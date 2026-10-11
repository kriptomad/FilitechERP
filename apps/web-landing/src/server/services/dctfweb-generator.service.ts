// src/server/services/dctfweb-generator.service.ts — Cap. 21.18.5
// Geração de DCTFWeb (Declaração de Débitos e Créditos Tributários Federais Previdenciários e de Outras Entidades e Fundos)
// Consolida EFD-Reinf + regime tributário
import { prismaUnscoped } from '../db';
import { DomainError } from '../api-envelope';
import { getCurrentLayoutVersion } from './sped-export';

export interface GenerateDCTFWebInput {
  tenantId: string;
  year: number;
  month: number; // 1-12
  forceRegenerate?: boolean;
}

export interface GenerateDCTFWebResult {
  fiscalDocumentId: string;
  layoutVersion: string;
  recordsCount: number;
  fileSize: number;
  downloadUrl: string;
}

/**
 * Gera DCTFWeb mensal consolidando:
 * - EFD-Reinf (R-2010, R-2020) - retenções IRRF/PIS/COFINS/CSLL/INSS
 * - eSocial (folha de pagamento) - INSS patronal, RAT, terceiros
 * - DCTFWeb substitui GFIP, DCTF, DIRF para INSS/contribuições
 */
export async function generateDCTFWeb(input: GenerateDCTFWebInput): Promise<GenerateDCTFWebResult> {
  const { tenantId, year, month, forceRegenerate } = input;

  if (month < 1 || month > 12) throw new DomainError('VALIDATION_ERROR', 'Mês inválido (1-12).', 400);

  const layout = await getCurrentLayoutVersion('DCTFWEB');

  const inicio = new Date(year, month - 1, 1);
  const fim = new Date(year, month, 0, 23, 59, 59);

  const existing = await prismaUnscoped.officialTaxDocument.findFirst({
    where: { tenantId, documentType: 'DCTFWEB', competenciaInicio: inicio, competenciaFim: fim },
  });
  if (existing && !forceRegenerate) {
    throw new DomainError('DOCUMENT_EXISTS', 'DCTFWeb já gerado para este período.', 409);
  }

  const tenant = await prismaUnscoped.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { tradeName: true, cnpj: true, taxRegime: true, uf: true, cnaePrincipal: true },
  });

  const lines: string[] = [];
  let recordCount = 0;

  // ====== CABEÇALHO ======
  lines.push(...dctfwebHeader(tenant, year, month, layout.layoutVersion));
  recordCount += 3;

  // ====== REGISTRO 1: IDENTIFICAÇÃO ======
  lines.push(joinPipe([
    '1', // REG
    tenant.cnpj.replace(/\D/g, ''), // CNPJ
    tenant.tradeName, // RAZAO_SOCIAL
    tenant.cnaePrincipal ?? '', // CNAE
    tenant.uf, // UF
    '1', // IND_ATIV (1=Normal)
  ]));
  recordCount++;

  // ====== REGISTRO 2: RECEITA BRUTA DO MÊS ======
  const revenue = await getMonthlyRevenue(tenantId, year, month);
  lines.push(joinPipe([
    '2', // REG
    formatPeriod(year, month), // PER_APUR
    revenue.toFixed(2).replace('.', ','), // RECEITA_BRUTA
    '0', // RECEITA_EXPORTACAO
    '0', // RECEITA_ISENTA
    '0', // RECEITA_NAO_TRIBUTADA
  ]));
  recordCount++;

  // ====== REGISTRO 3: RETENÇÕES NA FONTE (EFD-Reinf R-2010/R-2020) ======
  const retencoes = await getRetencoesPeriodo(tenantId, inicio, fim);
  for (const ret of retencoes) {
    lines.push(joinPipe([
      '3', // REG
      ret.tipo, // TP_RET (1=IRRF, 2=PIS, 3=COFINS, 4=CSLL, 5=INSS, 6=ISS)
      ret.cnpjCpf, // CNPJ_CPF_RETIDO
      ret.nome, // NOME_RETIDO
      ret.codigoServico, // COD_SERV
      ret.descricao, // DESC_SERV
      formatDate(ret.data), // DT_PAGTO
      ret.valorBruto.toFixed(2).replace('.', ','), // VL_BRUTO
      ret.valorRetido.toFixed(2).replace('.', ','), // VL_RETIDO
      ret.baseCalculo.toFixed(2).replace('.', ','), // VL_BASE
    ]));
    recordCount++;
  }

  // ====== REGISTRO 4: CONTRIBUIÇÕES PREVIDENCIÁRIAS (INSS Patronal + RAT + Terceiros) ======
  const prev = await getContribuicoesPrevidenciarias(tenantId, inicio, fim);
  for (const p of prev) {
    lines.push(joinPipe([
      '4', // REG
      p.tipo, // TP_CONTRIB (1=Patronal, 2=RAT, 3=Senar, 4=Incra, 4=Sesi, 5=Senai, 6=Sebrae, 7=Terceiros, 8=Cooperado)
      p.cnpjCpf ?? '', // CNPJ_CPF
      p.nome ?? '', // NOME
      p.baseCalculo.toFixed(2).replace('.', ','), // VL_BASE
      p.aliquota.toFixed(4).replace('.', ','), // ALIQUOTA
      p.valor.toFixed(2).replace('.', ','), // VL_CONTRIB
      p.codigoReceita, // COD_RECEITA
    ]));
    recordCount++;
  }

  // ====== REGISTRO 5: FOLHA DE PAGAMENTO (eSocial consolidado) ======
  const folha = await getFolhaPagamento(tenantId, inicio, fim);
  lines.push(joinPipe([
    '5', // REG
    formatPeriod(year, month), // PER_APUR
    folha.qtdeEmpregados.toString(), // QTD_EMPREGADOS
    folha.remuneracaoTotal.toFixed(2).replace('.', ','), // REM_TOTAL
    folha.inssPatronal.toFixed(2).replace('.', ','), // INSS_PATRONAL
    folha.rat.toFixed(2).replace('.', ','), // RAT
    folha.terceiros.toFixed(2).replace('.', ','), // TERCEIROS
    folha.cooperados.toFixed(2).replace('.', ','), // COOPERADOS
  ]));
  recordCount++;

  // ====== REGISTRO 6: COMPENSAÇÕES/RESTITUIÇÕES ======
  const comp = await getCompensacoes(tenantId, inicio, fim);
  for (const c of comp) {
    lines.push(joinPipe([
      '6', // REG
      c.tipo, // TP_COMP (1=Compensação, 2=Restituição, 3=Pagamento indevido)
      c.codigoReceita, // COD_RECEITA_ORIGEM
      c.codigoReceitaDestino, // COD_RECEITA_DESTINO
      c.periodoApuracao, // PER_APUR_ORIGEM
      c.valor.toFixed(2).replace('.', ','), // VL_COMP
      c.numeroProcesso, // NUM_PROC
    ]));
    recordCount++;
  }

  // ====== REGISTRO 7: DÉBITOS APURADOS ======
  const debitos = await calculateDebitosDCTFWeb(retencoes, prev, folha);
  for (const d of debitos) {
    lines.push(joinPipe([
      '7', // REG
      d.codigoReceita, // COD_RECEITA
      d.descricao, // DESC_RECEITA
      d.valorDevido.toFixed(2).replace('.', ','), // VL_DEVido
      d.valorPago.toFixed(2).replace('.', ','), // VL_PAGO
      d.valorSaldo.toFixed(2).replace('.', ','), // VL_SALDO
      d.vencimento, // DT_VENC
    ]));
    recordCount++;
  }

  // ====== REGISTRO 8: INFORMAÇÕES COMPLEMENTARES ======
  lines.push(joinPipe([
    '8', // REG
    '0', // IND_SIMPLES
    '0', // IND_MEI
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
      documentType: 'DCTFWEB',
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

function dctfwebHeader(tenant: any, year: number, month: number, layoutVersion: string): string[] {
  return [
    `# FILITECH ERP - DCTFWeb ${year}/${String(month).padStart(2, '0')}`,
    `# LEIAUTE=${layoutVersion}`,
    `# CNPJ=${tenant.cnpj.replace(/\D/g, '')}`,
    `# NOME=${tenant.tradeName}`,
    `# REGIME=${tenant.taxRegime}`,
    '',
  ];
}

function joinPipe(fields: (string | number)[]): string {
  return '|' + fields.map(f => String(f).replace(/\|/g, '')).join('|') + '|';
}

function formatPeriod(year: number, month: number): string {
  return `${year}${String(month).padStart(2, '0')}`;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10).split('-').reverse().join('');
}

async function getMonthlyRevenue(tenantId: string, year: number, month: number): Promise<number> {
  const sales = await prismaUnscoped.sale.aggregate({
    where: { tenantId, createdAt: { gte: new Date(year, month - 1, 1), lte: new Date(year, month, 0, 23, 59, 59) } },
    _sum: { totalAmount: true },
  });
  return Number(sales._sum.totalAmount ?? 0);
}

async function getRetencoesPeriodo(tenantId: string, inicio: Date, fim: Date) {
  // IRRF/PIS/COFINS/CSLL/INSS/ISS retidos na fonte (EFD-Reinf)
  const payables = await prismaUnscoped.accountPayable.findMany({
    where: { tenantId, createdAt: { gte: inicio, lte: fim }, status: 'PAID', withholdingTax: { not: null } },
    include: { supplier: true },
  });

  const sales = await prismaUnscoped.sale.findMany({
    where: { tenantId, createdAt: { gte: inicio, lte: fim }, withholdingByClient: true },
    include: { client: true },
  });

  const retencoes: any[] = [];

  // Retenções em pagamentos (tomador)
  for (const p of payables) {
    const wt = p.withholdingTax as any;
    if (wt?.irrf) retencoes.push({ tipo: '1', cnpjCpf: p.supplier.document.replace(/\D/g, ''), nome: p.supplier.name, codigoServico: '07.99', descricao: p.description.slice(0,100), data: p.paidAt ?? p.dueDate, valorBruto: Number(p.amount), valorRetido: Number(wt.irrf), baseCalculo: Number(p.amount) });
    if (wt?.pis) retencoes.push({ tipo: '2', cnpjCpf: p.supplier.document.replace(/\D/g, ''), nome: p.supplier.name, codigoServico: '07.99', descricao: p.description.slice(0,100), data: p.paidAt ?? p.dueDate, valorBruto: Number(p.amount), valorRetido: Number(wt.pis), baseCalculo: Number(p.amount) });
    if (wt?.cofins) retencoes.push({ tipo: '3', cnpjCpf: p.supplier.document.replace(/\D/g, ''), nome: p.supplier.name, codigoServico: '07.99', descricao: p.description.slice(0,100), data: p.paidAt ?? p.dueDate, valorBruto: Number(p.amount), valorRetido: Number(wt.cofins), baseCalculo: Number(p.amount) });
    if (wt?.csll) retencoes.push({ tipo: '4', cnpjCpf: p.supplier.document.replace(/\D/g, ''), nome: p.supplier.name, codigoServico: '07.99', descricao: p.description.slice(0,100), data: p.paidAt ?? p.dueDate, valorBruto: Number(p.amount), valorRetido: Number(wt.csll), baseCalculo: Number(p.amount) });
    if (wt?.inss) retencoes.push({ tipo: '5', cnpjCpf: p.supplier.document.replace(/\D/g, ''), nome: p.supplier.name, codigoServico: '07.99', descricao: p.description.slice(0,100), data: p.paidAt ?? p.dueDate, valorBruto: Number(p.amount), valorRetido: Number(wt.inss), baseCalculo: Number(p.amount) });
    if (wt?.iss) retencoes.push({ tipo: '6', cnpjCpf: p.supplier.document.replace(/\D/g, ''), nome: p.supplier.name, codigoServico: '07.99', descricao: p.description.slice(0,100), data: p.paidAt ?? p.dueDate, valorBruto: Number(p.amount), valorRetido: Number(wt.iss), baseCalculo: Number(p.amount) });
  }

  // Retenções sofridas (prestador)
  for (const s of sales) {
    if (s.withholdingIRRF) retencoes.push({ tipo: '1', cnpjCpf: s.client?.document?.replace(/\D/g, '') ?? '', nome: s.client?.name ?? '', codigoServico: '07.99', descricao: s.description.slice(0,100), data: s.createdAt, valorBruto: Number(s.totalAmount), valorRetido: Number(s.withholdingIRRF), baseCalculo: Number(s.totalAmount) });
    if (s.withholdingPIS) retencoes.push({ tipo: '2', cnpjCpf: s.client?.document?.replace(/\D/g, '') ?? '', nome: s.client?.name ?? '', codigoServico: '07.99', descricao: s.description.slice(0,100), data: s.createdAt, valorBruto: Number(s.totalAmount), valorRetido: Number(s.withholdingPIS), baseCalculo: Number(s.totalAmount) });
    if (s.withholdingCOFINS) retencoes.push({ tipo: '3', cnpjCpf: s.client?.document?.replace(/\D/g, '') ?? '', nome: s.client?.name ?? '', codigoServico: '07.99', descricao: s.description.slice(0,100), data: s.createdAt, valorBruto: Number(s.totalAmount), valorRetido: Number(s.withholdingCOFINS), baseCalculo: Number(s.totalAmount) });
    if (s.withholdingCSLL) retencoes.push({ tipo: '4', cnpjCpf: s.client?.document?.replace(/\D/g, '') ?? '', nome: s.client?.name ?? '', codigoServico: '07.99', descricao: s.description.slice(0,100), data: s.createdAt, valorBruto: Number(s.totalAmount), valorRetido: Number(s.withholdingCSLL), baseCalculo: Number(s.totalAmount) });
    if (s.withholdingINSS) retencoes.push({ tipo: '5', cnpjCpf: s.client?.document?.replace(/\D/g, '') ?? '', nome: s.client?.name ?? '', codigoServico: '07.99', descricao: s.description.slice(0,100), data: s.createdAt, valorBruto: Number(s.totalAmount), valorRetido: Number(s.withholdingINSS), baseCalculo: Number(s.totalAmount) });
    if (s.withholdingISS) retencoes.push({ tipo: '6', cnpjCpf: s.client?.document?.replace(/\D/g, '') ?? '', nome: s.client?.name ?? '', codigoServico: '07.99', descricao: s.description.slice(0,100), data: s.createdAt, valorBruto: Number(s.totalAmount), valorRetido: Number(s.withholdingISS), baseCalculo: Number(s.totalAmount) });
  }

  return retencoes;
}

async function getContribuicoesPrevidenciarias(tenantId: string, inicio: Date, fim: Date) {
  // INSS Patronal, RAT, Terceiros, Cooperados
  const folha = await getFolhaPagamento(tenantId, inicio, fim);

  return [
    { tipo: '1', cnpjCpf: '', nome: '', baseCalculo: folha.remuneracaoTotal, aliquota: 0.20, valor: folha.inssPatronal, codigoReceita: '1001' }, // INSS Patronal 20%
    { tipo: '2', cnpjCpf: '', nome: '', baseCalculo: folha.remuneracaoTotal, aliquota: folha.ratRate, valor: folha.rat, codigoReceita: '1002' }, // RAT
    { tipo: '7', cnpjCpf: '', nome: '', baseCalculo: folha.terceirosBase, aliquota: 0.15, valor: folha.terceiros, codigoReceita: '1003' }, // Terceiros 15%
    { tipo: '8', cnpjCpf: '', nome: '', baseCalculo: folha.cooperadosBase, aliquota: 0.20, valor: folha.cooperados, codigoReceita: '1004' }, // Cooperados
  ];
}

async function getFolhaPagamento(tenantId: string, inicio: Date, fim: Date) {
  // Busca dados de folha do eSocial / AccountPayable categoria 'PAYROLL'
  const payroll = await prismaUnscoped.accountPayable.aggregate({
    where: { tenantId, createdAt: { gte: inicio, lte: fim }, category: 'PAYROLL', status: 'PAID' },
    _sum: { amount: true },
    _count: { id: true },
  });

  const remuneracaoTotal = Number(payroll._sum.amount ?? 0);
  const qtdeEmpregados = payroll._count.id ?? 0;
  const inssPatronal = remuneracaoTotal * 0.20;
  const ratRate = 0.01; // 1% padrão (varia por CNAE)
  const rat = remuneracaoTotal * ratRate;
  const terceirosBase = remuneracaoTotal * 0.3; // Estimativa
  const terceiros = terceirosBase * 0.15;
  const cooperadosBase = 0;
  const cooperados = 0;

  return { qtdeEmpregados, remuneracaoTotal, inssPatronal, rat, ratRate, terceiros, terceirosBase, cooperados, cooperadosBase };
}

async function getCompensacoes(tenantId: string, inicio: Date, fim: Date) {
  // Busca compensações (PER/DCOMP, restituições)
  const comps = await prismaUnscoped.accountPayable.findMany({
    where: { tenantId, createdAt: { gte: inicio, lte: fim }, category: 'TAX_COMPENSATION' },
  });

  return comps.map(c => ({
    tipo: '1',
    codigoReceita: c.metadata?.codigoReceitaOrigem ?? '1000',
    codigoReceitaDestino: c.metadata?.codigoReceitaDestino ?? '1000',
    periodoApuracao: c.metadata?.periodoApuracao ?? '',
    valor: Number(c.amount),
    numeroProcesso: c.metadata?.numeroProcesso ?? '',
  }));
}

async function calculateDebitosDCTFWeb(retencoes: any[], prev: any[], folha: any) {
  // Consolida todos os débitos por código de receita
  const debitosMap = new Map<string, { codigoReceita: string; descricao: string; valorDevido: number; valorPago: number }>();

  // Retenações
  for (const r of retencoes) {
    const key = r.tipo === '1' ? '1001' : r.tipo === '2' ? '1002' : r.tipo === '3' ? '1003' : r.tipo === '4' ? '1004' : r.tipo === '5' ? '1005' : '1006';
    const existing = debitosMap.get(key) ?? { codigoReceita: key, descricao: '', valorDevido: 0, valorPago: 0 };
    existing.valorDevido += r.valorRetido;
    existing.valorPago += r.valorRetido; // Retido = pago pelo tomador
    debitosMap.set(key, existing);
  }

  // Previdenciárias
  for (const p of prev) {
    const existing = debitosMap.get(p.codigoReceita) ?? { codigoReceita: p.codigoReceita, descricao: '', valorDevido: 0, valorPago: 0 };
    existing.valorDevido += p.valor;
    existing.valorPago += p.valor; // Assumindo pago via DARF/DAS
    debitosMap.set(p.codigoReceita, existing);
  }

  return Array.from(debitosMap.values()).map(d => ({
    ...d,
    valorSaldo: Math.max(0, d.valorDevido - d.valorPago),
    vencimento: '20', // Dia 20 do mês subsequente
  }));
}