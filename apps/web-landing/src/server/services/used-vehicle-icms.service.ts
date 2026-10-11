// src/server/services/used-vehicle-icms.service.ts — Cap. 21.1 / 11.8
// Base de cálculo reduzida ICMS para veículos seminovos (revenda)
// Conforme Convênio ICMS 199/2022 e legislação estadual
import { prismaUnscoped } from '../db';
import { DomainError } from '../api-envelope';

export interface UsedVehicleICMSInput {
  tenantId: string;
  vehicleId: string;
  salePrice: number;
  acquisitionPrice: number;
  acquisitionDate: Date;
  uf: string; // UF do estabelecimento
}

export interface UsedVehicleICMSResult {
  baseCalculoNormal: number;
  baseCalculoReduzida: number;
  aliquotaInterna: number;
  aliquotaInterestadual?: number;
  icmsNormal: number;
  icmsReduzido: number;
  economia: number;
  percentualReducao: number;
  legalBasis: string;
  alerts: string[];
}

/**
 * Calcula ICMS com base reduzida para revenda de veículos seminovos.
 * Aplicável a concessionárias, revendas, lojas de seminovos (Nicho AUTOMOTIVA).
 * Base legal: Convênio ICMS 199/2022, RICMS estaduais, LC 87/96.
 */
export async function calculateUsedVehicleICMS(input: UsedVehicleICMSInput): Promise<UsedVehicleICMSResult> {
  const { tenantId, vehicleId, salePrice, acquisitionPrice, acquisitionDate, uf } = input;

  const alerts: string[] = [];

  // Busca configuração de ICMS do estado
  const stateConfig = await getStateICMSConfig(uf);
  if (!stateConfig) {
    throw new DomainError('STATE_CONFIG_NOT_FOUND', `Configuração de ICMS não encontrada para UF ${uf}.`, 404);
  }

  // Verifica se veículo existe e pertence ao tenant
  const vehicle = await prismaUnscoped.vehicle.findUnique({
    where: { id: vehicleId, tenantId },
    select: { id: true, brand: true, model: true, year: true, fuelType: true, value: true },
  });
  if (!vehicle) {
    throw new DomainError('VEHICLE_NOT_FOUND', 'Veículo não encontrado neste tenant.', 404);
  }

  // Verifica se é veículo usado (seminovo) - não zero km
  const isUsed = vehicle.year < new Date().getFullYear();
  if (!isUsed) {
    alerts.push('Veículo zero km não se enquadra na base reduzida para seminovos. Use tributação normal.');
    return calculateNormalICMS(salePrice, stateConfig, alerts);
  }

  // Verifica tempo mínimo de posse (alguns estados exigem 180 dias)
  const daysSinceAcquisition = Math.floor((Date.now() - acquisitionDate.getTime()) / (1000 * 60 * 60 * 24));
  const minDays = stateConfig.minDaysForReducedBase ?? 180;
  if (daysSinceAcquisition < minDays) {
    alerts.push(`Veículo adquirido há ${daysSinceAcquisition} dias. Mínimo de ${minDays} dias para base reduzida no ${uf}.`);
    return calculateNormalICMS(salePrice, stateConfig, alerts);
  }

  // Verifica se preço de aquisição é válido
  if (acquisitionPrice <= 0) {
    throw new DomainError('VALIDATION_ERROR', 'Preço de aquisição deve ser maior que zero.', 400);
  }

  // Verifica margem mínima (evita base negativa)
  const margin = salePrice - acquisitionPrice;
  if (margin <= 0) {
    alerts.push('Margem de lucro zero ou negativa. Base reduzida resulta em valor igual ou menor que aquisição.');
    return calculateNormalICMS(salePrice, stateConfig, alerts);
  }

  // ====== CÁLCULO BASE REDUZIDA ======
  // Base reduzida = Preço de Venda - Preço de Aquisição (Margem Bruta)
  // Alguns estados permitem deduzir despesas de preparação (até 5%)
  const preparationCosts = Math.min(acquisitionPrice * 0.05, salePrice * 0.03); // Max 5% aquisição ou 3% venda
  const taxableBase = salePrice - acquisitionPrice - preparationCosts;

  if (taxableBase <= 0) {
    alerts.push('Base de cálculo reduzida resultou em valor zero ou negativo. Aplicando tributação normal.');
    return calculateNormalICMS(salePrice, stateConfig, alerts);
  }

  // Alíquota interna do estado
  const aliquotaInterna = stateConfig.internalRate;

  // ICMS Normal (sobre preço de venda total)
  const icmsNormal = salePrice * aliquotaInterna;

  // ICMS Reduzido (sobre margem)
  const icmsReduzido = taxableBase * aliquotaInterna;

  // Economia
  const economia = icmsNormal - icmsReduzido;
  const percentualReducao = ((icmsNormal - icmsReduzido) / icmsNormal) * 100;

  // Verifica se estado exige destaque do ICMS na nota (alguns não permitem)
  if (!stateConfig.allowsReducedBaseHighlight) {
    alerts.push(`${uf} não permite destaque do ICMS com base reduzida na NF-e. ICMS será calculado normal, crédito ajustado na apuração.`);
    return calculateNormalICMS(salePrice, stateConfig, alerts);
  }

  // Verifica limite máximo de redução (alguns estados limitam a 50% do ICMS normal)
  const maxReducao = stateConfig.maxReductionPercent ?? 50;
  if (percentualReducao > maxReducao) {
    alerts.push(`Redução de ${percentualReducao.toFixed(1)}% excede limite de ${maxReducao}% do ${uf}. Limitando.`);
    const icmsLimitado = icmsNormal * (1 - maxReducao / 100);
    return {
      baseCalculoNormal: salePrice,
      baseCalculoReduzida: taxableBase,
      aliquotaInterna,
      icmsNormal,
      icmsReduzido: icmsLimitado,
      economia: icmsNormal - icmsLimitado,
      percentualReducao: maxReducao,
      legalBasis: stateConfig.legalBasis,
      alerts,
    };
  }

  return {
    baseCalculoNormal: salePrice,
    baseCalculoReduzida: taxableBase,
    aliquotaInterna,
    icmsNormal,
    icmsReduzido,
    economia,
    percentualReducao,
    legalBasis: stateConfig.legalBasis,
    alerts,
  };
}

