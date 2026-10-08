// src/services/sales/refund.service.ts — Cap. 4.6 (devolução de venda)
import { Prisma, PrismaClient } from "@prisma/client";

export class SaleNotFoundError extends Error {}
export class SaleAlreadyRefundedError extends Error {}

/**
 * Devolução de venda (Cap. 4.6): estorna o pagamento, retorna o estoque
 * dos itens e marca a venda como REFUNDED. Atualiza o saldo de crédito do
 * cliente se a venda foi fiada (STORE_CREDIT).
 */
export async function processRefund(
  prisma: PrismaClient,
  input: { tenantId: string; saleId: string; reason?: string },
) {
  return prisma.$transaction(
    async (tx) => {
      const sale = await tx.sale.findFirst({
        where: { id: input.saleId, tenantId: input.tenantId },
        include: { items: true, payments: true, client: true },
      });
      if (!sale) throw new SaleNotFoundError("Venda não encontrada.");
      if (sale.status === "REFUNDED") throw new SaleAlreadyRefundedError("Venda já foi devolvida.");
      if (sale.status === "CANCELLED") throw new SaleAlreadyRefundedError("Venda está cancelada.");

      // Retorna o estoque dos itens
      for (const item of sale.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stockQuantity: { increment: item.quantity } },
        });
        await tx.stockMovement.create({
          data: {
            tenantId: input.tenantId,
            productId: item.productId,
            type: "RETURN",
            quantity: item.quantity,
            referenceId: sale.id,
          },
        });
      }

      // Estorna o pagamento
      for (const payment of sale.payments) {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: "REFUNDED" },
        });
      }

      // Se foi fiada (STORE_CREDIT), debita o saldo do cliente
      if (sale.paymentMethod === "STORE_CREDIT" && sale.clientId) {
        await tx.client.update({
          where: { id: sale.clientId },
          data: { creditBalanceUsed: { decrement: sale.totalAmount } },
        });
      }

      // Marca a venda como devolvida
      const updated = await tx.sale.update({
        where: { id: sale.id },
        data: { status: "REFUNDED" },
      });

      return { saleId: updated.id, status: updated.status, refundedAmount: Number(sale.totalAmount) };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
