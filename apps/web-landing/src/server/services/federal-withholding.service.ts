// src/server/services/federal-withholding.service.ts — Cap. 21.19
// Retenções Federais B2B — IRRF, PIS, COFINS, CSLL, INSS sobre serviços tomados
import { prismaUnscoped } from '../db';
import { DomainError } from '../api-envelope';

export interface WithholdingCalculationInput {
  tenantId: string;
  supplierId: string;
  serviceCategory: string;
  grossAmount: number;
  issIncluded?: boolean; // Se ISS já está incluso no valor bruto
}

export interface WithholdingResult {
  irrf: { base: number; rate: number; value: number; code: string };
  pis: { base: number; rate: number; value: number; code: string };
  cofins: { base: number; rate: number; value: number; code: string };
  csll: { base: number; rate: number; value: number; code: string };
  inss: { base: number; rate: number; value: number; code: string };
  iss: { base: number; rate: number; value: number; code: string };
  totalWithheld: number;
  netAmount: number;
  alerts: string[];
}

/**
 * Calcula todas as retenções federais aplicáveis a um pagamento de serviço.
 * Regras baseadas na legislação vigente (IN RFB 1.127/2011, Lei 10.833/2003, etc.)
 */
export async function calculateFederalWithholding(input: WithholdingCalculationInput): Promise<WithholdingResult> {
  const { tenantId, supplierId, serviceCategory, grossAmount, issIncluded = false } = input;

  const alerts: string[] = [];

  // Busca dados do fornecedor
  const supplier = await prismaUnscoped.supplier.findUniqueOrThrow({
    where: { id: supplierId, tenantId },
    select: { document: true, name: true, optanteSimples: true, mei: true, retentionExempt: true },
  });

  // Se fornecedor optante pelo Simples/MEI e isento de retenção federal
  if (supplier.optanteSimples || supplier.mei) {
    if (supplier.retentionExempt) {
      alerts.push('Fornecedor optante pelo Simples Nacional/MEI com isenção de retenção federal (Art. 13, Lei 10.833/2003)');
      return zeroWithholding(grossAmount, alerts);
    }
  }

  // Base de cálculo: valor bruto menos ISS (se ISS não estiver incluso)
  let baseCalculo = grossAmount;
  let issValue = 0;

  if (!issIncluded) {
    // ISS retido na fonte (tomador) - base = valor bruto
    const issRate = getISSRates(serviceCategory);
    issValue = baseCalculo * issRate;
    baseCalculo = baseCalculo - issValue;
  } else {
    // ISS já incluso no valor bruto - extrai ISS
    const issRate = getISSRates(serviceCategory);
    issValue = baseCalculo * issRate / (1 + issRate);
    baseCalculo = baseCalculo - issValue;
  }

  // IRRF - Imposto de Renda Retido na Fonte
  // Alíquotas: 1.5% (serviços profissionais), 4.8% (outras), isento para alguns
  const irrfRate = getIRRFRate(serviceCategory, supplier);
  const irrfValue = baseCalculo * irrfRate;

  // PIS - 0.65% (cumulativo) ou 1% (não cumulativo) - retenção 1% sobre base
  const pisRate = 0.01; // 1% retenção na fonte
  const pisValue = baseCalculo * pisRate;

  // COFINS - 3% (cumulativo) ou 7.6% (não cumulativo) - retenção 3% sobre base
  const cofinsRate = 0.03; // 3% retenção na fonte
  const cofinsValue = baseCalculo * cofinsRate;

  // CSLL - 1% (serviços) ou 2% (outras) - retenção na fonte
  const csllRate = getCSLLRate(serviceCategory);
  const csllValue = baseCalculo * csllRate;

  // INSS - 11% sobre base de cálculo (serviços com cessão de mão de obra/empreitada)
  const inssRate = getINSSRate(serviceCategory);
  const inssValue = inssRate > 0 ? baseCalculo * inssRate : 0;

  // Limite mínimo para retenção (R$ 10,00 para IRRF, R$ 5,00 para demais)
  const finalIRRF = irrfValue >= 10 ? Math.round(irrfValue * 100) / 100 : 0;
  const finalPIS = pisValue >= 5 ? Math.round(pisValue * 100) / 100 : 0;
  const finalCOFINS = cofinsValue >= 5 ? Math.round(cofinsValue * 100) / 100 : 0;
  const finalCSLL = csllValue >= 5 ? Math.round(csllValue * 100) / 100 : 0;
  const finalINSS = inssValue >= 5 ? Math.round(inssValue * 100) / 100 : 0;
  const finalISS = issValue >= 5 ? Math.round(issValue * 100) / 100 : 0;

  if (finalIRRF === 0 && irrfValue > 0) alerts.push(`IRRF (R$ ${irrfValue.toFixed(2)}) abaixo do mínimo de R$ 10,00 - não retido`);
  if (finalPIS === 0 && pisValue > 0) alerts.push(`PIS (R$ ${pisValue.toFixed(2)}) abaixo do mínimo de R$ 5,00 - não retido`);
  if (finalCOFINS === 0 && cofinsValue > 0) alerts.push(`COFINS (R$ ${cofinsValue.toFixed(2)}) abaixo do mínimo de R$ 5,00 - não retido`);
  if (finalCSLL === 0 && csllValue > 0) alerts.push(`CSLL (R$ ${csllValue.toFixed(2)}) abaixo do mínimo de R$ 5,00 - não retido`);
  if (finalINSS === 0 && inssValue > 0) alerts.push(`INSS (R$ ${inssValue.toFixed(2)}) abaixo do mínimo de R$ 5,00 - não retido`);

  const totalWithheld = finalIRRF + finalPIS + finalCOFINS + finalCSLL + finalINSS + finalISS;
  const netAmount = grossAmount - totalWithheld;

  return {
    irrf: { base: baseCalculo, rate: irrfRate, value: finalIRRF, code: '1001' },
    pis: { base: baseCalculo, rate: pisRate, value: finalPIS, code: '1002' },
    cofins: { base: baseCalculo, rate: cofinsRate, value: finalCOFINS, code: '1003' },
    csll: { base: baseCalculo, rate: csllRate, value: finalCSLL, code: '1004' },
    inss: { base: baseCalculo, rate: inssRate, value: finalINSS, code: '1005' },
    iss: { base: grossAmount, rate: issIncluded ? 0 : getISSRates(serviceCategory), value: finalISS, code: '1006' },
    totalWithheld,
    netAmount,
    alerts,
  };
}

