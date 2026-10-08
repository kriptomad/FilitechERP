// src/routes/audit-log.routes.ts — AuditLog endpoints
import { Router, Request, Response } from "express";
import { requireSession } from "../middlewares/session.middleware.js";
import { apiSuccess, apiError } from "../types/api-envelope.js";
import { queryAuditLog, AuditAction } from "../lib/audit-log.js";
import { prismaUnscoped } from "../lib/prisma.js";

export const auditLogRouter = Router();

auditLogRouter.get(
  "/audit-log",
  requireSession,
  async (req: Request, res: Response) => {
    try {
      const { entityType, entityId, action, userId, from, to, limit, cursor } = req.query;
      const result = await queryAuditLog({
        tenantId: req.session!.tenantId,
        entityType: entityType as string,
        entityId: entityId as string,
        action: action as any,
        userId: userId as string,
        from: from ? new Date(from as string) : undefined,
        to: to ? new Date(to as string) : undefined,
        limit: limit ? parseInt(limit as string, 10) : 50,
        cursor: cursor as string,
      });
      res.json(apiSuccess(result));
    } catch (err) {
      res.status(500).json(apiError("INTERNAL_ERROR", "Erro ao consultar audit log."));
    }
  },
);

auditLogRouter.get(
  "/audit-log/export",
  requireSession,
  async (req: Request, res: Response) => {
    try {
      const { entityType, entityId, action, userId, from, to } = req.query;
      const entries: any[] = [];
      let cursor: string | undefined;
      do {
        const result = await queryAuditLog({
          tenantId: req.session!.tenantId,
          entityType: entityType as string,
          entityId: entityId as string,
          action: action as any,
          userId: userId as string,
          from: from ? new Date(from as string) : undefined,
          to: to ? new Date(to as string) : undefined,
          limit: 1000,
          cursor,
        });
        entries.push(...result.entries);
        cursor = result.nextCursor;
      } while (cursor);

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`);
      const csv = ["id,tenantId,userId,action,entityType,entityId,before,after,ipAddress,userAgent,createdAt"]
        .concat(
          entries.map((e) =>
            [e.id, e.tenantId, e.userId, e.action, e.entityType, e.entityId, JSON.stringify(e.before ?? {}), JSON.stringify(e.after ?? {}), e.ipAddress ?? "", e.userAgent ?? "", e.createdAt.toISOString()].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","),
          ),
        )
        .join("\n");
      res.send(csv);
    } catch (err) {
      res.status(500).json(apiError("INTERNAL_ERROR", "Erro ao exportar audit log."));
    }
  },
);

// Admin global: consulta cross-tenant (apenas SUPER_ADMIN)
auditLogRouter.get(
  "/audit-log/global",
  requireSession,
  async (req: Request, res: Response) => {
    const user = await prismaUnscoped.user.findUnique({ where: { id: req.session!.userId }, select: { role: true } });
    if (user?.role !== "OWNER") return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Acesso restrito a SUPER_ADMIN." } });

    const { tenantId, entityType, entityId, action, userId, from, to, limit, cursor } = req.query;
    const result = await queryAuditLog({
      tenantId: tenantId as string,
      entityType: entityType as string,
      entityId: entityId as string,
      action: action as any,
      userId: userId as string,
      from: from ? new Date(from as string) : undefined,
      to: to ? new Date(to as string) : undefined,
      limit: limit ? parseInt(limit as string, 10) : 50,
      cursor: cursor as string,
    });
    res.json(apiSuccess(result));
  },
);