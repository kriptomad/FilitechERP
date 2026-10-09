// src/app/api/financial/dre/route.ts — Cap. 17.2 DRE Automática
import { prismaUnscoped } from '@/server/db';
import { readSession } from '@/server/session';
import { handle } from '@/server/handler';
import { DomainError } from '@/server/api-envelope';

export const dynamic = 'force-dynamic';

export const GET = handle(async (request: Request) => {
  const session = await readSession(request);
  if (!session) throw new DomainError('UNAUTHENTICATED', 'Sessão ausente ou expirada.', 401);

  const url = new URL(request.url);
  const periodStart = url.searchParams.get('periodStart');
  const periodEnd = url.searchParams.get('periodEnd');

  if (!periodStart || !periodEnd) {
    throw new DomainError('VALIDATION_ERROR', 'Informe periodStart e periodEnd.');
  }

  const start = new Date(periodStart);
  const end = new Date(periodEnd);

  const [revenue, expenses] = await Promise.all([
    prismaUnscoped.sale.aggregate({
      where: { tenantId: session.tenantId, createdAt: { gte: start, lte: end } },
      _sum: { totalAmount: true },
      _count: { _all: true },
    }),
    prismaUnscoped.accountPayable.aggregate({
      where: { tenantId: session.tenantId, paidAt: { gte: start, lte: end } },
      _sum: { amount: true },
    }),
  ]);

  const grossRevenue = Number(revenue._sum.totalAmount ?? 0);
  const totalExpenses = Number(expenses._sum.amount ?? 0);
  const netResult = grossRevenue - totalExpenses;

  return {
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
    revenueLines: [
      { code: 'REC_BRUTA', label: 'Receita Bruta de Vendas', amount: grossRevenue },
    ],
    expenseLines: [
      { code: 'DESP_TOT', label: 'Despesas Totais', amount: totalExpenses },
    ],
    grossRevenue,
    totalExpenses,
    netResult,
    saleCount: revenue._count._all,
  };
});