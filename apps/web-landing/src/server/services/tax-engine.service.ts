// src/server/services/tax-engine.service.ts — Cap. 21
// Motor de cálculo tributário completo — ICMS/ST, ISS/Fator-r, PIS/COFINS monofásico, DIFAL, base reduzida veículos, Reforma Tributária (IBS/CBS)
import { Prisma } from '@prisma/client';
import { prismaUnscoped } from '../db';
import { DomainError } from '../api-envelope';

type TransactionClient = Omit<Prisma.TransactionClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

export interface TaxInput {
  tenantId: string;
  items: Array<{
    productId: string;
    quantity: number;
    unitPrice: number;
    ncm?: string;
    cest?: string;
    cfop?: string;
  }>;
  customerState?: string;
  operationType: 'SALE' | 'RETURN' | 'BONIFICACAO' | 'TRANSFERENCIA' | 'INDUSTRIALIZACAO' | 'DEVOLUCAO';
  shippingFreight?: number;
  insuranceValue?: number;
  otherExpenses?: number;
  discount?: number;
}

export interface TaxResult {
  icms: { base: number; value: number; stBase?: number; stValue?: number; difalValue?: number };
  ipi: { base: number; value: number };
  pis: { base: number; value: number; cofins: number };
  cofins: { base: number; value: number };
  iss: { base: number; value: number; factorR?: number };
  totalTaxes: number;
  breakdown: TaxBreakdownItem[];
  alerts: string[];
}

export interface TaxBreakdownItem {
  productId: string;
  ncm: string;
  cfop: string;
  icms: { aliquota: number; base: number; value: number; st?: { base: number; value: number }; difal?: number };
  ipi: { aliquota: number; base: number; value: number };
  pis: { aliquota: number; base: number; value: number; regime: 'MONOFASICO' | 'NAO_CUMULATIVO' | 'CUMULATIVO' };
  cofins: { aliquota: number; base: number; value: number; regime: 'MONOFASICO' | 'NAO_CUMULATIVO' | 'CUMULATIVO' };
  iss: { aliquota: number; base: number; value: number };
  total: number;
}

/**
 * Calcula tributos completos para uma venda.
 * Respeita regime do tenant (MEI, SIMPLES_NACIONAL, LUCRO_PRESUMIDO, LUCRO_REAL),
 * NCM do produto, CST/CSOSN, regras de ICMS-ST, DIFAL, PIS/COFINS monofásico,
 * ISS com Fator-r, e Reforma Tributária (IBS/CBS) quando vigente.
 */
