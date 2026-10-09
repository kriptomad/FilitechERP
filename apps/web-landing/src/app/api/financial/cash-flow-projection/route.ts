// src/app/api/financial/cash-flow-projection/route.ts — Cap. 17.3
import { prismaUnscoped } from '@/server/db';
import { readSession } from '@/server/session';
import { handle } from '@/server/handler';
import { DomainError } from '@/server/api-envelope';

export const dynamic = 'force-dynamic';

export const GET = handle(async (request: Request) => {
  const session = await readSession(request);
  if (!session) throw new DomainError('UNAUTHENTICATED', 'Sessão ausente ou expirada.', 401);

  const url = new URL(request.url);
  const daysAhead = Math.min(Number(url.searchParams.get('daysAhead') ?? 30), 365);

  const today = new Date();
  const horizon = new Date(today.getTime() + daysAhead * 24 * 60 * 60 * 1000);

  const [receivables, payables] = await Promise.all([
    prismaUnscoped.accountReceivable.findMany({
      where: { tenantId: session.tenantId, dueDate: { gte: today, lte: horizon } },
      select: { amount: true, dueDate: true, status: true },
    }),
    prismaUnscoped.accountPayable.findMany({
      where: { tenantId: session.tenantId, dueDate: { gte: today, lte: horizon } },
      select: { amount: true, dueDate: true, status: true },
    }),
  ]);

  const byDay = new Map<string, { inflow: number; outflow: number }>();

  for (const r of receivables) {
    const key = r.dueDate.toISOString().slice(0, 10);
    const entry = byDay.get(key) ?? { inflow: 0, outflow: 0 };
    entry.inflow += Number(r.amount);
    byDay.set(key, entry);
  }

  for (const p of payables) {
    const key = p.dueDate.toISOString().slice(0, 10);
    const entry = byDay.get(key) ?? { inflow: 0, outflow: 0 };
    entry.outflow += Number(p.amount);
    byDay.set(key, entry);
  }

  const projectedByDay = Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, { inflow, outflow }]) => ({ day, inflow, outflow, net: inflow - outflow }));

  return { daysAhead, projectedByDay };
});