function zeroWithholding(grossAmount: number, alerts: string[]): WithholdingResult {
  return {
    irrf: { base: 0, rate: 0, value: 0, code: '1001' },
    pis: { base: 0, rate: 0, value: 0, code: '1002' },
    cofins: { base: 0, rate: 0, value: 0, code: '1003' },
    csll: { base: 0, rate: 0, value: 0, code: '1004' },
    inss: { base: 0, rate: 0, value: 0, code: '1005' },
    iss: { base: 0, rate: 0, value: 0, code: '1006' },
    totalWithheld: 0,
    netAmount: grossAmount,
    alerts,
  };
}

function getIRRFRate(serviceCategory: string, supplier: any): number {
  // Tabela de alíquotas IRRF por categoria de serviço (IN RFB 1.127/2011)
  const rates: Record<string, number> = {
    // 1.5% - Serviços profissionais (Art. 647, Dec. 3.000/1999)
    'ADVOCACIA': 0.015,
    'CONTABILIDADE': 0.015,
    'ENGENHARIA': 0.015,
    'ARQUITETURA': 0.015,
    'MEDICINA': 0.015,
    'ODONTOLOGIA': 0.015,
    'PSICOLOGIA': 0.015,
    'AUDITORIA': 0.015,
    'CONSULTORIA': 0.015,
    'CORRETAGEM': 0.015,
    'ADMINISTRACAO': 0.015,

    // 4.8% - Serviços em geral
    'LIMPEZA': 0.048,
    'VIGILANCIA': 0.048,
    'TRANSPORTE': 0.048,
    'MANUTENCAO': 0.048,
    'CONSTRUCAO': 0.048,
    'INFORMATICA': 0.048,
    'PUBLICIDADE': 0.048,
    'HOTELARIA': 0.048,
    'ALIMENTACAO': 0.048,
    'EDUCACAO': 0.048,
    'SERVICOS_GERAIS': 0.048,
  };

  // Isenções: óleo diesel, energia elétrica, transporte coletivo, etc.
  const isento = ['OLEO_DIESEL', 'ENERGIA_ELETRICA', 'TRANSPORTE_COLETIVO', 'COMBUSTIVEIS'];
  if (isento.includes(serviceCategory.toUpperCase())) return 0;

  return rates[serviceCategory.toUpperCase()] ?? 0.048; // Default 4.8%
}

