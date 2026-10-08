// src/lib/redis.ts — Cap. 3.4
import { Redis } from "ioredis";

export const redis = new Redis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    return Math.min(times * 100, 3000);
  },
});

redis.on("error", (err) => {
  console.error("Redis connection error:", err);
});
