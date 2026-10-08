// src/routes/user.routes.ts — endpoints de usuário (usados por useActiveModules e painel)
import { Router, Request, Response } from "express";
import type { UserRole } from "@prisma/client";
import { prisma, prismaUnscoped } from "../lib/prisma.js";
import { hashPassword } from "../auth/password.service.js";
import { requireSession } from "../middlewares/session.middleware.js";
import { apiSuccess, apiError } from "../types/api-envelope.js";

export const userRouter = Router();

userRouter.get("/auth/me", requireSession, async (req: Request, res: Response) => {
  const tenantId = req.session!.tenantId;

  const tenantModules = await prisma.tenantModule.findMany({
    where: { tenantId, active: true },
    select: { moduleCode: true },
  });

  return res.json(
    apiSuccess({
      userId: req.session!.userId,
      tenantId,
      role: req.session!.role,
      activeModules: tenantModules.map((tm) => tm.moduleCode),
    }),
  );
});

/**
 * Equipe do tenant (painel de administração) — escopo automático por
 * tenantId via extensão (Cap. 7.2); o cliente só enxerga a própria equipe.
 */
userRouter.get("/users", requireSession, async (req: Request, res: Response) => {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
    orderBy: { name: "asc" },
  });
  return res.json(apiSuccess(users));
});

/**
 * Convite/criação de membro da equipe pelo painel de administração.
 * Em produção dispararia e-mail de convite com senha temporária; na
 * demonstração o membro é criado ativo com a senha provisória retornada.
 */
userRouter.post("/users", requireSession, async (req: Request, res: Response) => {
  const { name, email, role = "CASHIER", password } = req.body ?? {};

  if (!name || !email) {
    return res
      .status(400)
      .json(apiError("VALIDATION_ERROR", "Nome e e-mail são obrigatórios."));
  }
  // Apelido da UI "TECH" → enum do domínio TECHNICIAN (Cap. 5 — UserRole).
  const ROLE_ALIAS: Record<string, UserRole | undefined> = {
    OWNER: "OWNER",
    MANAGER: "MANAGER",
    CASHIER: "CASHIER",
    TECH: "TECHNICIAN",
    TECHNICIAN: "TECHNICIAN",
  };
  const mappedRole = ROLE_ALIAS[role];
  if (!mappedRole) {
    return res.status(400).json(apiError("INVALID_ROLE", "Papel inválido."));
  }

  const emailTaken = await prismaUnscoped.user.findFirst({ where: { email } });
  if (emailTaken) {
    return res.status(409).json(apiError("EMAIL_TAKEN", "E-mail já cadastrado."));
  }

  const tempPassword =
    typeof password === "string" && password.length >= 8
      ? password
      : `Filia${Math.random().toString(36).slice(2, 10).toUpperCase()}!`;
  const passwordHash = await hashPassword(tempPassword);

  const created = await prisma.user.create({
    data: {
      tenantId: req.session!.tenantId, // reforçado pela extensão (Cap. 7.2)
      name,
      email,
      passwordHash,
      role: mappedRole,
    },
    select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
  });

  return res.status(201).json(
    apiSuccess({
      user: created,
      // Somente demonstração: em produção seria enviado por e-mail.
      invitePassword: tempPassword,
    }),
  );
});

/** Atualização de membro da equipe (nome, papel, ativo). */
userRouter.patch("/users/:id", requireSession, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, role, active } = req.body ?? {};

  const ROLE_ALIAS: Record<string, UserRole | undefined> = {
    OWNER: "OWNER",
    MANAGER: "MANAGER",
    CASHIER: "CASHIER",
    TECH: "TECHNICIAN",
    TECHNICIAN: "TECHNICIAN",
  };

  const data: { name?: string; role?: UserRole; active?: boolean } = {};
  if (name !== undefined) {
    if (typeof name !== "string" || name.trim().length < 2) {
      return res.status(400).json(apiError("VALIDATION_ERROR", "Nome inválido."));
    }
    data.name = name.trim();
  }
  if (role !== undefined) {
    const mapped = ROLE_ALIAS[role];
    if (!mapped) return res.status(400).json(apiError("INVALID_ROLE", "Papel inválido."));
    data.role = mapped;
  }
  if (active !== undefined) {
    if (typeof active !== "boolean") {
      return res.status(400).json(apiError("VALIDATION_ERROR", "active deve ser boolean."));
    }
    data.active = active;
  }

  if (Object.keys(data).length === 0) {
    return res.status(400).json(apiError("VALIDATION_ERROR", "Nenhum dado enviado."));
  }

  try {
    const updated = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
    });
    return res.json(apiSuccess(updated));
  } catch {
    return res.status(404).json(apiError("NOT_FOUND", "Usuário não encontrado."));
  }
});

/** Exclusão de membro da equipe (não permite excluir o próprio OWNER). */
userRouter.delete("/users/:id", requireSession, async (req: Request, res: Response) => {
  const { id } = req.params;

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return res.status(404).json(apiError("NOT_FOUND", "Usuário não encontrado."));

  // Proteção: não permite excluir o próprio usuário OWNER da sessão.
  if (id === req.session!.userId) {
    return res.status(409).json(apiError("CANNOT_DELETE_SELF", "Você não pode excluir a própria conta."));
  }

  // Proteção: não permite excluir o último OWNER ativo do tenant.
  if (user.role === "OWNER") {
    const otherOwners = await prisma.user.count({
      where: { role: "OWNER", active: true, id: { not: id } },
    });
    if (otherOwners === 0) {
      return res.status(409).json(apiError("LAST_OWNER", "Não é possível excluir o último proprietário ativo."));
    }
  }

  await prisma.user.delete({ where: { id } });
  return res.json(apiSuccess({ id, deleted: true }));
});

/** Reset de senha de membro da equipe. */
userRouter.post("/users/:id/reset-password", requireSession, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { password } = req.body ?? {};

  const tempPassword =
    typeof password === "string" && password.length >= 8
      ? password
      : `Filia${Math.random().toString(36).slice(2, 10).toUpperCase()}!`;

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return res.status(404).json(apiError("NOT_FOUND", "Usuário não encontrado."));

  const passwordHash = await hashPassword(tempPassword);
  await prisma.user.update({ where: { id }, data: { passwordHash } });

  return res.json(apiSuccess({ id, reset: true, newPassword: tempPassword }));
});