function calculateNormalICMS(salePrice: number, stateConfig: any, alerts: string[]): UsedVehicleICMSResult {
  return {
    baseCalculoNormal: salePrice,
    baseCalculoReduzida: salePrice,
    aliquotaInterna: stateConfig.internalRate,
    icmsNormal: salePrice * stateConfig.internalRate,
    icmsReduzido: salePrice * stateConfig.internalRate,
    economia: 0,
    percentualReducao: 0,
    legalBasis: stateConfig.legalBasis,
    alerts,
  };
}

interface StateICMSConfig {
  uf: string;
  internalRate: number;
  minDaysForReducedBase: number;
  allowsReducedBaseHighlight: boolean;
  maxReductionPercent?: number;
  legalBasis: string;
  preparationCostsDeductible: boolean;
  maxPreparationCostPercent: number;
}

async function getStateICMSConfig(uf: string): Promise<StateICMSConfig | null> {
  // Configurações por estado (base Convênio ICMS 199/2022 + legislação estadual)
  // Em produção, buscar de tabela FiscalCodeCatalog ou SystemParameter
  const configs: Record<string, StateICMSConfig> = {
    'SP': {
      uf: 'SP',
      internalRate: 0.18,
      minDaysForReducedBase: 180,
      allowsReducedBaseHighlight: true,
      maxReductionPercent: 50,
      legalBasis: 'Art. 57 RICMS/SP + Convênio ICMS 199/2022',
      preparationCostsDeductible: true,
      maxPreparationCostPercent: 5,
    },
    'RJ': {
      uf: 'RJ',
      internalRate: 0.20,
      minDaysForReducedBase: 180,
      allowsReducedBaseHighlight: true,
      maxReductionPercent: 50,
      legalBasis: 'Art. 25 RICMS/RJ + Convênio ICMS 199/2022',
      preparationCostsDeductible: true,
      maxPreparationCostPercent: 5,
    },
    'MG': {
      uf: 'MG',
      internalRate: 0.18,
      minDaysForReducedBase: 90,
      allowsReducedBaseHighlight: true,
      maxReductionPercent: 40,
      legalBasis: 'Art. 32 RICMS/MG + Convênio ICMS 199/2022',
      preparationCostsDeductible: true,
      maxPreparationCostPercent: 3,
    },
    'RS': {
      uf: 'RS',
      internalRate: 0.17,
      minDaysForReducedBase: 180,
      allowsReducedBaseHighlight: false, // RS não permite destaque na nota
      legalBasis: 'Art. 24 RICMS/RS + Convênio ICMS 199/2022',
      preparationCostsDeductible: false,
      maxPreparationCostPercent: 0,
    },
    'PR': {
      uf: 'PR',
      internalRate: 0.18,
      minDaysForReducedBase: 180,
      allowsReducedBaseHighlight: true,
      maxReductionPercent: 50,
      legalBasis: 'Art. 28 RICMS/PR + Convênio ICMS 199/2022',
      preparationCostsDeductible: true,
      maxPreparationCostPercent: 5,
    },
    'SC': {
      uf: 'SC',
      internalRate: 0.17,
      minDaysForReducedBase: 180,
      allowsReducedBaseHighlight: true,
      maxReductionPercent: 50,
      legalBasis: 'Art. 26 RICMS/SC + Convênio ICMS 199/2022',
      preparationCostsDeductible: true,
      maxPreparationCostPercent: 5,
    },
    'BA': {
      uf: 'BA',
      internalRate: 0.18,
      minDaysForReducedBase: 180,
      allowsReducedBaseHighlight: true,
      maxReductionPercent: 50,
      legalBasis: 'Art. 30 RICMS/BA + Convênio ICMS 199/2022',
      preparationCostsDeductible: true,
      maxPreparationCostPercent: 5,
    },
    'GO': {
      uf: 'GO',
      internalRate: 0.17,
      minDaysForReducedBase: 180,
      allowsReducedBaseHighlight: true,
      maxReductionPercent: 50,
      legalBasis: 'Art. 27 RICMS/GO + Convênio ICMS 199/2022',
      preparationCostsDeductible: true,
      maxPreparationCostPercent: 5,
    },
    'PE': {
      uf: 'PE',
      internalRate: 0.18,
      minDaysForReducedBase: 180,
      allowsReducedBaseHighlight: true,
      maxReductionPercent: 50,
      legalBasis: 'Art. 29 RICMS/PE + Convênio ICMS 199/2022',
      preparationCostsDeductible: true,
      maxPreparationCostPercent: 5,
    },
    'CE': {
      uf: 'CE',
      internalRate: 0.18,
      minDaysForReducedBase: 180,
      allowsReducedBaseHighlight: true,
      maxReductionPercent: 50,
      legalBasis: 'Art. 31 RICMS/CE + Convênio ICMS 199/2022',
      preparationCostsDeductible: true,
      maxPreparationCostPercent: 5,
    },
    'ES': {
      uf: 'ES',
      internalRate: 0.17,
      minDaysForReducedBase: 180,
      allowsReducedBaseHighlight: true,
      maxReductionPercent: 50,
      legalBasis: 'Art. 25 RICMS/ES + Convênio ICMS 199/2022',
      preparationCostsDeductible: true,
      maxPreparationCostPercent: 5,
    },
    // Demais estados - configuração padrão
  };

  return configs[uf] ?? {
    uf,
    internalRate: 0.18,
    minDaysForReducedBase: 180,
    allowsReducedBaseHighlight: true,
    maxReductionPercent: 50,
    legalBasis: `Convênio ICMS 199/2022 + RICMS/${uf}`,
    preparationCostsDeductible: true,
    maxPreparationCostPercent: 5,
  };
}

