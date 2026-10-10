// src/app/api/audit-log/route.ts — Cap. 13.4 / 15.4
//
// Antes devolvia `{ entries: [], nextCursor: null }` — a trilha de auditoria
// existia no banco (todas as rotas gravam), mas a API nunca a expunha, então
// era impossível provar quem fez o quê.
//
// Agora: consulta paginada por cursor, com filtros (entidade, ação, usuário,
// período) — sempre escopada ao tenant da sessão.
import { prismaUnscoped } from '@/server/db';
import { DomainError } from '@/server/api-envelope';
import { requireSession } from '@/server/session';
import { handle } from '@/server/handler';

export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export const GET = handle(async (request: Request) => {
  const session = await requireSession(request);

  const url = new URL(request.url);
  const entityType = url.searchParams.get('entityType') ?? undefined;
  const entityId = url.searchParams.get('entityId') ?? undefined;
  const action = url.searchParams.get('action') ?? undefined;
  const userId = url.searchParams.get('userId') ?? undefined;
  const cursor = url.searchParams.get('cursor') ?? undefined;

  const limitRaw = Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, MAX_LIMIT) : DEFAULT_LIMIT;

  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  const parsedFrom = from ? new Date(from) : null;
  const parsedTo = to ? new Date(to) : null;
  if ((from && !parsedFrom) || (to && !parsedTo)) {
    throw new DomainError('VALIDATION_ERROR', 'Período inválido (use ISO 8601).', 400);
  }

  // Cursor opaco: `createdAt|id` — estável mesmo com registros no mesmo
  // milissegundo (offset quebraria ao inserir no meio da página).
  let cursorCreatedAt: Date | undefined;
  let cursorId: string | undefined;
  if (cursor) {
    const separator = cursor.indexOf('|');
    if (separator === -1) {
      throw new DomainError('VALIDATION_ERROR', 'Cursor inválido.', 400);
    }
    const at = new Date(cursor.slice(0, separator));
    if (Number.isNaN(at.getTime())) {
      throw new DomainError('VALIDATION_ERROR', 'Cursor inválido.', 400);
    }
    cursorCreatedAt = at;
    cursorId = cursor.slice(separator + 1);
  }

  const rows = await prismaUnscoped.auditLog.findMany({
    where: {
      tenantId: session.tenantId,
      ...(entityType ? { entityType } : {}),
      ...(entityId ? { entityId } : {}),
      ...(action ? { action } : {}),
      ...(userId ? { userId } : {}),
      ...(parsedFrom || parsedTo
        ? {
            createdAt: {
              ...(parsedFrom ? { gte: parsedFrom } : {}),
              ...(parsedTo ? { lte: parsedTo } : {}),
            },
          }
        : {}),
      ...(cursorCreatedAt && cursorId
        ? { OR: [{ createdAt: { lt: cursorCreatedAt } }, { createdAt: cursorCreatedAt, id: { lt: cursorId } }] }
        : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];

  return {
    success: true,
    data: {
      entries: page.map((row) => ({
        id: row.id,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        before: row.before ?? null,
        after: row.after ?? null,
        metadata: row.metadata ?? null,
        ipAddress: row.ipAddress,
        userAgent: row.userAgent,
        createdAt: row.createdAt.toISOString(),
        user: row.user,
      })),
      nextCursor: hasMore && last ? `${last.createdAt.toISOString()}|${last.id}` : null,
      total: page.length,
    },
    error: null,
  };
});
