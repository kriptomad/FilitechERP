// src/server/services/defis-generator.service.ts — Cap. 21.18.5
// Geração de DEFIS (Declaração de Informações Socioeconômicas e Fiscais) — Simples Nacional
import { prismaUnscoped } from '../db';
import { DomainError } from '../api-envelope';
import { getCurrentLayoutVersion } from './sped-export';

export interface GenerateDEFISInput {
  tenantId: string;
  year: number;
  forceRegenerate?: boolean;
}

export interface GenerateDEFISResult {
  fiscalDocumentId: string;
  layoutVersion: string;
  recordsCount: number;
  fileSize: number;
  downloadUrl: string;
}

/**
 * Gera DEFIS anual (Simples Nacional) conforme leiaute vigente.
 * Baseada nas vendas (PDV) + dados do tenant + sócios.
 */
export async function generateDEFIS(input: GenerateDEFISInput): Promise<GenerateDEFISResult> {
  const { tenantId, year, forceRegenerate } = input;

  const layout = await getCurrentLayoutVersion('DEFIS');

  const inicio = new Date(`${year}-01-01`);
  const fim = new Date(`${year}-12-31T23:59:59`);

  const existing = await prismaUnscoped.officialTaxDocument.findFirst({
    where: { tenantId, documentType: 'DEFIS', competenciaInicio: inicio, competenciaFim: fim },
  });
  if (existing && !forceRegenerate) {
    throw new DomainError('DOCUMENT_EXISTS', 'DEFIS já gerado para este ano.', 409);
  }

  const tenant = await prismaUnscoped.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: {
      tradeName: true, cnpj: true, taxRegime: true, uf: true, inscricaoEstadual: true,
      simplesNacionalAnexo: true, cnaePrincipal: true, companyPartners: true,
    },
  });

  if (tenant.taxRegime !== 'SIMPLES_NACIONAL' && tenant.taxRegime !== 'MEI') {
    throw new DomainError('INVALID_REGIME', 'DEFIS só se aplica a MEI ou Simples Nacional.', 400);
  }

  const lines: string[] = [];
  let recordCount = 0;

  // ====== CABEÇALHO ======
  lines.push(...defisHeader(tenant, year, layout.layoutVersion));
  recordCount += 3;

  // ====== REGISTRO 1: IDENTIFICAÇÃO DO DECLARANTE ======
  lines.push(joinPipe([
    '1', // REG
    tenant.cnpj.replace(/\D/g, ''), // CNPJ
    tenant.tradeName, // RAZAO_SOCIAL
    tenant.tradeName, // NOME_FANTASIA
    tenant.cnaePrincipal ?? '', // CNAE_FISCAL
    tenant.uf, // UF
    tenant.inscricaoEstadual ?? '', // IE
    '', // IM
    '', // SUFRAMA
    formatDate(inicio), // DT_INI_ATIV
    '', // DT_FIM_ATIV
    '1', // TIPO_ATIV (1=Normal)
    tenant.simplesNacionalAnexo ?? 'I', // ANEXO
    '', // NAT_JURIDICA
    '', // QUALIF_RESP
    '', // CPF_RESP
    '', // NOME_RESP
  ]));
  recordCount++;

  // ====== REGISTRO 2: SÓCIOS ======
  for (const partner of tenant.companyPartners ?? []) {
    lines.push(joinPipe([
      '2', // REG
      partner.cpf?.replace(/\D/g, '') ?? '', // CPF_SOCIO
      partner.name, // NOME_SOCIO
      partner.qualification, // QUALIFICACAO
      partner.percentage.toFixed(2).replace('.', ','), // PERC_CAPITAL
      partner.entryDate ? formatDate(new Date(partner.entryDate)) : '', // DT_ENTRADA
      '', // DT_SAIDA
      '', // CPF_REP_LEGAL
      '', // NOME_REP_LEGAL
      '', // QUALIF_REP_LEGAL
    ]));
    recordCount++;
  }

  // ====== REGISTRO 3: RECEITA BRUTA POR MÊS ======
  const monthlyRevenue = await getMonthlyRevenue(tenantId, year);
  for (let m = 1; m <= 12; m++) {
    const revenue = monthlyRevenue.get(m) ?? 0;
    lines.push(joinPipe([
      '3', // REG
      String(m).padStart(2, '0'), // MES
      year.toString(), // ANO
      revenue.toFixed(2).replace('.', ','), // RECEITA_BRUTA
      '0', // RECEITA_EXPORTACAO
      '0', // RECEITA_ISENTA
      '0', // RECEITA_NAO_TRIBUTADA
    ]));
    recordCount++;
  }

  // ====== REGISTRO 4: RECEITA BRUTA ACUMULADA 12 MESES (para anexo) ======
  const totalRevenue = Array.from(monthlyRevenue.values()).reduce((s, v) => s + v, 0);
  lines.push(joinPipe([
    '4', // REG
    totalRevenue.toFixed(2).replace('.', ','), // RECEITA_BRUTA_ACUM_12M
    '0', // RECEITA_EXPORT_ACUM_12M
    '0', // RECEITA_ISENTA_ACUM_12M
    '0', // RECEITA_NAO_TRIB_ACUM_12M
  ]));
  recordCount++;

  // ====== REGISTRO 5: APURAÇÃO DO SIMPLES ======
  const simplesCalc = await calculateSimplesNacional(tenant, totalRevenue, tenant.simplesNacionalAnexo);
  lines.push(joinPipe([
    '5', // REG
    simplesCalc.anexo, // ANEXO
    simplesCalc.faixa, // FAIXA
    simplesCalc.aliquotaNominal.toFixed(4).replace('.', ','), // ALIQUOTA_NOMINAL
    simplesCalc.parcelaDeduzir.toFixed(2).replace('.', ','), // PARCELA_DEDUZIR
    simplesCalc.aliquotaEfetiva.toFixed(4).replace('.', ','), // ALIQUOTA_EFETIVA
    simplesCalc.valorDevido.toFixed(2).replace('.', ','), // VALOR_DEVido
    simplesCalc.valorICMS.toFixed(2).replace('.', ','), // VALOR_ICMS
    simplesCalc.valorISS.toFixed(2).replace('.', ','), // VALOR_ISS
    simplesCalc.valorIRPJ.toFixed(2).replace('.', ','), // VALOR_IRPJ
    simplesCalc.valorCSLL.toFixed(2).replace('.', ','), // VALOR_CSLL
    simplesCalc.valorPIS.toFixed(2).replace('.', ','), // VALOR_PIS
    simplesCalc.valorCOFINS.toFixed(2).replace('.', ','), // VALOR_COFINS
    simplesCalc.valorCPP.toFixed(2).replace('.', ','), // VALOR_CPP (INSS Patronal)
  ]));
  recordCount++;

  // ====== REGISTRO 6: DAS (Documento de Arrecadação do Simples) ======
  // Um registro por mês pago
  const dasPayments = await getDASPayments(tenantId, year);
  for (const das of dasPayments) {
    lines.push(joinPipe([
      '6', // REG
      das.periodo, // PER_APUR (MMYYYY)
      das.vencimento, // DT_VENC (DDMMYYYY)
      das.valor.toFixed(2).replace('.', ','), // VALOR_DAS
      das.codigoReceita, // COD_RECEITA
      das.numeroDocumento, // NUM_DOC
      das.dataPagamento ? formatDate(new Date(das.dataPagamento)) : '', // DT_PAGTO
      das.formaPagamento, // FORMA_PAGTO (1=DARF, 2=DAS, 3=Outros)
    ]));
    recordCount++;
  }

  // ====== REGISTRO 7: INFORMAÇÕES COMPLEMENTARES ======
  lines.push(joinPipe([
    '7', // REG
    '0', // IND_OPT_SIMEI (0=Não, 1=Sim - MEI)
    '0', // IND_MEI_CARTAO (0=Não, 1=Sim)
    '', // OBS
  ]));
  recordCount++;

  // ====== REGISTRO 9: ENCERRAMENTO ======
  lines.push(joinPipe(['9', String(recordCount + 1)]));
  recordCount++;

  const content = lines.join('\r\n') + '\r\n';
  const bytes = Buffer.byteLength(content, 'utf8');

  const fiscalDoc = await prismaUnscoped.officialTaxDocument.create({
    data: {
      tenantId,
      documentType: 'DEFIS',
      layoutVersion: layout.layoutVersion,
      competenciaInicio: inicio,
      competenciaFim: fim,
      status: 'GENERATED',
      fileSize: bytes,
      fileUrl: `data:text/plain;charset=utf-8;base64,${Buffer.from(content, 'utf8').toString('base64')}`,
      generatedAt: new Date(),
    },
  });

  return {
    fiscalDocumentId: fiscalDoc.id,
    layoutVersion: layout.layoutVersion,
    recordsCount,
    fileSize: bytes,
    downloadUrl: `/api/accounting-office/sped/${fiscalDoc.id}/file`,
  };
}

