// src/services/stock/deduct-stock-fefo.service.ts — Cap. 6.2
import { Prisma, PrismaClient } from "@prisma/client";

interface DeductStockFefoInput {
  tenantId: string;
  productId: string;
  quantity: Prisma.Decimal;
  saleItemId: string;
}

export class ExpiredBatchBlockedError extends Error {}
export class InsufficientStockError extends Error {}

// Executor flexível: aceita PrismaClient, o client estendido por tenant
// (client.$extends) ou um TransactionClient — todos expõem os delegates usados.
// Delegates são `any` porque o client estendido tem genéricos incompatíveis
// estruturalmente com a base; o corpo interno segue tipado via TransactionClient.
export type FefoClient = {
  $queryRaw: (...args: any[]) => Promise<any>;
  $transaction?: (...args: any[]) => Promise<any>;
  productBatch: any;
  stockMovement: any;
  product: any;
};

export async function deductStockFefo(
  db: FefoClient,
  input: DeductStockFefoInput,
) {
  const body = async (tx: Prisma.TransactionClient) => {
      // Produtos SEM rastreio por lote (NONE/SERIAL): baixa direta no saldo —
      // FEFO só se aplica a trackingType = BATCH (Cap. 4.5/6.2).
      const product = await tx.product.findUniqueOrThrow({
        where: { id: input.productId },
        select: { trackingType: true, stockQuantity: true, name: true },
      });

      if (product.trackingType !== "BATCH") {
        if (product.stockQuantity.lessThan(input.quantity)) {
          throw new InsufficientStockError(
            `Estoque insuficiente para "${product.name}". Disponível: ${product.stockQuantity.toString()}, solicitado: ${input.quantity.toString()}.`,
          );
        }
        await tx.stockMovement.create({
          data: {
            tenantId: input.tenantId,
            productId: input.productId,
            type: "SALE_OUT",
            quantity: input.quantity.negated(),
            referenceId: input.saleItemId,
          },
        });
        await tx.product.update({
          where: { id: input.productId },
          data: { stockQuantity: { decrement: input.quantity } },
        });
        return [];
      }

      const batches = await tx.$queryRaw<
        { id: string; quantity: Prisma.Decimal; expirationDate: Date }[]
      >`
        SELECT id, quantity, "expirationDate"
        FROM product_batches
        WHERE "tenantId" = ${input.tenantId}
          AND "productId" = ${input.productId}
          AND quantity > 0
          AND "expirationDate" > NOW()
        ORDER BY "expirationDate" ASC
        FOR UPDATE
      `;

      let remaining = input.quantity;
      const movements: { batchId: string; quantityTaken: Prisma.Decimal }[] = [];

      for (const batch of batches) {
        if (remaining.lessThanOrEqualTo(0)) break;
        const quantityTaken = Prisma.Decimal.min(batch.quantity, remaining);

        await tx.productBatch.update({
          where: { id: batch.id },
          data: { quantity: { decrement: quantityTaken } },
        });

        await tx.stockMovement.create({
          data: {
            tenantId: input.tenantId,
            productId: input.productId,
            productBatchId: batch.id,
            type: "SALE_OUT",
            quantity: quantityTaken.negated(),
            referenceId: input.saleItemId,
          },
        });

        movements.push({ batchId: batch.id, quantityTaken });
        remaining = remaining.minus(quantityTaken);
      }

      if (remaining.greaterThan(0)) {
        throw new InsufficientStockError(
          `Estoque insuficiente dentro da validade para o produto ${input.productId}. Faltam ${remaining.toString()} unidades.`,
        );
      }

      await tx.product.update({
        where: { id: input.productId },
        data: { stockQuantity: { decrement: input.quantity } },
      });

      return movements;
  };

  // Transação externa (tx passado pelo caller) roda o corpo diretamente.
  if (db.$transaction) {
    return db.$transaction(body, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  }
  return body(db as unknown as Prisma.TransactionClient);
}
