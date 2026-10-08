// src/routes/niche.routes.ts — Cap. 6.5 / 11.1 / 11.6 — rotas dos nichos
import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { gatekeeper } from "../middlewares/gatekeeper.middleware.js";
import { requireSession } from "../middlewares/session.middleware.js";
import { apiSuccess, apiError } from "../types/api-envelope.js";
import { importNfeXml, DuplicateNfeError, UnmatchedProductError } from "../services/fiscal/import-nfe-xml.service.js";
import { closeComanda, ComandaNotOpenError, ComandaEmptyError } from "../services/restaurant/close-comanda.service.js";
import { AppointmentService, ProfessionalConflictError } from "../services/scheduling/appointment.service.js";
import { generatePurchaseSuggestions, calculateAbcCurve } from "../services/stock/purchase-suggestion.service.js";
import { getExpiryAlerts } from "../services/stock/expiry-alert.service.js";
import { ContainerLedgerService } from "../services/beverage-store/container-ledger.service.js";

export const nicheRouter = Router();
const appointments = new AppointmentService(prisma as never);
const containers = new ContainerLedgerService(prisma as never);

/** Cap. 6.5 — importação de XML de NF-e de compra (financeiro + estoque atômicos). */
nicheRouter.post(
  "/fiscal/nfe-import",
  requireSession,
  gatekeeper({ moduleCode: "fiscal", requiredPermission: "fiscal:emit" }),
  async (req: Request, res: Response) => {
    const { xmlBase64, xmlStorageKey } = req.body ?? {};
    if (!xmlBase64) {
      return res.status(400).json(apiError("VALIDATION_ERROR", "xmlBase64 é obrigatório."));
    }
    try {
      const result = await importNfeXml(prisma as never, {
        tenantId: req.session!.tenantId,
        xmlBuffer: Buffer.from(xmlBase64, "base64"),
        xmlStorageKey: xmlStorageKey ?? `tenants/${req.session!.tenantId}/nfe-entry-xml/import.xml`,
      });
      return res.status(201).json(apiSuccess(result));
    } catch (err) {
      if (err instanceof DuplicateNfeError) {
        return res.status(409).json(apiError("DUPLICATE_NFE", err.message));
      }
      if (err instanceof UnmatchedProductError) {
        return res.status(422).json(apiError("UNMATCHED_PRODUCT", err.message));
      }
      throw err;
    }
  },
);

/** Cap. 11.1 — fechamento de comanda (restaurante/salão). */
nicheRouter.post(
  "/comandas/:id/close",
  requireSession,
  gatekeeper({ moduleCode: "restaurant-pos", requiredPermission: "pdv:sell" }),
  async (req: Request, res: Response) => {
    const { paymentMethod = "CASH", itemIds, cashRegisterId, idempotencyKey } = req.body ?? {};
    try {
      const sale = await closeComanda(prisma as never, {
        tenantId: req.session!.tenantId,
        comandaId: req.params.id,
        cashierId: req.session!.userId,
        cashRegisterId,
        paymentMethod,
        itemIds,
        idempotencyKey: idempotencyKey ?? `comanda-${req.params.id}-${Date.now()}`,
      });
      return res.status(201).json(apiSuccess({ saleId: sale.id, totalAmount: Number(sale.totalAmount) }));
    } catch (err) {
      if (err instanceof ComandaNotOpenError) {
        return res.status(409).json(apiError("COMANDA_NOT_OPEN", err.message));
      }
      if (err instanceof ComandaEmptyError) {
        return res.status(422).json(apiError("COMANDA_EMPTY", err.message));
      }
      throw err;
    }
  },
);

/** Cap. 11.3/11.6 — agendamento com conflito de profissional. */
nicheRouter.post(
  "/appointments",
  requireSession,
  gatekeeper({ moduleCode: "petshop", requiredPermission: "crm:write" }),
  async (req: Request, res: Response) => {
    const { clientId, serviceId, professionalId, scheduledAt, durationMinutes, petId, vehicleId } = req.body ?? {};
    try {
      const appointment = await appointments.book({
        tenantId: req.session!.tenantId,
        clientId,
        serviceId,
        professionalId,
        scheduledAt: new Date(scheduledAt),
        durationMinutes,
        petId,
        vehicleId,
      });
      return res.status(201).json(apiSuccess(appointment));
    } catch (err) {
      if (err instanceof ProfessionalConflictError) {
        return res.status(409).json(apiError("PROFESSIONAL_CONFLICT", err.message));
      }
      throw err;
    }
  },
);

nicheRouter.get(
  "/appointments/board",
  requireSession,
  gatekeeper({ moduleCode: "petshop", requiredPermission: "crm:read" }),
  async (req: Request, res: Response) => {
    const day = req.query.date ? new Date(String(req.query.date)) : new Date();
    const board = await appointments.dayBoard(req.session!.tenantId, day);
    return res.json(apiSuccess(board));
  },
);

/** Cap. 4.1 — sugestão de compra, curva ABC e alerta de validade. */
nicheRouter.get(
  "/stock/purchase-suggestions",
  requireSession,
  gatekeeper({ moduleCode: "estoque", requiredPermission: "estoque:purchase" }),
  async (req: Request, res: Response) => {
    const suggestions = await generatePurchaseSuggestions(prisma as never, {
      tenantId: req.session!.tenantId,
    });
    return res.json(apiSuccess(suggestions));
  },
);

nicheRouter.get(
  "/stock/abc-curve",
  requireSession,
  gatekeeper({ moduleCode: "estoque", requiredPermission: "report:read" }),
  async (req: Request, res: Response) => {
    const curve = await calculateAbcCurve(prisma as never, {
      tenantId: req.session!.tenantId,
    });
    return res.json(apiSuccess(curve));
  },
);

nicheRouter.get(
  "/stock/expiry-alerts",
  requireSession,
  gatekeeper({ moduleCode: "estoque", requiredPermission: "estoque:read" }),
  async (req: Request, res: Response) => {
    const alerts = await getExpiryAlerts(prisma as never, {
      tenantId: req.session!.tenantId,
    });
    return res.json(apiSuccess(alerts));
  },
);

/** Cap. 4.3 — saldo de cascos do cliente. */
nicheRouter.get(
  "/containers/outstanding/:clientId",
  requireSession,
  gatekeeper({ moduleCode: "liquor-ledger", requiredPermission: "estoque:read" }),
  async (req: Request, res: Response) => {
    const productId = String(req.query.productId ?? "");
    if (!productId) {
      return res.status(400).json(apiError("VALIDATION_ERROR", "productId é obrigatório."));
    }
    const outstanding = await containers.outstanding(
      req.session!.tenantId,
      req.params.clientId,
      productId,
    );
    return res.json(apiSuccess({ outstanding }));
  },
);