function defisHeader(tenant: any, year: number, layoutVersion: string): string[] {
  return [
    `# FILITECH ERP - DEFIS ${year}`,
    `# LEIAUTE=${layoutVersion}`,
    `# CNPJ=${tenant.cnpj.replace(/\D/g, '')}`,
    `# NOME=${tenant.tradeName}`,
    `# ANEXO=${tenant.simplesNacionalAnexo ?? 'I'}`,
    '',
  ];
}

function joinPipe(fields: (string | number)[]): string {
  return '|' + fields.map(f => String(f).replace(/\|/g, '')).join('|') + '|';
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10).split('-').reverse().join('');
}

async function getMonthlyRevenue(tenantId: string, year: number): Promise<Map<number, number>> {
  const sales = await prismaUnscoped.sale.groupBy({
    by: ['createdAt'],
    where: { tenantId, createdAt: { gte: new Date(`${year}-01-01`), lte: new Date(`${year}-12-31T23:59:59`) } },
    _sum: { totalAmount: true },
  });

  const monthly = new Map<number, number>();
  for (let m = 1; m <= 12; m++) monthly.set(m, 0);

  for (const sale of sales) {
    const month = new Date(sale.createdAt).getMonth() + 1;
    monthly.set(month, (monthly.get(month) ?? 0) + Number(sale._sum.totalAmount ?? 0));
  }

  return monthly;
}

