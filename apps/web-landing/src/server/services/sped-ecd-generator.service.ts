// src/server/services/sped-ecd-generator.service.ts — Cap. 21.18.5
// Geração de ECD (Escrituração Contábil Digital) — Bloco 0, I, J, 9
import { prismaUnscoped } from '../db';
import { DomainError } from '../api-envelope';
import { getCurrentLayoutVersion } from './sped-export';

export interface GenerateECDInput {
  tenantId: string;
  year: number;
  forceRegenerate?: boolean;
}

export interface GenerateECDResult {
  fiscalDocumentId: string;
  layoutVersion: string;
  recordsCount: { bloco0: number; blocoI: number; blocoJ: number; bloco9: number };
  fileSize: number;
  downloadUrl: string;
}

/**
 * Gera ECD conforme leiaute vigente (SPED Contábil).
 * Bloco 0: Abertura/Identificação
 * Bloco I: Balanços e Balancetes
 * Bloco J: Lançamentos Contábeis (Diário/Razão)
 * Bloco 9: Encerramento
 */
export async function generateECD(input: GenerateECDInput): Promise<GenerateECDResult> {
  const { tenantId, year, forceRegenerate } = input;

  // Verifica leiaute vigente
  const layout = await getCurrentLayoutVersion('ECD');

  // Verifica se já existe para o ano
  const existing = await prismaUnscoped.officialTaxDocument.findFirst({
    where: { tenantId, documentType: 'ECD', competenciaInicio: { gte: new Date(`${year}-01-01`), lte: new Date(`${year}-12-31`) } },
  });
  if (existing && !forceRegenerate) {
    throw new DomainError('DOCUMENT_EXISTS', 'ECD já gerado para este ano. Use forceRegenerate=true para regerar.', 409);
  }

  const inicio = new Date(`${year}-01-01`);
  const fim = new Date(`${year}-12-31T23:59:59`);

  const tenant = await prismaUnscoped.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { tradeName: true, cnpj: true, taxRegime: true, uf: true, inscricaoEstadual: true, simplesNacionalAnexo: true },
  });

  const lines: string[] = [];
  let bloco0 = 0, blocoI = 0, blocoJ = 0, bloco9 = 0;

  // ====== BLOCO 0: ABERTURA ======
  lines.push(...bloco0Header(tenant, year, layout.layoutVersion));
  bloco0++;

  // Registro 0000 - Abertura
  lines.push(joinPipe([
    '0000', '0', // COD_VER
    formatDate(inicio), // DT_INI
    formatDate(fim), // DT_FIN
    tenant.cnpj.replace(/\D/g, ''), // CNPJ
    tenant.tradeName, // NOME
    tenant.uf, // UF
    tenant.inscricaoEstadual ?? '', // IE
    '', // COD_MUN (IBGE)
    '', // IM
    '', // SUFRAMA
    '0', // IND_PERFIL (0=Perfil A)
    '0', // IND_ATIV (0=Industrial ou equiparada)
  ]));
  bloco0++;

  // Registro 0001 - Abertura do bloco 0
  lines.push(joinPipe(['0001', '0']));
  bloco0++;

  // Registro 0100 - Contador responsável
  lines.push(joinPipe([
    '0100', tenant.cnpj.replace(/\D/g, ''), // CNPJ
    'Contador Responsável', // NOME
    '', // CRC
    '', // CRC_UF
    '', // EMAIL
    '', // FONE
  ]));
  bloco0++;

  // Registro 0150 - Tabela de códigos de conta (Plano de Contas)
  const chartOfAccounts = await prismaUnscoped.chartOfAccount.findMany({
    where: { tenantId },
    orderBy: { code: 'asc' },
  });
  for (const acc of chartOfAccounts) {
    lines.push(joinPipe([
      '0150', acc.code, // COD_CTA
      acc.name, // NOME_CTA
      acc.nature === 'DEBITO' ? 'D' : 'C', // NAT_CTA
      acc.parentCode ?? '', // COD_CTA_REF
      '', // NIVEL_CTA (calculado se necessário)
    ]));
    bloco0++;
  }

  // Registro 0190 - Unidades de medida
  const units = await prismaUnscoped.product.findMany({
    where: { tenantId, active: true },
    select: { unit: true },
    distinct: ['unit'],
  });
  for (const u of units) {
    if (u.unit) {
      lines.push(joinPipe(['0190', u.unit, u.unit, '']));
      bloco0++;
    }
  }

  // Registro 0200 - Identificação do participante (fornecedores/clientes)
  const participants = await prismaUnscoped.$queryRaw<Array<any>>`
    SELECT DISTINCT s.document as doc, s.name as nome, 'F' as tipo FROM suppliers s WHERE s.tenantid = ${tenantId}
    UNION
    SELECT DISTINCT c.document as doc, c.name as nome, 'C' as tipo FROM clients c WHERE c.tenantid = ${tenantId}
  `;
  for (const p of participants) {
    lines.push(joinPipe(['0200', p.tipo, p.doc.replace(/\D/g, ''), p.nome, '', '', '', '', '', '']));
    bloco0++;
  }

  // Registro 0990 - Encerramento bloco 0
  lines.push(joinPipe(['0990', String(bloco0 + 1)]));
  bloco0++;

  // ====== BLOCO I: BALANÇOS E BALANCETES ======
  lines.push(joinPipe(['I001', '0']));
  blocoI++;

  // Registro I010 - Balanço patrimonial
  const balanceSheet = await getBalanceSheet(tenantId, fim);
  lines.push(joinPipe([
    'I010',
    formatDate(fim), // DT_BAL
    balanceSheet.ativoTotal.toFixed(2).replace('.', ','), // VL_TOTAL_ATIVO
    balanceSheet.passivoTotal.toFixed(2).replace('.', ','), // VL_TOTAL_PASSIVO
    balanceSheet.patrimonioLiquido.toFixed(2).replace('.', ','), // VL_TOTAL_PL
  ]));
  blocoI++;

  // Registro I011 - Detalhamento do ativo
  for (const item of balanceSheet.ativoDetalhe) {
    lines.push(joinPipe([
      'I011', item.codigo, item.descricao, item.valor.toFixed(2).replace('.', ','),
    ]));
    blocoI++;
  }

  // Registro I012 - Detalhamento do passivo
  for (const item of balanceSheet.passivoDetalhe) {
    lines.push(joinPipe([
      'I012', item.codigo, item.descricao, item.valor.toFixed(2).replace('.', ','),
    ]));
    blocoI++;
  }

  // Registro I013 - Detalhamento do PL
  for (const item of balanceSheet.plDetalhe) {
    lines.push(joinPipe([
      'I013', item.codigo, item.descricao, item.valor.toFixed(2).replace('.', ','),
    ]));
    blocoI++;
  }

  // Registro I030 - Balancete de verificação
  const trialBalance = await getTrialBalance(tenantId, inicio, fim);
  for (const row of trialBalance) {
    lines.push(joinPipe([
      'I030', row.codigo, row.nome,
      row.saldoInicialDebito.toFixed(2).replace('.', ','),
      row.saldoInicialCredito.toFixed(2).replace('.', ','),
      row.periodoDebito.toFixed(2).replace('.', ','),
      row.periodoCredito.toFixed(2).replace('.', ','),
      row.saldoFinalDebito.toFixed(2).replace('.', ','),
      row.saldoFinalCredito.toFixed(2).replace('.', ','),
    ]));
    blocoI++;
  }

  lines.push(joinPipe(['I990', String(blocoI + 1)]));
  blocoI++;

  // ====== BLOCO J: LANÇAMENTOS CONTÁBEIS ======
  lines.push(joinPipe(['J001', '0']));
  blocoJ++;

  const journalEntries = await getJournalEntries(tenantId, inicio, fim);
  for (const entry of journalEntries) {
    // J005 - Cabeçalho do lançamento
    lines.push(joinPipe([
      'J005',
      formatDate(entry.date), // DT_LCTO
      entry.history, // HISTORICO
      entry.documentNumber, // NUM_DOC
      entry.documentType, // COD_DOC
      '', // COD_CTA_DEB (será nos filhos)
      '', // COD_CTA_CRED
      '', // VALOR
      '', // IND_DC
      '', // COD_CCUS
      '', // IND_ORIGEM
      '', // NUM_PROC
      '', // IND_PROC
      '', // COD_CTA_REF
    ]));
    blocoJ++;

    // J006 - Linhas do lançamento (débitos)
    for (const line of entry.debitLines) {
      lines.push(joinPipe([
        'J006', line.codigoConta, 'D',
        line.valor.toFixed(2).replace('.', ','),
        line.centroCusto ?? '',
      ]));
      blocoJ++;
    }
    // Créditos
    for (const line of entry.creditLines) {
      lines.push(joinPipe([
        'J006', line.codigoConta, 'C',
        line.valor.toFixed(2).replace('.', ','),
        line.centroCusto ?? '',
      ]));
      blocoJ++;
    }
  }

  lines.push(joinPipe(['J990', String(blocoJ + 1)]));
  blocoJ++;

  // ====== BLOCO 9: ENCERRAMENTO ======
  lines.push(joinPipe(['9900', '0']));
  bloco9++;

  // Registro 9900 - Controle
  const totalRecords = bloco0 + blocoI + blocoJ + bloco9 + 2;
  lines.push(joinPipe(['9900', String(totalRecords)]));
  blko9++;

  lines.push(joinPipe(['9999', String(totalRecords)]));
  bloco9++;

  const content = lines.join('\r\n') + '\r\n';
  const bytes = Buffer.byteLength(content, 'utf8');

  // Salva documento
  const fiscalDoc = await prismaUnscoped.officialTaxDocument.create({
    data: {
      tenantId,
      documentType: 'ECD',
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
    recordsCount: { bloco0, blocoI, blocoJ, bloco9 },
    fileSize: bytes,
    downloadUrl: `/api/accounting-office/sped/${fiscalDoc.id}/file`,
  };
}

function bloco0Header(tenant: any, year: number, layoutVersion: string): string[] {
  return [
    `# FILITECH ERP - ECD ${year}`,
    `# LEIAUTE=${layoutVersion}`,
    `# CNPJ=${tenant.cnpj.replace(/\D/g, '')}`,
    `# NOME=${tenant.tradeName}`,
    `# UF=${tenant.uf}`,
    `# REGIME=${tenant.taxRegime}`,
    `# ANEXO=${tenant.simplesNacionalAnexo ?? ''}`,
    '',
  ];
}

function joinPipe(fields: (string | number)[]): string {
  return '|' + fields.map(f => String(f).replace(/\|/g, '')).join('|') + '|';
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10).split('-').reverse().join('');
}

