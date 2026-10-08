// src/infra/redis/tenant-cache.ts — Cap. 3.4
import { redis } from "../../lib/redis.js";

export class TenantCache {
  constructor(private readonly tenantId: string) {}

  private key(resource: string, id: string): string {
    return `tenant:${this.tenantId}:cache:${resource}:${id}`;
  }

  async get<T>(resource: string, id: string): Promise<T | null> {
    const raw = await redis.get(this.key(resource, id));
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async set(
    resource: string,
    id: string,
    value: unknown,
    ttlSeconds = 300,
  ): Promise<void> {
    await redis.set(this.key(resource, id), JSON.stringify(value), "EX", ttlSeconds);
  }

  async invalidate(resource: string, id: string): Promise<void> {
    await redis.del(this.key(resource, id));
  }

  /** Invalida todos os recursos de um tipo (ex.: invalidar tudo de "products"). */
  async invalidateResource(resource: string): Promise<void> {
    const keys = await redis.keys(`tenant:${this.tenantId}:cache:${resource}:*`);
    if (keys.length > 0) await redis.del(...keys);
  }
}
