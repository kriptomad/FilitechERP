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
import { DomainError, jsonError, jsonSuccess } from './api-envelope';

type AnyRouteHandler = (request: Request, context?: unknown) => unknown | Promise<unknown>;

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