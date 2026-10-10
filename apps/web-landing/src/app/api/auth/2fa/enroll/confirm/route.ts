// src/app/api/auth/2fa/enroll/confirm/route.ts — Cap. 14.2 Passo 2
import { authenticator } from 'otplib';
import { randomBytes } from 'node:crypto';
import { prismaUnscoped } from '@/server/db';
import { readSession } from '@/server/session';
import { handle } from '@/server/handler';
import { DomainError } from '@/server/api-envelope';
import { backupCodeHash, formatBackupCode } from '@/server/two-factor';
import { isLegacyTotpSecret, openTotpSecret, sealTotpSecret } from '@/server/totp-secret';

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
  if (!secretEncrypted) {
    throw new DomainError('2FA_NOT_STARTED', 'Enrollment de 2FA não foi iniciado.', 400);
  }

  const secret = openTotpSecret(secretEncrypted);
  const valid = authenticator.verify({ token: code, secret });

  if (!valid) {
    throw new DomainError('INVALID_2FA_CODE', 'Código inválido. Tente novamente.', 401);
  }

  // Migração: segredo gravado no formato legado (base64 puro) sai cifrado
  // a partir do momento em que o usuário confirma o 2FA.
  const sealed = isLegacyTotpSecret(secretEncrypted) ? sealTotpSecret(secret) : secretEncrypted;

  // 10 códigos de backup com entropia real (CSPRNG).
  //
  // A versão anterior usava `Math.random()` — previsível: quem observasse
  // algumas saídas reconstruía o padrão e reconstituía os códigos de backup
  // de outra conta. Um código de backup é a ÚLTIMA barreira antes da conta.
  const backupCodes = Array.from({ length: 10 }, () => {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = randomBytes(10);
    let out = '';
    for (const byte of bytes) out += alphabet[byte % alphabet.length];
    return formatBackupCode(out);
  });

  // No banco vai apenas o HASH: um vazamento (dump, backup, SQL injection)
  // não pode virar 10 chaves de entrada na conta.
  const backupHashes = backupCodes.map(backupCodeHash);

  await prismaUnscoped.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { totpConfirmedAt: new Date(), totpSecretEncrypted: sealed },
    });

    await tx.twoFactorBackupCode.deleteMany({ where: { userId: user.id } });
    await tx.twoFactorBackupCode.createMany({
      data: backupHashes.map((code) => ({
        userId: user.id,
        code,
      })),
    });
  });

  return { backupCodes, message: '2FA ativado com sucesso.' };
});
