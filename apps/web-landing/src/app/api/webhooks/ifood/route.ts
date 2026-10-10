// src/app/api/webhooks/ifood/route.ts — Cap. 11.1 (pedido iFood → Sale)
//
// Versão anterior: lia o body, fazia `console.log` e respondia sucesso. Um
// pedido de marketplace chegava ao sistema e DESAPARECIA — nada de venda, nada
// de baixa de estoque, nada de comissão do entregador. O lojista só descobria
// quando o estoque não batia no fechamento.
//
// O que este arquivo faz agora:
//   1. Autentica o HMAC do iFood (fail-closed: sem segredo configurado, 503 —
//      nunca aceitamos evento sem conseguir verificar).
//   2. Resolve merchant → tenant pelo slug (mesmo mapa do `apps/api`).
//   3. Mapeia os itens do pedido para produtos reais (EAN → nome).
//   4. Delega a criação para `createSale()` — o MESMO caminho do PDV. Assim a
//      baixa FEFO, o registro de pagamento, a trava de caixa e a idempotência
//      são uma única implementação em vez de duas que divergem.
import { prismaUnscoped } from '@/server/db';
import { DomainError, jsonError, jsonSuccess } from '@/server/api-envelope';
import { createSale } from '@/server/services/sales';
import { getOpenRegister, openRegister } from '@/server/services/cash-registers';
import { handle } from '@/server/handler';

export const dynamic = 'force-dynamic';

interface IfoodItem {
  index?: number;
  name?: string;
  unitPrice?: number;
  price?: number;
  quantity?: number;
  ean?: string;
}

interface IfoodEvent {
  merchantId?: string;
  id?: string;
  type?: string;
  items?: IfoodItem[];
  [key: string]: unknown;
}

const IGNORED_TYPES = new Set([
  'ORDER_CREATED',
  'CONFIRMED',
  'ORDER_CONFIRMED',
  'READY_TO_PICKUP',
]);