async function getBalanceSheet(tenantId: string, date: Date) {
  const accounts = await prismaUnscoped.chartOfAccount.findMany({ where: { tenantId }, orderBy: { code: 'asc' } });
  const movements = await prismaUnscoped.accountingJournalLine.groupBy({
    by: ['accountId'],
    where: { journalEntry: { tenantId, date: { lte: date } } },
    _sum: { debitAmount: true, creditAmount: true },
  });

  const movementMap = new Map(movements.map(m => [m.accountId, m]));

  let ativoTotal = 0, passivoTotal = 0, patrimonioLiquido = 0;
  const ativoDetalhe: any[] = [], passivoDetalhe: any[] = [], plDetalhe: any[] = [];

  for (const acc of accounts) {
    const mov = movementMap.get(acc.id);
    const debit = Number(mov?._sum.debitAmount ?? 0);
    const credit = Number(mov?._sum.creditAmount ?? 0);
    const balance = acc.nature === 'DEBITO' ? debit - credit : credit - debit;

    if (balance === 0) continue;

    const item = { codigo: acc.code, descricao: acc.name, valor: Math.abs(balance) };

    if (['1', '2', '3', '4'].includes(acc.code.charAt(0))) { // Ativo
      ativoTotal += balance;
      ativoDetalhe.push(item);
    } else if (['5', '6', '7'].includes(acc.code.charAt(0))) { // Passivo
      passivoTotal += balance;
      passivoDetalhe.push(item);
    } else { // PL
      patrimonioLiquido += balance;
      plDetalhe.push(item);
    }
  }

  return { ativoTotal, passivoTotal, patrimonioLiquido, ativoDetalhe, passivoDetalhe, plDetalhe };
}