export async function calculateFullTax(input: TaxInput): Promise<TaxResult> {
  const { tenantId, items, customerState, operationType, shippingFreight, insuranceValue, otherExpenses, discount } = input;

  const tenant = await prismaUnscoped.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { taxRegime: true, simplesNacionalAnexo: true, uf: true, ibsCbsRegimeElections: true },
  });

  const originState = tenant.uf ?? 'SP';
  const destState = customerState ?? originState;
  const isInterstate = originState !== destState;

  // Busca regras fiscais do tenant (NCM + UF origem/destino)
  const taxRules = await getApplicableTaxRules(tenantId, items.map(i => i.ncm).filter(Boolean) as string[], originState, destState);

  // Busca produtos para validar NCM/CEST
  const productIds = items.map(i => i.productId);
  const products = await prismaUnscoped.product.findMany({
    where: { id: { in: productIds }, tenantId },
    select: { id: true, ncm: true, cest: true, taxOrigin: true, icmsStBaseReduction: true, ipiRate: true, pisCofinsMonofasico: true, serviceType: true },
  });
  const productMap = new Map(products.map(p => [p.id, p]));

  const breakdown: TaxBreakdownItem[] = [];
  const alerts: string[] = [];
  let totalTaxes = 0;

  for (const item of items) {
    const product = productMap.get(item.productId);
    if (!product) {
      alerts.push(`Produto ${item.productId} não encontrado — tributação padrão aplicada`);
    }

    const ncm = product?.ncm ?? item.ncm ?? '00000000';
    const cest = product?.cest ?? item.cest;
    const rule = taxRules.get(`${ncm}|${originState}|${destState}`) ?? taxRules.get(`${ncm}|${originState}|*`) ?? getDefaultRule(tenant.taxRegime);

    const lineTotal = item.quantity * item.unitPrice;
    const lineDiscount = discount ? (lineTotal * discount / 100) : 0;
    const taxableBase = lineTotal - lineDiscount;

    // CFOP resolve automaticamente se não informado
    const cfop = item.cfop ?? await resolveCFOP({ tenantId, operationType, originState, destState, ncm, cest });

    // ICMS
    const icmsResult = calculateICMS({
      regime: tenant.taxRegime,
      anexo: tenant.simplesNacionalAnexo,
      taxableBase,
      rule,
      originState,
      destState,
      isInterstate,
      cfop,
      cest,
      ncm,
      icmsStBaseReduction: product?.icmsStBaseReduction,
    });

    // IPI
    const ipiResult = calculateIPI({
      regime: tenant.taxRegime,
      taxableBase,
      ipiRate: product?.ipiRate ?? rule.ipiRate ?? 0,
      cfop,
    });

    // PIS/COFINS
    const pisCofinsResult = calculatePISCOFINS({
      regime: tenant.taxRegime,
      anexo: tenant.simplesNacionalAnexo,
      taxableBase,
      monofasico: product?.pisCofinsMonofasico ?? rule.pisCofinsMonofasico ?? false,
      pisRate: rule.pisRate,
      cofinsRate: rule.cofinsRate,
      cfop,
    });

    // ISS (serviços)
    const issResult = calculateISS({
      regime: tenant.taxRegime,
      anexo: tenant.simplesNacionalAnexo,
      taxableBase,
      serviceType: product?.serviceType,
      factorR: rule.factorR,
      cfop,
    });

    const itemTotalTax = icmsResult.value + icmsResult.stValue + icmsResult.difalValue + ipiResult.value + pisCofinsResult.pis + pisCofinsResult.cofins + issResult.value;
    totalTaxes += itemTotalTax;

    breakdown.push({
      productId: item.productId,
      ncm,
      cfop,
      icms: { aliquota: rule.icmsRate, base: icmsResult.base, value: icmsResult.value, st: icmsResult.stBase ? { base: icmsResult.stBase, value: icmsResult.stValue } : undefined, difal: icmsResult.difalValue },
      ipi: { aliquota: rule.ipiRate ?? 0, base: ipiResult.base, value: ipiResult.value },
      pis: { aliquota: pisCofinsResult.pisRate, base: pisCofinsResult.base, value: pisCofinsResult.pis, regime: pisCofinsResult.pisRegime },
      cofins: { aliquota: pisCofinsResult.cofinsRate, base: pisCofinsResult.base, value: pisCofinsResult.cofins, regime: pisCofinsResult.cofinsRegime },
      iss: { aliquota: issResult.aliquota, base: issResult.base, value: issResult.value },
      total: itemTotalTax,
    });
  }

  // Reforma Tributária (IBS/CBS) - verifica se tenant optou pelo regime
  const ibsCbs = await calculateIBSCBS(tenantId, breakdown, tenant.ibsCbsRegimeElections);

  return {
    icms: { base: breakdown.reduce((s, b) => s + b.icms.base, 0), value: breakdown.reduce((s, b) => s + b.icms.value, 0), stBase: breakdown.reduce((s, b) => s + (b.icms.st?.base ?? 0), 0), stValue: breakdown.reduce((s, b) => s + (b.icms.st?.value ?? 0), 0), difalValue: breakdown.reduce((s, b) => s + (b.icms.difal ?? 0), 0) },
    ipi: { base: breakdown.reduce((s, b) => s + b.ipi.base, 0), value: breakdown.reduce((s, b) => s + b.ipi.value, 0) },
    pis: { base: breakdown.reduce((s, b) => s + b.pis.base, 0), value: breakdown.reduce((s, b) => s + b.pis.value, 0), cofins: breakdown.reduce((s, b) => s + b.cofins.value, 0) },
    cofins: { base: breakdown.reduce((s, b) => s + b.cofins.base, 0), value: breakdown.reduce((s, b) => s + b.cofins.value, 0) },
    iss: { base: breakdown.reduce((s, b) => s + b.iss.base, 0), value: breakdown.reduce((s, b) => s + b.iss.value, 0), factorR: breakdown[0]?.iss.factorR },
    totalTaxes: totalTaxes + ibsCbs.total,
    breakdown,
    alerts,
  };
}

interface TaxRule {
  icmsRate: number;
  icmsStRate?: number;
  icmsStBaseReduction?: number;
  mvaSt?: number;
  pivaSt?: number;
  ipiRate?: number;
  pisRate: number;
  cofinsRate: number;
  pisCofinsMonofasico: boolean;
  issRate?: number;
  factorR?: number;
  difalEnabled: boolean;
  fcpRate?: number;
}

