// src/services/stock/purchase-suggestion.service.ts — Cap. 4.1 (compras + curva ABC)
import { PrismaClient, Prisma } from "@prisma/client";

interface SuggestionInput {
  tenantId: string;
  /** Média móvel de giro (dias) — padrão 30 conforme Cap. 4.1. */
  windowDays?: number;
}

export interface PurchaseSuggestion {
  productId: string;
  sku: string;
  name: string;
  currentStock: Prisma.Decimal;
  minThreshold: Prisma.Decimal;
  avgDailySales: Prisma.Decimal;
  suggestedQuantity: Prisma.Decimal;
  supplierId: string | null;
}

/**
 * Sugestão automática de pedido de compra (Cap. 4.1):
 * estoque mínimo configurado por produto × velocidade de giro histórica
 * (média móvel de 30 dias).
 */
export async function generatePurchaseSuggestions(
  prisma: PrismaClient,
  input: SuggestionInput,
): Promise<PurchaseSuggestion[]> {
  const windowDays = input.windowDays ?? 30;
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const products = await prisma.product.findMany({
    where: {
      tenantId: input.tenantId,
      active: true,
      minStockThreshold: { not: null },
    },
    include: {
      supplier: { select: { id: true } },
      stockMovements: {
        where: {
          type: "SALE_OUT",
          createdAt: { gte: since },
        },
        select: { quantity: true, createdAt: true },
      },
    },
  });

  const suggestions: PurchaseSuggestion[] = [];

  for (const product of products) {
    const soldTotal = product.stockMovements.reduce(
      (sum, m) => sum.plus(m.quantity.abs()),
      new Prisma.Decimal(0),
    );
    const avgDailySales = soldTotal.dividedBy(windowDays);

    if (!product.minStockThreshold) continue;
    if (product.stockQuantity.greaterThanOrEqualTo(product.minStockThreshold)) {
      continue; // acima do mínimo — não sugerir
    }

    // Quantidade sugerida: repor até 30 dias de previsão de venda (sempre arredonda para cima).
    const target = avgDailySales.times(windowDays);
    const suggestedQuantity = new Prisma.Decimal(
      Math.ceil(Number(target.minus(product.stockQuantity))),
    );
    if (suggestedQuantity.lessThanOrEqualTo(0)) continue;

    suggestions.push({
      productId: product.id,
      sku: product.sku,
      name: product.name,
      currentStock: product.stockQuantity,
      minThreshold: product.minStockThreshold,
      avgDailySales: avgDailySales.toDecimalPlaces(2),
      suggestedQuantity,
      supplierId: product.supplierId,
    });
  }

  return suggestions.sort((a, b) =>
    a.avgDailySales.comparedTo(b.avgDailySales) ?? 0,
  ).reverse();
}

export interface AbcCurveEntry {
  productId: string;
  sku: string;
  name: string;
  revenue: Prisma.Decimal;
  cumulativeShare: number;
  class: "A" | "B" | "C";
}

/**
 * Curva ABC de giro (Cap. 4.1): prioriza reposição e negociação com fornecedor.
 * - A: 80% do faturamento
 * - B: 80–95%
 * - C: 95–100%
 */
export async function calculateAbcCurve(
  prisma: PrismaClient,
  input: { tenantId: string; windowDays?: number },
): Promise<AbcCurveEntry[]> {
  const windowDays = input.windowDays ?? 90;
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const saleItems = await prisma.saleItem.groupBy({
    by: ["productId"],
    where: { tenantId: input.tenantId, sale: { createdAt: { gte: since }, status: { in: ["PAID"] } } },
    _sum: { totalPrice: true },
  });

  const productIds = saleItems.map((s) => s.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, sku: true, name: true },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));

  const total = saleItems.reduce(
    (sum, s) => sum.plus(s._sum.totalPrice ?? 0),
    new Prisma.Decimal(0),
  );
  if (total.isZero()) return [];

  const sorted = [...saleItems].sort(
    (a, b) => Number(b._sum.totalPrice ?? 0) - Number(a._sum.totalPrice ?? 0),
  );

  let cumulative = new Prisma.Decimal(0);
  const entries: AbcCurveEntry[] = [];

  for (const item of sorted) {
    const revenue = item._sum.totalPrice ?? new Prisma.Decimal(0);
    cumulative = cumulative.plus(revenue);
    const share = cumulative.dividedBy(total).toNumber();
    const product = productMap.get(item.productId);

    entries.push({
      productId: item.productId,
      sku: product?.sku ?? "n/d",
      name: product?.name ?? "n/d",
      revenue,
      cumulativeShare: Number((share * 100).toFixed(2)),
      class: share <= 0.8 ? "A" : share <= 0.95 ? "B" : "C",
    });
  }

  return entries;
}
