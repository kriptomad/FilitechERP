// src/routes/cash-register.routes.ts — Cap. 4.1 (abertura de caixa)
import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { gatekeeper } from "../middlewares/gatekeeper.middleware.js";
import { requireSession } from "../middlewares/session.middleware.js";
import { apiSuccess, apiError } from "../types/api-envelope.js";
import { openCashRegister, serializeRegisterForList } from "../services/cash-register/cash-register.service.js";

export const cashRegisterRouter = Router();

/** Lista caixas do tenant (gaveta cega: valores ocultos até CLOSED). */
cashRegisterRouter.get(
  "/cash-registers",
  requireSession,
  gatekeeper({ moduleCode: "pdv" }),
  async (req: Request, res: Response) => {
    const registers = await prisma.cashRegister.findMany({
      where: { tenantId: req.session!.tenantId },
      orderBy: { openedAt: "desc" },
      take: 50,
    });
    return res.json(apiSuccess(registers.map(serializeRegisterForList)));
  },
);

/** Abre um novo caixa (Cap. 4.1). */
cashRegisterRouter.post(
  "/cash-registers",
  requireSession,
  gatekeeper({ moduleCode: "pdv", requiredPermission: "pdv:sell" }),
  async (req: Request, res: Response) => {
    const { openingAmount = 0 } = req.body ?? {};
    try {
      const register = await openCashRegister(prisma as never, {
        tenantId: req.session!.tenantId,
        openedById: req.session!.userId,
        openingAmount: Number(openingAmount),
      });
      return res.status(201).json(apiSuccess(serializeRegisterForList(register)));
    } catch (err) {
      if (err instanceof Error && err.message.includes("Já existe um caixa aberto")) {
        return res.status(409).json(apiError("REGISTER_ALREADY_OPEN", err.message));
      }
      throw err;
    }
  },
);