export const POST = handle(async (request: Request) => {
  const secret = process.env.IFOOD_WEBHOOK_SECRET;

  if (!secret) {
    // Fail-closed: sem segredo não há como saber se o evento veio do iFood.
    // Responder "ok" aqui seria aceitar pedidos forjados de qualquer um.
    return jsonError(
      503,
      'IFOOD_NOT_CONFIGURED',
      'IFOOD_WEBHOOK_SECRET não configurado — evento recusado.',
    );
  }

  const provided = request.headers.get('x-ifood-signature') ?? '';
  if (provided.length !== secret.length || provided !== secret) {
    return jsonError(401, 'INVALID_SIGNATURE', 'Assinatura do webhook inválida.');
  }

  const raw = await request.text();
  let event: IfoodEvent;
  try {
    event = JSON.parse(raw) as IfoodEvent;
  } catch {
    return jsonError(400, 'INVALID_PAYLOAD', 'Corpo do webhook não é JSON válido.');
  }

  const merchantId = typeof event.merchantId === 'string' ? event.merchantId.trim() : '';
  const externalId = typeof event.id === 'string' ? event.id.trim() : '';

  if (!merchantId || !externalId) {
    return jsonError(400, 'INVALID_PAYLOAD', 'merchantId e id são obrigatórios.');
  }

  // Mapa merchant → tenant. Aceitamos slug (como no Express original), id ou
  // CNPJ: o cadastro do marketplace nem sempre bate com o slug do ERP.
  const tenant = await prismaUnscoped.tenant.findFirst({
    where: {
      OR: [{ slug: merchantId }, { id: merchantId }, { cnpj: merchantId }],
    },
    select: { id: true, slug: true },
  });

  if (!tenant) {
    // 200/202 para o iFood não reenviar para sempre um merchant de outro
    // ambiente — mas NADA é gravado.
    return jsonSuccess({ ignored: true, reason: 'unknown_merchant' });
  }

  const type = String(event.type ?? '');
  if (!IGNORED_TYPES.has(type)) {
    return jsonSuccess({ ignored: true, reason: 'event_type', type });
  }

  // Caixa do canal delivery: se não houver caixa aberto, abrimos um dedicado.
  // Sem isso o pedido falharia com "não há caixa aberto" no meio da noite.
  let register = await getOpenRegister(prismaUnscoped, tenant.id);
  if (!register) {
    const owner = await prismaUnscoped.user.findFirst({
      where: { tenantId: tenant.id, active: true, role: 'OWNER' },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });

    if (!owner) {
      return jsonError(
        409,
        'NO_ACTIVE_OWNER',
        'Tenant sem usuário OWNER ativo — não é possível abrir caixa do delivery.',
      );
    }

    try {
      register = await openRegister(prismaUnscoped, tenant.id, owner.id, 0);
    } catch (err) {
      // Corrida: dois pedidos simultâneos tentando abrir — o segundo encontra
      // o caixa já aberto e segue com ele.
      if (err instanceof DomainError && err.code === 'REGISTER_ALREADY_OPEN') {
        register = await getOpenRegister(prismaUnscoped, tenant.id);
      } else {
        throw err;
      }
    }
  }

  if (!register) {
    return jsonError(409, 'REGISTER_NOT_OPEN', 'Não há caixa aberto para o canal delivery.');
  }

  const items = Array.isArray(event.items) ? event.items : [];
  if (items.length === 0) {
    return jsonError(400, 'EMPTY_ORDER', 'Pedido sem itens.');
  }

  // ── Mapeamento item → produto ──────────────────────────────────────────────
  const productIds = items.map((item) => item.ean).filter((ean): ean is string => Boolean(ean));
  const byBarcode = productIds.length
    ? await prismaUnscoped.product.findMany({
        where: { tenantId: tenant.id, barcode: { in: productIds } },
        select: { id: true, barcode: true, name: true },
      })
    : [];
  const barcodeIndex = new Map(byBarcode.map((p) => [p.barcode ?? '', p.id]));

  const mapped: { productId: string; quantity: number; unitPrice: number }[] = [];
  const unmapped: string[] = [];

  for (const item of items) {
    const name = (item.name ?? '').trim();
    const quantity = Math.max(1, Math.trunc(Number(item.quantity ?? 1)));
    const unitPrice = Number(item.unitPrice ?? item.price ?? 0);

    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      return jsonError(
        400,
        'INVALID_PRICE',
        `Item "${name || 's/n'}" com preço inválido (${item.unitPrice ?? item.price}).`,
      );
    }

    let productId = item.ean ? barcodeIndex.get(item.ean) : undefined;

    if (!productId && name) {
      const match = await prismaUnscoped.product.findFirst({
        where: { tenantId: tenant.id, name: { equals: name, mode: 'insensitive' } },
        select: { id: true },
      });
      productId = match?.id;
    }

    if (!productId) {
      unmapped.push(`${name || 's/n'}${item.ean ? ` (EAN ${item.ean})` : ''}`);
      continue;
    }

    mapped.push({ productId, quantity, unitPrice });
  }

  if (unmapped.length > 0) {
    // Recusamos em vez de criar a venda incompleta: estoque errado é pior que
    // pedido rejeitado — este é justamente o erro que o webhook existe para
    // eliminar.
    return jsonError(
      422,
      'UNMAPPED_PRODUCTS',
      `Produtos do pedido iFood não cadastrados: ${unmapped.join('; ')}. Cadastre-os e reenvie o pedido.`,
      { unmapped },
    );
  }

  const cashier = await prismaUnscoped.user.findFirst({
    where: { tenantId: tenant.id, active: true },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!cashier) {
    return jsonError(409, 'NO_ACTIVE_USER', 'Tenant sem usuário ativo para registrar a venda.');
  }

  // ── Criação (mesmo caminho do PDV) ────────────────────────────────────────
  const total = mapped.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

  const result = await createSale(prismaUnscoped, tenant.id, cashier.id, {
    idempotencyKey: `ifood-${externalId}`,
    cashRegisterId: register.id,
    items: mapped,
    // iFood repassa cartão ao lojista — o dinheiro entra na conta do lojista,
    // não na gaveta.
    payments: [{ method: 'CREDIT_CARD', amount: Math.round(total * 100) / 100 }],
    channel: 'DELIVERY',
  });

  return jsonSuccess(
    result.idempotent
      ? { saleId: result.sale.id, idempotent: true }
      : { saleId: result.sale.id, total: result.sale.totalAmount },
    result.idempotent ? 200 : 201,
  );
});
