// src/lib/api.ts — cliente HTTP do site (same-origin, cookies HTTP-only)

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
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
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
    credentials: 'include', // Envia cookies HTTP-only automaticamente
  });
  const json = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;

  if (!res.ok || !json?.success) {
    throw new ApiError(
      res.status,
      json?.error?.code ?? 'UNKNOWN',
      json?.error?.message ?? 'Falha na chamada à API.',
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

export function del<T = unknown>(path: string): Promise<T> {
  return api<T>(path, { method: 'DELETE' });
}

/** URL do app operacional (ERP/PDV) para "Abrir o sistema". */
export const ERP_APP_URL = process.env.NEXT_PUBLIC_ERP_APP_URL ?? '';

export const brl = (value: number): string =>
  `R$ ${value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;