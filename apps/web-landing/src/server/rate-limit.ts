// src/server/rate-limit.ts — Rate limiting por IP (Cap. 3.2)
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export const apiLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(100, '60 s'),
  analytics: true,
});

export const authLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(5, '60 s'),
  analytics: true,
});

export async function checkRateLimit(
  identifier: string,
  type: 'api' | 'auth' = 'api',
): Promise<{ ok: boolean; remaining: number; reset: number }> {
  const limiter = type === 'auth' ? authLimiter : apiLimiter;
  const result = await limiter.limit(identifier);
  return {
    ok: result.success,
    remaining: result.remaining,
    reset: result.reset,
  };
}