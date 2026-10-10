// src/server/services/work-orders.ts — Cap. 4.2 / 6.4
//
// Ordem de serviço da assistência técnica. O ciclo completo está no Cap. 4.2:
//
//   RECEIVED → DIAGNOSING → AWAITING_APPROVAL → IN_REPAIR → READY → DELIVERED
//
// A aprovação por link (Cap. 6.4) usa UPDATE condicional: `WHERE status =
// AWAITING_APPROVAL AND budgetValidUntil > now()`. Dois cliques simultâneos no
// link do WhatsApp não geram dupla aprovação nem dupla baixa de peça.
import { randomBytes } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { DomainError } from '../api-envelope';
import { absoluteUrl } from '../env';

export interface WorkOrderRow {
  id: string;
  protocol: string;
  clientId: string;
  clientName: string;
  equipmentDescription: string;
  reportedIssue: string;
  status: string;
  diagnosisNotes: string | null;
  assignedTechnicianId: string | null;
  technicianName: string | null;
  budgetTotal: number;
  budgetValidUntil: string | null;
  warrantyDays: number | null;
  createdAt: string;
  deliveredAt: string | null;
  itemCount: number;
}

/**
 * Índice de protocolo `OS-AAAA-NNNNNN` — sequencial REAL por ano, estável.
 *
 * Por que não usar o `id` (como fazia a versão anterior): `OS-2026-3F8A21`
 * não é um número de ordem — é um pedaço de UUID. O Cap. 4.2 pede uma ordem
 * cronológica que o cliente e o técnico conseguem ler e citar no WhatsApp.
 *
 * Implementação: uma única consulta projetando `id` e `createdAt` do tenant,
 * ordenada cronologicamente, e a posição de cada OS vira o número. Como as OS
 * só são acrescentadas ao final, a posição de uma OS existente nunca muda — o
 * protocolo é estável entre consultas, sem coluna extra na tabela.
 */
