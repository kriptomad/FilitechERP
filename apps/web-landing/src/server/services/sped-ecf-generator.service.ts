// src/server/services/sped-ecf-generator.service.ts — Cap. 21.18.5
// Geração de ECF (Escrituração Contábil Fiscal) — Bloco C (ECD) + L/N/P/M/Y
import { prismaUnscoped } from '../db';
import { DomainError } from '../api-envelope';
import { getCurrentLayoutVersion } from './sped-export';

export interface GenerateECFInput {
  tenantId: string;
  year: number;
  forceRegenerate?: boolean;
}

export interface GenerateECFResult {
  fiscalDocumentId: string;
  layoutVersion: string;
  recordsCount: { blocoC: number; blocoL: number; blocoN: number; blocoP: number; blocoM: number; blocoY: number };
  fileSize: number;
  downloadUrl: string;
}

/**
 * Gera ECF conforme leiaute vigente (SPED Fiscal).
 * ECF substitui a DIPJ para Lucro Real/Presumido a partir de 2014.
 * Blocos: C (ECD), L (Lucro Real), N (Lucro Presumido), P (Partilha), M (Imunidade/Isenção), Y (Encerramento)
 */
export async function generateECF(input: GenerateECFInput): Promise<GenerateECFResult> {
  const { tenantId, year, forceRegenerate } = input;

  const layout = await getCurrentLayoutVersion('ECF');

  const existing = await prismaUnscoped.officialTaxDocument.findFirst({
    where: { tenantId, documentType: 'ECF', competenciaInicio: { gte: new Date(`${year}-01-01`), lte: new Date(`${year}-12-31`) } },
  });
  if (existing && !forceRegenerate) {
    throw new DomainError('DOCUMENT_EXISTS', 'ECF já gerado para este ano. Use forceRegenerate=true para regerar.', 409);
  }

  const inicio = new Date(`${year}-01-01`);
  const fim = new Date(`${year}-12-31T23:59:59`);

  const tenant = await prismaUnscoped.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { tradeName: true, cnpj: true, taxRegime: true, uf: true, inscricaoEstadual: true, simplesNacionalAnexo: true },
  });

  if (tenant.taxRegime === 'SIMPLES_NACIONAL' || tenant.taxRegime === 'MEI') {
    throw new DomainError('INVALID_REGIME', 'ECF não se aplica a MEI ou Simples Nacional. Use DEFIS.', 400);
  }

  const lines: string[] = [];
  let blocoC = 0, blocoL = 0, blocoN = 0, blocoP = 0, blocoM = 0, blocoY = 0;

  // ====== BLOCO C: ECD (Importação da ECD gerada) ======
  lines.push(...ecfBlocoCHeader(tenant, year, layout.layoutVersion));
  blocoC++;

  // Registro C001 - Abertura do bloco C
  lines.push(joinPipe(['C001', '0']));
  blocoC++;

  // Registro C100 - Identificação do participante (importado da ECD)
  const participants = await getECFParticipants(tenantId);
  for (const p of participants) {
    lines.push(joinPipe(['C100', p.tipo, p.cnpjCpf, p.nome, p.codigo, '', '', '', '']));
    blocoC++;
  }

  // Registro C170 - Itens do estoque (inventário)
  const inventoryItems = await getInventoryItems(tenantId, fim);
  for (const item of inventoryItems) {
    lines.push(joinPipe([
      'C170', item.codigo, item.descricao, item.unidade, item.quantidade.toFixed(3).replace('.', ','),
      item.valorUnitario.toFixed(2).replace('.', ','), item.valorTotal.toFixed(2).replace('.', ','),
      '', '', '', '', '',
    ]));
    blocoC++;
  }

  lines.push(joinPipe(['C990', String(blocoC + 1)]));
  blocoC++;

  // ====== BLOCO L: LUCRO REAL ======
  if (tenant.taxRegime === 'LUCRO_REAL') {
    lines.push(joinPipe(['L001', '0']));
    blocoL++;

    // L100 - Apuração do Lucro Real
    const lucroReal = await calculateLucroReal(tenantId, inicio, fim);
    lines.push(joinPipe([
      'L100',
      lucroReal.receitaBruta.toFixed(2).replace('.', ','),
      lucroReal.custos.toFixed(2).replace('.', ','),
      lucroReal.despesasOperacionais.toFixed(2).replace('.', ','),
      lucroReal.resultadoBruto.toFixed(2).replace('.', ','),
      lucroReal.adicoes.toFixed(2).replace('.', ','),
      lucroReal.exclusoes.toFixed(2).replace('.', ','),
      lucroReal.lucroLiquido.toFixed(2).replace('.', ','),
      lucroReal.baseCalculoIRPJ.toFixed(2).replace('.', ','),
      lucroReal.irpjDevido.toFixed(2).replace('.', ','),
      lucroReal.baseCalculoCSLL.toFixed(2).replace('.', ','),
      lucroReal.csllDevido.toFixed(2).replace('.', ','),
    ]));
    blocoL++;

    // L200 - Adições ao Lucro Real
    for (const ad of lucroReal.adicoesDetalhe) {
      lines.push(joinPipe(['L200', ad.codigo, ad.descricao, ad.valor.toFixed(2).replace('.', ',')]));
      blocoL++;
    }

    // L300 - Exclusões do Lucro Real
    for (const ex of lucroReal.exclusoesDetalhe) {
      lines.push(joinPipe(['L300', ex.codigo, ex.descricao, ex.valor.toFixed(2).replace('.', ',')]));
      blocoL++;
    }

    // L400 - Prejuízo Fiscal a Compensar
    lines.push(joinPipe(['L400', lucroReal.prejuizoAnterior.toFixed(2).replace('.', ','), lucroReal.prejuizoCompensado.toFixed(2).replace('.', ','), lucroReal.prejuizoSaldo.toFixed(2).replace('.', ',')]));
    blkoL++;

    lines.push(joinPipe(['L990', String(blocoL + 1)]));
    blocoL++;
  }

  // ====== BLOCO N: LUCRO PRESUMIDO ======
  if (tenant.taxRegime === 'LUCRO_PRESUMIDO') {
    lines.push(joinPipe(['N001', '0']));
    blocoN++;

    // N100 - Apuração Lucro Presumido
    const lucroPresumido = await calculateLucroPresumido(tenantId, inicio, fim);
    lines.push(joinPipe([
      'N100',
      lucroPresumido.receitaBruta.toFixed(2).replace('.', ','),
      lucroPresumido.percentualPresumido.toFixed(2).replace('.', ','),
      lucroPresumido.baseCalculo.toFixed(2).replace('.', ','),
      lucroPresumido.irpjDevido.toFixed(2).replace('.', ','),
      lucroPresumido.csllDevido.toFixed(2).replace('.', ','),
    ]));
    blocoN++;

    // N200 - Receitas por atividade
    for (const rec of lucroPresumido.receitasPorAtividade) {
      lines.push(joinPipe(['N200', rec.codigo, rec.descricao, rec.receita.toFixed(2).replace('.', ','), rec.percentual.toFixed(2).replace('.', ','), rec.baseCalculo.toFixed(2).replace('.', ','), rec.irpj.toFixed(2).replace('.', ','), rec.csll.toFixed(2).replace('.', ',')]));
      blocoN++;
    }

    lines.push(joinPipe(['N990', String(blocoN + 1)]));
    blocoN++;
  }

  // ====== BLOCO P: PARTILHA (Lucro Real/Presumido com filiais) ======
  const childTenants = await prismaUnscoped.tenant.findMany({ where: { parentTenantId: tenantId }, select: { id: true, tradeName: true, cnpj: true } });
  if (childTenants.length > 0) {
    lines.push(joinPipe(['P001', '0']));
    blocoP++;

    for (const child of childTenants) {
      const partilha = await calculatePartilha(tenantId, child.id, inicio, fim);
      lines.push(joinPipe([
        'P100', child.cnpj.replace(/\D/g, ''), child.tradeName,
        partilha.receitaTotal.toFixed(2).replace('.', ','),
        partilha.receitaFilial.toFixed(2).replace('.', ','),
        partilha.percentual.toFixed(4).replace('.', ','),
        partilha.irpjFilial.toFixed(2).replace('.', ','),
        partilha.csllFilial.toFixed(2).replace('.', ','),
      ]));
      blocoP++;
    }

    lines.push(joinPipe(['P990', String(blocoP + 1)]));
    blocoP++;
  }

  // ====== BLOCO M: IMUNIDADE/ISENÇÃO ======
  lines.push(joinPipe(['M001', '0']));
  blocoM++;

  const immunities = await getImmunities(tenantId, inicio, fim);
  for (const imm of immunities) {
    lines.push(joinPipe(['M100', imm.codigo, imm.descricao, imm.baseLegal, imm.valor.toFixed(2).replace('.', ','), imm.periodo]));
    blocoM++;
  }

  lines.push(joinPipe(['M990', String(blocoM + 1)]));
  blocoM++;

  // ====== BLOCO Y: ENCERRAMENTO ======
  lines.push(joinPipe(['Y001', '0']));
  blocoY++;

  const totalRecords = blocoC + blocoL + blocoN + blocoP + blocoM + blocoY + 2;
  lines.push(joinPipe(['Y990', String(totalRecords)]));
  blocoY++;

  lines.push(joinPipe(['9999', String(totalRecords)]));
  blocoY++;

  const content = lines.join('\r\n') + '\r\n';
  const bytes = Buffer.byteLength(content, 'utf8');

  const fiscalDoc = await prismaUnscoped.officialTaxDocument.create({
    data: {
      tenantId,
      documentType: 'ECF',
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
    recordsCount: { blocoC, blocoL, blocoN, blocoP, blocoM, blocoY },
    fileSize: bytes,
    downloadUrl: `/api/accounting-office/sped/${fiscalDoc.id}/file`,
  };
}

function ecfBlocoCHeader(tenant: any, year: number, layoutVersion: string): string[] {
  return [
    `# FILITECH ERP - ECF ${year}`,
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

async function getECFParticipants(tenantId: string) {
  const suppliers = await prismaUnscoped.supplier.findMany({ where: { tenantId }, select: { document: true, name: true } });
  const clients = await prismaUnscoped.client.findMany({ where: { tenantId }, select: { document: true, name: true } });

  return [
    ...suppliers.map(s => ({ tipo: 'F', cnpjCpf: s.document.replace(/\D/g, ''), nome: s.name, codigo: '' })),
    ...clients.map(c => ({ tipo: 'C', cnpjCpf: c.document?.replace(/\D/g, '') ?? '', nome: c.name, codigo: '' })),
  ];
}

async function getInventoryItems(tenantId: string, date: Date) {
  const products = await prismaUnscoped.product.findMany({
    where: { tenantId, active: true, stockQuantity: { gt: 0 } },
    select: { sku: true, name: true, unit: true, stockQuantity: true, averageCost: true },
  });

  return products.map(p => ({
    codigo: p.sku,
    descricao: p.name,
    unidade: p.unit,
    quantidade: Number(p.stockQuantity),
    valorUnitario: Number(p.averageCost ?? 0),
    valorTotal: Number(p.stockQuantity) * Number(p.averageCost ?? 0),
  }));
}

async function calculateLucroReal(tenantId: string, inicio: Date, fim: Date) {
  // Busca dados do DRE para o período
  const dre = await getDREData(tenantId, inicio, fim);

  const receitaBruta = dre.receitaBruta;
  const custos = dre.custos;
  const despesasOperacionais = dre.despesasOperacionais;
  const resultadoBruto = receitaBruta - custos - despesasOperacionais;

  // Adições (não dedutíveis)
  const adicoesDetalhe = [
    { codigo: '01', descricao: 'Despesas não dedutíveis (Art. 13 RIPI)', valor: dre.naoDedutiveis },
    { codigo: '02', descricao: 'Multas e penalidades', valor: dre.multaPenalidades },
    { codigo: '03', descricao: 'Doações não incentivadas', valor: dre.doacoesNaoIncentivadas },
    { codigo: '04', descricao: 'Provisões não realizadas', valor: dre.provisaoNaoRealizada },
  ];
  const adicoes = adicoesDetalhe.reduce((s, a) => s + a.valor, 0);

  // Exclusões (isentas/não tributadas)
  const exclusoesDetalhe = [
    { codigo: '01', descricao: 'Receitas de exportação', valor: dre.receitaExportacao },
    { codigo: '02', descricao: 'Dividendos/JCP recebidos', valor: dre.dividendosRecebidos },
    { codigo: '03', descricao: 'Reversão de provisões', valor: dre.reversaoProvisao },
  ];
  const exclusoes = exclusoesDetalhe.reduce((s, e) => s + e.valor, 0);

  const lucroLiquido = resultadoBruto + adicoes - exclusoes;
  const prejuizoAnterior = await getPrejuizoFiscal(tenantId, inicio);
  const prejuizoCompensado = Math.min(Math.max(0, lucroLiquido) * 0.3, prejuizoAnterior); // Limite 30%
  const baseCalculoIRPJ = Math.max(0, lucroLiquido - prejuizoCompensado);
  const irpjDevido = baseCalculoIRPJ * 0.15 + Math.max(0, baseCalculoIRPJ - 240000) * 0.10; // 15% + 10% adicional
  const baseCalculoCSLL = Math.max(0, lucroLiquido - prejuizoCompensado);
  const csllDevido = baseCalculoCSLL * 0.09;
  const prejuizoSaldo = prejuizoAnterior - prejuizoCompensado;

  return {
    receitaBruta, custos, despesasOperacionais, resultadoBruto,
    adicoes, adicoesDetalhe, exclusoes, exclusoesDetalhe,
    lucroLiquido, baseCalculoIRPJ, irpjDevido, baseCalculoCSLL, csllDevido,
    prejuizoAnterior, prejuizoCompensado, prejuizoSaldo,
  };
}

async function calculateLucroPresumido(tenantId: string, inicio: Date, fim: Date) {
  const sales = await prismaUnscoped.sale.groupBy({
    by: ['productId'],
    where: { tenantId, createdAt: { gte: inicio, lte: fim } },
    _sum: { totalAmount: true },
  });

  const productIds = sales.map(s => s.productId);
  const products = await prismaUnscoped.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, ncm: true },
  });

  // Percentuais de presunção por NCM/atividade (simplificado)
  const receitasPorAtividade = new Map<string, { receita: number; percentual: number }>();

  for (const sale of sales) {
    const product = products.find(p => p.id === sale.productId);
    const percentual = getPresumidoPercentual(product?.ncm);
    const key = percentual.toString();
    const existing = receitasPorAtividade.get(key) ?? { receita: 0, percentual };
    existing.receita += Number(sale._sum.totalAmount ?? 0);
    receitasPorAtividade.set(key, existing);
  }

  const receitaBruta = Array.from(receitasPorAtividade.values()).reduce((s, r) => s + r.receita, 0);
  const baseCalculo = Array.from(receitasPorAtividade.values()).reduce((s, r) => s + r.receita * r.percentual / 100, 0);
  const irpjDevido = baseCalculo * 0.15;
  const csllDevido = baseCalculo * 0.09;

  return {
    receitaBruta,
    percentualPresumido: receitaBruta > 0 ? baseCalculo / receitaBruta * 100 : 0,
    baseCalculo,
    irpjDevido,
    csllDevido,
    receitasPorAtividade: Array.from(receitasPorAtividade.entries()).map(([codigo, r]) => ({ codigo, descricao: `Atividade ${codigo}%`, ...r })),
  };
}

