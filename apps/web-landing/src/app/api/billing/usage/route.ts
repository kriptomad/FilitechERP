// src/app/api/billing/usage/route.ts — Cap. 2.4 / 8.4.4
//
// Antes devolvia sempre `{ tier: 'FREE', current: 0, limit: 100, ... }` — os
// números eram constantes impressas na rota, então o painel nunca mostrava o
// uso real e a trava do Tier Free era decorativa.
//
// Agora: conta vendas, usuários e produtos DO TENANT no período corrente e
// devolve ao lado do limite do plano, com o percentual já calculado. É o que
// o gatekeeper usa para bloquear antes de estourar (Cap. 2.4).
import { prismaUnscoped } from '@/server/db';
import { requireSession } from '@/server/session';
import { withTenant } from '@/server/tenant-context';
import { FREE_LIMITS } from '@/server/billing-catalog';
import { handle } from '@/server/handler';

export const dynamic = 'force-dynamic';

interface UsageCounter {
  current: number;
  limit: number | null;
  exceeded: boolean;
  percent: number | null;
}

function counter(current: number, limit: number | null): UsageCounter {
  const percent = limit && limit > 0 ? Math.min(100, Math.round((current / limit) * 100)) : null;
  return {
    current,
    limit,
    exceeded: limit !== null && current >= limit,
    percent,
  };
}

function limitFor(key: string): number | null {
  const found = FREE_LIMITS.find((entry) => entry.key === key);
  return found ? found.limit : null;
}

export const GET = handle(async (request: Request) => {
  const session = await requireSession(request);
  const { tenantId } = session;

  const subscription = await prismaUnscoped.subscription.findFirst({
    where: { tenantId },
    include: { plan: { select: { code: true, includedModules: true } } },
    orderBy: { createdAt: 'desc' },
  });

  const planCode = subscription?.plan.code ?? 'FREE';
  const isFree = planCode === 'FREE';
  const periodStart = startOfMonth();

  const [sales, users, products] = await withTenant(
    { tenantId, userId: session.userId, role: session.role },
    async () => {
      const [saleCount, userCount, productCount] = await Promise.all([
        prismaUnscoped.sale.count({
          where: { tenantId, createdAt: { gte: periodStart }, status: { not: 'CANCELLED' } },
        }),
        prismaUnscoped.user.count({ where: { tenantId, active: true } }),
        prismaUnscoped.product.count({ where: { tenantId, active: true } }),
      ]);
      return [saleCount, userCount, productCount] as const;
    },
  );

  // No plano pago as travas de volume não se aplicam (limit = null → a UI
  // mostra "ilimitado"). O plano Free mantém os limites do Cap. 2.4.
  const salesLimit = isFree ? limitFor('sales') : null;
  const usersLimit = isFree ? limitFor('users') : null;
  const productsLimit = isFree ? limitFor('products') : null;

  const usage = {
    sales: counter(sales, salesLimit),
    users: counter(users, usersLimit),
    products: counter(products, productsLimit),
    // Emissão fiscal não está incluída no Free (Cap. 2.4) — devolvemos o
    // módulo como bloqueado, e não um número falso zero.
    fiscal: {
      current: 0,
      limit: isFree ? 0 : null,
      exceeded: false,
      percent: null,
    },
  };

  return {
    success: true,
    data: {
      tier: planCode,
      periodStart: periodStart.toISOString(),
      usage,
      limits: FREE_LIMITS.map((entry) => ({
        key: entry.key,
        label: entry.label,
        limit: isFree ? entry.limit : null,
        unit: entry.unit,
        rationale: entry.rationale,
      })),
    },
    error: null,
  };
});

function startOfMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}
