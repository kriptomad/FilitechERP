// src/server/services/sped-efd-reinf-generator.service.ts — Cap. 21.18.5
// Geração de EFD-Reinf (Escrituração Fiscal Digital de Retenções e Outras Informações Fiscais)
// R-1000, R-2010/2020, R-9000
import { prismaUnscoped } from '../db';
import { DomainError } from '../api-envelope';
import { getCurrentLayoutVersion } from './sped-export';

export interface GenerateEFDReinfInput {
  tenantId: string;
  year: number;
  month: number; // 1-12
  forceRegenerate?: boolean;
}

export interface GenerateEFDReinfResult {
  fiscalDocumentId: string;
  layoutVersion: string;
  recordsCount: { r1000: number; r2010: number; r2020: number; r9000: number };
  fileSize: number;
  downloadUrl: string;
}

/**
 * Gera EFD-Reinf mensal conforme leiaute vigente.
 * Eventos: R-1000 (Informações do Contribuinte), R-2010 (Serviços Tomados), R-2020 (Serviços Prestados), R-9000 (Encerramento)
 */
export async function generateEFDReinf(input: GenerateEFDReinfInput): Promise<GenerateEFDReinfResult> {
  const { tenantId, year, month, forceRegenerate } = input;

  if (month < 1 || month > 12) throw new DomainError('VALIDATION_ERROR', 'Mês inválido (1-12).', 400);

  const layout = await getCurrentLayoutVersion('EFD_REINF');

  const inicio = new Date(year, month - 1, 1);
  const fim = new Date(year, month, 0, 23, 59, 59);

  const existing = await prismaUnscoped.officialTaxDocument.findFirst({
    where: { tenantId, documentType: 'EFD_REINF', competenciaInicio: inicio, competenciaFim: fim },
  });
  if (existing && !forceRegenerate) {
    throw new DomainError('DOCUMENT_EXISTS', 'EFD-Reinf já gerado para este período.', 409);
  }

  const tenant = await prismaUnscoped.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { tradeName: true, cnpj: true, taxRegime: true, uf: true, inscricaoEstadual: true, cnaePrincipal: true },
  });

  const lines: string[] = [];
  let r1000 = 0, r2010 = 0, r2020 = 0, r9000 = 0;

  // ====== R-1000: Informações do Contribuinte ======
  lines.push(...reinfHeader(tenant, year, month, layout.layoutVersion));
  r1000++;

  // evtInfoContri (R-1000)
  lines.push(joinPipe([
    'R1000',
    '1', // tpAmb (1=Produção)
    '1', // procEmi (1=App próprio)
    '1.0', // verProc
    tenant.cnpj.replace(/\D/g, ''), // cnpj
    tenant.tradeName, // nmRazao
    tenant.tradeName, // nmFantasia
    tenant.cnaePrincipal ?? '', // cnae
    tenant.uf, // uf
    formatDate(inicio), // iniValid
    '', // fimValid (vazio = vigente)
    '1', // classTrib (1=Lucro Real, 2=Lucro Presumido, 3=Simples, 4=MEI)
    tenant.taxRegime === 'LUCRO_REAL' ? '1' : tenant.taxRegime === 'LUCRO_PRESUMIDO' ? '2' : tenant.taxRegime === 'SIMPLES_NACIONAL' ? '3' : '4',
    '0', // indEscrituracao (0=Comum)
    '0', // indDesoneracao
    '0', // indAcordoIsenMulta
    '0', // indSitPJ (0=Normal)
  ]));
  r1000++;

  // R-1010 - Estabelecimentos
  lines.push(joinPipe([
    'R1010',
    tenant.cnpj.replace(/\D/g, ''), // cnpj
    '1', // tpInsc (1=CNPJ)
    '1', // tpInscEstab (1=CNPJ)
    tenant.cnpj.replace(/\D/g, ''), // nrInscEstab
    tenant.tradeName, // nmEstab
    '', // cnaeEstab
    tenant.uf, // ufEstab
    '', // cmunEstab (IBGE)
    '', // cepEstab
    '', // endEstab
    '', // numEstab
    '', // complEstab
    '', // bairEstab
    '', // foneEstab
    '', // emailEstab
  ]));
  r1000++;

  // R-1070 - Tabela de processos administrativos/judiciais (se houver)
  // Opcional - só se houver processos

  lines.push(joinPipe(['R1999', String(r1000 + 1)]));
  r1000++;

  // ====== R-2010: Serviços Tomados/Prestados (Retenção na Fonte) ======
  lines.push(joinPipe(['R2000', '0']));
  r2010++;

  // R-2010 - Serviços Tomados (retenção IRRF/PIS/COFINS/CSLL/INSS)
  const servicosTomados = await getServicosTomados(tenantId, inicio, fim);
  for (const serv of servicosTomados) {
    lines.push(joinPipe([
      'R2010',
      serv.cnpjPrestador, // cnpjPrestador
      serv.cpfPrestador ?? '', // cpfPrestador
      serv.nomePrestador, // nmPrestador
      serv.codigoServico, // codServ
      serv.descricaoServico, // descServ
      formatDate(serv.dataPagamento), // dtPagto
      serv.valorBruto.toFixed(2).replace('.', ','), // vlrBruto
      serv.valorIRRF.toFixed(2).replace('.', ','), // vlrIRRF
      serv.valorPIS.toFixed(2).replace('.', ','), // vlrPIS
      serv.valorCOFINS.toFixed(2).replace('.', ','), // vlrCOFINS
      serv.valorCSLL.toFixed(2).replace('.', ','), // vlrCSLL
      serv.valorINSS.toFixed(2).replace('.', ','), // vlrINSS
      serv.valorISS.toFixed(2).replace('.', ','), // vlrISS
      serv.baseCalculo.toFixed(2).replace('.', ','), // vlrBaseRet
      '1', // tpServ (1=Tomado)
    ]));
    r2010++;
  }

  lines.push(joinPipe(['R2999', String(r2010 + 1)]));
  r2010++;

  // ====== R-2020: Serviços Prestados (para quem presta serviços) ======
  lines.push(joinPipe(['R3000', '0']));
  r2020++;

  const servicosPrestados = await getServicosPrestados(tenantId, inicio, fim);
  for (const serv of servicosPrestados) {
    lines.push(joinPipe([
      'R2020',
      serv.cnpjTomador, // cnpjTomador
      serv.cpfTomador ?? '', // cpfTomador
      serv.nomeTomador, // nmTomador
      serv.codigoServico, // codServ
      serv.descricaoServico, // descServ
      formatDate(serv.dataPrestacao), // dtPrest
      serv.valorBruto.toFixed(2).replace('.', ','), // vlrBruto
      serv.valorIRRF.toFixed(2).replace('.', ','), // vlrIRRF
      serv.valorPIS.toFixed(2).replace('.', ','), // vlrPIS
      serv.valorCOFINS.toFixed(2).replace('.', ','), // vlrCOFINS
      serv.valorCSLL.toFixed(2).replace('.', ','), // vlrCSLL
      serv.valorINSS.toFixed(2).replace('.', ','), // vlrINSS
      serv.valorISS.toFixed(2).replace('.', ','), // vlrISS
      serv.baseCalculo.toFixed(2).replace('.', ','), // vlrBaseRet
      '2', // tpServ (2=Prestado)
    ]));
    r2020++;
  }

  lines.push(joinPipe(['R3999', String(r2020 + 1)]));
  r2020++;

  // ====== R-9000: Encerramento ======
  lines.push(joinPipe(['R9000', '0']));
  r9000++;

  const totalRecords = r1000 + r2010 + r2020 + r9000 + 2;
  lines.push(joinPipe(['R9999', String(totalRecords)]));
  r9000++;

  const content = lines.join('\r\n') + '\r\n';
  const bytes = Buffer.byteLength(content, 'utf8');

  const fiscalDoc = await prismaUnscoped.officialTaxDocument.create({
    data: {
      tenantId,
      documentType: 'EFD_REINF',
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
    recordsCount: { r1000, r2010, r2020, r9000 },
    fileSize: bytes,
    downloadUrl: `/api/accounting-office/sped/${fiscalDoc.id}/file`,
  };
}

function reinfHeader(tenant: any, year: number, month: number, layoutVersion: string): string[] {
  return [
    `# FILITECH ERP - EFD-Reinf ${year}/${String(month).padStart(2, '0')}`,
    `# LEIAUTE=${layoutVersion}`,
    `# CNPJ=${tenant.cnpj.replace(/\D/g, '')}`,
    `# NOME=${tenant.tradeName}`,
    `# REGIME=${tenant.taxRegime}`,
    `# CNAE=${tenant.cnaePrincipal ?? ''}`,
    '',
  ];
}

function joinPipe(fields: (string | number)[]): string {
  return '|' + fields.map(f => String(f).replace(/\|/g, '')).join('|') + '|';
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10).split('-').reverse().join('');
}

