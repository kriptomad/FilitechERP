// src/routes/auth-2fa.routes.ts — 2FA endpoints
import { Router, Request, Response } from "express";
import { requireSession } from "../middlewares/session.middleware.js";
import { apiSuccess, apiError } from "../types/api-envelope.js";
import {
  generateTotpSecret,
  getTotpUri,
  verifyTotpToken,
  generateBackupCodes,
  hashBackupCodes,
  verifyBackupCode,
  enrollTotp,
  disableTotp,
  verifyTotpOrBackupCode,
  enforce2faForRole,
} from "../auth/totp.service.js";
import { prismaUnscoped } from "../lib/prisma.js";
import { writeAuditLog } from "../lib/audit-log.js";
import { AuditAction } from "../lib/audit-log.js";

export const auth2faRouter = Router();

auth2faRouter.post(
  "/auth/2fa/enroll/start",
  requireSession,
  async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId;
      const user = await prismaUnscoped.user.findUnique({ where: { id: userId }, select: { email: true, totpSecretEncrypted: true } });
      if (!user) return res.status(404).json(apiError("USER_NOT_FOUND", "Usuário não encontrado."));
      if (user.totpSecretEncrypted) return res.status(409).json(apiError("ALREADY_ENROLLED", "2FA já configurado."));

      const secret = await generateTotpSecret();
      const uri = await getTotpUri(secret, user.email);
      const backupCodes = await generateBackupCodes();

      req.session!.temp2faSecret = secret;
      req.session!.temp2faBackupCodes = backupCodes;

      res.json(apiSuccess({ uri, backupCodes }));
    } catch (err) {
      res.status(500).json(apiError("INTERNAL_ERROR", "Erro ao iniciar enrollment 2FA."));
    }
  },
);

auth2faRouter.post(
  "/auth/2fa/enroll/confirm",
  requireSession,
  async (req: Request, res: Response) => {
    try {
      const { token } = req.body ?? {};
      if (!token) return res.status(400).json(apiError("VALIDATION_ERROR", "Token 2FA é obrigatório."));

      const secret = req.session!.temp2faSecret;
      const backupCodes = req.session!.temp2faBackupCodes;
      if (!secret || !backupCodes) return res.status(400).json(apiError("INVALID_STATE", "Enrollment não iniciado."));

      const valid = await verifyTotpToken(secret, token);
      if (!valid) return res.status(400).json(apiError("INVALID_TOKEN", "Token 2FA inválido."));

      const hashedBackupCodes = await hashBackupCodes(backupCodes);
      await prismaUnscoped.$transaction([
        prismaUnscoped.user.update({
          where: { id: req.session!.userId },
          data: { totpSecretEncrypted: secret, totpConfirmedAt: new Date() },
        }),
        prismaUnscoped.twoFactorBackupCode.createMany({
          data: backupCodes.map((c) => ({ userId: req.session!.userId, code: c })),
        }),
      ]);

      req.session!.temp2faSecret = undefined;
      req.session!.temp2faBackupCodes = undefined;

      await writeAuditLog(
        req.session!.tenantId,
        AuditAction.CONFIG_CHANGE,
        "User",
        req.session!.userId,
        req.session!.userId,
        undefined,
        undefined,
        undefined,
        { totpEnabled: true },
        undefined,
      );

      res.json(apiSuccess({ enrolled: true, backupCodes }));
    } catch (err) {
      res.status(500).json(apiError("INTERNAL_ERROR", "Erro ao confirmar 2FA."));
    }
  },
);

auth2faRouter.post(
  "/auth/2fa/disable",
  requireSession,
  async (req: Request, res: Response) => {
    try {
      const { password } = req.body ?? {};
      if (!password) return res.status(400).json(apiError("VALIDATION_ERROR", "Senha é obrigatória para desativar 2FA."));

      const user = await prismaUnscoped.user.findUnique({ where: { id: req.session!.userId }, select: { passwordHash: true } });
      if (!user) return res.status(404).json(apiError("USER_NOT_FOUND", "Usuário não encontrado."));

      const { verifyPassword } = await import("../auth/password.service.js");
      if (!(await verifyPassword(user.passwordHash, password))) {
        return res.status(401).json(apiError("INVALID_PASSWORD", "Senha incorreta."));
      }

      await disableTotp(req.session!.userId);

      await writeAuditLog(
        req.session!.tenantId,
        AuditAction.CONFIG_CHANGE,
        "User",
        req.session!.userId,
        req.session!.userId,
        undefined,
        undefined,
        undefined,
        { totpEnabled: false },
        undefined,
      );

      res.json(apiSuccess({ disabled: true }));
    } catch (err) {
      res.status(500).json(apiError("INTERNAL_ERROR", "Erro ao desativar 2FA."));
    }
  },
);

auth2faRouter.post(
  "/auth/2fa/verify",
  requireSession,
  async (req: Request, res: Response) => {
    try {
      const { token } = req.body ?? {};
      if (!token) return res.status(400).json(apiError("VALIDATION_ERROR", "Token é obrigatório."));

      const valid = await verifyTotpOrBackupCode(req.session!.userId, token);
      if (!valid) return res.status(401).json(apiError("INVALID_TOKEN", "Token 2FA ou código de backup inválido."));

      res.json(apiSuccess({ verified: true }));
    } catch (err) {
      res.status(500).json(apiError("INTERNAL_ERROR", "Erro ao verificar 2FA."));
    }
  },
);

auth2faRouter.get(
  "/auth/2fa/status",
  requireSession,
  async (req: Request, res: Response) => {
    const user = await prismaUnscoped.user.findUnique({
      where: { id: req.session!.userId },
      select: { totpSecretEncrypted: true, totpConfirmedAt: true, backupCodes: true },
    });
    res.json(apiSuccess({ enabled: !!user?.totpSecretEncrypted, enrolledAt: user?.totpConfirmedAt, backupCodesCount: user?.backupCodes.length ?? 0 }));
  },
);