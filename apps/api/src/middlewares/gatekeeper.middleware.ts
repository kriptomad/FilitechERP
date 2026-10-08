// src/middlewares/gatekeeper.middleware.ts — Cap. 6.1
import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma.js";
import { redis } from "../lib/redis.js";
import { roleHasPermission } from "../auth/role-permissions.js";

interface GatekeeperOptions {
  moduleCode: string;
  requiredPermission?: string;
}

const TENANT_MODULE_CACHE_TTL_SECONDS = 60;

export function gatekeeper(options: GatekeeperOptions) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const session = req.session;
    if (!session?.tenantId || !session?.userId) {
      return res.status(401).json({
        success: false,
        data: null,
        error: { code: "UNAUTHENTICATED", message: "Sessão ausente ou expirada." },
      });
    }

    // 1. Status financeiro do tenant — precedência absoluta.
    const tenant = await prisma.tenant.findUniqueOrThrow({
      where: { id: session.tenantId },
      select: { status: true },
    });

    if (tenant.status === "SUSPENDED") {
      return res.status(402).json({
        success: false,
        data: null,
        error: {
          code: "TENANT_SUSPENDED",
          message: "Assinatura suspensa por inadimplência. Regularize o pagamento para continuar.",
        },
      });
    }

    // 2. Módulo contratado e ativo — cache em Redis por tenant.
    const cacheKey = `tenant:${session.tenantId}:modules`;
    let activeModuleCodes = await redis.smembers(cacheKey);

    if (activeModuleCodes.length === 0) {
      const tenantModules = await prisma.tenantModule.findMany({
        where: { tenantId: session.tenantId, active: true },
        include: { module: { select: { code: true } } },
      });
      activeModuleCodes = tenantModules.map((tm) => tm.module.code);
      if (activeModuleCodes.length > 0) {
        await redis.sadd(cacheKey, ...activeModuleCodes);
        await redis.expire(cacheKey, TENANT_MODULE_CACHE_TTL_SECONDS);
      }
    }

    if (!activeModuleCodes.includes(options.moduleCode)) {
      const module = await prisma.module.findUnique({
        where: { code: options.moduleCode },
      });
      return res.status(402).json({
        success: false,
        data: null,
        error: {
          code: "MODULE_NOT_ACTIVE",
          message: `O módulo "${module?.label}" não está contratado.`,
        },
        upsell: {
          moduleCode: options.moduleCode,
          label: module?.label,
          price: Number(module?.monthlyPrice),
          checkoutUrl: `/billing/upsell?module=${options.moduleCode}`,
        },
      });
    }

    // 3. RBAC — permissão do papel do usuário dentro do módulo já contratado.
    //    Correção P0 (Review R4): matriz padrão por Role + override por usuário.
    if (options.requiredPermission) {
      const userOverrides = await prisma.rolePermission.findMany({
        where: { tenantId: session.tenantId, userId: session.userId },
        select: { permission: true, granted: true },
      });

      const allowed = roleHasPermission(
        session.role,
        options.requiredPermission,
        userOverrides,
      );

      if (!allowed) {
        return res.status(403).json({
          success: false,
          data: null,
          error: { code: "FORBIDDEN", message: "Seu nível de acesso não permite esta ação." },
        });
      }
    }

    return next();
  };
}