async function getApplicableTaxRules(tenantId: string, ncms: string[], originState: string, destState: string): Promise<Map<string, TaxRule>> {
  const rules = await prismaUnscoped.taxRule.findMany({
    where: {
      tenantId,
      ncm: { in: ncms },
      OR: [
        { originState, destState },
        { originState, destState: null },
        { originState: null, destState },
        { originState: null, destState: null },
      ],
      active: true,
    },
    orderBy: [
      { originState: 'desc' },
      { destState: 'desc' },
      { priority: 'desc' },
    ],
  });

  const map = new Map<string, TaxRule>();
  for (const rule of rules) {
    const key = `${rule.ncm}|${rule.originState ?? '*'}|${rule.destState ?? '*'}`;
    if (!map.has(key)) map.set(key, rule as TaxRule);
  }
  return map;
}

function getDefaultRule(regime: string): TaxRule {
  const base = {
    icmsRate: regime === 'MEI' ? 0 : 18,
    pisRate: regime === 'MEI' ? 0 : 0.65,
    cofinsRate: regime === 'MEI' ? 0 : 3,
    pisCofinsMonofasico: false,
    difalEnabled: true,
  };
  if (regime === 'SIMPLES_NACIONAL') {
    return { ...base, icmsRate: 0, pisRate: 0, cofinsRate: 0, issRate: 2, factorR: 0.5 };
  }
  if (regime === 'LUCRO_PRESUMIDO') {
    return { ...base, icmsRate: 18, pisRate: 0.65, cofinsRate: 3, issRate: 5 };
  }
  return { ...base, icmsRate: 18, pisRate: 1.65, cofinsRate: 7.6, issRate: 5 };
}

function calculateICMS(params: {
  regime: string;
  anexo?: string | null;
  taxableBase: number;
  rule: TaxRule;
  originState: string;
  destState: string;
  isInterstate: boolean;
  cfop: string;
  cest?: string | null;
  ncm: string;
  icmsStBaseReduction?: number | null;
}): { base: number; value: number; stBase?: number; stValue?: number; difalValue?: number } {
  const { regime, rule, taxableBase, isInterstate, originState, destState, icmsStBaseReduction } = params;

  if (regime === 'MEI' || regime === 'SIMPLES_NACIONAL') {
    return { base: 0, value: 0 };
  }

  let base = taxableBase;
  let aliquota = rule.icmsRate;

  // Redução de base ICMS-ST (veículos, medicamentos, etc.)
  if (icmsStBaseReduction && rule.icmsStRate) {
    base = taxableBase * (1 - icmsStBaseReduction / 100);
  }

  // ICMS normal
  const value = base * aliquota / 100;

  // ICMS-ST (Substituição Tributária)
  let stBase: number | undefined;
  let stValue: number | undefined;
  if (rule.icmsStRate && rule.mvaSt) {
    stBase = taxableBase * (1 + rule.mvaSt / 100);
    if (icmsStBaseReduction) stBase = stBase * (1 - icmsStBaseReduction / 100);
    stValue = stBase * rule.icmsStRate / 100 - value;
    if (stValue < 0) stValue = 0;
  }

  // DIFAL (Diferencial de Alíquota interestadual)
  let difalValue = 0;
  if (isInterstate && rule.difalEnabled && regime === 'LUCRO_REAL') {
    const destRate = await getInterstateRate(originState, destState, params.ncm);
    difalValue = taxableBase * Math.max(0, destRate - aliquota) / 100;
  }

  return { base, value, stBase, stValue, difalValue };
}

async function getInterstateRate(origin: string, dest: string, ncm: string): Promise<number> {
  // Consulta tabela de alíquotas interestaduais (4%, 7%, 12%) por NCM/UF
  const rule = await prismaUnscoped.taxRule.findFirst({
    where: { ncm, originState: origin, destState: dest, active: true },
    select: { icmsRate: true },
  });
  return rule?.icmsRate ?? (['SP', 'RJ', 'MG', 'ES'].includes(dest) ? 12 : 7);
}

function calculateIPI(params: { regime: string; taxableBase: number; ipiRate: number; cfop: string }): { base: number; value: number } {
  if (params.ipiRate === 0) return { base: 0, value: 0 };
  if (params.cfop.startsWith('5') || params.cfop.startsWith('6')) return { base: 0, value: 0 }; // Entradas não geram IPI na saída
  return { base: params.taxableBase, value: params.taxableBase * params.ipiRate / 100 };
}

