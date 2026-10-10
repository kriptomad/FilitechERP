// src/app/api/work-order/route.ts — Cap. 4.2
//
// Antes devolvia `[]` no GET e fabricava `wo-${Date.now()}` no POST — a
// assistência técnica não tinha nenhuma OS gravada, e o protocolo não existia.
//
// Agora: lista as OS reais do tenant (com filtro de status) e cria OS com
// protocolo sequencial, cliente validado e checklist de entrada.
import { prismaUnscoped } from '@/server/db';
import { DomainError } from '@/server/api-envelope';
import { requireSession } from '@/server/session';
import { roleHasPermission } from '@/server/gatekeeper';
import { readJson, requireString, optionalString, requireNumber } from '@/server/request';
import { writeAuditLog, requestFingerprint } from '@/server/audit';
import {
  createWorkOrder,
  listWorkOrders,
  type CreateWorkOrderInput,
} from '@/server/services/work-orders';
import { handle } from '@/server/handler';

export const dynamic = 'force-dynamic';

export const GET = handle(async (request: Request) => {
  const session = await requireSession(request);

  const url = new URL(request.url);
  const status = url.searchParams.get('status') ?? undefined;

  const orders = await listWorkOrders(prismaUnscoped, session.tenantId, status);
  return { success: true, data: orders, error: null };
});

interface CreateBody {
  clientId?: unknown;
  equipmentDescription?: unknown;
  reportedIssue?: unknown;
  assignedTechnicianId?: unknown;
  warrantyDays?: unknown;
  checklistItems?: unknown;
}

export const POST = handle(async (request: Request) => {
  const session = await requireSession(request);

  if (!roleHasPermission(session.role, 'work-order:create')) {
    throw new DomainError('FORBIDDEN', 'Seu nível de acesso não permite abrir ordens de serviço.', 403);
  }

  const body = await readJson<CreateBody>(request);

  const input: CreateWorkOrderInput = {
    clientId: requireString(body.clientId, 'cliente', { max: 64 }),
    equipmentDescription: requireString(body.equipmentDescription, 'equipamento', {
      min: 2,
      max: 400,
    }),
    reportedIssue: requireString(body.reportedIssue, 'problema relatado', { min: 2, max: 2000 }),
    assignedTechnicianId: optionalString(body.assignedTechnicianId, 'técnico', 64),
    warrantyDays:
      body.warrantyDays === undefined ? undefined : requireNumber(body.warrantyDays, 'garantia'),
    checklistItems: Array.isArray(body.checklistItems)
      ? (body.checklistItems as { label: string; checked: boolean }[]).map((item) => ({
          label: String(item.label ?? ''),
          checked: item.checked === true,
        }))
      : undefined,
  };

  const order = await createWorkOrder(prismaUnscoped, session.tenantId, input);

  await writeAuditLog({
    tenantId: session.tenantId,
    userId: session.userId,
    action: 'WORK_ORDER_CREATED',
    entityType: 'WorkOrder',
    entityId: order.id,
    after: { protocol: order.protocol, client: order.clientName },
    ...requestFingerprint(request),
  });

  return Response.json({ success: true, data: order, error: null }, { status: 201 });
});
