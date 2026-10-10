// src/app/api/admin/receivables/route.ts — Cap. 4.6 / 17.3
//
// Antes devolvia DEMO_RECEIVABLES com datas fixas de 2024 e o POST fabricava
// um registro inexistente — o painel mostrava cobranças que ninguém devia.
import { prismaUnscoped } from '@/server/db';
import { requireSession } from '@/server/session';
import { gatekeeper } from '@/server/gatekeeper';
import { readJson, requireString, requireNumber, optionalString } from '@/server/request';
import { writeAuditLog, requestFingerprint } from '@/server/audit';
import { createReceivable, listReceivables } from '@/server/services/admin-receivables';
import { handle } from '@/server/handler';

export const dynamic = 'force-dynamic';

export const GET = handle(async (request: Request) => {
  const session = await requireSession(request);
  await gatekeeper(session, { moduleCode: 'financeiro' });

  const url = new URL(request.url);
  const status = url.searchParams.get('status') ?? undefined;
  const clientId = url.searchParams.get('clientId') ?? undefined;

  const receivables = await listReceivables(prismaUnscoped, session.tenantId, {
    status,
    clientId,
  });

  return { success: true, data: receivables, error: null };
});

interface CreateBody {
  clientId?: unknown;
  description?: unknown;
  amount?: unknown;
  dueDate?: unknown;
  saleId?: unknown;
}

export const POST = handle(async (request: Request) => {
  const session = await requireSession(request);
  await gatekeeper(session, { moduleCode: 'financeiro', requiredPermission: 'crm:write' });

  const body = await readJson<CreateBody>(request);

  const created = await createReceivable(prismaUnscoped, session.tenantId, {
    clientId: requireString(body.clientId, 'cliente', { max: 64 }),
    description: requireString(body.description, 'descrição', { min: 2, max: 200 }),
    amount: requireNumber(body.amount, 'valor'),
    dueDate: String(body.dueDate ?? ''),
    saleId: optionalString(body.saleId, 'saleId', 64),
  });

  await writeAuditLog({
    tenantId: session.tenantId,
    userId: session.userId,
    action: 'RECEIVABLE_CREATED',
    entityType: 'AccountReceivable',
    entityId: created.id,
    after: { amount: created.amount, dueDate: created.dueDate },
    ...requestFingerprint(request),
  });

  return Response.json({ success: true, data: created, error: null }, { status: 201 });
});
