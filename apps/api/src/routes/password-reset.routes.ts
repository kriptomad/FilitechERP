// src/routes/password-reset.routes.ts — Reset de senha com token seguro
import { Router, Request, Response } from "express";
import { randomBytes, createHash } from "node:crypto";
import { addHours } from "date-fns";
import { prismaUnscoped } from "../lib/prisma.js";
import { hashPassword, verifyPassword } from "../auth/password.service.js";
import { apiSuccess, apiError } from "../types/api-envelope.js";
import { emitNotification } from "../services/notifications/notification.service.js";

export const passwordResetRouter = Router();

/**
 * SHA-256 do token de redefinição.
 *
 * O schema guarda `tokenHash` (e não `token`) porque o valor puro nunca pode
 * ir para o banco: vazamento de dump permitiria sequestrar qualquer conta com
 * um SELECT simples. O e-mail leva o token cru (o único lugar onde ele existe);
 * o reset re-hashia o que o usuário devolve e compara por igualdade — padrão
 * OWASP Forgot Password Cheat Sheet (Cap. 14.3), idêntico ao do Django.
 *
 * SHA-256 (e não bcrypt/argon2) é o correto aqui: o token tem 256 bits de
 * entropia gerados por `randomBytes(32)`, ou seja, não há dicionário para
 *(brute-forçar) — o custo de KDF só adicionaria latência sem ganho real.
 */
const hashResetToken = (token: string) => createHash("sha256").update(token).digest("hex");

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
        // `tenantId` é obrigatório no schema (todo dado de negócio é
        // tenant-scoped — Cap. 7). Sem ele o INSERT estourava em runtime.
        data: { tenantId: user.tenantId, userId: user.id, tokenHash: hashResetToken(token), expiresAt },
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

      // Re-hash do token vindo do usuário e busca por igualdade: o banco nunca
      // contém o valor em texto puro (ver `hashResetToken`).
      const resetToken = await prismaUnscoped.passwordResetToken.findUnique({
        where: { tokenHash: hashResetToken(token) },
      });
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