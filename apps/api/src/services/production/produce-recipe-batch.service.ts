// src/services/production/produce-recipe-batch.service.ts — Cap. 6.3
import { Prisma, PrismaClient } from "@prisma/client";

interface ProduceRecipeBatchInput {
  tenantId: string;
  finishedProductId: string;
  quantityProduced: Prisma.Decimal;
  producedByUserId: string;
}

export class MissingIngredientStockError extends Error {}

export async function produceRecipeBatch(
  prisma: PrismaClient,
  input: ProduceRecipeBatchInput,
) {
  return prisma.$transaction(
    async (tx) => {
      const recipe = await tx.recipe.findUniqueOrThrow({
        where: { productId: input.finishedProductId },
        include: { items: { include: { ingredient: true } } },
      });

      const productionRatio = input.quantityProduced.dividedBy(
        recipe.yieldQuantity,
      );

      for (const item of recipe.items) {
        const requiredQuantity = item.quantityPerYield.times(productionRatio);

        const ingredient = await tx.$queryRaw<
          { id: string; stockQuantity: Prisma.Decimal }[]
        >`
          SELECT id, "stockQuantity" FROM products
          WHERE id = ${item.ingredientId} AND "tenantId" = ${input.tenantId}
          FOR UPDATE
        `;

        if (
          !ingredient[0] ||
          ingredient[0].stockQuantity.lessThan(requiredQuantity)
        ) {
          throw new MissingIngredientStockError(
            `Insumo ${item.ingredientId} insuficiente para a fornada (necessário ${requiredQuantity.toString()}).`,
          );
        }

        await tx.product.update({
          where: { id: item.ingredientId },
          data: { stockQuantity: { decrement: requiredQuantity } },
        });

        await tx.stockMovement.create({
          data: {
            tenantId: input.tenantId,
            productId: item.ingredientId,
            type: "RECIPE_CONSUMPTION",
            quantity: requiredQuantity.negated(),
          },
        });
      }

      const productionBatch = await tx.productionBatch.create({
        data: {
          tenantId: input.tenantId,
          finishedProductId: input.finishedProductId,
          quantityProduced: input.quantityProduced,
          producedByUserId: input.producedByUserId,
          status: "PRODUCED",
        },
      });

      await tx.product.update({
        where: { id: input.finishedProductId },
        data: { stockQuantity: { increment: input.quantityProduced } },
      });

      await tx.stockMovement.create({
        data: {
          tenantId: input.tenantId,
          productId: input.finishedProductId,
          type: "PRODUCTION_CONSUMPTION",
          quantity: input.quantityProduced,
          referenceId: productionBatch.id,
        },
      });

      return productionBatch;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
