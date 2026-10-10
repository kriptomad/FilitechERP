// src/app/api/accounting-office/engagements/route.ts — Cap. 21.18.2 / 21.18.3
//
//   GET  — vícios em que o tenant participa, nos DOIS papéis (contratante e
//          contratado), com o nome do outro lado e a contagem de eventos.
//   POST — o LOJISTA concede a procuração (21.18.6). Conceder não abre
//          acesso: nasce PENDING_ACCOUNTANT_ACCEPTANCE e só a aceite do
//          escritório torna o engagement ACTIVE.
import { prismaUnscoped } from '@/server/db';
import { DomainError, jsonError, jsonSuccess } from '@/server/api-envelope';
import { requireSession } from '@/server/session';
import { roleHasPermission } from '@/server/gatekeeper';
import { requestFingerprint, writeAuditLog } from '@/server/audit';
import { handle } from '@/server/handler';
import { readJson } from '@/server/request';
import {
  ALL_SCOPES,
  grantEngagement,
  type EngagementScope,
} from '@/server/services/accounting-office';

export const dynamic = 'force-dynamic';

export const GET = handle(async (request: Request) => {
  const session = await requireSession(request);

  const engagements = await prismaUnscoped.accountingEngagement.findMany({
    where: {
      OR: [
        { clientTenantId: session.tenantId },
        { accountingFirmTenantId: session.tenantId },
      ],
    },
    orderBy: { grantedAt: 'desc' },
    include: {
      firmTenant: { select: { id: true, tradeName: true, uf: true } },
      clientTenant: { select: { id: true, tradeName: true, cnpj: true } },
      auditEvents: { orderBy: { occurredAt: 'desc' }, take: 10 },
      _count: { select: { tasks: true } },
    },
  });

  return jsonSuccess({
    engagements: engagements.map((row) => ({
      id: row.id,
      // `mine` diz qual lado este tenant ocupa — a tela mostra "você contratou"
      // ou "cliente" sem adivinhar a partir do nome.
      mine: row.clientTenantId === session.tenantId ? 'client' : 'firm',
      scopes: row.scopes,
      status: row.status,
      firm: row.firmTenant,
      client: row.clientTenant,
      grantedAt: row.grantedAt.toISOString(),
      acceptanceDeadlineAt: row.acceptanceDeadlineAt.toISOString(),
      acceptedAt: row.acceptedAt?.toISOString() ?? null,
      revokedAt: row.revokedAt?.toISOString() ?? null,
      revokedReason: row.revokedReason,
      taskCount: row._count.tasks,
      events: row.auditEvents.map((event) => ({
        eventType: event.eventType,
        occurredAt: event.occurredAt.toISOString(),
      })),
    })),
    availableScopes: ALL_SCOPES,
  });
});

interface GrantBody {
  firmTenantId?: unknown;
  scopes?: unknown;
  acceptanceDays?: unknown;
}

export const POST = handle(async (request: Request) => {
  const session = await requireSession(request);

  // Revogação/concessão de acesso cross-tenant é decisão do dono — não de um
  // caixa/técnico que por engano apontaria o contador para a concorrência.
  if (!roleHasPermission(session.role, 'billing:manage')) {
    return jsonError(
      403,
      'FORBIDDEN',
      'Apenas o proprietário ou gerente pode conceder procuração contábil.',
    );
  }

  const body = await readJson<GrantBody>(request);

  const firmTenantId =
    typeof body.firmTenantId === 'string' ? body.firmTenantId.trim() : '';
  if (!firmTenantId) {
    throw new DomainError('VALIDATION_ERROR', 'Selecione um escritório de contabilidade.', 400, {
      field: 'firmTenantId',
    });
  }

  if (firmTenantId === session.tenantId) {
    throw new DomainError(
      'SELF_PROCURATION',
      'O escritório não pode conceder procuração para ele mesmo.',
      400,
      { field: 'firmTenantId' },
    );
  }

  const scopes = (Array.isArray(body.scopes) ? body.scopes : []).filter(
    (value): value is EngagementScope =>
      typeof value === 'string' && (ALL_SCOPES as string[]).includes(value),
  );

  const engagement = await grantEngagement({
    clientTenantId: session.tenantId,
    grantedByUserId: session.userId,
    firmTenantId,
    scopes,
    acceptanceDays:
      typeof body.acceptanceDays === 'number' ? Math.round(body.acceptanceDays) : undefined,
  });

  await writeAuditLog({
    tenantId: session.tenantId,
    userId: session.userId,
    action: 'ACCOUNTING_ENGAGEMENT_CREATED',
    entityType: 'AccountingEngagement',
    entityId: engagement.id,
    after: { firmTenantId, scopes, status: engagement.status },
    ...requestFingerprint(request),
  });

  return jsonSuccess({ engagement }, 201);
});
