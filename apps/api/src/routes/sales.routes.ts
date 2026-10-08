// src/routes/sales.routes.ts — Cap. 9.5 (sincronização offline)
import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { gatekeeper } from "../middlewares/gatekeeper.middleware.js";
import { requireSession } from "../middlewares/session.middleware.js";
import { apiSuccess, apiError } from "../types/api-envelope.js";
import {
  createSale,
  InsufficientStockError,
} from "../services/sales/create-sale.service.js";
import { processRefund, SaleNotFoundError, SaleAlreadyRefundedError } from "../services/sales/refund.service.js";

export const salesRouter = Router();

/**
 * Catálogo para o PDV (Cap. 8.3): o front usa isto para hidratar o cache
 * offline (Dexie) — em modo offline o PDV lê só do snapshot local.
 */
salesRouter.get(
  "/products",
  requireSession,
  gatekeeper({ moduleCode: "pdv" }),
  async (req: Request, res: Response) => {
    const search =
      typeof req.query.search === "string" ? req.query.search.trim() : "";

    const products = await prisma.product.findMany({
      where: {
        active: true,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { sku: { contains: search, mode: "insensitive" } },
                { barcode: { contains: search } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        sku: true,
        barcode: true,
        name: true,
        unitPrice: true,
        stockQuantity: true,
        trackingType: true,
      },
      orderBy: { name: "asc" },
      take: 500,
    });

    return res.json(apiSuccess(products));
  },
);

salesRouter.post(
  "/sales",
  requireSession,
  gatekeeper({ moduleCode: "pdv" }),
  async (req: Request, res: Response) => {
    const idempotencyKey =
      req.headers["idempotency-key"] ?? req.body?.idempotencyKey;
    const { cashRegisterId, items, paymentMethod, amountTendered, clientId } =
      req.body ?? {};

    if (!idempotencyKey || !cashRegisterId || !Array.isArray(items) || items.length === 0) {
      return res
        .status(400)
        .json(apiError("VALIDATION_ERROR", "idempotencyKey, cashRegisterId e items são obrigatórios."));
    }

    try {
      const { sale, idempotent } = await createSale(prisma as never, {
        tenantId: req.session!.tenantId,
        idempotencyKey: String(idempotencyKey),
        cashierId: req.session!.userId,
        cashRegisterId,
        clientId,
        paymentMethod,
        amountTendered,
        items,
      });

      const totalAmount = Number(sale.totalAmount);
      const changeDue =
        paymentMethod === "CASH" && amountTendered
          ? Math.max(0, amountTendered - totalAmount)
          : 0;

      const payload = {
        saleId: sale.id,
        status: sale.status,
        totalAmount,
        changeDue,
        fiscalDocumentStatus: "PENDING",
        ...(idempotent
          ? { note: "Venda já processada anteriormente — retornando resultado idempotente." }
          : {}),
      };

      // 201 na primeira sincronização; 200 no reenvio idempotente (Cap. 9.5).
      return res.status(idempotent ? 200 : 201).json(apiSuccess(payload));
    } catch (err) {
      if (err instanceof InsufficientStockError) {
        // 422: erro de negócio → Service Worker marca FAILED (não retenta).
        return res.status(422).json(apiError("INSUFFICIENT_STOCK", err.message));
      }
      if (err instanceof Error && err.message === "LIMITE_CREDITO_EXCEDIDO") {
        return res.status(422).json(
          apiError("CREDIT_LIMIT_EXCEEDED", "Limite de crédito do cliente excedido."),
        );
      }
      throw err;
    }
  },
);

/** Cap. 4.6 — devolução de venda (estorno + retorno de estoque). */
salesRouter.post(
  "/sales/:id/refund",
  requireSession,
  gatekeeper({ moduleCode: "pdv" }),
  async (req: Request, res: Response) => {
    const { reason } = req.body ?? {};
    try {
      const result = await processRefund(prisma as never, {
        tenantId: req.session!.tenantId,
        saleId: req.params.id,
        reason,
      });
      return res.json(apiSuccess(result));
    } catch (err) {
      if (err instanceof SaleNotFoundError) {
        return res.status(404).json(apiError("NOT_FOUND", err.message));
      }
      if (err instanceof SaleAlreadyRefundedError) {
        return res.status(409).json(apiError("ALREADY_REFUNDED", err.message));
      }
      throw err;
    }
  },
);