async function getServicosTomados(tenantId: string, inicio: Date, fim: Date) {
  // Busca pagamentos a fornecedores com retenção na fonte
  const payables = await prismaUnscoped.accountPayable.findMany({
    where: {
      tenantId,
      createdAt: { gte: inicio, lte: fim },
      status: 'PAID',
      withholdingTax: { not: null }, // Tem retenção
    },
    include: { supplier: true },
  });

  return payables.map(p => ({
    cnpjPrestador: p.supplier.document.replace(/\D/g, ''),
    cpfPrestador: p.supplier.document.length === 11 ? p.supplier.document.replace(/\D/g, '') : undefined,
    nomePrestador: p.supplier.name,
    codigoServico: getServicoCode(p.category),
    descricaoServico: p.description.slice(0, 100),
    dataPagamento: p.paidAt ?? p.dueDate,
    valorBruto: Number(p.amount),
    valorIRRF: Number(p.withholdingTax?.irrf ?? 0),
    valorPIS: Number(p.withholdingTax?.pis ?? 0),
    valorCOFINS: Number(p.withholdingTax?.cofins ?? 0),
    valorCSLL: Number(p.withholdingTax?.csll ?? 0),
    valorINSS: Number(p.withholdingTax?.inss ?? 0),
    valorISS: Number(p.withholdingTax?.iss ?? 0),
    baseCalculo: Number(p.amount),
  }));
}

