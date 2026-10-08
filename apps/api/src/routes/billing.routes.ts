// src/routes/billing.routes.ts — Cap. 2.3 / 2.4 / 2.5 / 2.6 / 9.3
import { Router, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { prisma, prismaUnscoped } from "../lib/prisma.js";
import { requireSession } from "../middlewares/session.middleware.js";
import { apiSuccess, apiError } from "../types/api-envelope.js";
import { redis } from "../lib/redis.js";

export const billingRouter = Router();

// ─────────────────────────────────────────────────────────────────────────
// Cap. 2.4 — Travas do Tier Free (dimensionadas por VOLUME, não por tempo)
// ─────────────────────────────────────────────────────────────────────────
const FREE_LIMITS = [
  { key: "sales", label: "Vendas (PDV)", limit: 100, unit: "vendas/mês", rationale: "Suficiente para testar a operação real por semanas." },
  { key: "users", label: "Usuários", limit: 1, unit: "usuário (Owner)", rationale: "Upgrade natural assim que o lojista contrata o primeiro funcionário." },
  { key: "products", label: "Produtos cadastrados", limit: 200, unit: "SKUs", rationale: "Cobre um pequeno comércio completo." },
  { key: "fiscal", label: "Emissão fiscal", limit: 0, unit: "não incluída", rationale: "Módulo pago 'fiscal' — exigência legal, ponto de conversão natural." },
  { key: "storage", label: "Armazenamento de fotos/XML (R2)", limit: 500, unit: "MB", rationale: "Operação inicial sem custo de infraestrutura relevante." },
  { key: "support", label: "Suporte", limit: null, unit: "Comunidade/FAQ", rationale: "Suporte prioritário é um upsell dos planos pagos." },
] as const;

// ─────────────────────────────────────────────────────────────────────────
// Cap. 2.5 — Pacotes pré-definidos (combos por nicho, com desconto sobre à la carte)
// ─────────────────────────────────────────────────────────────────────────
const COMBO_DEFS = [
  { code: "COMBO_MERCADO", label: "Combo Mercado Pro", basePlan: "BASIC", includes: ["fiscal", "whatsapp"], discountPct: 12, niche: "Mercado/Conveniência" },
  { code: "COMBO_ASSISTENCIA", label: "Combo Assistência Técnica Pro", basePlan: "BASIC", includes: ["work-order", "whatsapp", "fiscal"], discountPct: 15, niche: "Assistência Técnica" },
  { code: "COMBO_ADEGA", label: "Combo Adega Pro", basePlan: "BASIC", includes: ["liquor-ledger", "fiscal"], discountPct: 10, niche: "Adega/Bebidas" },
  { code: "COMBO_PADARIA", label: "Combo Padaria Pro", basePlan: "PRO", includes: ["recipe-bom", "fiscal"], discountPct: 15, niche: "Padaria/Confeitaria" },
  { code: "COMBO_FARMACIA", label: "Combo Farmácia Pro", basePlan: "PRO", includes: ["pharmacy-sngpc", "fiscal", "whatsapp"], discountPct: 18, niche: "Farmácia/Drogaria" },
] as const;

const PLAN_ORDER: Record<string, number> = { FREE: 0, BASIC: 1, PRO: 2 };

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Catálogo público da vitrine (Cap. 2.3/2.4/2.5): planos, módulos à la carte,
 * combos com desconto e travas do Tier Free. Fonte única de verdade exibida
 * pela landing (/planos) e pela calculadora — o preço mostrado ao cliente é
 * EXATAMENTE o que o checkout cobra (transparência radical).
 */
billingRouter.get("/billing/catalog", async (_req: Request, res: Response) => {
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

  return res.json(
    apiSuccess({
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
    }),
  );
});

/** Cálculo público (usado pela calculadora da landing antes do checkout). */
billingRouter.post(
  "/billing/calculate",
  async (req: Request, res: Response) => {
    const { planCode, selectedModuleCodes = [] } = req.body ?? {};
    const plan = await prismaUnscoped.plan.findUnique({ where: { code: planCode } });
    if (!plan) {
      return res.status(400).json(apiError("INVALID_PLAN", "Plano não encontrado."));
    }

    const modules = await prismaUnscoped.module.findMany({
      where: { code: { in: selectedModuleCodes } },
    });

    const breakdown = [
      { code: plan.code, label: `Plano ${plan.label} (base)`, price: Number(plan.basePrice) },
      ...modules.map((m) => ({
        code: m.code,
        label: m.label,
        price: Number(m.monthlyPrice),
      })),
    ];

    const computedMrr = breakdown.reduce((sum, b) => sum + b.price, 0);
    return res.json(apiSuccess({ computedMrr, breakdown }));
  },
);

/**
 * Checkout (Cap. 9.3). Sem sessão: devolve o cálculo + URL de onboarding
 * (fluxo de criação de conta). Com sessão: PERSISTE a assinatura — cria/
 * atualiza Subscription, ativa os módulos do plano + selecionados, registra
 * BillingEvent e invalida o cache do gatekeeper (Cap. 6.1).
 */
billingRouter.post(
  "/billing/checkout",
  async (req: Request, res: Response) => {
    const { planCode, selectedModuleCodes = [], billingCycle = "MONTHLY" } = req.body ?? {};
    const plan = await prismaUnscoped.plan.findUnique({ where: { code: planCode } });
    if (!plan) {
      return res.status(400).json(apiError("INVALID_PLAN", "Plano não encontrado."));
    }

    const requested =
      Array.isArray(selectedModuleCodes) && selectedModuleCodes.length > 0
        ? selectedModuleCodes
        : [...plan.includedModules];

    const modules = await prismaUnscoped.module.findMany({
      where: { code: { in: requested } },
    });
    if (modules.length !== new Set(requested).size) {
      return res
        .status(400)
        .json(apiError("INVALID_MODULE", "Um ou mais códigos de módulo não existem no catálogo."));
    }

    const breakdown = [
      { code: plan.code, label: `Plano ${plan.label} (base)`, price: Number(plan.basePrice) },
      ...modules
        .filter((m) => Number(m.monthlyPrice) > 0 || plan.includedModules.includes(m.code))
        .map((m) => ({
          code: m.code,
          label: m.label,
          price: plan.includedModules.includes(m.code) ? 0 : Number(m.monthlyPrice),
        })),
    ];
    const computedMrr = round2(breakdown.reduce((sum, b) => sum + b.price, 0));
    const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // ── Sem sessão: cliente não está logado → onboarding (Cap. 9.3) ──
    if (!req.session) {
      const appUrl = process.env.APP_URL ?? "";
      const qs = new URLSearchParams({
        plan: plan.code,
        mods: modules.filter((m) => !plan.includedModules.includes(m.code)).map((m) => m.code).join(","),
        cycle: billingCycle,
      });
      return res.json(
        apiSuccess({
          subscriptionId: `sub_${Date.now()}`,
          computedMrr,
          billingCycle,
          breakdown,
          checkoutRedirectUrl: `${appUrl}/cadastro?${qs.toString()}`,
        }),
      );
    }

    // ── Com sessão: contratação efetiva ──
    const tenantId = req.session!.tenantId;

    const existingSub = await prisma.subscription.findFirst({ where: { tenantId } });
    const subscription = existingSub
      ? await prisma.subscription.update({
          where: { id: existingSub.id },
          data: {
            planId: plan.id,
            status: "ACTIVE",
            provider: "asaas",
            currentPeriodEnd: periodEnd,
            pastDueSince: null,
          },
        })
      : await prisma.subscription.create({
          data: {
            tenantId,
            planId: plan.id,
            provider: "asaas",
            externalSubscriptionId: `sub_${randomUUID()}`,
            status: "ACTIVE",
            currentPeriodEnd: periodEnd,
          },
        });

    // Ativa módulos inclusos no plano + os add-ons selecionados.
    const codesToActivate = [...new Set([...plan.includedModules, ...modules.map((m) => m.code)])];
    for (const code of codesToActivate) {
      await prisma.tenantModule.upsert({
        where: { tenantId_moduleCode: { tenantId, moduleCode: code } },
        create: { tenantId, moduleCode: code, active: true, activatedAt: new Date() },
        update: { active: true, activatedAt: new Date(), deactivatedAt: null },
      });
    }

    // Evento de cobrança (sempre via unscoped após validação de posse acima).
    await prismaUnscoped.billingEvent.create({
      data: {
        subscriptionId: subscription.id,
        provider: "asaas",
        externalEventKey: `checkout_${randomUUID()}`,
        type: "checkout.completed",
        payload: { computedMrr, billingCycle, breakdown, planCode: plan.code },
      },
    });

    await prismaUnscoped.tenant.update({
      where: { id: tenantId },
      data: { status: "ACTIVE" },
    });

    // Invalidação de cache na mesma ação (Cap. 6.1).
    await redis.del(`tenant:${tenantId}:modules`);

    return res.json(
      apiSuccess({
        subscriptionId: subscription.id,
        computedMrr,
        billingCycle,
        breakdown,
        checkoutRedirectUrl: `${process.env.APP_URL ?? ""}/painel?checkout=sucesso`,
      }),
    );
  },
);

/**
 * Assinatura atual do tenant — plano, breakdown, mrr e eventos recentes
 * (alimenta o painel de administração com transparência total de cobrança).
 */
billingRouter.get(
  "/billing/subscription",
  requireSession,
  async (req: Request, res: Response) => {
    const tenantId = req.session!.tenantId;

    const [subscription, tenant, activeModules] = await Promise.all([
      prisma.subscription.findFirst({
        where: { tenantId },
        include: {
          plan: true,
          billingEvents: { orderBy: { createdAt: "desc" }, take: 24 },
        },
      }),
      prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { tradeName: true, legalName: true, status: true, slug: true, createdAt: true },
      }),
      prisma.tenantModule.findMany({ where: { active: true }, select: { moduleCode: true } }),
    ]);

    const activeCodes = activeModules.map((tm) => tm.moduleCode);
    const catalogModules = await prismaUnscoped.module.findMany({
      where: { code: { in: activeCodes } },
    });
    const paidAddons = catalogModules.filter(
      (m) => Number(m.monthlyPrice) > 0 && !(subscription?.plan.includedModules.includes(m.code) ?? false),
    );

    const breakdown = subscription
      ? [
          {
            code: subscription.plan.code,
            label: `Plano ${subscription.plan.label} (base)`,
            price: Number(subscription.plan.basePrice),
          },
          ...paidAddons.map((m) => ({
            code: m.code,
            label: m.label,
            price: Number(m.monthlyPrice),
          })),
        ]
      : paidAddons.map((m) => ({ code: m.code, label: m.label, price: Number(m.monthlyPrice) }));

    const mrr = round2(breakdown.reduce((sum, b) => sum + b.price, 0));

    return res.json(
      apiSuccess({
        subscription: subscription
          ? {
              id: subscription.id,
              status: subscription.status,
              provider: subscription.provider,
              currentPeriodEnd: subscription.currentPeriodEnd,
              pastDueSince: subscription.pastDueSince,
              createdAt: subscription.createdAt,
            }
          : null,
        plan: subscription?.plan
          ? {
              code: subscription.plan.code,
              label: subscription.plan.label,
              basePrice: Number(subscription.plan.basePrice),
              includedModules: subscription.plan.includedModules,
            }
          : null,
        tenant,
        activeModules: activeCodes,
        breakdown,
        mrr,
        billingEvents: (subscription?.billingEvents ?? []).map((e) => ({
          id: e.id,
          type: e.type,
          provider: e.provider,
          createdAt: e.createdAt,
          payload: e.payload,
        })),
      }),
    );
  },
);

