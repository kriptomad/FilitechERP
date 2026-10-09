// src/app/api/billing/subscription/route.ts — Cap. 2.7.5
// Assinatura atual do tenant: plano, breakdown, MRR e eventos recentes.
// Alimenta o painel com transparência total de cobrança.
import { prismaUnscoped } from '@/server/db';
import { jsonSuccess } from '@/server/api-envelope';
import { getActiveModuleCodes } from '@/server/cache';
import { requireSession } from '@/server/session';
import { withTenant } from '@/server/tenant-context';
import { round2 } from '@/server/billing-catalog';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await requireSession(request);
  const { tenantId } = session;

  const [subscription, tenant] = await Promise.all([
    withTenant({ tenantId, userId: session.userId, role: session.role }, () =>
      prismaUnscoped.subscription.findFirst({
        where: { tenantId },
        include: {
          plan: true,
          billingEvents: { orderBy: { createdAt: 'desc' }, take: 24 },
        },
      }),
    ),
    prismaUnscoped.tenant.findUnique({
      where: { id: tenantId },
      select: { tradeName: true, legalName: true, status: true, slug: true, createdAt: true },
    }),
  ]);

  const activeCodes = await getActiveModuleCodes(tenantId);

  // Só contam como add-ons pagos os módulos fora do plano — caso contrário o
  // MRR contaria duas vezes o que já está incluso.
  const catalogModules = await prismaUnscoped.module.findMany({
    where: { code: { in: activeCodes } },
  });
  const paidAddons = catalogModules.filter(
    (m) =>
      Number(m.monthlyPrice) > 0 &&
      !(subscription?.plan.includedModules.includes(m.code) ?? false),
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

  return jsonSuccess({
    subscription: subscription
      ? {
          id: subscription.id,
          status: subscription.status,
          provider: subscription.provider,
          currentPeriodEnd: subscription.currentPeriodEnd,
          pastDueSince: subscription.pastDueSince,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
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
  });
}