// src/app/api/loyalty/route.ts — Cap. 4.1.1
//
//   GET   — resumo do cliente (programa, saldo, expirações, histórico).
//   PATCH — configuração do programa (OWNER/MANAGER).
//
// O programa é opt-in por tenant: sem `LoyaltyProgram` ativo o GET devolve
// `active:false` e o PDV não mostra nada de pontos.
import { prismaUnscoped } from '@/server/db';
import { DomainError, jsonError, apiSuccess } from '@/server/api-envelope';
import { requireSession } from '@/server/session';
import { roleHasPermission } from '@/server/gatekeeper';
import { requestFingerprint, writeAuditLog } from '@/server/audit';
import { handle } from '@/server/handler';
import { readJson } from '@/server/request';
import { getLoyaltySummary, getProgram } from '@/server/services/loyalty';

export const dynamic = 'force-dynamic';

export const GET = handle(async (request: Request) => {
  const session = await requireSession(request);

  if (!roleHasPermission(session.role, 'crm:read')) {
    return jsonError(403, 'FORBIDDEN', 'Seu papel não tem acesso a fidelidade.');
  }

  const clientId = new URL(request.url).searchParams.get('clientId');
  if (!clientId) {
    throw new DomainError('VALIDATION_ERROR', 'Informe o cliente (clientId).', 400, {
      field: 'clientId',
    });
  }

  const summary = await getLoyaltySummary(session.tenantId, clientId);
  return apiSuccess(summary);
});

interface ProgramBody {
  active?: unknown;
  pointsPerCurrencyUnit?: unknown;
  redemptionValuePerPoint?: unknown;
  minPointsToRedeem?: unknown;
  pointsExpireAfterDays?: unknown;
}

export const PATCH = handle(async (request: Request) => {
  const session = await requireSession(request);

  if (!roleHasPermission(session.role, 'billing:manage')) {
    return jsonError(
      403,
      'FORBIDDEN',
      'Apenas o proprietário ou gerente pode configurar o programa de fidelidade.',
    );
  }

  const body = await readJson<ProgramBody>(request);

  const numberField = (value: unknown, field: string, min: number, max: number): number | null => {
    if (value === null || value === undefined) return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
      throw new DomainError('VALIDATION_ERROR', `"${field}" fora do intervalo aceito.`, 400, {
        field,
        min,
        max,
      });
    }
    return parsed;
  };

  const pointsPerCurrencyUnit = numberField(body.pointsPerCurrencyUnit, 'pointsPerCurrencyUnit', 0.01, 100);
  const redemptionValuePerPoint = numberField(body.redemptionValuePerPoint, 'redemptionValuePerPoint', 0.0001, 100);
  const minPointsToRedeem = numberField(body.minPointsToRedeem, 'minPointsToRedeem', 1, 1_000_000);
  const pointsExpireAfterDays = numberField(body.pointsExpireAfterDays, 'pointsExpireAfterDays', 1, 3650);

  const before = await getProgram(prismaUnscoped, session.tenantId);

  const data = {
    ...(typeof body.active === 'boolean' ? { active: body.active } : {}),
    ...(pointsPerCurrencyUnit !== null ? { pointsPerCurrencyUnit } : {}),
    ...(redemptionValuePerPoint !== null ? { redemptionValuePerPoint } : {}),
    ...(minPointsToRedeem !== null ? { minPointsToRedeem: Math.round(minPointsToRedeem) } : {}),
    // `pointsExpireAfterDays: null` limpa a expiração (pontos sem validade).
    ...(body.pointsExpireAfterDays === null
      ? { pointsExpireAfterDays: null }
      : pointsExpireAfterDays !== null
        ? { pointsExpireAfterDays: Math.round(pointsExpireAfterDays) }
        : {}),
  };

  if (Object.keys(data).length === 0) {
    throw new DomainError('VALIDATION_ERROR', 'Nada para atualizar.', 400);
  }

  const program = await prismaUnscoped.loyaltyProgram.upsert({
    where: { tenantId: session.tenantId },
    create: { tenantId: session.tenantId, ...data },
    update: data,
  });

  await writeAuditLog({
    tenantId: session.tenantId,
    userId: session.userId,
    action: 'SETTINGS_UPDATED',
    entityType: 'LoyaltyProgram',
    entityId: program.id,
    // `...before` (e não `before`): interfaces não têm index signature
    // implícito e não entram em `Record<string, unknown>`; o spread cria um
    // tipo literal de objeto, que tem.
    before: before ? { ...before } : undefined,
    after: {
      active: program.active,
      pointsPerCurrencyUnit: Number(program.pointsPerCurrencyUnit),
      redemptionValuePerPoint: Number(program.redemptionValuePerPoint),
      minPointsToRedeem: program.minPointsToRedeem,
      pointsExpireAfterDays: program.pointsExpireAfterDays,
    },
    ...requestFingerprint(request),
  });

  return apiSuccess(await getProgram(prismaUnscoped, session.tenantId));
});