/**
 * Gera observação para NF-e com base reduzida
 */
export function generateNFEObservation(result: UsedVehicleICMSResult): string {
  if (result.percentualReducao === 0) return '';

  return `ICMS BASE REDUZIDA - VEÍCULO SEMINOVO
Base Cálculo: R$ ${result.baseCalculoReduzida.toFixed(2).replace('.', ',')}
ICMS Devido: R$ ${result.icmsReduzido.toFixed(2).replace('.', ',')}
Fundamento: ${result.legalBasis}
Margem Bruta: R$ ${(result.baseCalculoNormal - result.baseCalculoReduzida).toFixed(2).replace('.', ',')}
Economia ICMS: R$ ${result.economia.toFixed(2).replace('.', ',')} (${result.percentualReducao.toFixed(1)}%)`;
}

/**
 * Valida se operação de seminovo atende requisitos do Convênio ICMS 199/2022
 */
export async function validateUsedVehicleOperation(input: UsedVehicleICMSInput): Promise<{
  valid: boolean;
  reasons: string[];
}> {
  const reasons: string[] = [];
  const stateConfig = await getStateICMSConfig(input.uf);

  if (!stateConfig) {
    return { valid: false, reasons: [`UF ${input.uf} não configurada`] };
  }

  if (!stateConfig.allowsReducedBaseHighlight) {
    reasons.push(`${input.uf} não permite destaque de ICMS com base reduzida na NF-e`);
  }

  const daysSinceAcquisition = Math.floor((Date.now() - input.acquisitionDate.getTime()) / (1000 * 60 * 60 * 24));
  if (daysSinceAcquisition < stateConfig.minDaysForReducedBase) {
    reasons.push(`Posse inferior a ${stateConfig.minDaysForReducedBase} dias (mínimo para base reduzida no ${input.uf})`);
  }

  if (input.acquisitionPrice >= input.salePrice) {
    reasons.push('Preço de aquisição maior ou igual ao preço de venda - base reduzida inválida');
  }

  return { valid: reasons.length === 0, reasons };
}