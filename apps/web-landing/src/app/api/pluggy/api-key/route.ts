// apps/web-landing/src/app/api/pluggy/api-key/route.ts
import { handle } from '@/server/handler';
import { jsonError, jsonSuccess } from '@/server/api-envelope';
import { requireSession } from '@/server/session';

export const dynamic = 'force-dynamic';

let cachedApiKey: { value: string; expiresAt: number } | null = null;

async function getPluggyApiKey(): Promise<string> {
  if (cachedApiKey && cachedApiKey.expiresAt > Date.now() + 5 * 60 * 1000) {
    return cachedApiKey.value;
  }

  const auth = Buffer.from(
    `${process.env.PLUGGY_CLIENT_ID}:${process.env.PLUGGY_CLIENT_SECRET}`
  ).toString('base64');

  const res = await fetch('https://api.pluggy.ai/auth', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`Pluggy auth failed: ${res.status}`);
  }

  const { apiKey } = await res.json();
  cachedApiKey = { value: apiKey, expiresAt: Date.now() + 2 * 60 * 60 * 1000 };
  return apiKey;
}

export const GET = handle(async (request: Request) => {
  await requireSession(request);

  try {
    const apiKey = await getPluggyApiKey();
    return jsonSuccess({ apiKey });
  } catch (err: any) {
    console.error('[pluggy-api-key] error:', err);
    return jsonError(502, 'PLUGGY_API_KEY_FAILED', 'Falha ao obter API Key Pluggy.');
  }
});