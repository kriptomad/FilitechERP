// src/server/services/cfop-resolver.service.ts — Cap. 21.1 / 21.18.8
// Resolve CFOP por operação, NCM, CEST, UF origem/destino, regime tributário
import { prismaUnscoped } from '../db';
import { DomainError } from '../api-envelope';

export interface CFOPInput {
  tenantId: string;
  operationType: 'SALE' | 'RETURN' | 'BONIFICACAO' | 'TRANSFERENCIA' | 'INDUSTRIALIZACAO' | 'DEVOLUCAO' | 'REMESSA' | 'ENTRADA';
  originState: string;
  destState: string;
  ncm: string;
  cest?: string | null;
  isService?: boolean;
  isIndustrialized?: boolean;
  isExport?: boolean;
  isImport?: boolean;
}

export interface CFOPResult {
  cfop: string;
  description: string;
  fiscalNote?: string;
}

/**
 * Resolve CFOP automaticamente com base na operação, UFs, NCM/CEST e regime.
 * Prioridade: regra cadastrada no tenant > regra do catálogo nacional > fallback por operação.
 */
export async function resolveCFOP(input: CFOPInput): Promise<CFOPResult> {
  const { tenantId, operationType, originState, destState, ncm, cest, isService, isIndustrialized, isExport, isImport } = input;

  const tenant = await prismaUnscoped.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { taxRegime: true, uf: true },
  });

  const isInterstate = originState !== destState;
  const isInternational = isExport || isImport;

  // 1. Regra específica do tenant (cadastro manual ou herdada de template)
  const tenantRule = await prismaUnscoped.cfopRule.findFirst({
    where: {
      tenantId,
      operationType,
      originState,
      destState,
      OR: [{ ncm: ncm }, { ncm: '*' }],
      active: true,
    },
    orderBy: { priority: 'desc' },
  });

  if (tenantRule) {
    return { cfop: tenantRule.cfop, description: tenantRule.description, fiscalNote: tenantRule.fiscalNote };
  }

  // 2. Regra do catálogo nacional (CFOP nacional)
  const nationalRule = await prismaUnscoped.cfopCatalog.findFirst({
    where: {
      operationType,
      originState: isInterstate ? '*' : originState,
      destState: isInterstate ? '*' : destState,
      ncm: { in: [ncm, '*'] },
      active: true,
      taxRegimes: { has: tenant.taxRegime },
    },
    orderBy: { priority: 'desc' },
  });

  if (nationalRule) {
    return { cfop: nationalRule.cfop, description: nationalRule.description, fiscalNote: nationalRule.fiscalNote };
  }

  // 3. Fallback inteligente por tipo de operação
  return getFallbackCFOP({
    operationType,
    originState,
    destState,
    isInterstate,
    isInternational,
    isService,
    isIndustrialized,
    taxRegime: tenant.taxRegime,
  });
}