function getCSLLRate(serviceCategory: string): number {
  // CSLL retido na fonte: 1% (serviços) ou 2% (demais)
  const onePercent = [
    'ADVOCACIA', 'CONTABILIDADE', 'ENGENHARIA', 'ARQUITETURA', 'MEDICINA',
    'ODONTOLOGIA', 'PSICOLOGIA', 'AUDITORIA', 'CONSULTORIA', 'CORRETAGEM',
    'ADMINISTRACAO', 'INFORMATICA', 'PUBLICIDADE',
  ];
  return onePercent.includes(serviceCategory.toUpperCase()) ? 0.01 : 0.02;
}

function getINSSRate(serviceCategory: string): number {
  // INSS retido na fonte (11%) - apenas para cessão de mão de obra/empreitada
  // Art. 31, Lei 8.212/1991
  const comCessaoMaoObra = [
    'LIMPEZA', 'VIGILANCIA', 'CONSTRUCAO', 'MANUTENCAO',
    'SERVICOS_GERAIS', 'CONSERVACAO', 'JARDINAGEM',
  ];
  return comCessaoMaoObra.includes(serviceCategory.toUpperCase()) ? 0.11 : 0;
}

function getISSRates(serviceCategory: string): number {
  // ISS varia por município (2% a 5%) - usa alíquota padrão 5%
  // Para retenção na fonte, usa alíquota do município do tomador
  return 0.05; // 5% padrão
}

/**
 * Gera DARF para recolhimento das retenções
 */
export async function generateDARF(tenantId: string, withholding: WithholdingResult, period: string): Promise<{
  irrf: { codigoReceita: string; valor: number; vencimento: string };
  pisCofinsCsll: { codigoReceita: string; valor: number; vencimento: string };
  inss: { codigoReceita: string; valor: number; vencimento: string };
  iss: { codigoReceita: string; valor: number; vencimento: string };
}> {
  const { irrf, pis, cofins, csll, inss, iss } = withholding;

  // Vencimento: dia 20 do mês subsequente
  const [year, month] = period.split('-').map(Number);
  const dueDate = new Date(year, month, 20);
  const vencimento = dueDate.toISOString().slice(0, 10).split('-').reverse().join('/');

  return {
    irrf: {
      codigoReceita: '0588', // IRRF - Serviços
      valor: irrf.value,
      vencimento,
    },
    pisCofinsCsll: {
      codigoReceita: '5952', // PIS/COFINS/CSLL - Serviços
      valor: pis.value + cofins.value + csll.value,
      vencimento,
    },
    inss: {
      codigoReceita: inss.value > 0 ? '1001' : '', // INSS Patronal/Retenção
      valor: inss.value,
      vencimento,
    },
    iss: {
      codigoReceita: '1006', // ISS (municipal - código varia)
      valor: iss.value,
      vencimento: new Date(year, month, 10).toISOString().slice(0, 10).split('-').reverse().join('/'), // ISS vence dia 10
    },
  };
}

/**
 * Verifica se fornecedor está cadastrado no CADIN (inadimplente) - bloqueia pagamento
 */
export async function checkCADIN(cnpj: string): Promise<{ blocked: boolean; reason?: string }> {
  // Em produção, consultar API da PGFN
  // Aqui simula verificação
  return { blocked: false };
}