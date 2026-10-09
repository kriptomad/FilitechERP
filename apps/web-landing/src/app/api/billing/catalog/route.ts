// src/app/api/billing/catalog/route.ts — Cap. 2.3 / 2.4 / 2.5
// Catálogo público da vitrine. Rota pública (a landing renderiza antes do login).
//
// A versão anterior devolvia um objeto hardcoded no próprio arquivo — o preço
// mostrado na vitrine nunca vinha do banco, então um ajuste no painel do dono
// não afetava a landing. Aqui a fonte é o catálogo real (Plan/Module).
import { jsonSuccess } from '@/server/api-envelope';
import { prismaUnscoped } from '@/server/db';
import {
  COMBO_DEFS,
  FREE_LIMITS,
  PLAN_ORDER,
  round2,
} from '@/server/billing-catalog';

export const dynamic = 'force-dynamic';

export async function GET() {
  const [plans, modules] = await Promise.all([
    prismaUnscoped.plan.findMany({ where: { active: true } }),
    prismaUnscoped.module.findMany({ where: { active: true } }),
  ]);

  const planByCode = new Map(plans.map((p) => [p.code, p]));
  const moduleByCode = new Map(modules.map((m) => [m.code, m]));

  const combos = COMBO_DEFS.map((combo) => {
    const basePlan = planByCode.get(combo.basePlan);
    const included = combo.includes
      .map((code) => moduleByCode.get(code))
      .filter((m): m is NonNullable<typeof m> => Boolean(m));

    const fullPrice =
      (basePlan ? Number(basePlan.basePrice) : 0) +
      included.reduce((sum, m) => sum + Number(m.monthlyPrice), 0);
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

  const orderedPlans = [...plans].sort(
    (a, b) => (PLAN_ORDER[a.code] ?? 99) - (PLAN_ORDER[b.code] ?? 99),
  );

  return jsonSuccess({
    plans: orderedPlans.map((p) => ({
      code: p.code,
      label: p.label,
      basePrice: Number(p.basePrice),
      includedModules: p.includedModules,
    })),
    modules: modules.map((m) => ({
      code: m.code,
      label: m.label,
      monthlyPrice: Number(m.monthlyPrice),
      description: m.description,
    })),
    combos,
    freeLimits: FREE_LIMITS,
  });
}