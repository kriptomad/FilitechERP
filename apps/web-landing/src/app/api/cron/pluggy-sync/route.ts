// apps/web-landing/src/app/api/cron/pluggy-sync/route.ts
import { NextResponse } from 'next/server';
import { env } from '@/server/env';
import { pluggySyncQueue } from '@/server/jobs/pluggy-sync.queue';
import { prismaUnscoped } from '@/server/db';

export const dynamic = 'force-dynamic';

function authorize(request: Request): boolean {
  const secret = env.cronSecret;
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Cron não autorizado.' } },
      { status: 401 }
    );
  }

  try {
    // Busca todos os consentimentos ativos/pendentes
    const consents = await prismaUnscoped.openFinanceConsent.findMany({
      where: { status: { in: ['UPDATING', 'UPDATED', 'WAITING_USER_INPUT'] } },
      select: { itemId: true },
    });

    // Enfileira sincronização para cada item
    for (const consent of consents) {
      await pluggySyncQueue.add('sync-item', { itemId: consent.itemId, type: 'sync-item' });
    }

    return NextResponse.json({
      success: true,
      data: { itemsQueued: consents.length, ranAt: new Date().toISOString() },
      error: null,
    });
  } catch (err) {
    console.error('[cron:pluggy-sync] falha:', err);
    return NextResponse.json(
      { success: false, error: { code: 'CRON_FAILED', message: 'Falha ao enfileirar sincronização Pluggy.' } },
      { status: 500 }
    );
  }
}