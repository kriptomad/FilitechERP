// src/jobs/charge-subscriptions.job.ts — Cap. 2.3/2.6 (cobrança recorrente de assinaturas)
import { prismaUnscoped } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";

/**
 * Job agendado (diário): cobra a mensalidade de todas as assinaturas ACTIVE.
 * Gera um AccountReceivable por tenant com o valor do plano + add-ons ativos,
 * registra o BillingEvent e notifica o tenant. O pagamento é confirmado via
 * webhook de billing (POST /api/webhooks/billing → payment.succeeded).
 *
 * Em produção, este job dispararia a cobrança real no gateway (Asaas/Stripe)
 * e aguardaria o webhook de confirmação. Aqui, gera a cobrança localmente.
 */
export async function chargeSubscriptions() {
  const now = new Date();
  const activeSubscriptions = (await prismaUnscoped.subscription.findMany({
    where: { status: "ACTIVE" },
    include: {
      plan: true,
      tenant: { select: { id: true, tradeName: true } },
    },
  })) as unknown as Array<{
    id: string;
    tenantId: string;
    plan: { code: string; label: string; basePrice: unknown; includedModules: string[] };
    tenant: { id: string; tradeName: string };
  }>;

  // Busca módulos ativos de cada tenant separadamente
  const tenantModulesMap = new Map<string, Array<{ moduleCode: string; module: { code: string; label: string; monthlyPrice: unknown } }>>();
  for (const sub of activeSubscriptions) {
    const tenantModules = await prismaUnscoped.tenantModule.findMany({
      where: { tenantId: sub.tenantId, active: true },
      include: { module: true },
    });
    tenantModulesMap.set(
      sub.tenantId,
      tenantModules.map((tm) => ({
        moduleCode: tm.moduleCode,
        module: { code: tm.module.code, label: tm.module.label, monthlyPrice: tm.module.monthlyPrice },
      })),
    );
  }

  let charged = 0;
  let skipped = 0;

  for (const sub of activeSubscriptions) {
    // Calcula MRR: plano base + add-ons ativos (não inclusos no plano)
    const includedCodes = sub.plan.includedModules;
    const tenantModules = tenantModulesMap.get(sub.tenantId) ?? [];
    const paidAddons = tenantModules.filter(
      (tm) => !includedCodes.includes(tm.moduleCode) && Number(tm.module.monthlyPrice) > 0,
    );
    const mrr =
      Number(sub.plan.basePrice) +
      paidAddons.reduce((sum, tm) => sum + Number(tm.module.monthlyPrice), 0);

    if (mrr <= 0) {
      skipped++;
      continue;
    }

    // Verifica se já existe cobrança para este período (mês atual)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const existingCharge = await prismaUnscoped.accountReceivable.findFirst({
      where: {
        tenantId: sub.tenantId,
        description: { contains: `Mensalidade ${sub.plan.label}` },
        createdAt: { gte: monthStart },
      },
    });
    if (existingCharge) {
      skipped++;
      continue;
    }

    // Gera a cobrança (conta a receber do tenant)
    const dueDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 dias para pagar
    await prismaUnscoped.$transaction(async (tx) => {
      await tx.accountReceivable.create({
        data: {
          tenantId: sub.tenantId,
          clientId: await getPlatformClientId(tx, sub.tenantId),
          description: `Mensalidade ${sub.plan.label} — ${now.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}`,
          amount: mrr,
          dueDate,
          status: "PENDING",
        },
      });

      await tx.billingEvent.create({
        data: {
          subscriptionId: sub.id,
          provider: "asaas",
          externalEventKey: `charge_${sub.id}_${now.toISOString().slice(0, 10)}`,
          type: "subscription.charged",
          payload: {
            amount: mrr,
            planCode: sub.plan.code,
            planLabel: sub.plan.label,
            addons: paidAddons.map((tm) => ({ code: tm.moduleCode, label: tm.module.label, price: Number(tm.module.monthlyPrice) })),
            dueDate: dueDate.toISOString(),
          },
        },
      });
    });

    charged++;
    logger.info({ tenantId: sub.tenantId, subscriptionId: sub.id, amount: mrr }, "subscription_charged");
  }

  logger.info({ job: "charge-subscriptions", charged, skipped }, "charge_subscriptions_completed");
  return { charged, skipped };
}

/**
 * Cliente "plataforma" — usado como contrapartida das cobranças de assinatura.
 * Cada tenant tem um cliente virtual "Filitech Pagamentos" para receber as
 * mensalidades. Criado on-demand se não existir.
 */
async function getPlatformClientId(tx: Parameters<Parameters<typeof prismaUnscoped.$transaction>[0]>[0], tenantId: string): Promise<string> {
  const existing = await tx.client.findFirst({
    where: { tenantId, document: "PLATAFORMA" },
  });
  if (existing) return existing.id;

  const created = await tx.client.create({
    data: {
      tenantId,
      name: "Filitech Pagamentos",
      document: "PLATAFORMA",
      creditLimit: 0,
    },
  });
  return created.id;
}

export function registerChargeSubscriptionsWorker() {
  return {
    name: "charge-subscriptions",
    handler: () => chargeSubscriptions(),
    schedule: "0 6 * * *", // diário às 6h
  };
}
