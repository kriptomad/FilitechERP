import { PluggyClient } from 'pluggy-sdk';
import { handle } from '@/server/handler';
import { readJson } from '@/server/request';
import { requireSession } from '@/server/session';
import { jsonError, jsonSuccess } from '@/server/api-envelope';

export const dynamic = 'force-dynamic';

export const POST = handle(async (request: Request) => {
  const session = await requireSession(request);
  const body = await readJson<{ clientUserId?: string }>(request);

  // Usa o tenantId como clientUserId para rastrear no Pluggy
  const clientUserId = body.clientUserId ?? session.tenantId;

  const pluggy = new PluggyClient({
    clientId: process.env.PLUGGY_CLIENT_ID!,
    clientSecret: process.env.PLUGGY_CLIENT_SECRET!,
  });

  try {
    const connectToken = await pluggy.createConnectToken(clientUserId);

    return jsonSuccess({ accessToken: connectToken.accessToken });
  } catch (err: any) {
    console.error('[pluggy] createConnectToken error:', err);
    return jsonError(502, 'PLUGGY_CONNECT_TOKEN_FAILED', 'Falha ao criar token de conexão Pluggy.');
  }
});