// src/middlewares/tenant-context.middleware.ts — Cap. 7.1
import { Request, Response, NextFunction } from "express";
import { runWithTenantContext } from "../lib/tenant-context.js";

export function tenantContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!req.session?.tenantId) {
    return next(); // rotas públicas seguem sem contexto de tenant
  }
  runWithTenantContext(
    {
      tenantId: req.session.tenantId,
      userId: req.session.userId,
      role: req.session.role,
    },
    async () => next(),
  );
}
