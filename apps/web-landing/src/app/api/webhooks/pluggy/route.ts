import { PluggyClient } from 'pluggy-sdk';
import { handle } from '@/server/handler';
import { jsonError, jsonSuccess } from '@/server/api-envelope';
import { fetchPluggyAccounts, fetchPluggyTransactions, fetchPluggyInvestments } from '@/server/services/pluggy.service';
import { pluggySyncQueue } from '@/server/jobs/pluggy-sync.queue';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

let pluggyClient: PluggyClient | null = null;

function getPluggyClient() {
  if (!pluggyClient) {
    pluggyClient = new PluggyClient({
      clientId: process.env.PLUGGY_CLIENT_ID!,
      clientSecret: process.env.PLUGGY_CLIENT_SECRET!,
    });
  }
  return pluggyClient;
}

export const POST = handle(async (request: Request) => {
  const { prismaUnscoped } = await import('@/server/db');
  const body = await request.json();

  const { event, itemId } = body;

  console.log('[pluggy-webhook] event:', event, 'itemId:', itemId);

  try {
    switch (event) {
      case 'item/created':
      case 'item/updated': {
        // Sincroniza contas, transações e investimentos
        await pluggySyncQueue.add('sync-item', { itemId });
        break;
      }
      case 'item/error': {
        // Marca consentimento com erro
        await prismaUnscoped.openFinanceConsent.update({
          where: { itemId },
          data: { status: 'LOGIN_ERROR' },
        });
        break;
      }
      case 'transactions/created':
      case 'transactions/updated':
      case 'transactions/deleted': {
        await pluggySyncQueue.add('sync-transactions', { itemId });
        break;
      }
      case 'investments/created':
      case 'investments/updated':
      case 'investments/deleted': {
        await pluggySyncQueue.add('sync-investments', { itemId });
        break;
      }
      default:
        console.log('[pluggy-webhook] evento não tratado:', event);
    }

    return jsonSuccess({ received: true });
  } catch (err: any) {
    console.error('[pluggy-webhook] error:', err);
    // Sempre retorna 2xx para o Pluggy não reenviar indefinidamente
    return jsonSuccess({ received: true });
  }
});