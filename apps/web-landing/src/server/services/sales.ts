// src/server/services/sales.ts — Cap. 4.1 / 6.6
//
// Orquestrador transacional da venda (PDV). Portado do `apps/api` — a lógica
// já existia e estava órfã porque a API Express não roda na Vercel.
//
// Pontos que este arquivo preserva do Cap. 6.6:
//   • idempotência por chave (o PDV sincroniza venda offline e pode reenviar);
//   • baixa de estoque com FEFO e bloqueio de lote vencido;
//   • estorno de crediário e reentrada de estoque no refund;
//   • venda a prazo passa pelo limite de crédito do cliente.
import { Prisma, type PrismaClient } from '@prisma/client';
import { DomainError } from '../api-envelope';
import { assertCreditAvailable } from './admin-clients';

type Tx = Prisma.TransactionClient;

export interface SaleItemInput {
  productId: string;
  quantity: number;
  unitPrice?: number;
  productVariantId?: string;
}

export interface SalePaymentInput {
  method: string;
  amount: number;
  tefAuthorizationCode?: string;
}

export interface CreateSaleInput {
  idempotencyKey: string;
  cashRegisterId: string;
  clientId?: string;
  items: SaleItemInput[];
  payments: SalePaymentInput[];
  discountAmount?: number;
  channel?: string;
}

export interface SaleRow {
  id: string;
  status: string;
  totalAmount: number;
  discountAmount: number;
  changeDue: number;
  paymentMethod: string;
  channel: string;
  createdAt: string;
  itemCount: number;
}

const PAYMENT_METHODS = [
  'CASH',
  'DEBIT_CARD',
  'CREDIT_CARD',
  'PIX',
  'BOLETO',
  'STORE_CREDIT',
] as const;

/**
 * Normaliza o meio de pagamento para o enum `SalePaymentMethod`.
 *
 * Sem isto, um valor arbitrário vindo do PDV viraria erro de banco em vez de
 * erro de validação com mensagem útil. Termos PT-BR do PDV também são
 * aceitos porque é o que o operador digita.
 */
function normalizePaymentMethod(raw: string | undefined): (typeof PAYMENT_METHODS)[number] {
  const value = (raw ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');

  const aliases: Record<string, (typeof PAYMENT_METHODS)[number]> = {
    DINHEIRO: 'CASH',
    DEBITO: 'DEBIT_CARD',
    CARTAO_DEBITO: 'DEBIT_CARD',
    CARTAO: 'CREDIT_CARD',
    CARTAO_CREDITO: 'CREDIT_CARD',
    CREDITO: 'CREDIT_CARD',
    FIADO: 'STORE_CREDIT',
    CREDITO_INTERNO: 'STORE_CREDIT',
  };

  const resolved = aliases[value] ?? value;

  if (!PAYMENT_METHODS.includes(resolved as (typeof PAYMENT_METHODS)[number])) {
    throw new DomainError(
      'INVALID_PAYMENT_METHOD',
      `Meio de pagamento inválido: "${raw}". Use ${PAYMENT_METHODS.join(', ')}.`,
      400,
    );
  }

  return resolved as (typeof PAYMENT_METHODS)[number];
}

/** Estoque insuficiente — 422, não 500: é regra de negócio, não falha do sistema. */
export class InsufficientStockError extends DomainError {
  constructor(productName: string, available: number) {
    super(
      'INSUFFICIENT_STOCK',
      `Estoque insuficiente de "${productName}" (disponível: ${available}).`,
      422,
    );
  }
}

export class ExpiredBatchError extends DomainError {
  constructor(productName: string, batch: string, expiration: string) {
    super(
      'EXPIRED_BATCH',
      `"${productName}" — lote ${batch} venceu em ${expiration}. Venda bloqueada.`,
      422,
    );
  }
}

/**
 * Baixa de estoque FEFO (Cap. 6.2).
 *
 * Para produto com controle por lote, consome o lote de menor validade — é o
 * que reduz perda. Para produto sem lote, decremento direto.
 *
 * Exportada porque o webhook do iFood (Cap. 11.1) baixa o estoque de um pedido
 * de delivery sem passar pelo PDV — a mesma regra precisa valer nos dois
 * caminhos, senão um pedido do marketplace estouraria o estoque fisicamente.
 */
export async function deductStock(
  tx: Tx,
  tenantId: string,
  productId: string,
  quantity: number,
): Promise<void> {
  const product = await tx.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true, trackingType: true, stockQuantity: true },
  });

  if (!product) {
    throw new DomainError('PRODUCT_NOT_FOUND', 'Produto não encontrado.', 404);
  }

  if (product.trackingType === 'BATCH') {
    const batches = await tx.productBatch.findMany({
      where: { productId, quantity: { gt: 0 } },
      orderBy: { expirationDate: 'asc' },
    });

    const totalAvailable = batches.reduce((sum, b) => sum + Number(b.quantity), 0);
    if (totalAvailable < quantity) {
      throw new InsufficientStockError(product.name, totalAvailable);
    }

    // Lote vencido bloqueia a venda (Cap. 6.2) — usar vencido é descarte.
    const expired = batches.find((b) => b.expirationDate.getTime() < Date.now());
    if (expired && Number(expired.quantity) >= quantity) {
      throw new ExpiredBatchError(
        product.name,
        expired.batchNumber,
        expired.expirationDate.toLocaleDateString('pt-BR'),
      );
    }

    let remaining = quantity;
    for (const batch of batches) {
      if (remaining <= 0) break;
      const available = Number(batch.quantity);
      if (available <= 0) continue;
      if (batch.expirationDate.getTime() < Date.now()) continue;

      const take = Math.min(available, remaining);
      await tx.productBatch.update({
        where: { id: batch.id },
        data: { quantity: { decrement: take } },
      });
      await tx.stockMovement.create({
        data: {
          tenantId,
          productId,
          productBatchId: batch.id,
          type: 'SALE_OUT',
          quantity: new Prisma.Decimal(-take),
          reason: 'Venda PDV (FEFO)',
        },
      });
      remaining -= take;
    }

    if (remaining > 0) {
      throw new InsufficientStockError(product.name, totalAvailable);
    }

    await tx.product.update({
      where: { id: productId },
      data: { stockQuantity: { decrement: quantity } },
    });
    return;
  }

  const available = Number(product.stockQuantity);
  if (available < quantity) {
    throw new InsufficientStockError(product.name, available);
  }

  await tx.product.update({
    where: { id: productId },
    data: { stockQuantity: { decrement: quantity } },
  });

  await tx.stockMovement.create({
    data: {
      tenantId,
      productId,
      type: 'SALE_OUT',
      quantity: new Prisma.Decimal(-quantity),
      reason: 'Venda PDV',
    },
  });
}