/** Extrato de cobrança (faturas/eventos) do tenant. */
billingRouter.get(
  "/billing/invoices",
  requireSession,
  async (req: Request, res: Response) => {
    const tenantId = req.session!.tenantId;
    const subscription = await prisma.subscription.findFirst({
      where: { tenantId },
      include: { plan: true },
    });
    if (!subscription) {
      return res.json(apiSuccess({ invoices: [], subscriptionId: null }));
    }

    const events = await prismaUnscoped.billingEvent.findMany({
      where: { subscriptionId: subscription.id },
      orderBy: { createdAt: "desc" },
      take: 36,
    });

    return res.json(
      apiSuccess({
        subscriptionId: subscription.id,
        plan: subscription.plan.label,
        invoices: events.map((e) => {
          const payload = (e.payload ?? {}) as {
            computedMrr?: number;
            billingCycle?: string;
            amount?: number;
          };
          return {
            id: e.id,
            type: e.type,
            provider: e.provider,
            createdAt: e.createdAt,
            amount: payload.computedMrr ?? payload.amount ?? null,
            cycle: payload.billingCycle ?? "MONTHLY",
            description: describeBillingEvent(e.type),
          };
        }),
      }),
    );
  },
);

/** Uso real do tenant vs. limites do tier (transparência de consumo, Cap. 2.4). */
billingRouter.get(
  "/billing/usage",
  requireSession,
  async (req: Request, res: Response) => {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [salesThisMonth, users, products, subscription] = await Promise.all([
      prisma.sale.count({ where: { createdAt: { gte: monthStart } } }),
      prisma.user.count(),
      prisma.product.count(),
      prisma.subscription.findFirst({ where: { tenantId: req.session!.tenantId }, include: { plan: true } }),
    ]);

    return res.json(
      apiSuccess({
        tier: subscription?.plan.code ?? null,
        usage: {
          sales: { current: salesThisMonth, limit: 100 },
          users: { current: users, limit: 1 },
          products: { current: products, limit: 200 },
        },
        limits: FREE_LIMITS,
      }),
    );
  },
);

