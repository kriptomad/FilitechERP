// src/server/services/admin-receivables.ts — Cap. 4.6 / 17.3
//
// Contas a receber do tenant. A versão anterior validava a ação e devolvia um
// eco — "dar baixa" ou "cancelar" um recebível não mudava nada no banco, e os
// registros tinham datas fixas de 2024.
import { Prisma, type PrismaClient } from '@prisma/client';
import { DomainError } from '../api-envelope';
import { assertCreditAvailable } from './admin-clients';

export interface ReceivableRow {
  id: string;
  clientId: string;
  clientName: string;
  description: string;
  amount: number;
  dueDate: string;
  status: string;
  paidAt: string | null;
  saleId: string | null;
  createdAt: string;
}

function dec(value: Prisma.Decimal | null | undefined): number {
  return value ? Number(value) : 0;
}

/** Considera PENDING vencido como OVERDUE na leitura (Cap. 4.6). */
function effectiveStatus(status: string, dueDate: Date): string {
  if (status === 'PENDING' && dueDate.getTime() < Date.now()) return 'OVERDUE';
  return status;
}

export async function listReceivables(
  db: PrismaClient,
  tenantId: string,
  filters: { status?: string; clientId?: string } = {},
): Promise<ReceivableRow[]> {
  const rows = await db.accountReceivable.findMany({
    where: {
      tenantId,
      ...(filters.clientId ? { clientId: filters.clientId } : {}),
      // Filtro OVERDUE inclui PENDING-past-due, que o enum ainda não reflete.
      ...(filters.status === 'OVERDUE'
        ? { status: { in: ['OVERDUE', 'PENDING'] } }
        : filters.status
          ? { status: filters.status as never }
          : {}),
    },
    include: { client: { select: { name: true } } },
    orderBy: [{ dueDate: 'asc' }],
    take: 200,
  });

  return rows
    .map((r) => ({
      id: r.id,
      clientId: r.clientId,
      clientName: r.client.name,
      description: r.description,
      amount: dec(r.amount),
      dueDate: r.dueDate.toISOString(),
      status: effectiveStatus(r.status, r.dueDate),
      paidAt: r.paidAt?.toISOString() ?? null,
      saleId: r.saleId,
      createdAt: r.createdAt.toISOString(),
    }))
    .filter((r) => (filters.status ? r.status === filters.status : true));
}

export interface CreateReceivableInput {
  clientId: string;
  description: string;
  amount: number;
  dueDate: string;
  saleId?: string;
}

export async function createReceivable(
  db: PrismaClient,
  tenantId: string,
  input: CreateReceivableInput,
): Promise<ReceivableRow> {
  if (input.amount <= 0) {
    throw new DomainError('VALIDATION_ERROR', 'O valor deve ser maior que zero.');
  }

  const dueDate = new Date(input.dueDate);
  if (Number.isNaN(dueDate.getTime())) {
    throw new DomainError('VALIDATION_ERROR', 'Data de vencimento inválida.');
  }

  // Um recebível a prazo consome o limite de crédito do cliente (Cap. 4.6).
  await assertCreditAvailable(db, tenantId, input.clientId, input.amount);

  const created = await db.accountReceivable.create({
    data: {
      tenantId,
      clientId: input.clientId,
      description: input.description,
      amount: new Prisma.Decimal(input.amount),
      dueDate,
      saleId: input.saleId ?? null,
    },
    include: { client: { select: { name: true } } },
  });

  return {
    id: created.id,
    clientId: created.clientId,
    clientName: created.client.name,
    description: created.description,
    amount: dec(created.amount),
    dueDate: created.dueDate.toISOString(),
    status: effectiveStatus(created.status, created.dueDate),
    paidAt: created.paidAt?.toISOString() ?? null,
    saleId: created.saleId,
    createdAt: created.createdAt.toISOString(),
  };
}

export async function payReceivable(
  db: PrismaClient,
  tenantId: string,
  id: string,
): Promise<ReceivableRow> {
  const existing = await db.accountReceivable.findFirst({ where: { id, tenantId } });
  if (!existing) throw new DomainError('NOT_FOUND', 'Recebível não encontrado.', 404);

  if (existing.status === 'PAID') {
    throw new DomainError('ALREADY_PAID', 'Este recebível já está pago.', 409);
  }
  if (existing.status === 'CANCELLED') {
    throw new DomainError('ALREADY_CANCELLED', 'Este recebível foi cancelado.', 409);
  }

  const paidAt = new Date();
  const updated = await db.accountReceivable.update({
    where: { id },
    data: { status: 'PAID', paidAt },
    include: { client: { select: { name: true } } },
  });

  // Recebível pago de venda a prazo libera o limite do crediário.
  await db.client.update({
    where: { id: updated.clientId },
    data: { creditBalanceUsed: { decrement: dec(updated.amount) } },
  }).catch(() => undefined);

  return {
    id: updated.id,
    clientId: updated.clientId,
    clientName: updated.client.name,
    description: updated.description,
    amount: dec(updated.amount),
    dueDate: updated.dueDate.toISOString(),
    status: 'PAID',
    paidAt: updated.paidAt?.toISOString() ?? null,
    saleId: updated.saleId,
    createdAt: updated.createdAt.toISOString(),
  };
}

export async function cancelReceivable(
  db: PrismaClient,
  tenantId: string,
  id: string,
): Promise<ReceivableRow> {
  const existing = await db.accountReceivable.findFirst({ where: { id, tenantId } });
  if (!existing) throw new DomainError('NOT_FOUND', 'Recebível não encontrado.', 404);

  if (existing.status !== 'PENDING' && existing.status !== 'OVERDUE') {
    throw new DomainError(
      'NOT_CANCELLABLE',
      'Somente recebível em aberto pode ser cancelado.',
      409,
    );
  }

  const updated = await db.accountReceivable.update({
    where: { id },
    data: { status: 'CANCELLED' },
    include: { client: { select: { name: true } } },
  });

  return {
    id: updated.id,
    clientId: updated.clientId,
    clientName: updated.client.name,
    description: updated.description,
    amount: dec(updated.amount),
    dueDate: updated.dueDate.toISOString(),
    status: 'CANCELLED',
    paidAt: null,
    saleId: updated.saleId,
    createdAt: updated.createdAt.toISOString(),
  };
}