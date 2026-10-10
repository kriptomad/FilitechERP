// src/app/api/contracts/[id]/sign/route.ts — Cap. 11.18
//
// Antes devolvia "Contrato assinado com sucesso." sem alterar o status.
import { DomainError, jsonError } from '@/server/api-envelope';
import { prismaUnscoped } from '@/server/db';
import { requireSession } from '@/server/session';
import { writeAuditLog, requestFingerprint } from '@/server/audit';
import { signContract } from '@/server/services/contracts';
import { handle } from '@/server/handler';

export const dynamic = 'force-dynamic';

export const POST = handle(async (request: Request, { params }: { params: { id: string } }) => {
  const session = await requireSession(request);

  try {
    const contract = await signContract(prismaUnscoped, session.tenantId, params.id);

    await writeAuditLog({
      tenantId: session.tenantId,
      userId: session.userId,
      action: 'CONTRACT_SIGNED',
      entityType: 'ServiceContract',
      entityId: params.id,
      after: { signedAt: contract.signedAt, status: contract.status },
      ...requestFingerprint(request),
    });

    return {
      success: true,
      data: { ...contract, message: 'Contrato assinado com sucesso.' },
      error: null,
    };
  } catch (err) {
    if (err instanceof DomainError) {
      if (err.code === 'ALREADY_SIGNED') return jsonError(409, 'ALREADY_SIGNED', err.message);
      if (err.code === 'CONTRACT_CANCELLED') {
        return jsonError(409, 'CONTRACT_CANCELLED', err.message);
      }
      if (err.code === 'NOT_FOUND') return jsonError(404, 'NOT_FOUND', err.message);
    }
    throw err;
  }
});
