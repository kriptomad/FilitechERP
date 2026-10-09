// src/server/tenant-context.ts — Cap. 7.1
// Contexto de tenant por requisição, via AsyncLocalStorage.
//
// No Next.js Route Handlers não existe um "middleware" que abra um escopo para
// a duração do request inteira: cada handler precisa abrir o escopo
// explicitamente. O helper `withTenant` abaixo é o ponto único de entrada.
import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantContext {
  tenantId: string;
  userId: string;
  role: string;
}

export const tenantContextStorage = new AsyncLocalStorage<TenantContext>();

export async function withTenant<T>(
  context: TenantContext,
  callback: () => Promise<T>,
): Promise<T> {
  // CRÍTICO (Cap. 7.1): o PrismaPromise é preguiçoso — a query só executa no
  // await. Await DENTRO do escopo garante que a extensão ($allOperations)
  // enxergue o contexto. Fora daqui, todo acesso cairia no fail-closed.
  return tenantContextStorage.run(context, async () => callback());
}

export function getCurrentContext(): TenantContext {
  const context = tenantContextStorage.getStore();
  if (!context) {
    throw new Error(
      'Tentativa de acesso ao banco fora de um contexto de tenant autenticado.',
    );
  }
  return context;
}

export function getCurrentTenantId(): string {
  return getCurrentContext().tenantId;
}