// src/lib/api.ts — cliente HTTP do site (same-origin, cookies HTTP-only)
//
// Gap corrigido: `getToken()`/localStorage foram removidos. O token agora vive
// em cookie HttpOnly definido pelo servidor, então o JavaScript da página não
// tem (e não precisa de) acesso a ele — o que também elimina a superficialidade
// do XSS sobre a sessão.

export interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  error: { code: string; message: string; details?: Record<string, unknown> } | null;
  upsell?: {
    moduleCode: string;
    label: string;
    price: number;
    checkoutUrl: string;
  };
}

export class ApiError extends Error {
  code: string;
  status: number;
  /** Preenchido quando a resposta é 402 de feature gating (Cap. 2.6). */
  upsell?: ApiEnvelope<unknown>['upsell'];

  constructor(
    status: number,
    code: string,
    message: string,
    upsell?: ApiEnvelope<unknown>['upsell'],
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.upsell = upsell;
  }
}

/** GET/POST autenticado via cookies HTTP-only (same-origin). */
export async function api<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(path, {
    ...init,
    headers,
    credentials: 'include',
  });

  const json = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;

  if (!res.ok || !json?.success) {
    throw new ApiError(
      res.status,
      json?.error?.code ?? 'UNKNOWN',
      json?.error?.message ?? 'Falha na chamada à API.',
      json?.upsell,
    );
  }

  return json.data as T;
}

export function post<T = unknown>(path: string, body: unknown): Promise<T> {
  return api<T>(path, { method: 'POST', body: JSON.stringify(body) });
}

export function patch<T = unknown>(path: string, body: unknown): Promise<T> {
  return api<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
}

export function put<T = unknown>(path: string, body: unknown): Promise<T> {
  return api<T>(path, { method: 'PUT', body: JSON.stringify(body) });
}

export function del<T = unknown>(path: string): Promise<T> {
  return api<T>(path, { method: 'DELETE' });
}

/**
 * Rota interna do ERP (PDV e módulos operacionais).
 *
 * Gap corrigido: antes existia `NEXT_PUBLIC_ERP_APP_URL`, que — não estando
 * configurado — virava string vazia. O `href=""` fazia o botão "Entrar" recarregar
 * a própria landing, e era exatamente o sintoma reportado. Agora o destino é
 * uma rota interna do próprio Next, o que elimina a variável e a chance de o
 * link virar "".
 */
export const ERP_APP_URL = '/app';

export const brl = (value: number): string =>
  `R$ ${value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;