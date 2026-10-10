// src/app/api/contracts/[id]/cancel/route.ts — Cap. 11.18
//
// Antes devolvia "Contrato cancelado com sucesso." sem alterar o status.
import { DomainError, jsonError } from '@/server/api-envelope';
import { prismaUnscoped } from '@/server/db';
import { requireSession } from '@/server/session';
import { writeAuditLog, requestFingerprint } from '@/server/audit';
import { cancelContract } from '@/server/services/contracts';
import { handle } from '@/server/handler';

export const dynamic = 'force-dynamic';

export const POST = handle(async (request: Request, { params }: { params: { id: string } }) => {
  const session = await requireSession(request);

  try {
    const contract = await cancelContract(prismaUnscoped, session.tenantId, params.id);

    await writeAuditLog({
      tenantId: session.tenantId,
      userId: session.userId,
      action: 'CONTRACT_CANCELLED',
      entityType: 'ServiceContract',
      entityId: params.id,
      after: { status: contract.status },
      ...requestFingerprint(request),
    });

    return {
      success: true,
      data: { ...contract, message: 'Contrato cancelado com sucesso.' },
      error: null,
    };
  } catch (err) {
    if (err instanceof DomainError) {
      if (err.code === 'ALREADY_CANCELLED') return jsonError(409, 'ALREADY_CANCELLED', err.message);
      if (err.code === 'CONTRACT_COMPLETED') return jsonError(409, 'CONTRACT_COMPLETED', err.message);
      if (err.code === 'NOT_FOUND') return jsonError(404, 'NOT_FOUND', err.message);
    }
    throw err;
  }
});
