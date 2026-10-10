// src/server/handler.ts — conversão central de erro para os Route Handlers.
//
// PROBLEMA QUE ESTE MÓDULO RESOLVE: `DomainError` carrega status HTTP e código
// de negócio, mas um Route Handler do App Router que lança uma exceção NÃO tem
// para onde converter — o Next responde 500 e o cliente perde o motivo. Foi
// exatamente o que aconteceu na primeira rodada: toda rota autenticada
// respondia 500 em vez de 401, e o frontend via "erro interno" em vez de
// "sua sessão expirou".
//
// Uso — envolva o handler na exportação:
//
//   export const GET = handle(async (request) => { ... });
//   export const POST = handle(async (request, ctx) => { ... });
//
// `handle` devolve uma função com a assinatura que o Next espera e preserva o
// status/código do DomainError.
import { NextResponse } from 'next/server';
import { DomainError, jsonError, jsonSuccess, type ApiEnvelope } from './api-envelope';

type AnyRouteHandler = (request: Request, context?: unknown) => unknown | Promise<unknown>;

/**
 * Reconhece o envelope já montado pelo handler.
 *
 * Exige as TRÊS chaves (`success`, `data`, `error`) para não capturar por
 * engano um payload de negócio que apenas tenha um campo chamado `success`.
 */
function isApiEnvelope(value: unknown): value is ApiEnvelope<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'success' in value &&
    'data' in value &&
    'error' in value
  );
}

/** O envelope de erro não carrega status HTTP — ele é derivado do código. */
function statusForEnvelope(envelope: ApiEnvelope<unknown>): number {
  if (envelope.success) return 200;

  const code = envelope.error?.code ?? '';

  // Upsell e bloqueios financeiros são sempre 402 (Cap. 2.6 / 6.1): o cliente
  // precisa distinguir "você pode pagar" de "você foi proibido".
  if (envelope.upsell || code === 'MODULE_NOT_ACTIVE' || code === 'TENANT_SUSPENDED') {
    return 402;
  }
  if (code === 'UNAUTHENTICATED' || code === 'SESSION_EXPIRED') return 401;
  if (code === 'FORBIDDEN') return 403;
  if (code === 'NOT_FOUND' || code.endsWith('_NOT_FOUND')) return 404;
  if (code === 'DUPLICATED' || code === 'UNIQUE_CONSTRAINT' || code.endsWith('_EXISTS')) {
    return 409;
  }

  return 400;
}

export function handle<A extends unknown[]>(
  fn: (request: Request, ...args: A) => unknown | Promise<unknown>,
): (request: Request, ...args: A) => Promise<NextResponse> {
  return async (request: Request, ...args: A): Promise<NextResponse> => {
    try {
      const result = await fn(request, ...args);

      // O handler já devolveu uma resposta (cookie, PDF, 201 manual).
      //
      // O teste precisa ser `Response`, e não `NextResponse`: `Response.json()`
      // devolve um `Response` comum, que NÃO é instanceof NextResponse. Sem
      // isto, toda rota que respondia 201 manualmente era re-empacotada em
      // `{success:true,data:<Response>}` e o cliente via `data: {}`.
      if (result instanceof Response) {
        return result as NextResponse;
      }

      // O handler devolveu o ENVELOPE pronto (`{success, data, error}`) —
      // forma usada por ~22 rotas. Sem este ramo, `jsonSuccess(result)`
      // produziria `{success:true, data:{success:true, data:<payload>, ...}}`
      // e o cliente (que lê `data` no topo) trataria o envelope inteiro como
      // se fosse a lista/salvamento — tela em branco, `.map is not a function`,
      // e `success:false` saindo como HTTP 200.
      if (isApiEnvelope(result)) {
        return NextResponse.json(result, { status: statusForEnvelope(result) });
      }

      // Devolveu JSON puro — embrulha no envelope padrão (Cap. 9.1).
      return jsonSuccess(result);
    } catch (err) {
      return toErrorResponse(err);
    }
  };
}

function toErrorResponse(err: unknown): NextResponse {
  if (err instanceof DomainError) {
    return jsonError(err.status, err.code, err.message, err.details);
  }

  // Erros conhecidos do Prisma traduzidos para o vocabulário da API.
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = String((err as { code: unknown }).code);

    switch (code) {
      case 'P2002':
        return jsonError(409, 'UNIQUE_CONSTRAINT', 'Já existe um registro com esses dados.');
      case 'P2025':
        return jsonError(404, 'NOT_FOUND', 'Registro não encontrado.');
      case 'P2003':
        return jsonError(409, 'FOREIGN_KEY', 'Referência inválida para um registro relacionado.');
      case 'P2034':
        return jsonError(409, 'TRANSACTION_CONFLICT', 'Conflito de concorrência. Tente novamente.');
      default:
        break;
    }
  }

  // Falha de configuração (DATABASE_URL/JWT ausentes) ou bug: log no servidor,
  // mensagem neutra na resposta — nunca vazar stack ou segredo ao cliente.
  console.error('[api] erro não tratado:', err);
  return jsonError(500, 'INTERNAL_ERROR', 'Erro interno do servidor.');
}