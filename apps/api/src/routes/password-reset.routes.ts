// src/routes/password-reset.routes.ts — Reset de senha com token seguro
import { Router, Request, Response } from "express";
import { randomBytes } from "node:crypto";
import { addHours } from "date-fns";
import { prismaUnscoped } from "../lib/prisma.js";
import { hashPassword, verifyPassword } from "../auth/password.service.js";
import { apiSuccess, apiError } from "../types/api-envelope.js";
import { emitNotification } from "../services/notifications/notification.service.js";

export const passwordResetRouter = Router();

passwordResetRouter.post(
  "/auth/password/forgot",
  async (req: Request, res: Response) => {
    try {
      const { email } = req.body ?? {};
      if (!email) return res.status(400).json(apiError("VALIDATION_ERROR", "E-mail é obrigatório."));

      const user = await prismaUnscoped.user.findFirst({ where: { email: { contains: email, mode: "insensitive" as const } } });
      // Sempre retorna sucesso para não vazar existência de e-mail
      if (!user) return res.json(apiSuccess({ sent: true }));

      const token = randomBytes(32).toString("hex");
      const expiresAt = addHours(new Date(), 2);

      await prismaUnscoped.passwordResetToken.create({
        data: { userId: user.id, token, expiresAt },
      });

      // Em produção: enviar e-mail via fila (emitNotification)
      await emitNotification({
        tenantId: user.tenantId,
        recipientId: user.id,
        category: "PASSWORD_RESET",
        title: "Redefinição de senha",
        body: `Use o token: ${token} (expira em 2 horas)`,
        channels: ["EMAIL"],
      });

      res.json(apiSuccess({ sent: true }));
    } catch (err) {
      res.status(500).json(apiError("INTERNAL_ERROR", "Erro ao processar solicitação."));
    }
  },
);

passwordResetRouter.post(
  "/auth/password/reset",
  async (req: Request, res: Response) => {
    try {
      const { token, password } = req.body ?? {};
      if (!token || !password) return res.status(400).json(apiError("VALIDATION_ERROR", "Token e nova senha são obrigatórios."));
      if (password.length < 8) return res.status(400).json(apiError("VALIDATION_ERROR", "A senha deve ter pelo menos 8 caracteres."));

      const resetToken = await prismaUnscoped.passwordResetToken.findUnique({ where: { token } });
      if (!resetToken || resetToken.expiresAt < new Date() || resetToken.usedAt) {
        return res.status(400).json(apiError("INVALID_TOKEN", "Token inválido ou expirado."));
      }

      const passwordHash = await hashPassword(password);
      await prismaUnscoped.$transaction([
        prismaUnscoped.user.update({ where: { id: resetToken.userId }, data: { passwordHash } }),
        prismaUnscoped.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } }),
        prismaUnscoped.activeSession.deleteMany({ where: { userId: resetToken.userId } }), // Invalida todas as sessões
      ]);

      res.json(apiSuccess({ reset: true }));
    } catch (err) {
      res.status(500).json(apiError("INTERNAL_ERROR", "Erro ao redefinir senha."));
    }
  },
);

passwordResetRouter.post(
  "/auth/password/change",
  async (req: Request, res: Response) => {
    // Requer sessão autenticada (middleware requireSession seria aplicado no main.ts)
    try {
      const { currentPassword, newPassword } = req.body ?? {};
      if (!currentPassword || !newPassword) return res.status(400).json(apiError("VALIDATION_ERROR", "Senha atual e nova senha são obrigatórias."));
      if (newPassword.length < 8) return res.status(400).json(apiError("VALIDATION_ERROR", "A nova senha deve ter pelo menos 8 caracteres."));

      const session = req.session as any;
      if (!session?.userId) return res.status(401).json(apiError("UNAUTHENTICATED", "Sessão ausente."));

      const user = await prismaUnscoped.user.findUnique({ where: { id: session.userId }, select: { passwordHash: true } });
      if (!user) return res.status(404).json(apiError("USER_NOT_FOUND", "Usuário não encontrado."));

      if (!(await verifyPassword(user.passwordHash, currentPassword))) {
        return res.status(401).json(apiError("INVALID_PASSWORD", "Senha atual incorreta."));
      }

      const passwordHash = await hashPassword(newPassword);
      await prismaUnscoped.user.update({ where: { id: session.userId }, data: { passwordHash } });
      await prismaUnscoped.activeSession.deleteMany({ where: { userId: session.userId, NOT: { id: session.sessionId ?? "" } } });

      res.json(apiSuccess({ changed: true }));
    } catch (err) {
      res.status(500).json(apiError("INTERNAL_ERROR", "Erro ao alterar senha."));
    }
  },
);