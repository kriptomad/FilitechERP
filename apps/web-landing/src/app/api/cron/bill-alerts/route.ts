// src/app/api/cron/bill-alerts/route.ts
// Alertas de contas a pagar (Cap. 17 / 22)
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

function getDueDate(bill: { dueDay: number }): Date {
  const now = new Date();
  const dueDate = new Date(now.getFullYear(), now.getMonth(), bill.dueDay);
  // Se o dia já passou este mês, considera o próximo mês
  if (dueDate < now) {
    dueDate.setMonth(dueDate.getMonth() + 1);
  }
  return dueDate;
}

export async function GET(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Não autorizado.' } }, { status: 401 });
  }

  try {
    const now = new Date();
    const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    // Busca todas as contas pendentes
    const allBills = await prismaUnscoped.personalBill.findMany({
      where: { status: 'PENDING' },
      include: { tenant: true },
    });

    // Filtra por dueDate calculado
    const upcoming = allBills.filter(bill => {
      const dueDate = getDueDate(bill);
      return dueDate >= now && dueDate <= in3Days;
    });

    const overdue = allBills.filter(bill => {
      const dueDate = getDueDate(bill);
      return dueDate < now;
    });

    let alertsSent = 0;

    for (const bill of upcoming) {
      const dueDate = getDueDate(bill);
      await emitNotification({
        recipientId: bill.tenantId,
        category: 'personal_bill_reminder',
        title: 'Conta a vencer',
        body: `"${bill.name}" vence em ${dueDate.toLocaleDateString('pt-BR')} — R$ ${Number(bill.amount).toFixed(2)}`,
        data: { billId: bill.id, dueDate: dueDate.toISOString(), amount: Number(bill.amount) },
        priority: 'NORMAL',
      });
      alertsSent++;
    }

    for (const bill of overdue) {
      const dueDate = getDueDate(bill);
      await emitNotification({
        recipientId: bill.tenantId,
        category: 'personal_bill_overdue',
        title: 'Conta vencida',
        body: `"${bill.name}" venceu em ${dueDate.toLocaleDateString('pt-BR')} — R$ ${Number(bill.amount).toFixed(2)}`,
        data: { billId: bill.id, dueDate: dueDate.toISOString(), amount: Number(bill.amount) },
        priority: 'HIGH',
      });
      alertsSent++;
    }

    return NextResponse.json({ success: true, data: { upcoming: upcoming.length, overdue: overdue.length, alertsSent } });
  } catch (err) {
    console.error('[cron:bill-alerts] erro:', err);
    return NextResponse.json({ success: false, error: { code: 'CRON_FAILED', message: 'Falha no cron de alertas de contas.' } }, { status: 500 });
  }
}