function getPresumidoPercentual(ncm?: string | null): number {
  if (!ncm) return 32; // Serviços gerais
  const firstTwo = ncm.slice(0, 2);
  // Tabela simplificada de percentuais de presunção
  const map: Record<string, number> = {
    '01': 1.6, '02': 1.6, '03': 1.6, '04': 1.6, '05': 1.6, '06': 1.6, '07': 1.6, '08': 1.6, '09': 1.6, '10': 1.6, // Agro
    '11': 1.6, '12': 1.6, '13': 1.6, '14': 1.6, '15': 1.6, '16': 1.6, '17': 1.6, '18': 1.6, '19': 1.6, '20': 1.6, // Alimentos
    '21': 1.6, '22': 32, '23': 32, '24': 32, '25': 32, '26': 32, '27': 32, '28': 32, '29': 32, '30': 32, // Bebidas/Tabaco
    '31': 32, '32': 32, '33': 32, '34': 32, '35': 32, '36': 32, '37': 32, '38': 32, '39': 32, '40': 32,
    '41': 32, '42': 32, '43': 32, '44': 32, '45': 32, '46': 32, '47': 32, '48': 32, '49': 32, '50': 32,
    '51': 32, '52': 32, '53': 32, '54': 32, '55': 32, '56': 32, '57': 32, '58': 32, '59': 32, '60': 32,
    '61': 32, '62': 32, '63': 32, '64': 32, '65': 32, '66': 32, '67': 32, '68': 32, '69': 32, '70': 32,
    '71': 32, '72': 32, '73': 32, '74': 32, '75': 32, '76': 32, '77': 32, '78': 32, '79': 32, '80': 32,
    '81': 32, '82': 32, '83': 32, '84': 32, '85': 32, '86': 32, '87': 32, '88': 32, '89': 32, '90': 32,
    '91': 32, '92': 32, '93': 32, '94': 32, '95': 32, '96': 32, '97': 32, '98': 32, '99': 32,
  };
  return map[firstTwo] ?? 32;
}