function calculatePISCOFINS(params: {
  regime: string;
  anexo?: string | null;
  taxableBase: number;
  monofasico: boolean;
  pisRate: number;
  cofinsRate: number;
  cfop: string;
}): { base: number; pis: number; cofins: number; pisRate: number; cofinsRate: number; pisRegime: string; cofinsRegime: string } {
  const { regime, anexo, taxableBase, monofasico, pisRate, cofinsRate } = params;

  if (regime === 'MEI') return { base: 0, pis: 0, cofins: 0, pisRate: 0, cofinsRate: 0, pisRegime: 'ISENTO', cofinsRegime: 'ISENTO' };
  if (regime === 'SIMPLES_NACIONAL') return { base: 0, pis: 0, cofins: 0, pisRate: 0, cofinsRate: 0, pisRegime: 'SIMPLES', cofinsRegime: 'SIMPLES' };

  if (monofasico) {
    // Monofásico: alíquota concentrada na indústria/importador, varejo não recolhe
    return { base: taxableBase, pis: 0, cofins: 0, pisRate: 0, cofinsRate: 0, pisRegime: 'MONOFASICO', cofinsRegime: 'MONOFASICO' };
  }

  const pis = taxableBase * pisRate / 100;
  const cofins = taxableBase * cofinsRate / 100;
  return { base: taxableBase, pis, cofins, pisRate, cofinsRate, pisRegime: regime === 'LUCRO_REAL' ? 'NAO_CUMULATIVO' : 'CUMULATIVO', cofinsRegime: regime === 'LUCRO_REAL' ? 'NAO_CUMULATIVO' : 'CUMULATIVO' };
}

function calculateISS(params: {
  regime: string;
  anexo?: string | null;
  taxableBase: number;
  serviceType?: string | null;
  factorR?: number | null;
  cfop: string;
}): { base: number; value: number; aliquota: number; factorR?: number } {
  const { regime, anexo, taxableBase, factorR } = params;

  if (regime === 'MEI') return { base: 0, value: 0, aliquota: 0 };
  if (regime === 'SIMPLES_NACIONAL') {
    // Anexo III (Serviços) ou Anexo V (ISS) - Fator-r define alíquota efetiva
    const aliquotaEfetiva = anexo === 'ANEXO_V' && factorR ? factorR * 100 : 5;
    return { base: taxableBase, value: taxableBase * aliquotaEfetiva / 100, aliquota: aliquotaEfetiva, factorR };
  }
  return { base: taxableBase, value: taxableBase * (params.aliquota ?? 5) / 100, aliquota: params.aliquota ?? 5 };
}

async function calculateIBSCBS(tenantId: string, breakdown: TaxBreakdownItem[], elections: any[]): Promise<{ total: number }> {
  // Reforma Tributária (EC 132/2023) - IBS/CBS transição 2026-2033
  // Só calcula se tenant optou pelo regime e ano >= 2026
  const now = new Date();
  if (now.getFullYear() < 2026) return { total: 0 };

  const hasElection = elections.some(e => e.status === 'ELECTED' && new Date(e.electedAt) <= now);
  if (!hasElection) return { total: 0 };

  // IBS (estadual/municipal) + CBS (federal) - alíquotas de referência
  const ibsRate = 0.175; // 17.5% referência
  const cbsRate = 0.088; // 8.8% referência

  const taxableBase = breakdown.reduce((s, b) => s + b.icms.base + b.ipi.base + b.pis.base + b.cofins.base + b.iss.base, 0);
  const ibs = taxableBase * ibsRate;
  const cbs = taxableBase * cbsRate;

  // Créditos de transição (reaproveita ICMS/IPI/PIS/COFINS já pagos)
  const credits = breakdown.reduce((s, b) => s + b.icms.value + b.ipi.value + b.pis.value + b.cofins.value, 0);

  return { total: Math.max(0, ibs + cbs - credits * 0.2) }; // 20% de crédito na transição
}

async function resolveCFOP(input: { tenantId: string; operationType: string; originState: string; destState: string; ncm: string; cest?: string | null }): Promise<string> {
  const { operationType, originState, destState, ncm, cest } = input;

  // Busca CFOP cadastrado para a operação
  const cfopRule = await prismaUnscoped.cfopRule.findFirst({
    where: {
      tenantId: input.tenantId,
      operationType,
      originState,
      destState,
      ncm: { in: [ncm, '*'] },
      active: true,
    },
    orderBy: { priority: 'desc' },
  });

  if (cfopRule) return cfopRule.cfop;

  // Fallback: CFOP padrão por operação/UF
  const isInterstate = originState !== destState;
  const prefix = isInterstate ? '6' : '5';

  switch (operationType) {
    case 'SALE': return `${prefix}.102`; // Venda de mercadoria
    case 'RETURN': return `${prefix}.202`; // Devolução
    case 'BONIFICACAO': return `${prefix}.910`; // Bonificação
    case 'TRANSFERENCIA': return `${prefix}.556`; // Transferência
    case 'INDUSTRIALIZACAO': return `${prefix}.401`; // Industrialização
    default: return `${prefix}.102`;
  }
}