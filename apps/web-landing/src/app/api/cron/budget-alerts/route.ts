// src/app/api/cron/budget-alerts/route.ts
// Alertas de orçamento pessoal (Cap. 22)
import { NextResponse } from 'next/server';
import { prismaUnscoped } from '@/server/db';
import { env } from '@/server/env';
import { emitNotification } from '@/server/services/notifications';

export const dynamic = 'force-dynamic';

function authorize(request: Request): boolean {
  const secret = env.cronSecret;
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Não autorizado.' } }, { status: 401 });
  }

  try {
    const budgets = await prismaUnscoped.personalBudget.findMany({
      where: { alertThreshold: { gt: 0 } },
      include: { category: true, tenant: true },
    });

    let alertsSent = 0;

    for (const budget of budgets) {
      // Calcula início e fim do período baseado no monthReference (primeiro dia do mês)
      const periodStart = new Date(budget.monthReference);
      const periodEnd = new Date(periodStart);
      periodEnd.setMonth(periodEnd.getMonth() + 1);
      periodEnd.setDate(periodEnd.getDate() - 1);
      periodEnd.setHours(23, 59, 59, 999);

      const spent = await prismaUnscoped.personalTransaction.aggregate({
        where: {
          tenantId: budget.tenantId,
          categoryId: budget.categoryId,
          type: 'EXPENSE',
          transactionDate: { gte: periodStart, lte: periodEnd },
        },
        _sum: { amount: true },
      });

      const totalSpent = Number(spent._sum.amount ?? 0);
      const limitAmount = Number(budget.limitAmount);
      const percentage = limitAmount > 0 ? (totalSpent / limitAmount) * 100 : 0;

      if (percentage >= Number(budget.alertThreshold)) {
        const alertType = percentage >= 100 ? 'personal_budget_exceeded' : 'personal_budget_warning_80';
        await emitNotification({
          recipientId: budget.tenantId,
          category: alertType,
          title: percentage >= 100 ? 'Orçamento excedido' : 'Orçamento próximo do limite',
          body: `Categoria "${budget.category.name}": ${percentage.toFixed(1)}% utilizado (R$ ${totalSpent.toFixed(2)} de R$ ${limitAmount.toFixed(2)})`,
          data: { budgetId: budget.id, percentage, spent: totalSpent, limit: limitAmount },
          priority: percentage >= 100 ? 'HIGH' : 'NORMAL',
        });
        alertsSent++;
      }
    }

    return NextResponse.json({ success: true, data: { budgetsChecked: budgets.length, alertsSent } });
  } catch (err) {
    console.error('[cron:budget-alerts] erro:', err);
    return NextResponse.json({ success: false, error: { code: 'CRON_FAILED', message: 'Falha no cron de alertas de orçamento.' } }, { status: 500 });
  }
}