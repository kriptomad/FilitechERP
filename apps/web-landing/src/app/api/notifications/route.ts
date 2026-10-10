// src/app/api/notifications/route.ts — Cap. 8.4.5
//
// Sino do usuário logado + marcação de lidas.
//
// Correção importante: a versão anterior devolvia `{ success: false, ... }`
// como OBJETO em vez de `Response`. O `handle()` embrulha retornos não-`Response`
// no envelope de sucesso — então uma validação falhando respondia HTTP 200 com
// `{ success: true, data: { success: false } }`, e o cliente via sucesso onde
// havia erro. Aqui os erros são `DomainError`/`jsonError` (resposta real).
import { prismaUnscoped } from '@/server/db';
import { DomainError, jsonError } from '@/server/api-envelope';
import { requireSession } from '@/server/session';
import { handle } from '@/server/handler';

export const dynamic = 'force-dynamic';

export const GET = handle(async (request: Request) => {
  const session = await requireSession(request);

  const url = new URL(request.url);
  const unreadOnly = url.searchParams.get('unreadOnly') === 'true';
  const takeRaw = Number(url.searchParams.get('limit') ?? 50);
  const take = Number.isFinite(takeRaw) && takeRaw > 0 ? Math.min(takeRaw, 100) : 50;

  const [notifications, unread] = await Promise.all([
    prismaUnscoped.notification.findMany({
      where: {
        recipientId: session.userId,
        ...(unreadOnly ? { readAt: null } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take,
    }),
    prismaUnscoped.notification.count({
      where: { recipientId: session.userId, readAt: null },
    }),
  ]);

  return {
    success: true,
    data: {
      notifications: notifications.map((n) => ({
        id: n.id,
        category: n.category,
        title: n.title,
        body: n.body,
        priority: n.priority,
        actionUrl: n.actionUrl,
        readAt: n.readAt?.toISOString() ?? null,
        createdAt: n.createdAt.toISOString(),
        expiresAt: n.expiresAt?.toISOString() ?? null,
      })),
      unread,
    },
    error: null,
  };
});

export const POST = handle(async (request: Request) => {
  const session = await requireSession(request);

  const body = (await request.json().catch(() => null)) as { ids?: unknown } | null;
  const ids = Array.isArray(body?.ids)
    ? body.ids.filter((x): x is string => typeof x === 'string')
    : [];

  if (ids.length === 0) {
    // Lançar: um `return` de objeto seria re-empacotado como sucesso.
    throw new DomainError(
      'VALIDATION_ERROR',
      'Informe as notificações para marcar como lidas.',
      400,
    );
  }

  // `recipientId` no WHERE: um usuário não pode marcar como lida a notificação
  // de outra conta só por adivinhar o id.
  const result = await prismaUnscoped.notification.updateMany({
    where: { id: { in: ids }, recipientId: session.userId, readAt: null },
    data: { readAt: new Date() },
  });

  if (result.count === 0) {
    return jsonError(404, 'NOT_FOUND', 'Nenhuma notificação pendente encontrada.');
  }

  return { success: true, data: { updated: result.count }, error: null };
});
