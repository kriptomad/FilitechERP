// src/services/sales/create-sale.service.ts — Cap. 8.3 / 9.5 (idempotência)
import { Prisma, PrismaClient } from "@prisma/client";
import { deductStockFefo, InsufficientStockError } from "../stock/deduct-stock-fefo.service.js";

export class SaleAlreadyExistsError extends Error {}

export interface CreateSaleInput {
  tenantId: string;
  idempotencyKey: string;
  cashierId: string;
  cashRegisterId: string;
  clientId?: string;
  paymentMethod: "CASH" | "DEBIT_CARD" | "CREDIT_CARD" | "PIX" | "BOLETO" | "STORE_CREDIT";
  items: { productId: string; productVariantId?: string; quantity: number; unitPrice: number }[];
  amountTendered?: number;
}

export async function createSale(
  prisma: PrismaClient,
  input: CreateSaleInput,
) {
  // Idempotência: reenvio do Service Worker retorna a venda já criada (Cap. 9.5).
  const existing = await prisma.sale.findUnique({
    where: {
      tenantId_idempotencyKey: {
        tenantId: input.tenantId,
        idempotencyKey: input.idempotencyKey,
      },
    },
    include: { payments: true },
  });
  if (existing) {
    return { sale: existing, idempotent: true as const };
  }

  const totalAmount = input.items.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0,
  );

  const sale = await prisma.$transaction(
    async (tx) => {
      const created = await tx.sale.create({
        data: {
          tenantId: input.tenantId,
          idempotencyKey: input.idempotencyKey,
          cashierId: input.cashierId,
          cashRegisterId: input.cashRegisterId,
          clientId: input.clientId,
          paymentMethod: input.paymentMethod,
          status: "PAID",
          totalAmount,
          items: {
            create: input.items.map((item) => ({
              tenantId: input.tenantId,
              productId: item.productId,
              productVariantId: item.productVariantId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalPrice: item.quantity * item.unitPrice,
            })),
          },
          payments: {
            create: {
              tenantId: input.tenantId,
              method: input.paymentMethod,
              status: "CONFIRMED",
              amount: totalAmount,
              idempotencyKey: `${input.idempotencyKey}:payment`,
            },
          },
        },
        include: { items: true, payments: true },
      });

      // Baixa de estoque FEFO por item (lotes) — serial/variante segue caminho próprio.
      for (const item of created.items) {
        await deductStockFefo(tx as unknown as PrismaClient, {
          tenantId: input.tenantId,
          productId: item.productId,
          quantity: new Prisma.Decimal(item.quantity.toString()),
          saleItemId: item.id,
        });
      }

      // Crediário (STORE_CREDIT, Cap. 4.6): debita limite e gera conta a receber.
      if (input.paymentMethod === "STORE_CREDIT" && input.clientId) {
        const client = await tx.client.findUniqueOrThrow({
          where: { id: input.clientId },
        });
        const newUsed = client.creditBalanceUsed.plus(totalAmount);
        if (newUsed.greaterThan(client.creditLimit)) {
          throw new Error("LIMITE_CREDITO_EXCEDIDO");
        }
        await tx.client.update({
          where: { id: input.clientId },
          data: { creditBalanceUsed: newUsed },
        });
        await tx.accountReceivable.create({
          data: {
            tenantId: input.tenantId,
            clientId: input.clientId,
            saleId: created.id,
            description: `Venda fiada ${created.id}`,
            amount: totalAmount,
            dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        });
      }

      return created;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  return { sale, idempotent: false as const };
}

export { InsufficientStockError };
