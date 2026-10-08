// src/gateways/sse.gateway.ts — Cap. 8.2 (SSE sem memory leaks)
import { Response } from "express";
import { redis } from "../lib/redis.js";

interface SseClient {
  tenantId: string;
  res: Response;
  heartbeat: NodeJS.Timeout;
}

const clients = new Map<string, Set<SseClient>>();

export function registerSseClient(
  tenantId: string,
  resourceId: string,
  res: Response,
): () => void {
  const key = `${tenantId}:${resourceId}`;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(`retry: 3000\n\n`);

  // Heartbeat a cada 25s mantém conexões proxys (Cloudflare) vivas.
  const heartbeat = setInterval(() => {
    res.write(`: ping\n\n`);
  }, 25_000);

  const client: SseClient = { tenantId, res, heartbeat };

  if (!clients.has(key)) clients.set(key, new Set());
  clients.get(key)!.add(client);

  const cleanup = () => {
    clearInterval(heartbeat);
    clients.get(key)?.delete(client);
    if (clients.get(key)?.size === 0) clients.delete(key);
    res.end();
  };

  res.on("close", cleanup);
  return cleanup;
}

export function publishToResource(
  tenantId: string,
  resourceId: string,
  event: string,
  payload: unknown,
) {
  const key = `${tenantId}:${resourceId}`;
  const set = clients.get(key);
  if (!set) return;
  const data = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of set) {
    client.res.write(data);
  }
}

/** Publica via Redis para suportar múltiplos nós da API (Swarm/K3s). */
export async function publishViaRedis(
  tenantId: string,
  resourceId: string,
  event: string,
  payload: unknown,
) {
  await redis.publish(
    "filitech:sse",
    JSON.stringify({ tenantId, resourceId, event, payload }),
  );
}

export function subscribeRedisFanout() {
  const subscriber = redis.duplicate();
  subscriber.subscribe("filitech:sse");
  subscriber.on("message", (_channel: string, message: string) => {
    try {
      const { tenantId, resourceId, event, payload } = JSON.parse(message);
      publishToResource(tenantId, resourceId, event, payload);
    } catch {
      // mensagem malformada — ignora
    }
  });
  return subscriber;
}
