// src/services/beverage-store/container-ledger.service.ts — Cap. 4.3 (cascos)
import { Prisma, PrismaClient } from "@prisma/client";

export class ContainerAlreadyReturnedError extends Error {}

/**
 * Conta-corrente de cascos — PATRIMÔNIO DA DISTRIBUIDORA, não do cliente (Cap. 4.3).
 * Separada da conta-corrente financeira: rastreia posse FÍSICA do vasilhame.
 */
export class ContainerLedgerService {
  constructor(private readonly prisma: PrismaClient) {}

  /** Venda de produto retornável → lançamento BORROWED. */
  async borrow(params: {
    tenantId: string;
    clientId: string;
    productId: string;
    quantity: number;
    saleId?: string;
  }) {
    return this.prisma.returnableContainerLedger.create({
      data: {
        tenantId: params.tenantId,
        clientId: params.clientId,
        productId: params.productId,
        direction: "BORROWED",
        quantity: params.quantity,
        saleId: params.saleId,
      },
    });
  }

  /** Devolução do casco → lançamento RETURNED. */
  async giveBack(params: {
    tenantId: string;
    clientId: string;
    productId: string;
    quantity: number;
    saleId?: string;
  }) {
    const outstanding = await this.outstanding(
      params.tenantId,
      params.clientId,
      params.productId,
    );
    if (outstanding < params.quantity) {
      throw new ContainerAlreadyReturnedError(
        `Cliente não possui ${params.quantity} casco(s) em aberto para este produto (saldo: ${outstanding}).`,
      );
    }

    return this.prisma.returnableContainerLedger.create({
      data: {
        tenantId: params.tenantId,
        clientId: params.clientId,
        productId: params.productId,
        direction: "RETURNED",
        quantity: params.quantity,
        saleId: params.saleId,
      },
    });
  }

  /** Saldo de posse: BORROWED - RETURNED por cliente/produto. */
  async outstanding(tenantId: string, clientId: string, productId: string) {
    const rows = await this.prisma.returnableContainerLedger.groupBy({
      by: ["direction"],
      where: { tenantId, clientId, productId },
      _sum: { quantity: true },
    });

    let borrowed = 0;
    let returned = 0;
    for (const row of rows) {
      if (row.direction === "BORROWED") borrowed = row._sum.quantity ?? 0;
      if (row.direction === "RETURNED") returned = row._sum.quantity ?? 0;
    }
    return borrowed - returned;
  }

  /**
   * Cascos não devolvidos há mais de `days` → sugere cobrança do valor de
   * reposição como item avulso na próxima venda (Cap. 4.3).
   */
  async suggestReplacementCharge(
    tenantId: string,
    clientId: string,
    days = 30,
  ) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const overdue = await this.prisma.returnableContainerLedger.groupBy({
      by: ["productId"],
      where: {
        tenantId,
        clientId,
        direction: "BORROWED",
        createdAt: { lt: cutoff },
      },
      _sum: { quantity: true },
    });

    const suggestions: {
      productId: string;
      quantity: number;
      replacementValue: Prisma.Decimal;
    }[] = [];

    for (const row of overdue) {
      const outstanding = await this.outstanding(
        tenantId,
        clientId,
        row.productId,
      );
      if (outstanding <= 0) continue;

      const product = await this.prisma.product.findUnique({
        where: { id: row.productId },
        select: { unitPrice: true },
      });
      if (!product) continue;

      suggestions.push({
        productId: row.productId,
        quantity: outstanding,
        replacementValue: product.unitPrice,
      });
    }

    return suggestions;
  }
}
