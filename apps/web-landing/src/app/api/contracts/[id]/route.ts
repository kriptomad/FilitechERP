// src/app/api/contracts/[id]/route.ts — Cap. 11.18
//
// Antes devolvia `{ id: params.id, ...body }` (eco) e o DELETE respondia
// sucesso sem tocar no banco.
import { prismaUnscoped } from '@/server/db';
import { jsonError } from '@/server/api-envelope';
import { requireSession } from '@/server/session';
import { readJson, optionalString } from '@/server/request';
import { writeAuditLog, requestFingerprint } from '@/server/audit';
import { getContract } from '@/server/services/contracts';
import { handle } from '@/server/handler';

export const dynamic = 'force-dynamic';

export const GET = handle(async (request: Request, { params }: { params: { id: string } }) => {
  const session = await requireSession(request);
  const contract = await getContract(prismaUnscoped, session.tenantId, params.id);
  return { success: true, data: contract, error: null };
});

interface PatchBody {
  title?: unknown;
  description?: unknown;
  startDate?: unknown;
  endDate?: unknown;
}

export const PATCH = handle(async (request: Request, { params }: { params: { id: string } }) => {
  const session = await requireSession(request);
  const body = await readJson<PatchBody>(request);

  const existing = await prismaUnscoped.serviceContract.findFirst({
    where: { id: params.id, tenantId: session.tenantId },
    select: { id: true, status: true },
  });
  if (!existing) return jsonError(404, 'NOT_FOUND', 'Contrato não encontrado.');

  if (existing.status === 'ACTIVE' || existing.status === 'CANCELLED') {
    return jsonError(
      409,
      'CONTRACT_LOCKED',
      'Contrato assinado ou cancelado não pode ser editado.',
    );
  }

  const data: Record<string, unknown> = {};
  if (body.title !== undefined) {
    const title = String(body.title).trim();
    if (title.length < 2) {
      return jsonError(400, 'VALIDATION_ERROR', 'Título inválido.');
    }
    data.title = title;
  }
  if (body.description !== undefined) {
    data.description = optionalString(body.description, 'descrição', 2000) ?? null;
  }
  if (body.startDate !== undefined) data.startDate = new Date(String(body.startDate));
  if (body.endDate !== undefined) {
    data.endDate = body.endDate ? new Date(String(body.endDate)) : null;
  }

  const updated = await prismaUnscoped.serviceContract.update({
    where: { id: params.id },
    data,
    include: { client: { select: { name: true } }, items: { select: { id: true } } },
  });

  await writeAuditLog({
    tenantId: session.tenantId,
    userId: session.userId,
    action: 'CONTRACT_CREATED',
    entityType: 'ServiceContract',
    entityId: params.id,
    after: { title: updated.title },
    ...requestFingerprint(request),
  });

  return {
    success: true,
    data: {
      id: updated.id,
      contractNumber: updated.contractNumber,
      clientId: updated.clientId,
      clientName: updated.client.name,
      title: updated.title,
      description: updated.description,
      status: updated.status,
      totalAmount: Number(updated.totalAmount),
      startDate: updated.startDate.toISOString(),
      endDate: updated.endDate?.toISOString() ?? null,
      signedAt: updated.signedAt?.toISOString() ?? null,
      itemCount: updated.items.length,
      createdAt: updated.createdAt.toISOString(),
    },
    error: null,
  };
});

/**
 * DELETE — contrato nunca é apagado fisicamente: ele é CANCELLED.
 * Apagar quebraria a trilha fiscal e a referência de faturamento.
 */
export const DELETE = handle(async (request: Request, { params }: { params: { id: string } }) => {
  const session = await requireSession(request);

  const existing = await prismaUnscoped.serviceContract.findFirst({
    where: { id: params.id, tenantId: session.tenantId },
    select: { id: true, status: true },
  });
  if (!existing) return jsonError(404, 'NOT_FOUND', 'Contrato não encontrado.');

  if (existing.status === 'CANCELLED') {
    return jsonError(409, 'ALREADY_CANCELLED', 'Contrato já cancelado.');
  }

  const updated = await prismaUnscoped.serviceContract.update({
    where: { id: params.id },
    data: { status: 'CANCELLED' },
    select: { id: true, status: true },
  });

  await writeAuditLog({
    tenantId: session.tenantId,
    userId: session.userId,
    action: 'CONTRACT_CANCELLED',
    entityType: 'ServiceContract',
    entityId: params.id,
    before: existing,
    ...requestFingerprint(request),
  });

  return {
    success: true,
    data: { id: updated.id, status: updated.status, cancelled: true },
    error: null,
  };
});