/** Ativação imediata de módulo (upsell contextual — Cap. 2.6). */
billingRouter.post(
  "/billing/modules/:moduleCode/activate",
  requireSession,
  async (req: Request, res: Response) => {
    const { moduleCode } = req.params;
    const tenantId = req.session!.tenantId;

    const module = await prismaUnscoped.module.findUnique({ where: { code: moduleCode } });
    if (!module) {
      return res.status(404).json(apiError("MODULE_NOT_FOUND", "Módulo não existe no catálogo."));
    }

    await prisma.tenantModule.upsert({
      where: { tenantId_moduleCode: { tenantId, moduleCode } },
      create: { tenantId, moduleCode, active: true, activatedAt: new Date() },
      update: { active: true, activatedAt: new Date(), deactivatedAt: null },
    });

    // Registro de cobrança proporcional ao ato de contratar (transparência).
    const sub = await prisma.subscription.findFirst({ where: { tenantId } });
    if (sub) {
      await prismaUnscoped.billingEvent.create({
        data: {
          subscriptionId: sub.id,
          provider: "asaas",
          externalEventKey: `module_${moduleCode}_${randomUUID()}`,
          type: "module.activated",
          payload: {
            moduleCode,
            label: module.label,
            amount: Number(module.monthlyPrice),
          },
        },
      });
    }

    // Invalidação de cache na mesma ação (Cap. 6.1) — elimina janela de inconsistência.
    await redis.del(`tenant:${tenantId}:modules`);

    return res.json(apiSuccess({ moduleCode, active: true }));
  },
);

