// src/services/stock/expiry-alert.service.ts — Cap. 4.1 (alerta 30/60 dias)
import { PrismaClient } from "@prisma/client";

export interface ExpiryAlert {
  productId: string;
  productName: string;
  batchNumber: string;
  expirationDate: Date;
  quantity: number;
  daysToExpire: number;
  urgency: "CRITICAL" | "WARNING" | "INFO";
}

/**
 * Alerta de validade antecipado (Cap. 4.1): 30/60 dias para liquidar
 * produtos antes da perda total — fundamental para farmácia e mercado.
 */
export async function getExpiryAlerts(
  prisma: PrismaClient,
  input: { tenantId: string; warningDays?: number; criticalDays?: number },
): Promise<ExpiryAlert[]> {
  const warningDays = input.warningDays ?? 60;
  const criticalDays = input.criticalDays ?? 30;
  const warningLimit = new Date(Date.now() + warningDays * 24 * 60 * 60 * 1000);

  const batches = await prisma.productBatch.findMany({
    where: {
      tenantId: input.tenantId,
      quantity: { gt: 0 },
      expirationDate: { lte: warningLimit },
    },
    include: { product: { select: { id: true, name: true } } },
    orderBy: { expirationDate: "asc" },
  });

  const now = Date.now();

  return batches.map((batch) => {
    const daysToExpire = Math.ceil(
      (batch.expirationDate.getTime() - now) / (24 * 60 * 60 * 1000),
    );
    return {
      productId: batch.product.id,
      productName: batch.product.name,
      batchNumber: batch.batchNumber,
      expirationDate: batch.expirationDate,
      quantity: Number(batch.quantity),
      daysToExpire,
      urgency:
        daysToExpire <= criticalDays
          ? ("CRITICAL" as const)
          : daysToExpire <= warningDays
            ? ("WARNING" as const)
            : ("INFO" as const),
    };
  });
}

/**
 * Sugestão de liquidação pós-sazonal (Cap. 11.5): produtos com estoque acima
 * do esperado após janela sazonal encerrada → capital parado evitado.
 */
export async function getPostSeasonalLiquidation(
  prisma: PrismaClient,
  input: {
    tenantId: string;
    /** Tags de categoria em janela encerrada, ex.: ["Volta às Aulas"]. */
    seasonalCategoryTags: string[];
    windowEnd: Date;
  },
) {
  const products = await prisma.product.findMany({
    where: {
      tenantId: input.tenantId,
      active: true,
      category: { in: input.seasonalCategoryTags },
      updatedAt: { gte: input.windowEnd },
    },
    include: {
      stockMovements: {
        where: {
          createdAt: {
            gte: new Date(input.windowEnd.getTime() - 90 * 24 * 60 * 60 * 1000),
            lte: input.windowEnd,
          },
          type: "SALE_OUT",
        },
        select: { quantity: true },
      },
    },
  });

  return products
    .map((p) => {
      const soldInSeason = p.stockMovements.reduce(
        (sum, m) => sum + Math.abs(Number(m.quantity)),
        0,
      );
      const residualRatio =
        soldInSeason > 0 ? Number(p.stockQuantity) / soldInSeason : Infinity;
      return {
        productId: p.id,
        sku: p.sku,
        name: p.name,
        stockQuantity: Number(p.stockQuantity),
        soldInSeason,
        residualRatio,
      };
    })
    .filter((p) => p.residualRatio > 0.3) // >30% de sobra respecto ao giro da estação
    .sort((a, b) => b.residualRatio - a.residualRatio);
}
