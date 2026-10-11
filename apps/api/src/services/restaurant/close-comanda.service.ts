// src/services/restaurant/close-comanda.service.ts — Cap. 11.1 (comanda → Sale)
import { Prisma, PrismaClient } from "@prisma/client";
import { deductStockFefo, InsufficientStockError } from "../stock/deduct-stock-fefo.service.js";

export class ComandaNotOpenError extends Error {}
export class ComandaEmptyError extends Error {}

/**
 * Fechamento de comanda (Cap. 11.1): transforma os itens acumulados em uma
 * `Sale` efetiva — ATÔMICO (estoque + venda + comanda na mesma transação),
 * permitindo dividir a conta entre comansais antes da baixa fiscal.
 *
 * O estoque dos itens lançados no KDS já foi consumido no lançamento
 * (baixa no instante do envio à cozinha); aqui apenas registra a venda.
 */
export async function closeComanda(
  prisma: PrismaClient,
  input: {
    tenantId: string;
    comandaId: string;
    cashierId: string;
    cashRegisterId: string;
    clientId?: string;
    paymentMethod: "CASH" | "DEBIT_CARD" | "CREDIT_CARD" | "PIX" | "BOLETO" | "STORE_CREDIT";
    /** Rateio opcional: fecha apenas parte da comanda (dividir conta). */
    itemIds?: string[];
    idempotencyKey: string;
  },
) {
  return prisma.$transaction(
    async (tx) => {
      const comanda = await tx.comanda.findFirst({
        where: { id: input.comandaId, tenantId: input.tenantId },
        include: { items: true },
      });
      if (!comanda) throw new ComandaNotOpenError("Comanda não encontrada ou já fechada.");
      if (comanda.status !== "OPEN") throw new ComandaNotOpenError("Comanda não está aberta.");

      const itemsToClose = input.itemIds?.length
        ? comanda.items.filter((i) => input.itemIds!.includes(i.id))
        : comanda.items;

      if (itemsToClose.length === 0) throw new ComandaEmptyError("Comanda sem itens para fechar.");

      const totalAmount = itemsToClose.reduce(
        (sum, item) => sum + Number(item.unitPrice) * Number(item.quantity),
        0,
      );

      // Venda com todos os itens da comanda (canal DINE_IN).
      const sale = await tx.sale.create({
        data: {
          tenantId: input.tenantId,
          cashierId: input.cashierId,
          cashRegisterId: input.cashRegisterId,
          clientId: input.clientId ?? comanda.clientId,
          idempotencyKey: input.idempotencyKey,
          paymentMethod: input.paymentMethod,
          status: "PAID",
          channel: "DINE_IN",
          totalAmount,
          items: {
            create: await Promise.all(
              itemsToClose.map(async (item) => {
                // Itens de produto baixaram estoque no KDS; itens de serviço não.
                const productId =
                  item.productId ??
                  (await resolveServiceAsProduct(tx, input.tenantId, item.serviceId));
                return {
                  tenantId: input.tenantId,
                  productId: productId!,
                  quantity: Number(item.quantity),
                  unitPrice: Number(item.unitPrice),
                  totalPrice: Number(item.quantity) * Number(item.unitPrice),
                };
              }),
            ),
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
        include: { items: true },
      });

      // Fecha a comanda apontando para a venda (1:1 via saleId unique).
      const remaining = comanda.items.length - itemsToClose.length;
      await tx.comanda.update({
        where: { id: comanda.id },
        data:
          remaining === 0
            ? { status: "CLOSED", saleId: sale.id, closedAt: new Date() }
            : { status: "OPEN" }, // rateio parcial — comanda continua aberta
      });

      return sale;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

/**
 * Serviços não têm estoque — mapeamos para um produto-serviço genérico
 * se o lançamento da comanda veio apenas com serviceId.
 * Em produção: tabela `ServiceProductMap` por tenant.
 */
async function resolveServiceAsProduct(
  tx: Prisma.TransactionClient,
  tenantId: string,
  serviceId?: string | null,
): Promise<string | null> {
  if (!serviceId) return null;
  const service = await tx.service.findUnique({ where: { id: serviceId } });
  if (!service) return null;

  // Produto "SERVICO" placeholder criado no onboarding do nicho restaurante.
  const placeholder = await tx.product.findFirst({
    where: { sku: `SERVICO-${serviceId}` },
  });
  if (placeholder) return placeholder.id;

  const created = await tx.product.create({
    data: {
      tenantId,
      sku: `SERVICO-${serviceId}`,
      name: service.name,
      unitPrice: service.basePrice,
      trackingType: "NONE",
      // `unit` e `averageCost` são obrigatórios no schema (usados pela sugestão
      // de reposição do Cap. 17.8.3, que divide estoque por unidade de venda).
      // Serviço não tem estoque nem unidade de compra, então recebe os valores
      // neutros: "un" e custo igual ao preço — serviço não gera CMV de estoque.
      unit: "un",
      averageCost: service.basePrice,
    },
  });
  return created.id;
}

export { InsufficientStockError, deductStockFefo };
