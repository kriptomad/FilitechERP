// src/lib/catalog.ts — catálogo público da vitrine (planos/módulos/combos).
// Fonte única consumida por /planos, /checkout e /cadastro. Busca na API com
// fallback local (espelho do seed) para a página renderizar mesmo com a API
// indisponível — os números exibidos NUNCA inventam preço.

export interface CatalogPlan {
  code: string;
  label: string;
  basePrice: number;
  includedModules: string[];
}

export interface CatalogModule {
  code: string;
  label: string;
  monthlyPrice: number;
  description: string;
}

export interface CatalogCombo {
  code: string;
  label: string;
  niche: string;
  basePlan: string;
  basePlanLabel: string;
  includes: string[];
  labels: string[];
  discountPct: number;
  fullPrice: number;
  price: number;
  savings: number;
}

export interface FreeLimit {
  key: string;
  label: string;
  limit: number | null;
  unit: string;
  rationale: string;
}

export interface Catalog {
  plans: CatalogPlan[];
  modules: CatalogModule[];
  combos: CatalogCombo[];
  freeLimits: FreeLimit[];
}

export const API_URL = process.env.API_URL ?? 'http://localhost:3001';

// ── Fallback espelhado do prisma/seed.ts ──────────────────────────────────
const FALLBACK_PLANS: CatalogPlan[] = [
  { code: 'FREE', label: 'Free', basePrice: 0, includedModules: ['pdv', 'estoque', 'financeiro'] },
  { code: 'BASIC', label: 'Essencial', basePrice: 89.9, includedModules: ['pdv', 'estoque', 'financeiro'] },
  { code: 'PRO', label: 'Profissional', basePrice: 169.9, includedModules: ['pdv', 'estoque', 'financeiro', 'crm'] },
];

const FALLBACK_MODULES: CatalogModule[] = [
  { code: 'fiscal', label: 'Emissão Fiscal (NFC-e/NFe)', monthlyPrice: 49.9, description: 'Emissão ilimitada de documentos fiscais com contingência automática.' },
  { code: 'whatsapp', label: 'Integração WhatsApp', monthlyPrice: 39.9, description: 'Orçamentos, cobranças e notificações de O.S. via WhatsApp.' },
  { code: 'multi-filial', label: 'Multi-Filial', monthlyPrice: 59.9, description: 'Dashboard consolidado para múltiplas lojas.' },
  { code: 'work-order', label: 'Assistência Técnica (O.S.)', monthlyPrice: 69.9, description: 'Ordens de serviço, checklist, laudo e IMEI/Serial.' },
  { code: 'liquor-ledger', label: 'Adega — Conta-Corrente de Cascos', monthlyPrice: 29.9, description: 'Controle de vasilhames retornáveis por cliente.' },
  { code: 'recipe-bom', label: 'Ficha Técnica (Padaria/Confeitaria)', monthlyPrice: 44.9, description: 'Receitas, custo de produção e baixa automática.' },
  { code: 'pharmacy-sngpc', label: 'Farmácia — SNGPC/Controlados', monthlyPrice: 79.9, description: 'Escrituração eletrônica e retenção digital de receituário.' },
  { code: 'pdv', label: 'PDV', monthlyPrice: 0, description: 'Frente de caixa offline-first (incluso nos planos).' },
  { code: 'estoque', label: 'Estoque', monthlyPrice: 0, description: 'Compras, inventário, lote/validade/serial/grade (incluso).' },
  { code: 'financeiro', label: 'Financeiro', monthlyPrice: 0, description: 'Contas a pagar/receber e fluxo de caixa (incluso).' },
  { code: 'crm', label: 'CRM', monthlyPrice: 0, description: 'Cliente, crediário e fidelidade (incluso no PRO).' },
  { code: 'restaurant-pos', label: 'Restaurante (Comanda + KDS)', monthlyPrice: 74.9, description: 'Comanda eletrônica, KDS e iFood.' },
  { code: 'petshop', label: 'Petshop/Veterinária', monthlyPrice: 54.9, description: 'Prontuário do pet, vacinas e agendamento.' },
  { code: 'beauty-salon', label: 'Salão/Barbearia', monthlyPrice: 54.9, description: 'Agenda por profissional e comissionamento.' },
  { code: 'automotive', label: 'Setor Automotivo', monthlyPrice: 64.9, description: 'Veículos, O.S. automotiva e peças.' },
  { code: 'optical', label: 'Ótica', monthlyPrice: 49.9, description: 'Receita de grau, laboratório e consignação.' },
  { code: 'fashion-grid', label: 'Moda/Calçados (Grade)', monthlyPrice: 39.9, description: 'Grade cor/tamanho/numeração e curva ABC por variante.' },
  { code: 'stationery-seasonal', label: 'Papelaria (Sazonalidade/Kits)', monthlyPrice: 34.9, description: 'Janelas sazonais e kits compostos.' },
  { code: 'construction-fractional', label: 'Construção (Venda Fracionada)', monthlyPrice: 44.9, description: 'Compra vs venda, conversão de unidade e desconto progressivo.' },
];

