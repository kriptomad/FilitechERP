// src/app/api/admin/receivables/[id]/[action]/route.ts — Cap. 4.6 / 17.3
//
// Antes a rota validava a ação e devolvia um eco ("Pagamento registrado com
// sucesso.") sem alterar NADA no banco. Baixar ou cancelar uma cobrança agora
// é uma transação real, com idempotência de estado (pagar duas vezes = 409).
import { DomainError, jsonError } from '@/server/api-envelope';
import { prismaUnscoped } from '@/server/db';
import { requireSession } from '@/server/session';
import { gatekeeper } from '@/server/gatekeeper';
import { writeAuditLog, requestFingerprint } from '@/server/audit';
import { cancelReceivable, payReceivable } from '@/server/services/admin-receivables';
import { handle } from '@/server/handler';

export const dynamic = 'force-dynamic';

const ACTIONS = ['pay', 'cancel'] as const;
type Action = (typeof ACTIONS)[number];

export const POST = handle(
  async (request: Request, { params }: { params: { id: string; action: string } }) => {
    const session = await requireSession(request);
    await gatekeeper(session, { moduleCode: 'financeiro', requiredPermission: 'crm:write' });

    const { id, action } = params;

    if (!ACTIONS.includes(action as Action)) {
      return jsonError(400, 'INVALID_ACTION', `Ação inválida: "${action}".`);
    }

    try {
      const row =
        action === 'pay'
          ? await payReceivable(prismaUnscoped, session.tenantId, id)
          : await cancelReceivable(prismaUnscoped, session.tenantId, id);

      await writeAuditLog({
        tenantId: session.tenantId,
        userId: session.userId,
        action: action === 'pay' ? 'RECEIVABLE_PAID' : 'RECEIVABLE_CANCELLED',
        entityType: 'AccountReceivable',
        entityId: id,
        after: { status: row.status, amount: row.amount },
        ...requestFingerprint(request),
      });

      return {
        success: true,
        data: {
          ...row,
          message:
            action === 'pay'
              ? 'Pagamento registrado com sucesso.'
              : 'Cobrança cancelada com sucesso.',
        },
        error: null,
      };
    } catch (err) {
      if (err instanceof DomainError) {
        if (err.code === 'ALREADY_PAID' || err.code === 'ALREADY_CANCELLED') {
          return jsonError(409, err.code, err.message);
        }
        if (err.code === 'NOT_CANCELLABLE') {
          return jsonError(409, 'NOT_CANCELLABLE', err.message);
        }
        if (err.code === 'NOT_FOUND') {
          return jsonError(404, 'NOT_FOUND', err.message);
        }
      }
      throw err;
    }
  },
);