billingRouter.post(
  "/billing/modules/:moduleCode/deactivate",
  requireSession,
  async (req: Request, res: Response) => {
    const { moduleCode } = req.params;
    const tenantId = req.session!.tenantId;

    await prisma.tenantModule.updateMany({
      where: { tenantId, moduleCode },
      data: { active: false, deactivatedAt: new Date() },
    });

    const sub = await prisma.subscription.findFirst({ where: { tenantId } });
    if (sub) {
      await prismaUnscoped.billingEvent.create({
        data: {
          subscriptionId: sub.id,
          provider: "asaas",
          externalEventKey: `module_off_${moduleCode}_${randomUUID()}`,
          type: "module.deactivated",
          payload: { moduleCode },
        },
      });
    }

    await redis.del(`tenant:${tenantId}:modules`);
    return res.json(apiSuccess({ moduleCode, active: false }));
  },
);

/**
 * Cancelamento de assinatura (Cap. 2.6): muda status para CANCELLED,
 * desativa todos os módulos e registra evento de billing.
 */
billingRouter.post(
  "/billing/subscription/cancel",
  requireSession,
  async (req: Request, res: Response) => {
    const tenantId = req.session!.tenantId;

    const subscription = await prisma.subscription.findFirst({ where: { tenantId } });
    if (!subscription) {
      return res.status(404).json(apiError("NOT_FOUND", "Assinatura não encontrada."));
    }
    if (subscription.status === "CANCELLED") {
      return res.status(409).json(apiError("ALREADY_CANCELLED", "Assinatura já está cancelada."));
    }

    await prismaUnscoped.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: subscription.id },
        data: { status: "CANCELLED" },
      });
      await tx.tenant.update({
        where: { id: tenantId },
        data: { status: "CANCELLED" },
      });
      await tx.tenantModule.updateMany({
        where: { tenantId },
        data: { active: false, deactivatedAt: new Date() },
      });
      await tx.billingEvent.create({
        data: {
          subscriptionId: subscription.id,
          provider: "asaas",
          externalEventKey: `cancel_${randomUUID()}`,
          type: "subscription.cancelled",
          payload: { reason: "user_requested" },
        },
      });
    });

    await redis.del(`tenant:${tenantId}:modules`);
    return res.json(apiSuccess({ cancelled: true }));
  },
);

