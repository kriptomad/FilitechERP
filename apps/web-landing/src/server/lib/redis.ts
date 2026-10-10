// apps/web-landing/src/server/lib/redis.ts
import { createClient, RedisClientType } from 'redis';

let redisClient: RedisClientType | null = null;

export async function getRedisClient(): Promise<RedisClientType> {
  if (!redisClient) {
    redisClient = createClient({
      url: process.env.REDIS_URL ?? 'redis://localhost:6379',
    });
    redisClient.on('error', (err) => console.error('[redis] error:', err));
    await redisClient.connect();
  }
  return redisClient;
}

export const redisConnection = {
  async get(key: string): Promise<string | null> {
    const client = await getRedisClient();
    return client.get(key);
  },
  async set(key: string, value: string, mode?: string, ttlMs?: number): Promise<void> {
    const client = await getRedisClient();
    if (ttlMs) {
      await client.set(key, value, { EX: Math.ceil(ttlMs / 1000) });
    } else {
      await client.set(key, value);
    }
  },
  async del(key: string): Promise<void> {
    const client = await getRedisClient();
    await client.del(key);
  },
  async sadd(key: string, ...members: string[]): Promise<number> {
    const client = await getRedisClient();
    return client.sAdd(key, members);
  },
  async smembers(key: string): Promise<string[]> {
    const client = await getRedisClient();
    return client.sMembers(key);
  },
  async expire(key: string, seconds: number): Promise<number> {
    const client = await getRedisClient();
    return client.expire(key, seconds);
  },
};