// src/app/api/admin/clients/route.ts — Cap. 4.6
//
// Antes devolvia DEMO_CLIENTS (Mercado Central e João da Silva) e o POST
// criava `{ id: String(Date.now()) }` só na resposta — nada de cliente real,
// e o crediário apontava para registros que não existiam.
import { prismaUnscoped } from '@/server/db';
import { DomainError } from '@/server/api-envelope';
import { requireSession } from '@/server/session';
import { gatekeeper } from '@/server/gatekeeper';
import { readJson, optionalString, requireString, requireNumber } from '@/server/request';
import { writeAuditLog, requestFingerprint } from '@/server/audit';
import { createClient, listClients } from '@/server/services/admin-clients';
import { handle } from '@/server/handler';

export const dynamic = 'force-dynamic';

export const GET = handle(async (request: Request) => {
  const session = await requireSession(request);
  await gatekeeper(session, { moduleCode: 'crm' });

  const url = new URL(request.url);
  const search = url.searchParams.get('q') ?? undefined;

  const clients = await listClients(prismaUnscoped, session.tenantId, search);
  return { success: true, data: clients, error: null };
});

interface CreateBody {
  name?: unknown;
  document?: unknown;
  phone?: unknown;
  email?: unknown;
  creditLimit?: unknown;
  isBusinessAccount?: unknown;
}

export const POST = handle(async (request: Request) => {
  const session = await requireSession(request);
  await gatekeeper(session, { moduleCode: 'crm', requiredPermission: 'crm:write' });

  const body = await readJson<CreateBody>(request);

  const created = await createClient(prismaUnscoped, session.tenantId, {
    name: requireString(body.name, 'nome', { min: 2, max: 160 }),
    document: optionalString(body.document, 'documento', 30),
    phone: optionalString(body.phone, 'telefone', 40),
    email: optionalString(body.email, 'e-mail', 180),
    creditLimit: typeof body.creditLimit === 'number' ? requireNumber(body.creditLimit, 'limite') : undefined,
    isBusinessAccount: body.isBusinessAccount === true,
  });

  await writeAuditLog({
    tenantId: session.tenantId,
    userId: session.userId,
    action: 'CLIENT_CREATED',
    entityType: 'Client',
    entityId: created.id,
    after: { name: created.name, creditLimit: created.creditLimit },
    ...requestFingerprint(request),
  });

  return Response.json({ success: true, data: created, error: null }, { status: 201 });
});