function getFallbackCFOP(params: {
  operationType: string;
  originState: string;
  destState: string;
  isInterstate: boolean;
  isInternational: boolean;
  isService?: boolean;
  isIndustrialized?: boolean;
  taxRegime: string;
}): CFOPResult {
  const { operationType, isInterstate, isInternational, isService, isIndustrialized, taxRegime } = params;

  // Prefixo: 1=entrada, 5=saída estadual, 6=saída interestadual, 7=exportação
  let prefix = '5';
  if (['ENTRADA', 'REMESSA'].includes(operationType)) prefix = '1';
  else if (isInterstate) prefix = '6';
  else if (isInternational && isExport) prefix = '7';

  // Simples Nacional usa CFOP simplificados (5.102, 6.102, etc.)
  const simplesPrefix = taxRegime === 'SIMPLES_NACIONAL' || taxRegime === 'MEI' ? prefix : prefix;

  switch (operationType) {
    case 'SALE': {
      const base = isService ? '935' : '102'; // Serviços: 5.935/6.935 | Mercadorias: 5.102/6.102
      return { cfop: `${simplesPrefix}.${base}`, description: isService ? 'Prestação de serviço' : 'Venda de mercadoria' };
    }
    case 'RETURN':
    case 'DEVOLUCAO': {
      const base = isInterstate ? '202' : '102'; // Devolução interestadual/estadual
      return { cfop: `${simplesPrefix}.${base}`, description: 'Devolução de venda' };
    }
    case 'BONIFICACAO': {
      return { cfop: `${simplesPrefix}.910`, description: 'Bonificação/Brinde' };
    }
    case 'TRANSFERENCIA': {
      return { cfop: `${simplesPrefix}.556`, description: 'Transferência entre estabelecimentos' };
    }
    case 'INDUSTRIALIZACAO': {
      const base = isIndustrialized ? '401' : '402'; // Industrialização por conta própria/terceiros
      return { cfop: `${simplesPrefix}.${base}`, description: 'Industrialização' };
    }
    case 'REMESSA': {
      return { cfop: `${simplesPrefix}.556`, description: 'Remessa para industrialização/consignação' };
    }
    case 'ENTRADA': {
      const base = isInterstate ? '201' : '101'; // Entrada interestadual/estadual
      return { cfop: `1.${base}`, description: 'Entrada de mercadoria' };
    }
    default: {
      return { cfop: `${simplesPrefix}.102`, description: 'Venda de mercadoria (padrão)' };
    }
  }
}

/**
 * Valida se CFOP é compatível com a operação e UFs.
 * Usado no gatekeeper antes de emitir NF-e.
 */
export async function validateCFOP(cfop: string, input: CFOPInput): Promise<{ valid: boolean; reason?: string }> {
  const { operationType, originState, destState, isExport, isImport } = input;
  const isInterstate = originState !== destState;
  const prefix = cfop.split('.')[0];

  // Valida prefixo
  if (['ENTRADA', 'REMESSA'].includes(operationType) && prefix !== '1') {
    return { valid: false, reason: 'CFOP de entrada deve iniciar com 1' };
  }
  if (isExport && prefix !== '7') {
    return { valid: false, reason: 'CFOP de exportação deve iniciar com 7' };
  }
  if (isImport && prefix !== '1') {
    return { valid: false, reason: 'CFOP de importação deve iniciar com 1' };
  }
  if (!isInterstate && !isInternational && prefix !== '5') {
    return { valid: false, reason: 'CFOP estadual deve iniciar com 5' };
  }
  if (isInterstate && !isInternational && prefix !== '6') {
    return { valid: false, reason: 'CFOP interestadual deve iniciar com 6' };
  }

  // Valida categoria (segundo dígito)
  const category = cfop.split('.')[1]?.charAt(0);
  const validCategories: Record<string, string[]> = {
    SALE: ['1', '2', '3', '5', '6', '9'], // Vendas, bonificações, transferências
    RETURN: ['2'], // Devoluções
    BONIFICACAO: ['9'], // Bonificações
    TRANSFERENCIA: ['5'], // Transferências
    INDUSTRIALIZACAO: ['4'], // Industrialização
    REMESSA: ['5'], // Remessas
    ENTRADA: ['1', '2', '4', '5'], // Entradas
  };

  if (validCategories[operationType] && !validCategories[operationType].includes(category ?? '')) {
    return { valid: false, reason: `Categoria CFOP '${category}' não compatível com operação '${operationType}'` };
  }

  return { valid: true };
}

/**
 * Busca CFOP sugerido para múltiplos itens de uma venda (usa o CFOP do item principal).
 */
export async function resolveCFOPForItems(input: CFOPInput & { items: Array<{ ncm: string; cest?: string; isService?: boolean }> }): Promise<CFOPResult> {
  const mainItem = input.items.reduce((max, item) => {
    // Item principal = maior valor ou primeiro produto (não serviço)
    return item.isService ? max : item;
  }, input.items[0]);

  return resolveCFOP({
    ...input,
    ncm: mainItem.ncm,
    cest: mainItem.cest,
    isService: mainItem.isService,
  });
}