/**
 * Upgrade/downgrade de plano com proração (Cap. 2.3): calcula o valor
 * proporcional ao período restante e registra o evento de billing.
 */
billingRouter.post(
  "/billing/subscription/change-plan",
  requireSession,
  async (req: Request, res: Response) => {
    const { planCode } = req.body ?? {};
    const tenantId = req.session!.tenantId;

    const newPlan = await prismaUnscoped.plan.findUnique({ where: { code: planCode } });
    if (!newPlan) {
      return res.status(400).json(apiError("INVALID_PLAN", "Plano não encontrado."));
    }

    const subscription = await prisma.subscription.findFirst({ where: { tenantId } });
    if (!subscription) {
      return res.status(404).json(apiError("NOT_FOUND", "Assinatura não encontrada."));
    }

    // Proração: calcula dias restantes do período atual
    const now = new Date();
    const periodEnd = subscription.currentPeriodEnd ?? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const totalDays = 30;
    const remainingDays = Math.max(0, Math.ceil((periodEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
    const proratedAmount = round2((Number(newPlan.basePrice) / totalDays) * remainingDays);

    const updated = await prismaUnscoped.$transaction(async (tx) => {
      const sub = await tx.subscription.update({
        where: { id: subscription.id },
        data: { planId: newPlan.id, status: "ACTIVE" },
      });

      // Atualiza módulos inclusos no novo plano
      const codesToActivate = [...new Set([...newPlan.includedModules])];
      for (const code of codesToActivate) {
        await tx.tenantModule.upsert({
          where: { tenantId_moduleCode: { tenantId, moduleCode: code } },
          create: { tenantId, moduleCode: code, active: true, activatedAt: new Date() },
          update: { active: true, activatedAt: new Date(), deactivatedAt: null },
        });
      }

      await tx.billingEvent.create({
        data: {
          subscriptionId: sub.id,
          provider: "asaas",
          externalEventKey: `change_plan_${randomUUID()}`,
          type: "plan.changed",
          payload: {
            oldPlanCode: subscription.planId,
            newPlanCode: newPlan.code,
            proratedAmount,
            remainingDays,
          },
        },
      });

      return sub;
    });

    await redis.del(`tenant:${tenantId}:modules`);
    return res.json(apiSuccess({ subscription: updated, proratedAmount, remainingDays }));
  },
);

function describeBillingEvent(type: string): string {
  switch (type) {
    case "checkout.completed":
      return "Contratação de plano";
    case "module.activated":
      return "Ativação de módulo adicional";
    case "module.deactivated":
      return "Cancelamento de módulo adicional";
    case "signup":
      return "Cadastro (Tier Free)";
    case "payment.succeeded":
      return "Pagamento confirmado";
    case "subscription.past_due":
      return "Assinatura em atraso";
    default:
      return type;
  }
}