async function calculatePartilha(parentId: string, childId: string, inicio: Date, fim: Date) {
  const childSales = await prismaUnscoped.sale.aggregate({
    where: { tenantId: childId, createdAt: { gte: inicio, lte: fim } },
    _sum: { totalAmount: true },
  });
  const totalSales = await prismaUnscoped.sale.aggregate({
    where: { tenantId: parentId, createdAt: { gte: inicio, lte: fim } },
    _sum: { totalAmount: true },
  });

  const receitaFilial = Number(childSales._sum.totalAmount ?? 0);
  const receitaTotal = Number(totalSales._sum.totalAmount ?? 0);
  const percentual = receitaTotal > 0 ? receitaFilial / receitaTotal : 0;

  // IRPJ/CSLL da matriz já calculado, partilha proporcional
  const parentDRE = await getDREData(parentId, inicio, fim);
  const irpjTotal = Math.max(0, parentDRE.lucroLiquido) * 0.15;
  const csllTotal = Math.max(0, parentDRE.lucroLiquido) * 0.09;

  return {
    receitaTotal,
    receitaFilial,
    percentual,
    irpjFilial: irpjTotal * percentual,
    csllFilial: csllTotal * percentual,
  };
}

async function getImmunities(tenantId: string, inicio: Date, fim: Date) {
  // Busca receitas imunes/isentas (exportação, entidades beneficentes, etc.)
  const immunities: any[] = [];

  // Exportação
  const exportSales = await prismaUnscoped.sale.aggregate({
    where: { tenantId, createdAt: { gte: inicio, lte: fim }, operationType: 'EXPORTACAO' },
    _sum: { totalAmount: true },
  });
  if (Number(exportSales._sum.totalAmount ?? 0) > 0) {
    immunities.push({ codigo: '01', descricao: 'Receita de exportação', baseLegal: 'Art. 150, VI, "a" CF/88', valor: Number(exportSales._sum.totalAmount), periodo: 'ANUAL' });
  }

  return immunities;
}

