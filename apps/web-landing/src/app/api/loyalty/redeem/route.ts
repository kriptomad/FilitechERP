// src/app/api/loyalty/redeem/route.ts — Cap. 4.1.1
//
// Resgate de pontos no PDV. A trava real é o update CONDICIONAL dentro do
// serviço (`pointsBalance >= ?`): dois caixas clicando ao mesmo tempo não
// resgatam os mesmos pontos duas vezes, e o saldo nunca fica negativo.
//
// Vende pontos de volta a dinheiro sem venda seria um caixa aberto — por isso
// a rota só aceita resgate vinculado a um motivo explícito, e exige
// `pdv:sell` (mesma permissão que consegue dar desconto).
import { DomainError, apiSuccess, jsonError } from '@/server/api-envelope';
import { requireSession } from '@/server/session';
import { roleHasPermission } from '@/server/gatekeeper';
import { requestFingerprint, writeAuditLog } from '@/server/audit';
import { handle } from '@/server/handler';
import { readJson } from '@/server/request';
import { redeemLoyaltyPoints } from '@/server/services/loyalty';
import { prismaUnscoped } from '@/server/db';

export const dynamic = 'force-dynamic';

interface RedeemBody {
  clientId?: unknown;
  points?: unknown;
  reason?: unknown;
}

export const POST = handle(async (request: Request) => {
  const session = await requireSession(request);

  if (!roleHasPermission(session.role, 'pdv:sell')) {
    return jsonError(403, 'FORBIDDEN', 'Seu papel não pode resgatar pontos.');
  }

  const body = await readJson<RedeemBody>(request);

  const clientId = typeof body.clientId === 'string' ? body.clientId.trim() : '';
  if (!clientId) {
    throw new DomainError('VALIDATION_ERROR', 'Informe o cliente.', 400, { field: 'clientId' });
  }

  const points = Number(body.points);
  if (!Number.isInteger(points)) {
    throw new DomainError('VALIDATION_ERROR', 'Quantidade de pontos inteira.', 400, {
      field: 'points',
    });
  }

  const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : undefined;

  const result = await redeemLoyaltyPoints(prismaUnscoped, {
    tenantId: session.tenantId,
    clientId,
    points,
    reason,
  });

  await writeAuditLog({
    tenantId: session.tenantId,
    userId: session.userId,
    action: 'LOYALTY_POINTS_REDEEMED',
    entityType: 'LoyaltyAccount',
    entityId: clientId,
    after: result,
    ...requestFingerprint(request),
  });

  return apiSuccess(result);
});
