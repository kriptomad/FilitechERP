// src/server/billing-catalog.ts — Cap. 2.4 / 2.5
// Constantes do motor de assinatura extraídas das rotas: travas do Tier Free
// (dimensionadas por VOLUME, não por tempo) e combos por nicho com desconto.
//
// Ficam num módulo próprio porque são usadas tanto pela API quanto pelo espelho
// local (src/lib/catalog.ts) que renderiza a landing quando o banco não
// responde — os números precisam ser idênticos nos dois lados.

// ── Cap. 2.4 — Travas do Tier Free ────────────────────────────────────────
export const FREE_LIMITS = [
  {
    key: 'sales',
    label: 'Vendas (PDV)',
    limit: 100,
    unit: 'vendas/mês',
    rationale: 'Suficiente para testar a operação real por semanas.',
  },
  {
    key: 'users',
    label: 'Usuários',
    limit: 1,
    unit: 'usuário (Owner)',
    rationale: 'Upgrade natural assim que o lojista contrata o primeiro funcionário.',
  },
  {
    key: 'products',
    label: 'Produtos cadastrados',
    limit: 200,
    unit: 'SKUs',
    rationale: 'Cobre um pequeno comércio completo.',
  },
  {
    key: 'fiscal',
    label: 'Emissão fiscal',
    limit: 0,
    unit: 'não incluída',
    rationale:
      "Módulo pago 'fiscal' — exigência legal, ponto de conversão natural.",
  },
  {
    key: 'storage',
    label: 'Armazenamento de fotos/XML (R2)',
    limit: 500,
    unit: 'MB',
    rationale: 'Operação inicial sem custo de infraestrutura relevante.',
  },
  {
    key: 'support',
    label: 'Suporte',
    limit: null,
    unit: 'Comunidade/FAQ',
    rationale: 'Suporte prioritário é um dos principais upsells de planos pagos.',
  },
] as const;

// ── Cap. 2.5 — Pacotes pré-definidos (combos por nicho) ────────────────────
export const COMBO_DEFS = [
  {
    code: 'COMBO_MERCADO',
    label: 'Combo Mercado Pro',
    basePlan: 'BASIC',
    includes: ['fiscal', 'whatsapp'],
    discountPct: 12,
    niche: 'Mercado/Conveniência',
  },
  {
    code: 'COMBO_ASSISTENCIA',
    label: 'Combo Assistência Técnica Pro',
    basePlan: 'BASIC',
    includes: ['work-order', 'whatsapp', 'fiscal'],
    discountPct: 15,
    niche: 'Assistência Técnica',
  },
  {
    code: 'COMBO_ADEGA',
    label: 'Combo Adega Pro',
    basePlan: 'BASIC',
    includes: ['liquor-ledger', 'fiscal'],
    discountPct: 10,
    niche: 'Adega/Bebidas',
  },
  {
    code: 'COMBO_PADARIA',
    label: 'Combo Padaria Pro',
    basePlan: 'PRO',
    includes: ['recipe-bom', 'fiscal'],
    discountPct: 15,
    niche: 'Padaria/Confeitaria',
  },
  {
    code: 'COMBO_FARMACIA',
    label: 'Combo Farmácia Pro',
    basePlan: 'PRO',
    includes: ['pharmacy-sngpc', 'fiscal', 'whatsapp'],
    discountPct: 18,
    niche: 'Farmácia/Drogaria',
  },
] as const;

export const PLAN_ORDER: Record<string, number> = { FREE: 0, BASIC: 1, PRO: 2 };

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Descrição legível de um evento de cobrança — Cap. 2.7.5 (histórico no painel). */
export function describeBillingEvent(type: string): string {
  switch (type) {
    case 'checkout.completed':
      return 'Contratação de plano';
    case 'module.activated':
      return 'Ativação de módulo adicional';
    case 'module.deactivated':
      return 'Cancelamento de módulo adicional';
    case 'signup':
      return 'Cadastro (Tier Free)';
    case 'payment.succeeded':
      return 'Pagamento confirmado';
    case 'payment.failed':
      return 'Pagamento recusado';
    case 'subscription.past_due':
      return 'Assinatura em atraso';
    case 'subscription.cancelled':
      return 'Assinatura cancelada';
    case 'plan.changed':
      return 'Troca de plano';
    default:
      return type;
  }
}