// src/webhooks/ifood-webhook.ts — Cap. 11.1 (pedidos iFood → Sale)
import { Router, Request, Response } from "express";
import { prisma, prismaUnscoped } from "../lib/prisma.js";
import { apiSuccess, apiError } from "../types/api-envelope.js";
import { logger } from "../lib/logger.js";
import { deductStockFefo } from "../services/stock/deduct-stock-fefo.service.js";
import { Prisma } from "@prisma/client";

export const ifoodRouter = Router();

/**
 * Webhook iFood (Cap. 11.1): pedido do marketplace chega como `Sale` do
 * canal DELIVERY — baixa de estoque e emissão fiscal automáticas,
 * eliminando a re-digitação manual (principal causa de erro operacional).
 *
 * Autenticação: header `x-ifood-signature` validado com HMAC-SHARED-SECRET.
 */
ifoodRouter.post(
  "/webhooks/ifood",
  async (req: Request, res: Response) => {
    const signature = req.headers["x-ifood-signature"];
    if (!process.env.IFOOD_WEBHOOK_SECRET) {
      return res.status(500).json(apiError("IFOOD_NOT_CONFIGURED", "Segredo do iFood não configurado."));
    }
    if (signature !== process.env.IFOOD_WEBHOOK_SECRET) {
      return res.status(401).json(apiError("INVALID_SIGNATURE", "Assinatura inválida."));
    }

    const event = req.body;
    const merchantId: string | undefined = event?.merchantId;
    const externalId: string | undefined = event?.id;

    if (!merchantId || !externalId) {
      return res.status(400).json(apiError("INVALID_PAYLOAD", "merchantId e id são obrigatórios."));
    }

    // Mapa merchant → tenant (tabela de configuração de integrações por tenant).
    const tenant = await prismaUnscoped.tenant.findFirst({
      where: { slug: merchantId },
      select: { id: true },
    });
    if (!tenant) {
      // 200 para evitar reentrega infinita do iFood em tenant desconhecido.
      return res.json(apiSuccess({ ignored: true, reason: "unknown_merchant" }));
    }

    if (event.type !== "ORDER_CREATED" && event.type !== "CONFIRMED") {
      return res.json(apiSuccess({ ignored: true, reason: "event_type" }));
    }

    // Idempotência: mesmo externalId não gera venda duplicada.
    const idempotencyKey = `ifood-${externalId}`;
    const existing = await prisma.sale.findUnique({
      where: {
        tenantId_idempotencyKey: { tenantId: tenant.id, idempotencyKey },
      },
    });
    if (existing) {
      return res.json(apiSuccess({ saleId: existing.id, idempotent: true }));
    }

    try {
      const sale = await prisma.$transaction(
        async (tx) => {
          // Precisa de um caixa aberto dedicado ao canal delivery.
          let deliveryRegister = await tx.cashRegister.findFirst({
            where: { tenantId: tenant.id, status: "OPEN" },
          });
          if (!deliveryRegister) {
            deliveryRegister = await tx.cashRegister.create({
              data: {
                tenantId: tenant.id,
                openedById: (await tx.user.findFirst({
                  where: { tenantId: tenant.id, role: "OWNER" },
                  select: { id: true },
                }))!.id,
                openingAmount: 0,
                status: "OPEN",
              },
            });
          }

          const ownerUser = await tx.user.findFirst({
            where: { tenantId: tenant.id, role: "OWNER" },
            select: { id: true },
          });

          const items = (event.items ?? []) as {
            index: number;
            name: string;
            unitPrice: number;
            quantity: number;
            ean?: string;
          }[];

          const totalAmount = items.reduce(
            (sum, i) => sum + i.unitPrice * i.quantity,
            0,
          );

          const created = await tx.sale.create({
            data: {
              tenantId: tenant.id,
              idempotencyKey,
              cashierId: ownerUser!.id,
              cashRegisterId: deliveryRegister.id,
              paymentMethod: "CREDIT_CARD", // iFood repassa cartão
              status: "PAID",
              channel: "DELIVERY",
              totalAmount,
              items: {
                create: await Promise.all(
                  items.map(async (item) => {
                    const product = item.ean
                      ? await tx.product.findUnique({
                          where: {
                            tenantId_barcode: { tenantId: tenant.id, barcode: item.ean },
                          },
                        })
                      : await tx.product.findFirst({
                          where: { tenantId: tenant.id, name: item.name },
                        });

                    if (!product) {
                      throw new Error(
                        `Produto do pedido iFood não mapeado: "${item.name}" (EAN ${item.ean ?? "n/d"}).`,
                      );
                    }

                    return {
                      tenantId: tenant.id,
                      productId: product.id,
                      quantity: item.quantity,
                      unitPrice: item.unitPrice,
                      totalPrice: item.unitPrice * item.quantity,
                    };
                  }),
                ),
              },
            },
            include: { items: true },
          });

          // Baixa de estoque automática (cada item vendido via delivery).
          for (const item of created.items) {
            await deductStockFefo(tx, {
              tenantId: tenant.id,
              productId: item.productId,
              quantity: new Prisma.Decimal(item.quantity.toString()),
              saleItemId: item.id,
            });
          }

          return created;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      logger.info(
        { externalId, tenantId: tenant.id, saleId: sale.id },
        "ifood_order_created",
      );
      return res.status(201).json(apiSuccess({ saleId: sale.id }));
    } catch (err) {
      logger.error({ err, externalId }, "ifood_order_failed");
      return res
        .status(422)
        .json(apiError("IFOOD_ORDER_FAILED", err instanceof Error ? err.message : "Falha ao processar pedido."));
    }
  },
);
