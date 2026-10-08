// src/routes/work-order.routes.ts — Cap. 2.6 / 4.2 / 6.4
import { Router, Request, Response } from "express";
import { prisma, prismaUnscoped } from "../lib/prisma.js";
import { runWithTenantContext } from "../lib/tenant-context.js";
import { gatekeeper } from "../middlewares/gatekeeper.middleware.js";
import { requireSession } from "../middlewares/session.middleware.js";
import { apiSuccess, apiError } from "../types/api-envelope.js";
import { registerSseClient, publishViaRedis } from "../gateways/sse.gateway.js";
import { randomBytes } from "node:crypto";

export const workOrderRouter = Router();

workOrderRouter.post(
  "/work-orders",
  requireSession,
  gatekeeper({ moduleCode: "work-order", requiredPermission: "work-order:create" }),
  async (req: Request, res: Response) => {
    const { clientId, equipmentDescription, reportedIssue, checklistEntry } = req.body ?? {};
    if (!clientId || !equipmentDescription || !reportedIssue) {
      return res
        .status(400)
        .json(apiError("VALIDATION_ERROR", "clientId, equipmentDescription e reportedIssue são obrigatórios."));
    }

    const count = await prisma.workOrder.count({
      where: { tenantId: req.session!.tenantId },
    });
    const protocolNumber = `OS-${new Date().getFullYear()}-${String(count + 1).padStart(6, "0")}`;

    const workOrder = await prisma.workOrder.create({
      data: {
        tenantId: req.session!.tenantId,
        clientId,
        equipmentDescription,
        reportedIssue,
        status: "RECEIVED",
        ...(checklistEntry?.items?.length
          ? {
              checklist: {
                create: {
                  tenantId: req.session!.tenantId,
                  stage: "ENTRY",
                  items: checklistEntry,
                },
              },
            }
          : {}),
      },
    });

    return res.status(201).json(
      apiSuccess({
        workOrderId: workOrder.id,
        status: workOrder.status,
        protocolNumber,
        whatsappApprovalPreviewUrl: null,
      }),
    );
  },
);

/** Cap. 4.2 — gera token de aprovação (uso único, expira com budgetValidUntil). */
workOrderRouter.patch(
  "/work-orders/:id/budget",
  requireSession,
  gatekeeper({ moduleCode: "work-order", requiredPermission: "work-order:budget" }),
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { validDays = 7 } = req.body ?? {};
    const budgetValidUntil = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000);
    const budgetApprovalToken = randomBytes(32).toString("hex");

    const updated = await prisma.workOrder.update({
      where: { id },
      data: { status: "AWAITING_APPROVAL", budgetValidUntil, budgetApprovalToken },
    });

    return res.json(
      apiSuccess({
        workOrderId: updated.id,
        status: updated.status,
        budgetValidUntil: updated.budgetValidUntil,
        whatsappApprovalUrl: `https://app.filitecherp.com.br/aprovar/${budgetApprovalToken}`,
      }),
    );
  },
);

  /** Cap. 6.4 — aprovação pública via link do WhatsApp (uso único). */
workOrderRouter.post(
  "/work-orders/approve",
  async (req: Request, res: Response) => {
    const { token } = req.body ?? {};
    if (!token) {
      return res.status(400).json(apiError("VALIDATION_ERROR", "token é obrigatório."));
    }

    // Rota PÚBLICA (sem sessão): resolve o tenant pelo token com o cliente
    // não-escopado e roda a aprovação DENTRO do contexto do tenant dono da O.S.
    const owner = await prismaUnscoped.workOrder.findFirst({
      where: { budgetApprovalToken: token },
      select: { tenantId: true },
    });
    if (!owner) {
      // Token já consumido (clique duplo pós-aprovação) ou inexistente.
      return res
        .status(409)
        .json(apiError("BUDGET_ALREADY_PROCESSED", "Orçamento já aprovado ou link inválido."));
    }

    const { approveBudget, BudgetExpiredError } = await import(
      "../services/work-order/approve-budget.service.js"
    );

    try {
      const wo = await runWithTenantContext(
        { tenantId: owner.tenantId, userId: "public-approval-link", role: "OWNER" },
        () => approveBudget(prisma as never, token),
      );
      await publishViaRedis(wo.tenantId, wo.id, "status-changed", { status: wo.status });
      return res.json(apiSuccess({ workOrderId: wo.id, status: wo.status }));
    } catch (err) {
      if (err instanceof BudgetExpiredError) {
        return res.status(410).json(apiError("BUDGET_EXPIRED", err.message));
      }
      throw err;
    }
  },
);

/** Cap. 8.2 — stream de status ao vivo. */
workOrderRouter.get(
  "/work-orders/:id/events",
  requireSession,
  gatekeeper({ moduleCode: "work-order" }),
  async (req: Request, res: Response) => {
    const cleanup = registerSseClient(req.session!.tenantId, req.params.id, res);
    req.on("close", cleanup);
  },
);