async function calculateSimplesNacional(tenant: any, receitaBrutaAnual: number, anexo: string) {
  // Tabelas do Simples Nacional 2024 (valores anuais)
  const tabelas: Record<string, Array<{ ate: number; aliquota: number; deduzir: number }>> = {
    'I': [ // Comércio
      { ate: 180000, aliquota: 0.04, deduzir: 0 },
      { ate: 360000, aliquota: 0.073, deduzir: 5940 },
      { ate: 720000, aliquota: 0.095, deduzir: 13860 },
      { ate: 1800000, aliquota: 0.107, deduzir: 22320 },
      { ate: 3600000, aliquota: 0.143, deduzir: 87120 },
      { ate: 4800000, aliquota: 0.19, deduzir: 378000 },
    ],
    'II': [ // Indústria
      { ate: 180000, aliquota: 0.045, deduzir: 0 },
      { ate: 360000, aliquota: 0.078, deduzir: 5940 },
      { ate: 720000, aliquota: 0.10, deduzir: 13860 },
      { ate: 1800000, aliquota: 0.112, deduzir: 22320 },
      { ate: 3600000, aliquota: 0.147, deduzir: 87120 },
      { ate: 4800000, aliquota: 0.30, deduzir: 720000 },
    ],
    'III': [ // Serviços (Anexo III - antigo V)
      { ate: 180000, aliquota: 0.06, deduzir: 0 },
      { ate: 360000, aliquota: 0.112, deduzir: 9360 },
      { ate: 720000, aliquota: 0.135, deduzir: 17640 },
      { ate: 1800000, aliquota: 0.16, deduzir: 35640 },
      { ate: 3600000, aliquota: 0.21, deduzir: 125640 },
      { ate: 4800000, aliquota: 0.33, deduzir: 648000 },
    ],
    'IV': [ // Serviços (Anexo IV - antigo VI)
      { ate: 180000, aliquota: 0.045, deduzir: 0 },
      { ate: 360000, aliquota: 0.09, deduzir: 8100 },
      { ate: 720000, aliquota: 0.102, deduzir: 13500 },
      { ate: 1800000, aliquota: 0.14, deduzir: 37800 },
      { ate: 3600000, aliquota: 0.22, deduzir: 183600 },
      { ate: 4800000, aliquota: 0.33, deduzir: 828000 },
    ],
    'V': [ // Serviços (Anexo V - antigo III)
      { ate: 180000, aliquota: 0.155, deduzir: 0 },
      { ate: 360000, aliquota: 0.18, deduzir: 4500 },
      { ate: 720000, aliquota: 0.195, deduzir: 9900 },
      { ate: 1800000, aliquota: 0.205, deduzir: 17100 },
      { ate: 3600000, aliquota: 0.23, deduzir: 62100 },
      { ate: 4800000, aliquota: 0.305, deduzir: 540000 },
    ],
  };

  const tabela = tabelas[anexo] ?? tabelas['I'];
  let faixa = '';
  let aliquotaNominal = 0;
  let parcelaDeduzir = 0;

  for (let i = 0; i < tabela.length; i++) {
    if (receitaBrutaAnual <= tabela[i].ate) {
      faixa = String(i + 1);
      aliquotaNominal = tabela[i].aliquota;
      parcelaDeduzir = tabela[i].deduzir;
      break;
    }
  }
  if (!faixa) {
    faixa = String(tabela.length);
    aliquotaNominal = tabela[tabela.length - 1].aliquota;
    parcelaDeduzir = tabela[tabela.length - 1].deduzir;
  }

  const aliquotaEfetiva = Math.max(0, aliquotaNominal - parcelaDeduzir / receitaBrutaAnual);
  const valorDevido = Math.max(0, receitaBrutaAnual * aliquotaEfetiva);

  // Distribuição por tributo (percentuais fixos por anexo)
  const distribuicao: Record<string, { icms: number; iss: number; irpj: number; csll: number; pis: number; cofins: number; cpp: number }> = {
    'I': { icms: 0.40, iss: 0, irpj: 0.20, csll: 0.10, pis: 0.15, cofins: 0.10, cpp: 0.05 },
    'II': { icms: 0.15, iss: 0, irpj: 0.25, csll: 0.10, pis: 0.15, cofins: 0.10, cpp: 0.25 },
    'III': { icms: 0, iss: 0.35, irpj: 0.20, csll: 0.10, pis: 0.15, cofins: 0.10, cpp: 0.10 },
    'IV': { icms: 0, iss: 0.25, irpj: 0.25, csll: 0.10, pis: 0.15, cofins: 0.10, cpp: 0.15 },
    'V': { icms: 0, iss: 0.15, irpj: 0.25, csll: 0.10, pis: 0.15, cofins: 0.10, cpp: 0.25 },
  };

  const dist = distribuicao[anexo] ?? distribuicao['I'];

  return {
    anexo,
    faixa,
    aliquotaNominal,
    parcelaDeduzir,
    aliquotaEfetiva,
    valorDevido,
    valorICMS: valorDevido * dist.icms,
    valorISS: valorDevido * dist.iss,
    valorIRPJ: valorDevido * dist.irpj,
    valorCSLL: valorDevido * dist.csll,
    valorPIS: valorDevido * dist.pis,
    valorCOFINS: valorDevido * dist.cofins,
    valorCPP: valorDevido * dist.cpp,
  };
}

async function getDASPayments(tenantId: string, year: number) {
  // Busca DAS pagos no ano (AccountPayable com origin='DAS' ou similar)
  const payments = await prismaUnscoped.accountPayable.findMany({
    where: {
      tenantId,
      origin: 'DAS',
      createdAt: { gte: new Date(`${year}-01-01`), lte: new Date(`${year}-12-31T23:59:59`) },
    },
    orderBy: { dueDate: 'asc' },
  });

  return payments.map(p => ({
    periodo: formatDate(new Date(p.dueDate)).slice(2) + year.toString(), // MMYYYY
    vencimento: formatDate(new Date(p.dueDate)).replace(/\//g, ''), // DDMMYYYY
    valor: Number(p.amount),
    codigoReceita: '1000', // DAS código genérico
    numeroDocumento: p.id.slice(-10),
    dataPagamento: p.paidAt,
    formaPagamento: '2', // DAS
  }));
}