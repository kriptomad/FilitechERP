// src/app/api/contracts/route.ts — Cap. 11.18 / 12
//
// Antes devolvia DEMO_CONTRACTS ("CTR-2024-0001", Mercado Central) e o POST
// fabricava um contrato com os últimos dígitos de Date.now().
import { prismaUnscoped } from '@/server/db';
import { requireSession } from '@/server/session';
import { readJson, requireString, optionalString } from '@/server/request';
import { writeAuditLog, requestFingerprint } from '@/server/audit';
import {
  createContract,
  listContracts,
  type ContractItemInput,
} from '@/server/services/contracts';
import { handle } from '@/server/handler';

export const dynamic = 'force-dynamic';

export const GET = handle(async (request: Request) => {
  const session = await requireSession(request);

  const url = new URL(request.url);
  const status = url.searchParams.get('status') ?? undefined;

  const contracts = await listContracts(prismaUnscoped, session.tenantId, status);
  return { success: true, data: contracts, error: null };
});

interface CreateBody {
  clientId?: unknown;
  title?: unknown;
  description?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  items?: unknown;
}

export const POST = handle(async (request: Request) => {
  const session = await requireSession(request);

  const body = await readJson<CreateBody>(request);

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return {
      success: false,
      data: null,
      error: { code: 'VALIDATION_ERROR', message: 'O contrato precisa de ao menos um item.' },
    };
  }

  const items: ContractItemInput[] = (body.items as Record<string, unknown>[]).map((raw) => ({
    serviceId: typeof raw.serviceId === 'string' && raw.serviceId ? raw.serviceId : undefined,
    description: String(raw.description ?? ''),
    quantity: Number(raw.quantity ?? 1),
    unitPrice: Number(raw.unitPrice ?? 0),
  }));

  const created = await createContract(prismaUnscoped, session.tenantId, {
    clientId: requireString(body.clientId, 'cliente', { max: 64 }),
    title: requireString(body.title, 'título', { min: 2, max: 200 }),
    description: optionalString(body.description, 'descrição', 2000),
    startDate: String(body.startDate ?? ''),
    endDate: typeof body.endDate === 'string' && body.endDate ? body.endDate : undefined,
    items,
  });

  await writeAuditLog({
    tenantId: session.tenantId,
    userId: session.userId,
    action: 'CONTRACT_CREATED',
    entityType: 'ServiceContract',
    entityId: created.id,
    after: { contractNumber: created.contractNumber, totalAmount: created.totalAmount },
    ...requestFingerprint(request),
  });

  return Response.json({ success: true, data: created, error: null }, { status: 201 });
});
