// src/app/app/financeiro/page.tsx — Cap. 17 (financeiro) / 4.6
//
// Visão financeira do tenant: DRE do mês corrente, fluxo de caixa projetado,
// contas a receber e a pagar. Tudo agregado do banco no servidor.
// A sidebar já linkava para cá — antes era 404.

import type { Prisma } from '@prisma/client';
import { prismaUnscoped } from '@/server/db';
import { getSessionContext } from '@/server/session-context';
import { FinanceiroView } from './financeiro-view';

export const dynamic = 'force-dynamic';

function monthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export default async function FinanceiroPage() {
  const context = await getSessionContext();
  if (!context) return null;

  const tenantId = context.tenant.id;
  const start = monthStart();
  const today = new Date();
  const horizon = addDays(today, 30);

  const [
    revenue,
    expenses,
    receivables,
    payables,
    upcomingReceivables,
    upcomingPayables,
    registers,
  ] = await Promise.all([
    prismaUnscoped.sale.aggregate({
      where: { tenantId, createdAt: { gte: start }, status: { not: 'CANCELLED' } },
      _sum: { totalAmount: true },
      _count: { _all: true },
    }),
    prismaUnscoped.accountPayable.aggregate({
      where: { tenantId, paidAt: { gte: start } },
      _sum: { amount: true },
    }),
    prismaUnscoped.accountReceivable.groupBy({
      by: ['status'],
      where: { tenantId, status: { in: ['PENDING', 'OVERDUE'] } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prismaUnscoped.accountPayable.groupBy({
      by: ['status'],
      where: { tenantId, status: { in: ['PENDING', 'OVERDUE'] } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prismaUnscoped.accountReceivable.findMany({
      where: { tenantId, dueDate: { gte: today, lte: horizon }, status: { in: ['PENDING', 'OVERDUE'] } },
      select: { id: true, description: true, amount: true, dueDate: true, client: { select: { name: true } } },
      orderBy: { dueDate: 'asc' },
      take: 15,
    }),
    prismaUnscoped.accountPayable.findMany({
      where: { tenantId, dueDate: { gte: today, lte: horizon }, status: { in: ['PENDING', 'OVERDUE'] } },
      select: { id: true, description: true, amount: true, dueDate: true, supplier: { select: { name: true } } },
      orderBy: { dueDate: 'asc' },
      take: 15,
    }),
    prismaUnscoped.cashRegister.findMany({
      where: { tenantId },
      orderBy: { openedAt: 'desc' },
      take: 5,
      select: {
        id: true,
        status: true,
        openingAmount: true,
        closingAmount: true,
        expectedAmount: true,
        divergenceAmount: true,
        openedAt: true,
        closedAt: true,
      },
    }),
  ]);

  const grossRevenue = Number(revenue._sum.totalAmount ?? 0);
  const totalExpenses = Number(expenses._sum.amount ?? 0);

  const sumBy = (rows: { _sum: { amount: Prisma.Decimal | null } }[]) =>
    rows.reduce((acc, row) => acc + Number(row._sum.amount ?? 0), 0);

  const pendingReceivables = receivables.filter((r) => r.status !== 'PAID');
  const overdueReceivables = receivables.filter((r) => r.status === 'OVERDUE');
  const pendingPayables = payables.filter((p) => p.status !== 'PAID');
  const overduePayables = payables.filter((p) => p.status === 'OVERDUE');

  const registerRows = registers.map((register) => {
    const closed = register.status === 'CLOSED';
    return {
      id: register.id,
      status: register.status,
      openingAmount: Number(register.openingAmount),
      // Gaveta cega (Cap. 4.1): o esperado só existe depois do fechamento.
      closingAmount: closed ? Number(register.closingAmount) : null,
      expectedAmount: closed ? Number(register.expectedAmount) : null,
      divergenceAmount: closed ? Number(register.divergenceAmount) : null,
      openedAt: register.openedAt.toISOString(),
      closedAt: register.closedAt?.toISOString() ?? null,
    };
  });

  return (
    <FinanceiroView
      periodStart={start.toISOString()}
      grossRevenue={grossRevenue}
      totalExpenses={totalExpenses}
      netResult={grossRevenue - totalExpenses}
      saleCount={revenue._count._all}
      pendingReceivableTotal={sumBy(pendingReceivables)}
      overdueReceivableCount={overdueReceivables.length}
      pendingPayableTotal={sumBy(pendingPayables)}
      overduePayableCount={overduePayables.length}
      upcomingReceivables={upcomingReceivables.map((r) => ({
        id: r.id,
        description: r.description,
        party: r.client?.name ?? null,
        amount: Number(r.amount),
        dueDate: r.dueDate.toISOString(),
      }))}
      upcomingPayables={upcomingPayables.map((p) => ({
        id: p.id,
        description: p.description,
        party: p.supplier?.name ?? null,
        amount: Number(p.amount),
        dueDate: p.dueDate.toISOString(),
      }))}
      registers={registerRows}
    />
  );
}
