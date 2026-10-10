// src/app/api/admin/services/route.ts — Cap. 11 (nicho de serviços)
//
// Antes devolvia DEMO_SERVICES e o POST fabricava `id: String(Date.now())`.
import { prismaUnscoped } from '@/server/db';
import { requireSession } from '@/server/session';
import { gatekeeper } from '@/server/gatekeeper';
import { readJson, requireString, requireNumber, optionalString } from '@/server/request';
import { writeAuditLog, requestFingerprint } from '@/server/audit';
import { createService, listServices } from '@/server/services/admin-services';
import { handle } from '@/server/handler';

export const dynamic = 'force-dynamic';

export const GET = handle(async (request: Request) => {
  const session = await requireSession(request);
  await gatekeeper(session, { moduleCode: 'crm' });

  const services = await listServices(prismaUnscoped, session.tenantId);
  return { success: true, data: services, error: null };
});

interface CreateBody {
  name?: unknown;
  nicheTag?: unknown;
  basePrice?: unknown;
  estimatedDurationMinutes?: unknown;
  commissionPercentage?: unknown;
  active?: unknown;
}

export const POST = handle(async (request: Request) => {
  const session = await requireSession(request);
  await gatekeeper(session, { moduleCode: 'crm', requiredPermission: 'crm:write' });

  const body = await readJson<CreateBody>(request);

  const created = await createService(prismaUnscoped, session.tenantId, {
    name: requireString(body.name, 'nome', { min: 2, max: 160 }),
    nicheTag: optionalString(body.nicheTag, 'nicho', 40) ?? 'GERAL',
    basePrice: requireNumber(body.basePrice ?? 0, 'preço'),
    estimatedDurationMinutes:
      typeof body.estimatedDurationMinutes === 'number' ? body.estimatedDurationMinutes : 30,
    commissionPercentage:
      typeof body.commissionPercentage === 'number' ? body.commissionPercentage : undefined,
    active: body.active !== false,
  });

  await writeAuditLog({
    tenantId: session.tenantId,
    userId: session.userId,
    action: 'SETTINGS_UPDATED',
    entityType: 'Service',
    entityId: created.id,
    after: { name: created.name, basePrice: created.basePrice },
    ...requestFingerprint(request),
  });

  return Response.json({ success: true, data: created, error: null }, { status: 201 });
});
