// src/services/crm/loyalty.service.ts — Cap. 4.1 (fidelidade)
import { Prisma, PrismaClient } from "@prisma/client";

const POINTS_PER_REAL = 1; // 1 ponto por R$ 1,00 gasto
const POINT_VALUE_BRL = 0.05; // cada ponto vale R$ 0,05 em resgate

/**
 * Programa de fidelidade (Cap. 4.1): pontos por valor gasto, resgate em desconto.
 * Alimentado pelo histórico de compras do cliente cadastrado via CPF na nota.
 */
export class LoyaltyService {
  constructor(private readonly prisma: PrismaClient) {}

  async getBalance(tenantId: string, clientId: string) {
    const earned = await this.totalEarned(tenantId, clientId);
    const redeemed = await this.totalRedeemed(tenantId, clientId);
    const points = earned - redeemed;
    return { points, valueBrl: points * POINT_VALUE_BRL };
  }

  private async totalEarned(tenantId: string, clientId: string): Promise<number> {
    const sales = await this.prisma.sale.findMany({
      where: { tenantId, clientId, status: { in: ["PAID", "REFUNDED"] } },
      select: { totalAmount: true, status: true },
    });
    return sales.reduce((sum, s) => {
      const points = Math.floor(Number(s.totalAmount) * POINTS_PER_REAL);
      return sum + (s.status === "REFUNDED" ? -points : points);
    }, 0);
  }

  private async totalRedeemed(tenantId: string, clientId: string): Promise<number> {
    // Resgates registrados como desconto negativo em vendas (discountAmount com motivo LOYALTY).
    const redemptions = await this.prisma.sale.findMany({
      where: {
        tenantId,
        clientId,
        discountAmount: { gt: 0 },
        status: { in: ["PAID", "OPEN"] },
      },
      select: { discountAmount: true },
    });
    // Cada R$ 1,00 de desconto = 20 pontos resgatados.
    return redemptions.reduce(
      (sum, r) => sum + Math.floor(Number(r.discountAmount) * 20),
      0,
    );
  }

  /** Aplica resgate como desconto na venda — nunca deixa saldo negativo. */
  async redeem(params: {
    tenantId: string;
    clientId: string;
    saleId: string;
    pointsToRedeem: number;
  }) {
    const balance = await this.getBalance(params.tenantId, params.clientId);
    if (params.pointsToRedeem > balance.points) {
      throw new Error("INSUFFICIENT_POINTS");
    }

    const discountBrl = new Prisma.Decimal(params.pointsToRedeem)
      .times(POINT_VALUE_BRL)
      .toDecimalPlaces(2);

    return this.prisma.sale.update({
      where: { id: params.saleId },
      data: { discountAmount: { increment: discountBrl } },
    });
  }
}