async function getServicosPrestados(tenantId: string, inicio: Date, fim: Date) {
  // Busca vendas de serviços com retenção pelo tomador
  const sales = await prismaUnscoped.sale.findMany({
    where: {
      tenantId,
      createdAt: { gte: inicio, lte: fim },
      operationType: 'SERVICE',
      withholdingByClient: true, // Cliente reteve na fonte
    },
    include: { client: true },
  });

  return sales.map(s => ({
    cnpjTomador: s.client?.document?.replace(/\D/g, '') ?? '',
    cpfTomador: s.client?.document?.length === 11 ? s.client.document.replace(/\D/g, '') : undefined,
    nomeTomador: s.client?.name ?? 'Cliente Não Identificado',
    codigoServico: getServicoCode('SERVICE'),
    descricaoServico: s.description.slice(0, 100),
    dataPrestacao: s.createdAt,
    valorBruto: Number(s.totalAmount),
    valorIRRF: Number(s.withholdingIRRF ?? 0),
    valorPIS: Number(s.withholdingPIS ?? 0),
    valorCOFINS: Number(s.withholdingCOFINS ?? 0),
    valorCSLL: Number(s.withholdingCSLL ?? 0),
    valorINSS: Number(s.withholdingINSS ?? 0),
    valorISS: Number(s.withholdingISS ?? 0),
    baseCalculo: Number(s.totalAmount),
  }));
}

function getServicoCode(category?: string | null): string {
  // Códigos de serviço conforme tabela da Receita Federal (LC 116/2003)
  const map: Record<string, string> = {
    'CONSTRUCAO': '07.01', // Construção civil
    'MANUTENCAO': '07.02', // Manutenção
    'LIMPEZA': '07.03', // Limpeza
    'VIGILANCIA': '07.04', // Vigilância
    'TRANSPORTE': '07.05', // Transporte
    'CONSULTORIA': '07.06', // Consultoria
    'SERVICOS_TECNICOS': '07.07', // Serviços técnicos
    'PUBLICIDADE': '07.08', // Publicidade
    'INFORMATICA': '07.09', // Informática
    'CONTABILIDADE': '07.10', // Contabilidade
    'ADVOCACIA': '07.11', // Advocacia
    'MEDICINA': '07.12', // Medicina
    'ODONTOLOGIA': '07.13', // Odontologia
    'EDUCACAO': '07.14', // Educação
    'HOTELARIA': '07.15', // Hotelaria
    'ALIMENTACAO': '07.16', // Alimentação
    'SERVICOS_GERAIS': '07.99', // Outros serviços
  };
  return map[category?.toUpperCase() ?? 'SERVICOS_GERAIS'] ?? '07.99';
}