async function getTrialBalance(tenantId: string, inicio: Date, fim: Date) {
  const lines = await prismaUnscoped.$queryRaw<Array<any>>`
    SELECT a.code as codigo, a.name as nome,
      COALESCE(SUM(CASE WHEN j.date < ${inicio} AND jl.debit_amount > 0 THEN jl.debit_amount ELSE 0 END), 0) as saldo_inicial_debito,
      COALESCE(SUM(CASE WHEN j.date < ${inicio} AND jl.credit_amount > 0 THEN jl.credit_amount ELSE 0 END), 0) as saldo_inicial_credito,
      COALESCE(SUM(CASE WHEN j.date BETWEEN ${inicio} AND ${fim} AND jl.debit_amount > 0 THEN jl.debit_amount ELSE 0 END), 0) as periodo_debito,
      COALESCE(SUM(CASE WHEN j.date BETWEEN ${inicio} AND ${fim} AND jl.credit_amount > 0 THEN jl.credit_amount ELSE 0 END), 0) as periodo_credito,
      COALESCE(SUM(CASE WHEN j.date <= ${fim} AND jl.debit_amount > 0 THEN jl.debit_amount ELSE 0 END), 0) as saldo_final_debito,
      COALESCE(SUM(CASE WHEN j.date <= ${fim} AND jl.credit_amount > 0 THEN jl.credit_amount ELSE 0 END), 0) as saldo_final_credito
    FROM chart_of_accounts a
    LEFT JOIN accounting_journal_lines jl ON jl.account_id = a.id
    LEFT JOIN accounting_journal_entries j ON j.id = jl.journal_entry_id AND j.tenant_id = ${tenantId}
    WHERE a.tenant_id = ${tenantId}
    GROUP BY a.id, a.code, a.name
    HAVING COALESCE(SUM(jl.debit_amount), 0) + COALESCE(SUM(jl.credit_amount), 0) > 0
    ORDER BY a.code
  `;
  return lines;
}

async function getJournalEntries(tenantId: string, inicio: Date, fim: Date) {
  const entries = await prismaUnscoped.accountingJournalEntry.findMany({
    where: { tenantId, date: { gte: inicio, lte: fim }, status: 'POSTED' },
    orderBy: { date: 'asc' },
    include: {
      lines: { include: { account: true, costCenter: true } },
    },
  });

  return entries.map(e => ({
    date: e.date,
    history: e.description,
    documentNumber: e.documentNumber,
    documentType: e.documentType,
    debitLines: e.lines.filter(l => Number(l.debitAmount) > 0).map(l => ({
      codigoConta: l.account.code,
      valor: Number(l.debitAmount),
      centroCusto: l.costCenter?.code ?? '',
    })),
    creditLines: e.lines.filter(l => Number(l.creditAmount) > 0).map(l => ({
      codigoConta: l.account.code,
      valor: Number(l.creditAmount),
      centroCusto: l.costCenter?.code ?? '',
    })),
  }));
}