export async function createSale(
  db: PrismaClient,
  tenantId: string,
  cashierId: string,
  input: CreateSaleInput,
): Promise<{ sale: SaleRow; idempotent: boolean }> {
  if (input.items.length === 0) {
    throw new DomainError('EMPTY_SALE', 'A venda precisa de ao menos um item.');
  }

  // Idempotência: o PDV offline reenvia a mesma venda ao reconectar.
  const existing = await db.sale.findFirst({
    where: { tenantId, idempotencyKey: input.idempotencyKey },
    include: { items: { select: { id: true } } },
  });

  if (existing) {
    const payments = await db.payment.findMany({ where: { tenantId, saleId: existing.id } });
    const paid = payments
      .filter((p) => p.status === 'CONFIRMED')
      .reduce((sum, p) => sum + Number(p.amount), 0);

    return {
      idempotent: true,
      sale: {
        id: existing.id,
        status: existing.status,
        totalAmount: Number(existing.totalAmount),
        discountAmount: Number(existing.discountAmount),
        changeDue: Math.max(0, paid - Number(existing.totalAmount)),
        paymentMethod: existing.paymentMethod,
        channel: existing.channel,
        createdAt: existing.createdAt.toISOString(),
        itemCount: existing.items.length,
      },
    };
  }

  const register = await db.cashRegister.findFirst({
    where: { id: input.cashRegisterId, tenantId, status: 'OPEN' },
  });
  if (!register) {
    throw new DomainError(
      'CASH_REGISTER_CLOSED',
      'Não há caixa aberto. Abra o caixa antes de registrar vendas.',
      409,
    );
  }

  const subtotal = input.items.reduce((sum, item) => {
    const unitPrice = item.unitPrice ?? 0;
    return sum + unitPrice * item.quantity;
  }, 0);

  // Preço não informado vem do catálogo — nunca fica 0 por omissão. Antes, um
  // item sem `unitPrice` gerava total errado (e até venda grátis) sem nenhum
  // erro para o operador.
  const missingPrice = input.items.filter((item) => item.unitPrice === undefined);
  const prices = missingPrice.length
    ? await db.product.findMany({
        where: { id: { in: missingPrice.map((item) => item.productId) } },
        select: { id: true, unitPrice: true },
      })
    : [];
  const priceByProduct = new Map(prices.map((p) => [p.id, Number(p.unitPrice)]));
  for (const item of missingPrice) {
    const catalogPrice = priceByProduct.get(item.productId);
    if (catalogPrice === undefined) {
      throw new DomainError(
        'PRODUCT_NOT_FOUND',
        'Um dos produtos da venda não existe mais no catálogo.',
        404,
      );
    }
    item.unitPrice = catalogPrice;
  }

  const discount = input.discountAmount ?? 0;
  const totalAmount = Math.round((subtotal - discount) * 100) / 100;
  const paid = input.payments.reduce((sum, p) => sum + p.amount, 0);
  const changeDue = Math.round(Math.max(0, paid - totalAmount) * 100) / 100;

  if (totalAmount <= 0) {
    throw new DomainError('INVALID_TOTAL', 'O total da venda deve ser maior que zero.');
  }

  // Venda a prazo consome limite de crédito (Cap. 4.6).
  const hasStoreCredit = input.payments.some((p) => p.method === 'STORE_CREDIT');
  if (hasStoreCredit && !input.clientId) {
    throw new DomainError(
      'CLIENT_REQUIRED',
      'Venda a prazo exige cliente identificado.',
      422,
    );
  }
  if (hasStoreCredit && input.clientId) {
    await assertCreditAvailable(db, tenantId, input.clientId, totalAmount);
  }

  const saleId = await db.$transaction(async (tx) => {
    const sale = await tx.sale.create({
      data: {
        tenantId,
        cashierId,
        cashRegisterId: input.cashRegisterId,
        clientId: input.clientId ?? null,
        status: 'COMPLETED',
        idempotencyKey: input.idempotencyKey,
        paymentMethod: normalizePaymentMethod(input.payments[0]?.method),
        totalAmount: new Prisma.Decimal(totalAmount),
        discountAmount: new Prisma.Decimal(discount),
        channel: input.channel ?? 'COUNTER',
        items: {
          create: input.items.map((item) => ({
            tenantId,
            productId: item.productId,
            productVariantId: item.productVariantId ?? null,
            quantity: new Prisma.Decimal(item.quantity),
            unitPrice: new Prisma.Decimal(item.unitPrice ?? 0),
            totalPrice: new Prisma.Decimal(
              Math.round((item.unitPrice ?? 0) * item.quantity * 100) / 100,
            ),
          })),
        },
      },
    });

    for (const item of input.items) {
      await deductStock(tx, tenantId, item.productId, item.quantity);
    }

    // O awaited aqui é obrigatório: PrismaPromise é preguiçosa, e um `void`
    // dentro da transação descarta a query — os pagamentos NUNCA eram gravados
    // (o caixa fechava com venda sem forma de pagamento registrada).
    for (const [index, payment] of input.payments.entries()) {
      await tx.payment.create({
        data: {
          tenantId,
          saleId: sale.id,
          method: normalizePaymentMethod(payment.method),
          status: 'CONFIRMED',
          amount: new Prisma.Decimal(payment.amount),
          tefAuthorizationCode: payment.tefAuthorizationCode ?? null,
          idempotencyKey: `${input.idempotencyKey}:pay:${index}`,
        },
      });
    }

    if (hasStoreCredit && input.clientId) {
      await tx.client.update({
        where: { id: input.clientId },
        data: { creditBalanceUsed: { increment: totalAmount } },
      });

      await tx.accountReceivable.create({
        data: {
          tenantId,
          clientId: input.clientId,
          saleId: sale.id,
          description: `Venda a prazo ${sale.id.slice(0, 8)}`,
          amount: new Prisma.Decimal(totalAmount),
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });
    }

    return sale.id;
  });

  const [sale, itemCount] = await Promise.all([
    db.sale.findUniqueOrThrow({ where: { id: saleId } }),
    db.saleItem.count({ where: { tenantId, saleId } }),
  ]);

  return {
    idempotent: false,
    sale: {
      id: sale.id,
      status: sale.status,
      totalAmount: Number(sale.totalAmount),
      discountAmount: Number(sale.discountAmount),
      changeDue,
      paymentMethod: sale.paymentMethod,
      channel: sale.channel,
      createdAt: sale.createdAt.toISOString(),
      itemCount,
    },
  };
}

export async function processRefund(
  db: PrismaClient,
  tenantId: string,
  saleId: string,
): Promise<{ refunded: boolean; items: number; amount: number }> {
  const sale = await db.sale.findFirst({
    where: { id: saleId, tenantId },
    include: { items: true, payments: true },
  });

  if (!sale) throw new DomainError('SALE_NOT_FOUND', 'Venda não encontrada.', 404);

  if (sale.status === 'REFUNDED') {
    throw new DomainError('ALREADY_REFUNDED', 'Esta venda já foi estornada.', 409);
  }

  await db.$transaction(async (tx) => {
    for (const item of sale.items) {
      const product = await tx.product.findUnique({
        where: { id: item.productId },
        select: { name: true, isReturnable: true },
      });

      // Produto não retornável (higiene) não volta ao estoque.
      if (!product?.isReturnable) continue;
      void product.name;

      const quantity = Number(item.quantity);
      await tx.product.update({
        where: { id: item.productId },
        data: { stockQuantity: { increment: quantity } },
      });

      await tx.stockMovement.create({
        data: {
          tenantId,
          productId: item.productId,
          type: 'RETURN',
          quantity: new Prisma.Decimal(quantity),
          reason: 'Estorno de venda',
        },
      });
    }

    await tx.payment.updateMany({
      where: { tenantId, saleId },
      data: { status: 'REFUNDED' },
    });

    await tx.sale.update({ where: { id: saleId }, data: { status: 'REFUNDED' } });

    if (sale.clientId) {
      const receivable = await tx.accountReceivable.findFirst({
        where: { tenantId, saleId, status: { in: ['PENDING', 'OVERDUE'] } },
      });
      if (receivable) {
        await tx.accountReceivable.update({
          where: { id: receivable.id },
          data: { status: 'CANCELLED' },
        });
        await tx.client.update({
          where: { id: sale.clientId },
          data: { creditBalanceUsed: { decrement: Number(sale.totalAmount) } },
        });
      }
    }
  });

  return {
    refunded: true,
    items: sale.items.length,
    amount: Number(sale.totalAmount),
  };
}