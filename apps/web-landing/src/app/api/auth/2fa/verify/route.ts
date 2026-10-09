// src/app/api/auth/2fa/verify/route.ts — Cap. 14.2 Verificação
import { authenticator } from 'otplib';
import { prismaUnscoped } from '@/server/db';
import { readSession } from '@/server/session';
import { handle } from '@/server/handler';
import { DomainError } from '@/server/api-envelope';

export const dynamic = 'force-dynamic';

export const POST = handle(async (request: Request) => {
  const session = await readSession(request);
  if (!session) throw new DomainError('UNAUTHENTICATED', 'Sessão ausente ou expirada.', 401);

  const body = (await request.json()) as { totpCode?: unknown };
  const code = typeof body.totpCode === 'string' ? body.totpCode : '';

  if (!code || !/^\d{6}$/.test(code)) {
    throw new DomainError('VALIDATION_ERROR', 'Código TOTP inválido.');
  }

  const user = await prismaUnscoped.user.findUnique({ where: { id: session.userId } });
  if (!user) throw new DomainError('NOT_FOUND', 'Usuário não encontrado.', 404);

  const secretEncrypted = user.totpSecretEncrypted;
  if (!secretEncrypted || !user.totpConfirmedAt) {
    throw new DomainError('2FA_NOT_ENABLED', '2FA não está ativo para esta conta.', 400);
  }

  const secret = Buffer.from(secretEncrypted, 'base64').toString('utf8');
  const valid = authenticator.verify({ token: code, secret });

  if (!valid) {
    // Verifica se é um código de backup
    const backupCode = await prismaUnscoped.twoFactorBackupCode.findFirst({
      where: { userId: user.id, code, usedAt: null },
    });

    if (backupCode) {
      await prismaUnscoped.twoFactorBackupCode.update({
        where: { id: backupCode.id },
        data: { usedAt: new Date() },
      });
      return { valid: true, message: 'Código de backup aceito.' };
    }

    throw new DomainError('INVALID_2FA_CODE', 'Código inválido.', 401);
  }

  return { valid: true, message: 'Código válido.' };
});
