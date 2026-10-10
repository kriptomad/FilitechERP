// src/app/api/cash-register/route.ts — Cap. 4.1
//
// Antes esta rota devolvia `{ status: 'CLOSED', openingAmount: 0, ... }` para
// GET e criava `cr-${Date.now()}` para POST — nenhum registro existia no banco,
// e o PDV aceitava vendas contra um caixa que nunca abriu.
//
// Agora: GET lista os caixas reais (gaveta cega), POST abre um caixa real e
// PATCH fecha com a contagem física informada pelo operador.
import { prismaUnscoped } from '@/server/db';
import { DomainError, jsonError } from '@/server/api-envelope';
import { requireSession } from '@/server/session';
import { gatekeeper } from '@/server/gatekeeper';
import { readJson, optionalString, requireNumber } from '@/server/request';
import { writeAuditLog, requestFingerprint } from '@/server/audit';
import {
  closeRegister,
  getOpenRegister,
  listRegisters,
  openRegister,
} from '@/server/services/cash-registers';
import { handle } from '@/server/handler';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cash-register
 *
 * `?open=1` devolve apenas o caixa aberto (ou null) — é o que o PDV consulta.
 * Sem parâmetro devolve o histórico completo — é o que a tela de Caixa lista.
 */
export const GET = handle(async (request: Request) => {
  const session = await requireSession(request);
  await gatekeeper(session, { moduleCode: 'pdv' });

  const url = new URL(request.url);

  if (url.searchParams.get('open') === '1') {
    const open = await getOpenRegister(prismaUnscoped, session.tenantId);
    return { success: true, data: open, error: null };
  }

  const registers = await listRegisters(prismaUnscoped, session.tenantId);
  return { success: true, data: registers, error: null };
});

interface OpenBody {
  openingAmount?: unknown;
  /** Presente quando a chamada é de FECHAMENTO (o PDV fecha via POST). */
  registerId?: unknown;
  countedAmount?: unknown;
  countedByMethod?: unknown;
}

/**
 * POST /api/cash-register
 *
 * Duas chamadas chegam por POST e são distinguidas pelo payload:
 *   • sem `registerId` → abre o caixa (fundo de troco);
 *   • com `registerId` → fecha com a contagem física (é o que o PDV envia).
 * O fechamento é delegado para `runClose`, o mesmo usado pelo PATCH.
 */
export const POST = handle(async (request: Request) => {
  const session = await requireSession(request);
  const body = await readJson<OpenBody>(request);

  if (body.registerId !== undefined) {
    return runClose(request, session, {
      registerId: body.registerId,
      countedAmount: body.countedAmount,
      countedByMethod: body.countedByMethod,
    });
  }

  await gatekeeper(session, { moduleCode: 'pdv', requiredPermission: 'pdv:sell' });

  const openingAmount =
    body.openingAmount === undefined
      ? 0
      : requireNumber(body.openingAmount, 'fundo de troco');

  try {
    const register = await openRegister(
      prismaUnscoped,
      session.tenantId,
      session.userId,
      openingAmount,
    );

    await writeAuditLog({
      tenantId: session.tenantId,
      userId: session.userId,
      action: 'CASH_REGISTER_OPENED',
      entityType: 'CashRegister',
      entityId: register.id,
      after: { openingAmount: register.openingAmount },
      ...requestFingerprint(request),
    });

    return Response.json(
      { success: true, data: register, error: null },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof DomainError && err.code === 'REGISTER_ALREADY_OPEN') {
      return jsonError(409, 'REGISTER_ALREADY_OPEN', err.message);
    }
    throw err;
  }
});

interface CloseBody {
  registerId?: unknown;
  countedAmount?: unknown;
  countedByMethod?: unknown;
}

/**
 * Fechamento de caixa — compartilhado por POST (PDV) e PATCH (tela de Caixa).
 *
 * Aceita tanto `countedByMethod` (lista por forma de pagamento) quanto
 * `countedAmount` (contagem única de dinheiro em gaveta), que é o que as telas
 * enviam hoje.
 */
async function runClose(
  request: Request,
  session: Awaited<ReturnType<typeof requireSession>>,
  body: CloseBody,
) {
  await gatekeeper(session, { moduleCode: 'pdv', requiredPermission: 'pdv:close-register' });

  const registerId = optionalString(body.registerId, 'registerId', 64);
  if (!registerId) {
    throw new DomainError('VALIDATION_ERROR', 'Informe o caixa a fechar.', 400);
  }

  let counted: { method: string; amount: number }[];

  if (Array.isArray(body.countedByMethod)) {
    counted = (body.countedByMethod as Record<string, unknown>[]).map((entry) => ({
      method: String(entry.method ?? 'CASH'),
      amount: Number(entry.amount ?? 0),
    }));
  } else if (body.countedAmount !== undefined && body.countedAmount !== null) {
    counted = [{ method: 'CASH', amount: requireNumber(body.countedAmount, 'contagem') }];
  } else {
    throw new DomainError(
      'VALIDATION_ERROR',
      'Informe a contagem física (countedAmount ou countedByMethod).',
      400,
    );
  }

  try {
    const closed = await closeRegister(
      prismaUnscoped,
      session.tenantId,
      registerId,
      counted,
      session.userId,
    );

    await writeAuditLog({
      tenantId: session.tenantId,
      userId: session.userId,
      action: 'CASH_REGISTER_CLOSED',
      entityType: 'CashRegister',
      entityId: registerId,
      after: {
        closingAmount: closed.closingAmount,
        expectedAmount: closed.expectedAmount,
        divergenceAmount: closed.divergenceAmount,
      },
      ...requestFingerprint(request),
    });

    return {
      success: true,
      data: {
        ...closed,
        message:
          closed.divergenceAmount === 0
            ? 'Caixa fechado sem divergência.'
            : (closed.divergenceAmount ?? 0) > 0
              ? `Caixa fechado. Sobra de R$ ${(closed.divergenceAmount ?? 0).toFixed(2)}.`
              : `Caixa fechado. Falta de R$ ${Math.abs(closed.divergenceAmount ?? 0).toFixed(2)}.`,
      },
      error: null,
    };
  } catch (err) {
    if (err instanceof DomainError) {
      if (err.code === 'REGISTER_ALREADY_CLOSED') {
        return jsonError(409, 'REGISTER_ALREADY_CLOSED', err.message);
      }
      if (err.code === 'REGISTER_NOT_FOUND') {
        return jsonError(404, 'REGISTER_NOT_FOUND', err.message);
      }
    }
    throw err;
  }
}

/** PATCH /api/cash-register — fecha o caixa (gaveta cega). */
export const PATCH = handle(async (request: Request) => {
  const session = await requireSession(request);
  const body = await readJson<CloseBody>(request);
  return runClose(request, session, body);
});
