// src/app/api/work-order/[id]/budget/route.ts — Cap. 4.2 / 6.4
// Orçamento com validade e link de aprovação por WhatsApp.
import { prismaUnscoped } from '@/server/db';
import { DomainError } from '@/server/api-envelope';
import { readSession } from '@/server/session';
import { sendBudget, type BudgetItemInput } from '@/server/services/work-orders';
import { writeAuditLog, requestFingerprint } from '@/server/audit';
import { handle } from '@/server/handler';

export const dynamic = 'force-dynamic';

interface BudgetBody {
  items?: unknown;
  validDays?: unknown;
}

export const POST = handle(async (request: Request, { params }: { params: { id: string } }) => {
  const session = await readSession(request);
  if (!session) throw new DomainError('UNAUTHENTICATED', 'Sessão ausente ou expirada.', 401);

  const body = await request.json() as BudgetBody;

  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw new DomainError('EMPTY_BUDGET', 'O orçamento precisa de ao menos um item.');
  }

  const items: BudgetItemInput[] = (body.items as Record<string, unknown>[]).map((raw) => ({
    description: String(raw.description ?? ''),
    itemType: String(raw.itemType ?? 'PART'),
    quantity: typeof raw.quantity === 'number' ? raw.quantity : 1,
    unitPrice: typeof raw.unitPrice === 'number' ? raw.unitPrice : 0,
    productId: typeof raw.productId === 'string' ? raw.productId : undefined,
    commissionable: raw.commissionable === true,
  }));

  const result = await sendBudget(
    prismaUnscoped,
    session.tenantId,
    params.id,
    items,
    typeof body.validDays === 'number' ? body.validDays : 7,
  );

  await writeAuditLog({
    tenantId: session.tenantId,
    userId: session.userId,
    action: 'WORK_ORDER_BUDGET_SENT',
    entityType: 'WorkOrder',
    entityId: params.id,
    after: { total: result.total, validUntil: result.validUntil },
    ...requestFingerprint(request),
  });

  return Response.json({ success: true, data: result, error: null });
});