// apps/web-landing/src/server/services/reconcile-bank-statement.ts
import { Prisma } from '@prisma/client';
import { prismaUnscoped } from '../db';

type TransactionClient = Omit<Prisma.TransactionClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

export interface ReconciliationMatch {
  type: 'PAYABLE' | 'RECEIVABLE';
  id: string;
}

/**
 * Busca candidato de conciliação: valor exato + janela de +/- 3 dias
 * contra contas a pagar/receber em aberto.
 */
export async function findReconciliationCandidate(
  tx: TransactionClient,
  tenantId: string,
  amount: number,
  date: Date
): Promise<ReconciliationMatch | null> {
  const absAmount = Math.abs(amount);
  const startDate = new Date(date);
  startDate.setDate(startDate.getDate() - 3);
  const endDate = new Date(date);
  endDate.setDate(endDate.getDate() + 3);

  // Tenta primeiro contas a pagar (valor negativo = saída)
  if (amount < 0) {
    const payable = await tx.accountPayable.findFirst({
      where: {
        tenantId,
        status: 'PENDING',
        amount: { equals: absAmount },
        dueDate: { gte: startDate, lte: endDate },
      },
      select: { id: true },
    });
    if (payable) return { type: 'PAYABLE', id: payable.id };
  }

  // Tenta contas a receber (valor positivo = entrada)
  if (amount > 0) {
    const receivable = await tx.accountReceivable.findFirst({
      where: {
        tenantId,
        status: 'PENDING',
        amount: { equals: absAmount },
        dueDate: { gte: startDate, lte: endDate },
      },
      select: { id: true },
    });
    if (receivable) return { type: 'RECEIVABLE', id: receivable.id };
  }

  return null;
}