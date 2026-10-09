// src/lib/catalog.ts — Cap. 2.3 / 2.5
//
// Catálogo da vitrine.
//
// Gap estrutural que esta versão corrige: havia TRÊS tabelas de preço
// independentes — `FALLBACK_CATALOG` aqui, `BASE_PLANS`/`ADDON_MODULES` no
// componente da calculadora, e o banco. Já tinham divergido entre si. Agora o
// banco é a única fonte; o fallback local existe só para a página renderizar
// durante uma indisponibilidade, e é gerado do mesmo seed.

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

export const FALLBACK_CATALOG: Catalog = {
  plans: [
    { code: 'FREE', label: 'Free', basePrice: 0, includedModules: ['pdv', 'estoque', 'financeiro'] },
    { code: 'BASIC', label: 'Essencial', basePrice: 89.9, includedModules: ['pdv', 'estoque', 'financeiro'] },
    { code: 'PRO', label: 'Profissional', basePrice: 169.9, includedModules: ['pdv', 'estoque', 'financeiro', 'crm'] },
  ],
  modules: [
    { code: 'pdv', label: 'PDV', monthlyPrice: 0, description: 'Frente de caixa offline-first (incluso nos planos).' },
    { code: 'estoque', label: 'Estoque', monthlyPrice: 0, description: 'Compras, inventário, lote/validade/serial/grade (incluso).' },
    { code: 'financeiro', label: 'Financeiro', monthlyPrice: 0, description: 'Contas a pagar/receber e fluxo de caixa (incluso).' },
    { code: 'crm', label: 'CRM', monthlyPrice: 0, description: 'Cliente, crediário e fidelidade (incluso no PRO).' },
    { code: 'fiscal', label: 'Emissão Fiscal (NFC-e/NFe)', monthlyPrice: 49.9, description: 'Emissão ilimitada de documentos fiscais com contingência automática.' },
    { code: 'whatsapp', label: 'Integração WhatsApp', monthlyPrice: 39.9, description: 'Orçamentos, cobranças e notificações de O.S. via WhatsApp.' },
    { code: 'multi-filial', label: 'Multi-Filial', monthlyPrice: 59.9, description: 'Dashboard consolidado para múltiplas lojas.' },
    { code: 'work-order', label: 'Assistência Técnica (O.S.)', monthlyPrice: 69.9, description: 'Ordens de serviço, checklist, laudo e IMEI/Serial.' },
    { code: 'liquor-ledger', label: 'Adega — Conta-Corrente de Cascos', monthlyPrice: 29.9, description: 'Controle de vasilhames retornáveis por cliente.' },
    { code: 'recipe-bom', label: 'Ficha Técnica (Padaria/Confeitaria)', monthlyPrice: 44.9, description: 'Receitas, custo de produção e baixa automática.' },
    { code: 'pharmacy-sngpc', label: 'Farmácia — SNGPC/Controlados', monthlyPrice: 79.9, description: 'Escrituração eletrônica e retenção digital de receituário.' },
    { code: 'accounting-integration', label: 'Escritório de Contabilidade (ECD/ECF/SPED)', monthlyPrice: 89.9, description: 'Procuração eletrônica, obrigação acessória e DARF.' },
  ],
  combos: [],
  freeLimits: [
    { key: 'sales', label: 'Vendas (PDV)', limit: 100, unit: 'vendas/mês', rationale: 'Suficiente para testar a operação real por semanas.' },
    { key: 'users', label: 'Usuários', limit: 1, unit: 'usuário (Owner)', rationale: 'Upgrade natural assim que o lojista contrata o primeiro funcionário.' },
    { key: 'products', label: 'Produtos cadastrados', limit: 200, unit: 'SKUs', rationale: 'Cobre um pequeno comércio completo.' },
    { key: 'fiscal', label: 'Emissão fiscal', limit: 0, unit: 'não incluída', rationale: 'Módulo pago — exigência legal, ponto de conversão natural.' },
    { key: 'storage', label: 'Armazenamento de fotos/XML', limit: 500, unit: 'MB', rationale: 'Operação inicial sem custo de infraestrutura relevante.' },
    { key: 'support', label: 'Suporte', limit: null, unit: 'Comunidade/FAQ', rationale: 'Suporte prioritário é um dos principais upsells de planos pagos.' },
  ],
};

/** Catálogo para o servidor (render da landing e /planos). */
export async function fetchCatalog(): Promise<Catalog> {
  try {
    const res = await fetch('/api/billing/catalog', {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error(`catalog ${res.status}`);
    const json = await res.json();
    if (!json?.success || !json.data) throw new Error('envelope');
    return json.data as Catalog;
  } catch {
    return FALLBACK_CATALOG;
  }
}

/** Catálogo para o cliente (componentes interativos). */
export async function fetchCatalogClient(): Promise<Catalog> {
  const res = await fetch('/api/billing/catalog', { cache: 'no-store' });
  if (!res.ok) return FALLBACK_CATALOG;
  const json = await res.json();
  return json?.success && json.data ? (json.data as Catalog) : FALLBACK_CATALOG;
}

export function computeBreakdown(
  catalog: Catalog,
  planCode: string,
  moduleCodes: string[],
): { lines: { code: string; label: string; price: number }[]; total: number } {
  const plan = catalog.plans.find((p) => p.code === planCode) ?? catalog.plans[0];

  if (!plan) {
    return { lines: [], total: 0 };
  }

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

const round2 = (n: number): number => Math.round(n * 100) / 100;