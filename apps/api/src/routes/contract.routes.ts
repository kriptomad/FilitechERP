// src/routes/contract.routes.ts — emissão de contrato de serviço
import { Router, Request, Response, NextFunction } from "express";
import { requireSession } from "../middlewares/session.middleware.js";
import { apiSuccess, apiError } from "../types/api-envelope.js";
import { roleHasPermission } from "../auth/role-permissions.js";
import { prisma } from "../lib/prisma.js";
import {
  ContractError,
  listContracts,
  getContract,
  createContract,
  signContract,
  cancelContract,
  generateContractPdf,
} from "../services/contracts/service-contract.service.js";

export const contractRouter = Router();

type AsyncRoute = (req: Request, res: Response) => Promise<unknown>;

function handle(fn: AsyncRoute) {
  return (req: Request, res: Response, next: NextFunction): void => {
    void fn(req, res).catch((err: unknown) => {
      if (err instanceof ContractError) {
        res.status(err.status).json(apiError(err.code, err.message, err.details));
        return;
      }
      next(err);
    });
  };
}

async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { tenantId, userId, role } = req.session!;
    const overrides = await prisma.rolePermission.findMany({
      where: { tenantId, userId },
      select: { permission: true, granted: true },
    });
    if (!roleHasPermission(role, "billing:manage", overrides)) {
      res.status(403).json(apiError("FORBIDDEN", "Seu nível de acesso não permite esta ação."));
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
}

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

contractRouter.get(
  "/contracts",
  requireSession,
  handle(async (req, res) => {
    const status = asString(req.query.status);
    const contracts = await listContracts(status);
    return res.json(apiSuccess(contracts));
  }),
);

contractRouter.get(
  "/contracts/:id",
  requireSession,
  handle(async (req, res) => {
    const result = await getContract(req.params.id);
    return res.json(apiSuccess(result));
  }),
);

contractRouter.post(
  "/contracts",
  requireSession,
  requireAdmin,
  handle(async (req, res) => {
    const contract = await createContract(req.body);
    return res.status(201).json(apiSuccess(contract));
  }),
);

contractRouter.post(
  "/contracts/:id/sign",
  requireSession,
  requireAdmin,
  handle(async (req, res) => {
    const contract = await signContract(req.params.id);
    return res.json(apiSuccess(contract));
  }),
);

contractRouter.post(
  "/contracts/:id/cancel",
  requireSession,
  requireAdmin,
  handle(async (req, res) => {
    const contract = await cancelContract(req.params.id);
    return res.json(apiSuccess(contract));
  }),
);

contractRouter.post(
  "/contracts/:id/pdf",
  requireSession,
  requireAdmin,
  handle(async (req, res) => {
    const result = await generateContractPdf(req.params.id);
    return res.json(apiSuccess(result));
  }),
);
