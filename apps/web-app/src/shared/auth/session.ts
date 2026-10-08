// src/shared/auth/session.ts — sessão do app (Cap. 9.2, Bearer RS256)
// A API autentica por header Authorization: Bearer <token> (não por cookie).

const TOKEN_KEY = "filitech.accessToken";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null; // storage indisponível (modo privado)
  }
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignora
  }
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Sessão ausente ou expirada.");
    this.name = "UnauthorizedError";
  }
}

/**
 * Fetch autenticado para /api/* (relativo — passa pelo proxy do Vite em dev,
 * mesmo-origem em produção). Em 401: limpa o token e manda para /login.
 */
export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(path, {
    ...init,
    headers,
    credentials: "include",
  });

  if (res.status === 401) {
    clearToken();
    if (location.pathname !== "/login") {
      location.assign("/login");
    }
    throw new UnauthorizedError();
  }

  return res;
}

/** Parse do envelope padrão da API ({ success, data, error }). */
export async function apiJson<T = unknown>(res: Response): Promise<T> {
  const json = await res.json();
  return json.data as T;
}