const FALLBACK_COMBO_DEFS = [
  { code: 'COMBO_MERCADO', label: 'Combo Mercado Pro', basePlan: 'BASIC', includes: ['fiscal', 'whatsapp'], discountPct: 12, niche: 'Mercado/Conveniência' },
  { code: 'COMBO_ASSISTENCIA', label: 'Combo Assistência Técnica Pro', basePlan: 'BASIC', includes: ['work-order', 'whatsapp', 'fiscal'], discountPct: 15, niche: 'Assistência Técnica' },
  { code: 'COMBO_ADEGA', label: 'Combo Adega Pro', basePlan: 'BASIC', includes: ['liquor-ledger', 'fiscal'], discountPct: 10, niche: 'Adega/Bebidas' },
  { code: 'COMBO_PADARIA', label: 'Combo Padaria Pro', basePlan: 'PRO', includes: ['recipe-bom', 'fiscal'], discountPct: 15, niche: 'Padaria/Confeitaria' },
  { code: 'COMBO_FARMACIA', label: 'Combo Farmácia Pro', basePlan: 'PRO', includes: ['pharmacy-sngpc', 'fiscal', 'whatsapp'], discountPct: 18, niche: 'Farmácia/Drogaria' },
];

const FALLBACK_FREE_LIMITS: FreeLimit[] = [
  { key: 'sales', label: 'Vendas (PDV)', limit: 100, unit: 'vendas/mês', rationale: 'Suficiente para testar a operação real por semanas.' },
  { key: 'users', label: 'Usuários', limit: 1, unit: 'usuário (Owner)', rationale: 'Upgrade natural assim que o lojista contrata o primeiro funcionário.' },
  { key: 'products', label: 'Produtos cadastrados', limit: 200, unit: 'SKUs', rationale: 'Cobre um pequeno comércio completo.' },
  { key: 'fiscal', label: 'Emissão fiscal', limit: 0, unit: 'não incluída', rationale: "Módulo pago 'fiscal' — exigência legal, ponto de conversão natural." },
  { key: 'storage', label: 'Armazenamento de fotos/XML (R2)', limit: 500, unit: 'MB', rationale: 'Operação inicial sem custo de infraestrutura relevante.' },
  { key: 'support', label: 'Suporte', limit: null, unit: 'Comunidade/FAQ', rationale: 'Suporte prioritário é um upsell dos planos pagos.' },
];

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Monta os combos com a MESMA matemática do backend (preço cheio → desconto). */
function buildCombos(plans: CatalogPlan[], modules: CatalogModule[]): CatalogCombo[] {
  const planByCode = new Map(plans.map((p) => [p.code, p]));
  const moduleByCode = new Map(modules.map((m) => [m.code, m]));

  return FALLBACK_COMBO_DEFS.map((combo) => {
    const basePlan = planByCode.get(combo.basePlan);
    const included = combo.includes
      .map((code) => moduleByCode.get(code))
      .filter((m): m is CatalogModule => Boolean(m));
    const fullPrice =
      (basePlan?.basePrice ?? 0) +
      included.reduce((sum, m) => sum + m.monthlyPrice, 0);
    const price = round2(fullPrice * (1 - combo.discountPct / 100));
    return {
      code: combo.code,
      label: combo.label,
      niche: combo.niche,
      basePlan: combo.basePlan,
      basePlanLabel: basePlan?.label ?? combo.basePlan,
      includes: combo.includes,
      labels: included.map((m) => m.label),
      discountPct: combo.discountPct,
      fullPrice: round2(fullPrice),
      price,
      savings: round2(fullPrice - price),
    };
  });
}

export const FALLBACK_CATALOG: Catalog = {
  plans: FALLBACK_PLANS,
  modules: FALLBACK_MODULES,
  combos: buildCombos(FALLBACK_PLANS, FALLBACK_MODULES),
  freeLimits: FALLBACK_FREE_LIMITS,
};

/** Busca o catálogo na API (server-side). Silenciosamente usa o fallback. */
export async function fetchCatalog(): Promise<Catalog> {
  try {
    const res = await fetch(`${API_URL}/api/billing/catalog`, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error(`catalog ${res.status}`);
    const json = await res.json();
    if (!json?.success || !json.data) throw new Error('catalog envelope');
    return json.data as Catalog;
  } catch {
    return FALLBACK_CATALOG;
  }
}

/** Preço mensal de um plano + módulos (breakdown transparente). */
export function computeBreakdown(
  catalog: Catalog,
  planCode: string,
  moduleCodes: string[],
): { lines: { code: string; label: string; price: number }[]; total: number } {
  const plan = catalog.plans.find((p) => p.code === planCode) ?? catalog.plans[0];
  const lines = [
    { code: plan.code, label: `Plano ${plan.label} (base)`, price: plan.basePrice },
  ];
  for (const code of moduleCodes) {
    const mod = catalog.modules.find((m) => m.code === code);
    if (!mod || plan.includedModules.includes(code)) continue;
    lines.push({ code: mod.code, label: mod.label, price: mod.monthlyPrice });
  }
  return { lines, total: round2(lines.reduce((sum, l) => sum + l.price, 0)) };
}
