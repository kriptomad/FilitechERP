// src/server/http.ts — wrapper único dos Route Handlers.
//
// Concentra num lugar o que Express fazia via middlewares: leitura de sessão,
// gatekeeper, abertura do contexto de tenant e conversão de erro no envelope
// padrão (Cap. 9.1). Sem isso, cada rota repetiria try/catch e o frontend
// receberia formatos diferentes dependendo de quem escreveu a rota.
import { NextResponse } from 'next/server';
import { DomainError, jsonError, jsonSuccess } from './api-envelope';
import { gatekeeper, type GatekeeperOptions } from './gatekeeper';
import { readSession, requireSession, type RequestLike } from './session';
import { withTenant } from './tenant-context';
import type { SessionClaims } from './jwt';

export type Handler<T> = (args: {
  request: RequestLike;
  session: SessionClaims;
}) => Promise<T> | T;

export interface RouteOptions {
  /** Módulo + permissão exigidos (Cap. 6.1). Ausente = rota autenticada sem gating. */
  gate?: GatekeeperOptions;
  /** `false` libera a rota (ex.: login, catálogo, health). Padrão: `true`. */
  auth?: boolean;
}

/**
 * Envolve um handler e devolve sempre um NextResponse com envelope padrão.
 *
 * Uso:
 *   export const POST = route(async ({ request, session }) => { ... }, { gate: {...} });
 */
export function route<T>(handler: Handler<T>, options: RouteOptions = {}) {
  const requiresAuth = options.auth !== false;

  return async function routeHandler(request: Request): Promise<NextResponse> {
    try {
      if (!requiresAuth) {
        return jsonSuccess(await handler({ request, session: ANONYMOUS }));
      }

      const session = await requireSession(request);

      if (options.gate) {
        // gatekeeper lança 402/403 com payload de upsell quando o módulo não
        // está ativo — nunca uma tela de erro genérica (Cap. 2.6).
        try {
          await gatekeeper(session, options.gate);
        } catch (err) {
          if (err instanceof DomainError && err.upsell) {
            return NextResponse.json(
              {
                success: false,
                data: null,
                error: { code: err.code, message: err.message },
                upsell: err.upsell,
              },
              { status: err.status },
            );
          }
          throw err;
        }
      }

      // O handler roda dentro do contexto de tenant para que a extensão Prisma
      // injete tenantId automaticamente (Cap. 7.2).
      const data = await withTenant(
        { tenantId: session.tenantId, userId: session.userId, role: session.role },
        async () => handler({ request, session }),
      );

      return jsonSuccess(data);
    } catch (err) {
      return toErrorResponse(err);
    }
  };
}

const ANONYMOUS: SessionClaims = {
  userId: '',
  tenantId: '',
  role: 'PUBLIC',
  sessionId: '',
};

function toErrorResponse(err: unknown): NextResponse {
  if (err instanceof DomainError) {
    return jsonError(err.status, err.code, err.message, err.details);
  }

  // Erro do Prisma mais comum: registro não encontrado.
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = String((err as { code: unknown }).code);
    if (code === 'P2002') {
      return jsonError(409, 'UNIQUE_CONSTRAINT', 'Já existe um registro com esses dados.');
    }
    if (code === 'P2025') {
      return jsonError(404, 'NOT_FOUND', 'Registro não encontrado.');
    }
    if (code === 'P2003') {
      return jsonError(409, 'FOREIGN_KEY', 'Referência inválida para um registro relacionado.');
    }
  }

  // Falha de configuração (ex.: DATABASE_URL/JWT ausentes) — log no servidor,
  // mensagem genérica na resposta (não vaza segredo para o cliente).
  console.error('[api] erro não tratado:', err);
  return jsonError(500, 'INTERNAL_ERROR', 'Erro interno do servidor.');
}

/** Lê a sessão sem exigir autenticação (ex.: renderizar header condicional). */
export { readSession };