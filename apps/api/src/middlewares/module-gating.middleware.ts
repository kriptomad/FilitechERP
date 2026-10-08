// src/middlewares/module-gating.middleware.ts — Feature Gating com upsell contextual
import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma.js";
import { getCurrentTenantId } from "../lib/tenant-context.js";

const MODULE_CATALOG: Record<string, { label: string; monthlyPrice: number }> = {
  FISCAL_NFCE: { label: "Emissão Fiscal (NFC-e/NFe)", monthlyPrice: 49.9 },
  WHATSAPP_INTEGRATION: { label: "Integração WhatsApp", monthlyPrice: 39.9 },
  MULTI_FILIAL: { label: "Multi-Filial", monthlyPrice: 59.9 },
  WORK_ORDER: { label: "Assistência Técnica (O.S.)", monthlyPrice: 69.9 },
  LIQUOR_LEDGER: { label: "Adega — Conta-Corrente de Cascos", monthlyPrice: 29.9 },
  RECIPE_BOM: { label: "Ficha Técnica (Padaria/Confeitaria)", monthlyPrice: 44.9 },
  PHARMACY_SNGPC: { label: "Farmácia — SNGPC/Controlados", monthlyPrice: 79.9 },
  LOYALTY_PROGRAM: { label: "Programa de Fidelidade", monthlyPrice: 19.9 },
  REFERRAL_PROGRAM: { label: "Programa de Indicação", monthlyPrice: 9.9 },
  ONLINE_STORE: { label: "Loja Online (Vitrine Virtual)", monthlyPrice: 29.9 },
  INVENTORY_COUNT: { label: "Inventário Rotativo", monthlyPrice: 14.9 },
  PURCHASE_ORDERS: { label: "Pedidos de Compra Automatizados", monthlyPrice: 24.9 },
  ACCOUNTING_INTEGRATION: { label: "Integração Contábil (SPED/ECF)", monthlyPrice: 39.9 },
};

export function requireModule(moduleCode: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = getCurrentTenantId();

      const tenantModule = await prisma.tenantModule.findUnique({
        where: { tenantId_moduleCode: { tenantId, moduleCode } },
      });

      if (!tenantModule?.active) {
        const moduleInfo = MODULE_CATALOG[moduleCode];
        res.status(402).json({
          success: false,
          data: null,
          error: {
            code: "MODULE_NOT_ACTIVE",
            message: `O módulo '${moduleInfo?.label ?? moduleCode}' não está ativo para sua conta.`,
            details: {
              upsell: {
                moduleCode,
                label: moduleInfo?.label,
                monthlyPrice: moduleInfo?.monthlyPrice,
                checkoutUrl: `/api/v1/billing/modules/${moduleCode}/activate`,
              },
            },
          },
        });
        return;
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

// Decorator para controllers que precisam de múltiplos módulos
export function requireModules(...moduleCodes: string[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = getCurrentTenantId();
      const tenantModules = await prisma.tenantModule.findMany({
        where: { tenantId, moduleCode: { in: moduleCodes } },
      });
      const activeCodes = new Set(tenantModules.filter((m) => m.active).map((m) => m.moduleCode));

      for (const code of moduleCodes) {
        if (!activeCodes.has(code)) {
          const moduleInfo = MODULE_CATALOG[code];
          res.status(402).json({
            success: false,
            data: null,
            error: {
              code: "MODULES_NOT_ACTIVE",
              message: `Os módulos necessários não estão ativos: ${moduleCodes.filter((c) => !activeCodes.has(c)).join(", ")}`,
              details: {
                missingModules: moduleCodes.filter((c) => !activeCodes.has(c)).map((c) => ({
                  moduleCode: c,
                  label: MODULE_CATALOG[c]?.label,
                  monthlyPrice: MODULE_CATALOG[c]?.monthlyPrice,
                })),
              },
            },
          });
          return;
        }
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}