async function buildProtocolIndex(
  db: PrismaClient,
  tenantId: string,
): Promise<Map<string, string>> {
  const orders = await db.workOrder.findMany({
    where: { tenantId },
    select: { id: true, createdAt: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

  const counterByYear = new Map<number, number>();
  const index = new Map<string, string>();

  for (const order of orders) {
    const year = order.createdAt.getFullYear();
    const sequence = (counterByYear.get(year) ?? 0) + 1;
    counterByYear.set(year, sequence);
    index.set(order.id, `OS-${year}-${String(sequence).padStart(6, '0')}`);
  }

  return index;
}

export async function listWorkOrders(
  db: PrismaClient,
  tenantId: string,
  status?: string,
): Promise<WorkOrderRow[]> {
  const orders = await db.workOrder.findMany({
    where: { tenantId, ...(status ? { status: status as never } : {}) },
    include: {
      client: { select: { name: true } },
      assignedTechnician: { select: { name: true } },
      items: { select: { id: true, unitPrice: true, quantity: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  if (orders.length === 0) return [];

  const protocols = await buildProtocolIndex(db, tenantId);
  return orders.map((order) => serialize(order, protocols.get(order.id)));
}

function serialize(
  order: {
    id: string;
    createdAt: Date;
    client: { name: string };
    equipmentDescription: string;
    reportedIssue: string;
    status: string;
    diagnosisNotes: string | null;
    assignedTechnicianId: string | null;
    assignedTechnician: { name: string } | null;
    budgetValidUntil: Date | null;
    warrantyDays: number | null;
    deliveredAt: Date | null;
    items: { unitPrice: Prisma.Decimal; quantity: Prisma.Decimal }[];
    clientId?: string;
  },
  protocol?: string,
): WorkOrderRow {
  return {
    id: order.id,
    // Fallback determinístico quando o índice ainda não foi computado (uma OS
    // recém-criada): nunca `Math.random()` nem hash opaco de UUID.
    protocol:
      protocol ??
      `OS-${order.createdAt.getFullYear()}-${order.id.replace(/-/g, '').slice(0, 6).toUpperCase()}`,
    clientName: order.client.name,
    equipmentDescription: order.equipmentDescription,
    reportedIssue: order.reportedIssue,
    status: order.status,
    diagnosisNotes: order.diagnosisNotes,
    assignedTechnicianId: order.assignedTechnicianId,
    technicianName: order.assignedTechnician?.name ?? null,
    budgetTotal: order.items.reduce(
      (sum, i) => sum + Number(i.unitPrice) * Number(i.quantity),
      0,
    ),
    budgetValidUntil: order.budgetValidUntil?.toISOString() ?? null,
    warrantyDays: order.warrantyDays,
    createdAt: order.createdAt.toISOString(),
    deliveredAt: order.deliveredAt?.toISOString() ?? null,
    itemCount: order.items.length,
    clientId: order.clientId ?? '',
  };
}

export interface CreateWorkOrderInput {
  clientId: string;
  equipmentDescription: string;
  reportedIssue: string;
  assignedTechnicianId?: string;
  warrantyDays?: number;
  checklistItems?: { label: string; checked: boolean }[];
}

export async function createWorkOrder(
  db: PrismaClient,
  tenantId: string,
  input: CreateWorkOrderInput,
): Promise<WorkOrderRow> {
  const client = await db.client.findFirst({ where: { id: input.clientId, tenantId } });
  if (!client) throw new DomainError('CLIENT_NOT_FOUND', 'Cliente não encontrado.', 404);

  const order = await db.workOrder.create({
    data: {
      tenantId,
      clientId: input.clientId,
      equipmentDescription: input.equipmentDescription,
      reportedIssue: input.reportedIssue,
      assignedTechnicianId: input.assignedTechnicianId ?? null,
      warrantyDays: input.warrantyDays ?? null,
      status: 'RECEIVED',
      // Checklist de entrada assinado digitalmente (Cap. 4.2) — é o que impede
      // contestação posterior sobre o estado do equipamento na recepção.
      checklist: input.checklistItems?.length
        ? {
            create: [
              {
                tenantId,
                stage: 'ENTRY',
                items: input.checklistItems as unknown as Prisma.InputJsonValue,
              },
            ],
          }
        : undefined,
    },
    include: {
      client: { select: { name: true } },
      assignedTechnician: { select: { name: true } },
      items: { select: { id: true, unitPrice: true, quantity: true } },
    },
  });

  const protocols = await buildProtocolIndex(db, tenantId);
  return {
    ...serialize(order, protocols.get(order.id)),
    clientId: order.clientId,
  };
}

export interface BudgetItemInput {
  description: string;
  itemType: string;
  quantity: number;
  unitPrice: number;
  productId?: string;
  commissionable?: boolean;
}

export interface BudgetResult {
  approvalUrl: string;
  validUntil: string;
  total: number;
}

export async function sendBudget(
  db: PrismaClient,
  tenantId: string,
  workOrderId: string,
  items: BudgetItemInput[],
  validDays = 7,
): Promise<BudgetResult> {
  const order = await db.workOrder.findFirst({ where: { id: workOrderId, tenantId } });
  if (!order) throw new DomainError('NOT_FOUND', 'Ordem de serviço não encontrada.', 404);

  if (order.status === 'DELIVERED' || order.status === 'CANCELLED') {
    throw new DomainError(
      'WORK_ORDER_CLOSED',
      'Esta O.S. já está encerrada e não pode receber novo orçamento.',
      409,
    );
  }

  if (items.length === 0) {
    throw new DomainError('EMPTY_BUDGET', 'O orçamento precisa de ao menos um item.');
  }

  const token = randomBytes(32).toString('hex');
  const validUntil = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000);

  const total = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);

  await db.$transaction(async (tx) => {
    await tx.workOrderItem.deleteMany({ where: { tenantId, workOrderId } });
    await tx.workOrderItem.createMany({
      data: items.map((item) => ({
        tenantId,
        workOrderId,
        productId: item.productId ?? null,
        description: item.description,
        itemType: item.itemType,
        quantity: new Prisma.Decimal(item.quantity),
        unitPrice: new Prisma.Decimal(item.unitPrice),
        commissionable: item.commissionable ?? item.itemType === 'LABOR',
      })),
    });

    await tx.workOrder.update({
      where: { id: workOrderId },
      data: {
        status: 'AWAITING_APPROVAL',
        budgetApprovalToken: token,
        budgetValidUntil: validUntil,
        budgetApprovedAt: null,
      },
    });
  });

  return {
    // Link público assinado: o cliente aprova do celular, sem voltar à loja.
    approvalUrl: absoluteUrl(`/aprovacao/${token}`),
    validUntil: validUntil.toISOString(),
    total: Math.round(total * 100) / 100,
  };
}

/**
 * Aprovação pública pelo link (Cap. 6.4).
 *
 * O UPDATE condicional é o que torna a aprovação à prova de duplo clique:
 * a segunda tentativa afeta 0 linhas porque `budgetApprovalToken` já foi
 * zerado pela primeira.
 */
export async function approveBudgetByToken(
  db: PrismaClient,
  token: string,
): Promise<{ workOrderId: string; approvedAt: string }> {
  const order = await db.workOrder.findFirst({
    where: { budgetApprovalToken: token },
    select: { id: true, tenantId: true, status: true, budgetValidUntil: true },
  });

  if (!order) {
    throw new DomainError('TOKEN_NOT_FOUND', 'Link de aprovação inválido.', 404);
  }

  if (order.status !== 'AWAITING_APPROVAL') {
    throw new DomainError(
      'ALREADY_PROCESSED',
      'Este orçamento já foi processado.',
      409,
    );
  }

  if (order.budgetValidUntil && order.budgetValidUntil.getTime() < Date.now()) {
    throw new DomainError(
      'BUDGET_EXPIRED',
      'Este orçamento expirou. Solicite um novo orçamento à assistência.',
      410,
    );
  }

  const approvedAt = new Date();

  const result = await db.workOrder.updateMany({
    where: {
      id: order.id,
      status: 'AWAITING_APPROVAL',
      // O token ainda precisa estar lá — se outro clique já consumiu, 0 linhas.
      budgetApprovalToken: token,
    },
    data: {
      status: 'IN_REPAIR',
      budgetApprovedAt: approvedAt,
      budgetApprovalToken: null,
    },
  });

  if (result.count === 0) {
    throw new DomainError('ALREADY_PROCESSED', 'Este orçamento já foi processado.', 409);
  }

  return { workOrderId: order.id, approvedAt: approvedAt.toISOString() };
}

/** Consulta pública do orçamento — o cliente vê o que está approving. */
export async function getPublicBudget(
  db: PrismaClient,
  token: string,
): Promise<{
  protocol: string;
  equipment: string;
  items: { description: string; quantity: number; unitPrice: number; total: number }[];
  total: number;
  validUntil: string | null;
  status: string;
  alreadyApproved: boolean;
}> {
  const order = await db.workOrder.findFirst({
    where: { budgetApprovalToken: token },
    include: { items: true },
  });

  if (!order) throw new DomainError('TOKEN_NOT_FOUND', 'Link de aprovação inválido.', 404);

  const protocols = await buildProtocolIndex(db, order.tenantId);

  return {
    protocol: protocols.get(order.id) ?? `OS-${order.createdAt.getFullYear()}-000001`,
    equipment: order.equipmentDescription,
    items: order.items.map((i) => ({
      description: i.description,
      quantity: Number(i.quantity),
      unitPrice: Number(i.unitPrice),
      total: Math.round(Number(i.unitPrice) * Number(i.quantity) * 100) / 100,
    })),
    total:
      Math.round(
        order.items.reduce(
          (sum, i) => sum + Number(i.unitPrice) * Number(i.quantity),
          0,
        ) * 100,
      ) / 100,
    validUntil: order.budgetValidUntil?.toISOString() ?? null,
    status: order.status,
    alreadyApproved: order.status === 'IN_REPAIR',
  };
}

export async function advanceStatus(
  db: PrismaClient,
  tenantId: string,
  workOrderId: string,
  status: string,
  diagnosisNotes?: string,
): Promise<WorkOrderRow> {
  const order = await db.workOrder.findFirst({ where: { id: workOrderId, tenantId } });
  if (!order) throw new DomainError('NOT_FOUND', 'Ordem de serviço não encontrada.', 404);

  if (order.status === 'DELIVERED') {
    throw new DomainError(
      'ALREADY_DELIVERED',
      'Ordem de serviço já entregue.',
      409,
    );
  }

  if (order.status === 'CANCELLED') {
    throw new DomainError('ALREADY_CANCELLED', 'Ordem de serviço cancelada.', 409);
  }

  const data: Record<string, unknown> = { status };
  if (diagnosisNotes !== undefined) data.diagnosisNotes = diagnosisNotes;
  if (status === 'DELIVERED') data.deliveredAt = new Date();

  const updated = await db.workOrder.update({
    where: { id: workOrderId },
    data,
    include: {
      client: { select: { name: true } },
      assignedTechnician: { select: { name: true } },
      items: { select: { id: true, unitPrice: true, quantity: true } },
    },
  });

  const protocols = await buildProtocolIndex(db, tenantId);
  return { ...serialize(updated, protocols.get(updated.id)), clientId: updated.clientId };
}