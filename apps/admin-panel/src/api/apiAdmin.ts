const API_BASE = '/api/platform-admin';

class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });

  const json = await res.json().catch(() => null);
  
  if (!res.ok) {
    throw new ApiError(
      res.status,
      json?.error?.code ?? `HTTP_${res.status}`,
      json?.error?.message ?? 'Erro na requisição',
      json?.error?.details
    );
  }

  return json?.data ?? json;
}

/**
 * Cliente HTTP do Painel Global do Dono (Cap. 13.6).
 *
 * É CHAMÁVEL e o 2º argumento tem duas formas, conforme o call site:
 *   apiAdmin<T>(path)                     -> GET
 *   apiAdmin(path, { method: 'DELETE' })  -> RequestInit
 *   apiAdmin(path, { email, password })   -> corpo JSON (assume POST)
 *
 * A distinção é feita pela presença da chave `method`, que um corpo de negócio
 * nunca tem — não há ambiguidade prática. Sem isso o `login` do AuthProvider
 * (`apiAdmin('/platform-admin/auth/login', { email, password })`) era
 * interpretado como RequestInit e o TS2353 apontava `email` como propriedade
 * desconhecida.
 *
 * Os verbos continuam disponíveis como propriedades para quem precisar do
 * método explícito — todos passam pela mesma função `request`, sem duplicar
 * transporte nem headers.
 */
type ApiAdminInit = RequestInit | Record<string, unknown>;

const apiAdminCall = <T>(path: string, init?: ApiAdminInit): Promise<T> => {
  if (!init) return request<T>(path, { method: 'GET' });
  const asRecord = init as Record<string, unknown>;
  if (typeof asRecord.method === 'string') {
    return request<T>(path, init as RequestInit);
  }
  // sem `method`: o objeto e o corpo da gravacao.
  return request<T>(path, { method: 'POST', body: JSON.stringify(init) });
};

export const apiAdmin = Object.assign(apiAdminCall, {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
});

export { ApiError };