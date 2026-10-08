// src/routes/admin.routes.ts — sistema de administração do portal (/painel)
// ─────────────────────────────────────────────────────────────────────────
// Endpoints de controle do próprio tenant: clientes, serviços e cobranças
// (contas a receber), consumidos pelo painel de administração da landing.
//
// Nível do portal (como /billing/* e /users/*): leitura exige sessão válida;
// toda MUTAÇÃO exige a permissão "billing:manage" da matriz padrão por Role
// (Cap. 5) com precedência dos overrides RolePermission por usuário. O lockout
// de módulo (Cap. 2.6/9.1, gatekeeper) pertence ao ERP operacional — aqui o
// dono precisa de acesso irrestrito à própria cobrança justamente para
// regularizar pendências.
// ─────────────────────────────────────────────────────────────────────────
import { Router, Request, Response, NextFunction } from "express";
import { requireSession } from "../middlewares/session.middleware.js";
import { apiSuccess, apiError } from "../types/api-envelope.js";
import { roleHasPermission } from "../auth/role-permissions.js";
import { prisma } from "../lib/prisma.js";
import {
  AdminError,
  RECEIVABLE_STATUSES,
  listClients,
  createClient,
  updateClient,
  deleteClient,
  listServices,
  createService,
  updateService,
  deleteService,
  listReceivables,
  createReceivable,
  payReceivable,
  cancelReceivable,
} from "../services/admin/portal-admin.service.js";

export const adminRouter = Router();

type AsyncRoute = (req: Request, res: Response) => Promise<unknown>;

/**
 * Traduz AdminError (domínio) para o envelope padrão (Cap. 9.1) e delega o
 * restante ao handler global de erros.
 */
function handle(fn: AsyncRoute) {
  return (req: Request, res: Response, next: NextFunction): void => {
    void fn(req, res).catch((err: unknown) => {
      if (err instanceof AdminError) {
        res.status(err.status).json(apiError(err.code, err.message, err.details));
        return;
      }
      next(err);
    });
  };
}

/** RBAC de mutação: permissão "billing:manage" (OWNER/MANAGER + overrides). */
async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenantId, userId, role } = req.session!;
    const overrides = await prisma.rolePermission.findMany({
      where: { tenantId, userId },
      select: { permission: true, granted: true },
    });
    if (!roleHasPermission(role, "billing:manage", overrides)) {
      res.status(403).json(
        apiError("FORBIDDEN", "Seu nível de acesso não permite esta ação."),
      );
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
}

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

// ── CLIENTES ─────────────────────────────────────────────────────────────

adminRouter.get(
  "/admin/clients",
  requireSession,
  handle(async (req, res) => {
    const clients = await listClients(asString(req.query.q));
    return res.json(apiSuccess(clients));
  }),
);

adminRouter.post(
  "/admin/clients",
  requireSession,
  requireAdmin,
  handle(async (req, res) => {
    const client = await createClient(req.body);
    return res.status(201).json(apiSuccess(client));
  }),
);

adminRouter.patch(
  "/admin/clients/:id",
  requireSession,
  requireAdmin,
  handle(async (req, res) => {
    const client = await updateClient(req.params.id, req.body);
    return res.json(apiSuccess(client));
  }),
);

adminRouter.delete(
  "/admin/clients/:id",
  requireSession,
  requireAdmin,
  handle(async (req, res) => {
    const result = await deleteClient(req.params.id);
    return res.json(apiSuccess(result));
  }),
);

// ── SERVIÇOS ─────────────────────────────────────────────────────────────

adminRouter.get(
  "/admin/services",
  requireSession,
  handle(async (_req, res) => {
    return res.json(apiSuccess(await listServices()));
  }),
);

adminRouter.post(
  "/admin/services",
  requireSession,
  requireAdmin,
  handle(async (req, res) => {
    const service = await createService(req.body);
    return res.status(201).json(apiSuccess(service));
  }),
);

adminRouter.patch(
  "/admin/services/:id",
  requireSession,
  requireAdmin,
  handle(async (req, res) => {
    const service = await updateService(req.params.id, req.body);
    return res.json(apiSuccess(service));
  }),
);

adminRouter.delete(
  "/admin/services/:id",
  requireSession,
  requireAdmin,
  handle(async (req, res) => {
    const result = await deleteService(req.params.id);
    return res.json(apiSuccess(result));
  }),
);

// ── COBRANÇAS (CONTAS A RECEBER) ─────────────────────────────────────────

adminRouter.get(
  "/admin/receivables",
  requireSession,
  handle(async (req, res) => {
    const rawStatus = asString(req.query.status);
    const status = RECEIVABLE_STATUSES.find((value) => value === rawStatus);
    const receivables = await listReceivables(status, asString(req.query.clientId));
    return res.json(apiSuccess(receivables));
  }),
);

adminRouter.post(
  "/admin/receivables",
  requireSession,
  requireAdmin,
  handle(async (req, res) => {
    const receivable = await createReceivable(req.body);
    return res.status(201).json(apiSuccess(receivable));
  }),
);

adminRouter.post(
  "/admin/receivables/:id/pay",
  requireSession,
  requireAdmin,
  handle(async (req, res) => {
    return res.json(apiSuccess(await payReceivable(req.params.id)));
  }),
);

adminRouter.post(
  "/admin/receivables/:id/cancel",
  requireSession,
  requireAdmin,
  handle(async (req, res) => {
    return res.json(apiSuccess(await cancelReceivable(req.params.id)));
  }),
);
