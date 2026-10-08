// src/routes/auth.routes.ts — Cap. 9.2 / 2.4 (Tier Free PLG)
import { Router, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { prismaUnscoped } from "../lib/prisma.js";
import { hashPassword, verifyPassword } from "../auth/password.service.js";
import { signSessionToken } from "../auth/jwt.service.js";
import { apiSuccess, apiError } from "../types/api-envelope.js";

export const authRouter = Router();

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/**
 * Cadastro público (Cap. 1.2.1 / 2.4) — Tier Free sem cartão de crédito:
 * cria Tenant (TRIAL) + User OWNER + Subscription + TenantModule do plano
 * e devolve o token de sessão (onboarding imediato, zero fricção).
 * Com planCode pago, simula o checkout do gateway e ativa os add-ons
 * escolhidos na vitrine (/planos ou /checkout).
 */
authRouter.post("/auth/signup", async (req: Request, res: Response) => {
  try {
    const {
      tradeName,
      legalName,
      cnpj,
      email,
      password,
      name,
      planCode = "FREE",
      selectedModuleCodes = [],
      billingCycle = "MONTHLY",
    } = req.body ?? {};

    if (!tradeName || !email || !password || !name) {
      return res
        .status(400)
        .json(apiError("VALIDATION_ERROR", "Razão social, nome, e-mail e senha são obrigatórios."));
    }
    if (typeof password !== "string" || password.length < 8) {
      return res
        .status(400)
        .json(apiError("VALIDATION_ERROR", "A senha deve ter pelo menos 8 caracteres."));
    }

    const emailTaken = await prismaUnscoped.user.findFirst({ where: { email } });
    if (emailTaken) {
      return res.status(409).json(apiError("EMAIL_TAKEN", "Já existe uma conta com este e-mail."));
    }
    if (cnpj) {
      const cnpjTaken = await prismaUnscoped.tenant.findUnique({ where: { cnpj } });
      if (cnpjTaken) {
        return res.status(409).json(apiError("CNPJ_TAKEN", "Já existe um tenant com este CNPJ."));
      }
    }

    const plan = await prismaUnscoped.plan.findUnique({ where: { code: planCode } });
    if (!plan) {
      return res.status(400).json(apiError("INVALID_PLAN", "Plano não encontrado no catálogo."));
    }

    const requestedCodes: string[] = Array.isArray(selectedModuleCodes)
      ? [...new Set<string>(selectedModuleCodes)]
      : [];
    const requestedModules = await prismaUnscoped.module.findMany({
      where: { code: { in: requestedCodes } },
    });
    if (requestedModules.length !== requestedCodes.length) {
      return res
        .status(400)
        .json(apiError("INVALID_MODULE", "Um ou mais módulos não existem no catálogo."));
    }
    const signupMrr =
      Math.round(
        (Number(plan.basePrice) +
          requestedModules.reduce((sum, m) => sum + Number(m.monthlyPrice), 0)) *
          100,
      ) / 100;

    // Slug único a partir do nome fantasia.
    const baseSlug = slugify(tradeName) || "loja";
    let slug = baseSlug;
    for (let i = 2; ; i++) {
      const clash = await prismaUnscoped.tenant.findUnique({ where: { slug } });
      if (!clash) break;
      slug = `${baseSlug}-${i}`;
    }

    const passwordHash = await hashPassword(password);
    const isFree = plan.code === "FREE";
    const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const activeCodes = [
      ...plan.includedModules,
      ...requestedCodes.filter((c) => !plan.includedModules.includes(c)),
    ];

    const created = await prismaUnscoped.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          slug,
          legalName: legalName ?? tradeName,
          tradeName,
          cnpj: cnpj ?? `PENDENTE-${randomUUID().slice(0, 12).toUpperCase()}`,
          status: isFree ? "TRIAL" : "ACTIVE",
        },
      });

      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          name,
          email,
          passwordHash,
          role: "OWNER",
        },
      });

      await tx.tenantModule.createMany({
        data: activeCodes.map((moduleCode) => ({
          tenantId: tenant.id,
          moduleCode,
          active: true,
        })),
        skipDuplicates: true,
      });

      const subscription = await tx.subscription.create({
        data: {
          tenantId: tenant.id,
          planId: plan.id,
          provider: "asaas",
          externalSubscriptionId: `sub_${randomUUID()}`,
          status: isFree ? "TRIAL" : "ACTIVE",
          currentPeriodEnd: periodEnd,
        },
      });

      await tx.billingEvent.create({
        data: {
          subscriptionId: subscription.id,
          provider: "asaas",
          externalEventKey: `signup_${randomUUID()}`,
          type: isFree ? "signup" : "checkout.completed",
          payload: {
            planCode: plan.code,
            billingCycle,
            selectedModuleCodes: requestedCodes,
            isFree,
            computedMrr: signupMrr,
          },
        },
      });

      return { tenant, user, subscription };
    });

    const accessToken = signSessionToken({
      userId: created.user.id,
      tenantId: created.tenant.id,
      role: "OWNER",
      sessionId: randomUUID(),
    });

    return res.status(201).json(
      apiSuccess({
        accessToken,
        user: {
          id: created.user.id,
          name: created.user.name,
          role: created.user.role,
          tenantId: created.tenant.id,
          tenantSubdomain: created.tenant.slug,
        },
        activeModules: activeCodes,
        plan: plan.code,
        subscriptionId: created.subscription.id,
      }),
    );
  } catch (err) {
    console.error("signup error", err);
    return res
      .status(500)
      .json(apiError("INTERNAL_ERROR", "Erro interno ao criar a conta."));
  }
});

authRouter.post("/auth/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      return res
        .status(400)
        .json(apiError("VALIDATION_ERROR", "E-mail e senha são obrigatórios."));
    }

    // Lookup com cliente não-escopado: login antecede o contexto de tenant.
    const found = await prismaUnscoped.user.findFirst({
      where: { email, active: true },
      include: {
        tenant: {
          select: {
            id: true,
            slug: true,
            status: true,
            tenantModules: {
              where: { active: true },
              select: { moduleCode: true },
            },
          },
        },
      },
    });

    if (!found) {
      return res
        .status(401)
        .json(apiError("INVALID_CREDENTIALS", "Credenciais inválidas."));
    }

    const valid = await verifyPassword(found.passwordHash, password);
    if (!valid) {
      return res
        .status(401)
        .json(apiError("INVALID_CREDENTIALS", "Credenciais inválidas."));
    }

    // Bloqueio por inadimplência tem precedência absoluta (Cap. 6.1).
    if (found.tenant.status === "SUSPENDED") {
      return res.status(402).json(
        apiError(
          "TENANT_SUSPENDED",
          "Assinatura suspensa por inadimplência. Regularize o pagamento para continuar.",
        ),
      );
    }

    const accessToken = signSessionToken({
      userId: found.id,
      tenantId: found.tenant.id,
      role: found.role,
      sessionId: randomUUID(),
    });

    return res.json(
      apiSuccess({
        accessToken,
        refreshToken: randomUUID(),
        user: {
          id: found.id,
          name: found.name,
          role: found.role,
          tenantId: found.tenant.id,
          tenantSubdomain: found.tenant.slug,
        },
        activeModules: found.tenant.tenantModules.map((tm) => tm.moduleCode),
      }),
    );
  } catch (err) {
    console.error("login error", err);
    return res
      .status(500)
      .json(apiError("INTERNAL_ERROR", "Erro interno ao autenticar."));
  }
});