async function getDREData(tenantId: string, inicio: Date, fim: Date) {
  const receitaBruta = await prismaUnscoped.sale.aggregate({
    where: { tenantId, createdAt: { gte: inicio, lte: fim } },
    _sum: { totalAmount: true },
  });

  const custos = await prismaUnscoped.accountPayable.aggregate({
    where: { tenantId, createdAt: { gte: inicio, lte: fim }, category: 'COST' },
    _sum: { amount: true },
  });

  const despesasOperacionais = await prismaUnscoped.accountPayable.aggregate({
    where: { tenantId, createdAt: { gte: inicio, lte: fim }, category: 'EXPENSE' },
    _sum: { amount: true },
  });

  return {
    receitaBruta: Number(receitaBruta._sum.totalAmount ?? 0),
    custos: Number(custos._sum.amount ?? 0),
    despesasOperacionais: Number(despesasOperacionais._sum.amount ?? 0),
    naoDedutiveis: 0,
    multaPenalidades: 0,
    doacoesNaoIncentivadas: 0,
    provisaoNaoRealizada: 0,
    receitaExportacao: 0,
    dividendosRecebidos: 0,
    reversaoProvisao: 0,
    lucroLiquido: 0,
  };
}

async function getPrejuizoFiscal(tenantId: string, date: Date): Promise<number> {
  // Busca prejuízo fiscal acumulado de anos anteriores
  const previousYears = await prismaUnscoped.officialTaxDocument.findMany({
    where: { tenantId, documentType: 'ECF', competenciaFim: { lt: date } },
    orderBy: { competenciaFim: 'desc' },
    take: 5,
  });

  let totalPrejuizo = 0;
  for (const doc of previousYears) {
    // Extrai prejuízo do arquivo (simplificado)
    totalPrejuizo += 0; // Implementar leitura do arquivo se necessário
  }
  return totalPrejuizo;
}