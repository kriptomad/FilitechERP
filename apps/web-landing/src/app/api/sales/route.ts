// src/app/api/sales/route.ts — Cap. 4.1 / 6.6 / 9.5
//
// Antes esta rota devolvia `sale-${Date.now()}` com o body ecoado: nenhuma
// venda era gravada, nenhum estoque era baixado e o caixa fechava sem nada.
//
// Agora delega para `createSale()`, que é o único caminho de venda e aplica:
//   • idempotência por chave (o PDV reenvia a venda ao reconectar — Cap. 9.5);
//   • baixa de estoque FEFO com bloqueio de lote vencido (Cap. 6.2);
//   • limite de crédito do cliente em venda a prazo (Cap. 4.6).
import { prismaUnscoped } from '@/server/db';
import { DomainError } from '@/server/api-envelope';
import { requireSession } from '@/server/session';
import { gatekeeper } from '@/server/gatekeeper';
import { readJson, optionalString } from '@/server/request';
import { writeAuditLog, requestFingerprint } from '@/server/audit';
import { createSale, type SaleItemInput, type SalePaymentInput } from '@/server/services/sales';
import { handle } from '@/server/handler';

export const dynamic = 'force-dynamic';

interface SaleBody {
  idempotencyKey?: unknown;
  cashRegisterId?: unknown;
  clientId?: unknown;
  items?: unknown;
  payments?: unknown;
  /** Formas legadas do PDV: uma forma só + valor entregue. */
  paymentMethod?: unknown;
  amountTendered?: unknown;
  discountAmount?: unknown;
  channel?: unknown;
}

export const POST = handle(async (request: Request) => {
  const session = await requireSession(request);
  await gatekeeper(session, { moduleCode: 'pdv', requiredPermission: 'pdv:sell' });

  const body = await readJson<SaleBody>(request);

  const idempotencyKey =
    optionalString(body.idempotencyKey, 'idempotencyKey', 120) ??
    request.headers.get('idempotency-key') ??
    undefined;

  if (!idempotencyKey) {
    throw new DomainError(
      'VALIDATION_ERROR',
      'idempotencyKey é obrigatório (header Idempotency-Key ou campo equivalente).',
      400,
    );
  }

  const cashRegisterId = optionalString(body.cashRegisterId, 'cashRegisterId', 64);
  if (!cashRegisterId) {
    throw new DomainError('VALIDATION_ERROR', 'cashRegisterId é obrigatório.', 400);
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw new DomainError('EMPTY_SALE', 'A venda precisa de ao menos um item.', 400);
  }

  const items: SaleItemInput[] = (body.items as Record<string, unknown>[]).map((raw) => ({
    productId: String(raw.productId ?? ''),
    quantity: Number(raw.quantity ?? 0),
    unitPrice: typeof raw.unitPrice === 'number' ? raw.unitPrice : undefined,
    productVariantId:
      typeof raw.productVariantId === 'string' ? raw.productVariantId : undefined,
  }));

  // Forma legada do PDV: `{ paymentMethod, amountTendered }` vira uma lista de
  // pagamentos com um único item — mantém o contrato do front sem duplicar
  // a regra de negócio dentro da rota.
  let payments: SalePaymentInput[];
  if (Array.isArray(body.payments) && body.payments.length > 0) {
    payments = (body.payments as Record<string, unknown>[]).map((raw) => ({
      method: String(raw.method ?? 'CASH'),
      amount: Number(raw.amount ?? 0),
      tefAuthorizationCode:
        typeof raw.tefAuthorizationCode === 'string' ? raw.tefAuthorizationCode : undefined,
    }));
  } else {
    const method = optionalString(body.paymentMethod, 'paymentMethod', 30) ?? 'CASH';
    const subtotal = items.reduce((sum, item) => sum + (item.unitPrice ?? 0) * item.quantity, 0);
    const discount = typeof body.discountAmount === 'number' ? body.discountAmount : 0;
    const total = Math.max(0, Math.round((subtotal - discount) * 100) / 100);
    const tendered =
      typeof body.amountTendered === 'number' && body.amountTendered > 0
        ? body.amountTendered
        : total;

    payments = [{ method, amount: tendered }];
  }

  try {
    const { sale, idempotent } = await createSale(prismaUnscoped, session.tenantId, session.userId, {
      idempotencyKey,
      cashRegisterId,
      clientId: optionalString(body.clientId, 'clientId', 64),
      items,
      payments,
      discountAmount: typeof body.discountAmount === 'number' ? body.discountAmount : undefined,
      channel: optionalString(body.channel, 'channel', 30),
    });

    if (!idempotent) {
      await writeAuditLog({
        tenantId: session.tenantId,
        userId: session.userId,
        action: 'SALE_CREATED',
        entityType: 'Sale',
        entityId: sale.id,
        after: { totalAmount: sale.totalAmount, channel: sale.channel },
        ...requestFingerprint(request),
      });
    }

    const payload = {
      ...sale,
      fiscalDocumentStatus: 'PENDING',
      ...(idempotent
        ? { note: 'Venda já processada anteriormente — retornando resultado idempotente.' }
        : {}),
    };

    // 201 na primeira gravação; 200 no reenvio idempotente (Cap. 9.5).
    return Response.json(
      { success: true, data: payload, error: null },
      { status: idempotent ? 200 : 201 },
    );
  } catch (err) {
    // 422: é regra de negócio (estoque/limite), não falha do sistema — o PDV
    // precisa do código para marcar a linha como FAILED sem reenviar em loop.
    if (err instanceof DomainError && err.status === 422) {
      return Response.json(
        { success: false, data: null, error: { code: err.code, message: err.message, details: err.details } },
        { status: 422 },
      );
    }
    throw err;
  }
});
