// src/app/api/accounting-office/engagements/[id]/action/route.ts — Cap. 21.18.3
//
// Resposta do escritório (accept/reject) e revogação pelos dois lados.
//
// O lado é inferido do PRÓPRIO tenant da sessão comparado ao engagement — nunca
// de um campo enviado pelo cliente. Um lojista mandando `side: "firm"` na
// requisição seria, no mínimo, um convite a tentar revogar pelo lado errado.
import { prismaUnscoped } from '@/server/db';
import { DomainError, jsonError, jsonSuccess } from '@/server/api-envelope';
import { requireSession } from '@/server/session';
import { roleHasPermission } from '@/server/gatekeeper';
import { requestFingerprint, writeAuditLog } from '@/server/audit';
import { handle } from '@/server/handler';
import { optionalString, readJson, requireString } from '@/server/request';
import { respondEngagement, revokeEngagement } from '@/server/services/accounting-office';

export const dynamic = 'force-dynamic';

interface ActionBody {
  action?: unknown;
  reason?: unknown;
}

export const POST = handle(
  async (request: Request, { params }: { params: { id: string } }) => {
    const session = await requireSession(request);

    if (!roleHasPermission(session.role, 'billing:manage')) {
      return jsonError(
        403,
        'FORBIDDEN',
        'Apenas o proprietário ou gerente pode alterar a procuração contábil.',
      );
    }

    const body = await readJson<ActionBody>(request);
    const action = requireString(body.action, 'action', { min: 3, max: 30 }).toLowerCase();

    const engagement = await prismaUnscoped.accountingEngagement.findUnique({
      where: { id: params.id },
      select: { id: true, accountingFirmTenantId: true, clientTenantId: true, status: true },
    });

    if (!engagement) {
      throw new DomainError('ENGAGEMENT_NOT_FOUND', 'Procuração não encontrada.', 404);
    }

    const side =
      engagement.accountingFirmTenantId === session.tenantId
        ? 'firm'
        : engagement.clientTenantId === session.tenantId
          ? 'client'
          : null;

    if (!side) {
      // Fail-closed: engagement de terceiros não aparece nem para ler.
      throw new DomainError('ENGAGEMENT_NOT_FOUND', 'Procuração não encontrada.', 404);
    }

    let result;

    if (action === 'accept' || action === 'reject') {
      if (side !== 'firm') {
        return jsonError(
          403,
          'FORBIDDEN',
          'Somente o escritório contratado aceita ou recusa a procuração.',
        );
      }
      result = await respondEngagement({
        engagementId: engagement.id,
        firmTenantId: session.tenantId,
        userId: session.userId,
        accept: action === 'accept',
        reason: optionalString(body.reason, 'reason', 300),
      });
    } else if (action === 'revoke') {
      const reason = optionalString(body.reason, 'reason', 300);
      result = await revokeEngagement({
        engagementId: engagement.id,
        tenantId: session.tenantId,
        userId: session.userId,
        side,
        reason,
      });
    } else {
      throw new DomainError('VALIDATION_ERROR', `Ação "${action}" desconhecida.`, 400, {
        allowed: ['accept', 'reject', 'revoke'],
      });
    }

    await writeAuditLog({
      tenantId: session.tenantId,
      userId: session.userId,
      // Só a aceite recebe `..._SIGNED` — é a assinatura eletrônica da
      // procuração. Revogação/recusa não tem ação própria: a trilha completa
      // fica em `AccountingEngagementAuditEvent`.
      action: action === 'accept' ? 'ACCOUNTING_ENGAGEMENT_SIGNED' : 'SETTINGS_UPDATED',
      entityType: 'AccountingEngagement',
      entityId: engagement.id,
      before: { status: engagement.status },
      after: { status: result.status, action },
      ...requestFingerprint(request),
    });

    return jsonSuccess({ engagement: { id: result.id, status: result.status } });
  },
);
