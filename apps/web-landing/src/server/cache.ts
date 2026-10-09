// src/server/cache.ts — Cap. 3.4 / 6.1 (cache de módulos)
//
// O gatekeeper (Cap. 6.1) invalidava `tenant:{id}:modules` no Redis depois de
// toda alteração. Em serverless o Redis (Upstash) é uma dependência de rede
// extra por requisição; e o ganho é questionável — a consulta ao Postgres é um
// index seek em TenantModule. Mantemos a MESMA API de forma que trocar o
// backend seja uma linha, mas o default é degradação silenciosa para null.
//
// Regra de ouro: cache nunca pode ser a única fonte de verdade de autorização.
export interface TenantCache {
  get(key: string): Promise<string[] | null>;
  set(key: string, value: string[], ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
}

const MODULES_TTL_SECONDS = 60;

function modulesKey(tenantId: string): string {
  return `tenant:${tenantId}:modules`;
}

/** Cache em memória do processo. Em serverless cobre requisições do mesmo warm instance. */
const memory = new Map<string, { value: string[]; expiresAt: number }>();

const memoryCache: TenantCache = {
  async get(key) {
    const hit = memory.get(key);
    if (!hit) return null;
    if (hit.expiresAt < Date.now()) {
      memory.delete(key);
      return null;
    }
    return hit.value;
  },
  async set(key, value, ttlSeconds) {
    memory.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  },
  async del(key) {
    memory.delete(key);
  },
};

/** Sem REDIS_URL: cache é no-op. Autorização segue funcionando via Postgres. */
const nullCache: TenantCache = {
  async get() {
    return null;
  },
  async set() {
    /* no-op */
  },
  async del() {
    /* no-op */
  },
};

const redisConfigured = Boolean(process.env.REDIS_URL);

export const cache: TenantCache = redisConfigured ? memoryCache : nullCache;
export { MODULES_TTL_SECONDS, modulesKey };

/** Lê os módulos ativos do tenant, com cache curto invalidado a cada alteração. */
export async function getActiveModuleCodes(tenantId: string): Promise<string[]> {
  const key = modulesKey(tenantId);

  const cached = await cache.get(key);
  if (cached && cached.length > 0) return cached;

  const { prismaUnscoped } = await import('./db');
  const tenantModules = await prismaUnscoped.tenantModule.findMany({
    where: { tenantId, active: true },
    select: { moduleCode: true },
  });
  const codes = tenantModules.map((tm) => tm.moduleCode);

  if (codes.length > 0) {
    await cache.set(key, codes, MODULES_TTL_SECONDS);
  }

  return codes;
}

/** Invalidação na MESMA ação que alterou os módulos — elimina janela de inconsistência. */
export async function invalidateModulesCache(tenantId: string): Promise<void> {
  await cache.del(modulesKey(tenantId));
}