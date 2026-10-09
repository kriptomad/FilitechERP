// src/app/api/notifications/route.ts — Cap. 8.4.5
import { prismaUnscoped } from '@/server/db';
import { readSession } from '@/server/session';
import { handle } from '@/server/handler';

export const dynamic = 'force-dynamic';

export const GET = handle(async (request: Request) => {
  const session = await readSession(request);
  if (!session) return Response.json({ success: false, data: null, error: { code: 'UNAUTHENTICATED', message: 'Sessão ausente ou expirada.' } }, { status: 401 });

  const url = new URL(request.url);
  const unreadOnly = url.searchParams.get('unreadOnly') === 'true';
  const take = Math.min(Number(url.searchParams.get('limit') ?? 50), 100);

  const notifications = await prismaUnscoped.notification.findMany({
    where: {
      recipientId: session.userId,
      ...(unreadOnly ? { readAt: null } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take,
  });

  return { success: true, data: notifications, error: null };
});

export const POST = handle(async (request: Request) => {
  const session = await readSession(request);
  if (!session) return Response.json({ success: false, data: null, error: { code: 'UNAUTHENTICATED', message: 'Sessão ausente ou expirada.' } }, { status: 401 });

  const body = (await request.json()) as { ids?: unknown };
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === 'string') : [];

  if (ids.length === 0) {
    return { success: false, data: null, error: { code: 'VALIDATION_ERROR', message: 'Informe as notificações para marcar como lidas.' } };
  }

  const result = await prismaUnscoped.notification.updateMany({
    where: { id: { in: ids }, recipientId: session.userId },
    data: { readAt: new Date() },
  });

  return { success: true, data: { updated: result.count }, error: null };
});
