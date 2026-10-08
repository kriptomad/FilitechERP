// src/lib/tenant-context.ts — Cap. 7.1
import { AsyncLocalStorage } from "node:async_hooks";

export interface TenantContext {
  tenantId: string;
  userId: string;
  role: string;
}

export const tenantContextStorage = new AsyncLocalStorage<TenantContext>();

export function runWithTenantContext<T>(
  context: TenantContext,
  callback: () => Promise<T>,
): Promise<T> {
  // CRÍTICO: o PrismaPromise é preguiçoso — a query só executa no .then().
  // Await DENTRO do escopo do AsyncLocalStorage garante que o hook da extensão
  // ($allOperations) execute com o contexto presente. Sem isso, todo acesso
  // via extensão cairia no fail-closed ("fora de um contexto de tenant").
  return tenantContextStorage.run(context, async () => {
    const result = await callback();
    return result;
  });
}

export function getCurrentTenantId(): string {
  const context = tenantContextStorage.getStore();
  if (!context) {
    throw new Error(
      "Tentativa de acesso ao banco fora de um contexto de tenant autenticado.",
    );
  }
  return context.tenantId;
}

export function getCurrentContext(): TenantContext {
  const context = tenantContextStorage.getStore();
  if (!context) {
    throw new Error(
      "Tentativa de acesso ao banco fora de um contexto de tenant autenticado.",
    );
  }
  return context;
}
