// src/app/api/auth/2fa/enroll/start/route.ts — Cap. 14.2 Passo 1
import { authenticator } from 'otplib';
import { prismaUnscoped } from '@/server/db';
import { readSession } from '@/server/session';
import { handle } from '@/server/handler';
import { DomainError } from '@/server/api-envelope';
import { sealTotpSecret } from '@/server/totp-secret';

export const dynamic = 'force-dynamic';

export const POST = handle(async (request: Request) => {
  const session = await readSession(request);
  if (!session) throw new DomainError('UNAUTHENTICATED', 'Sessão ausente ou expirada.', 401);

  const user = await prismaUnscoped.user.findUnique({ where: { id: session.userId } });
  if (!user) throw new DomainError('NOT_FOUND', 'Usuário não encontrado.', 404);

  if (user.totpConfirmedAt) {
    throw new DomainError('2FA_ALREADY_ENABLED', '2FA já está ativo para esta conta.', 409);
  }

  const secret = authenticator.generateSecret();
  const otpauthUrl = authenticator.keyuri(user.email, 'Filitech ERP', secret);

  // Grava cifrado (AES-256-GCM). A versão anterior guardava apenas base64 —
  // o dump do banco bastava para reconstituir o segundo fator.
  await prismaUnscoped.user.update({
    where: { id: user.id },
    data: { totpSecretEncrypted: sealTotpSecret(secret) },
  });

  return { otpauthUrl, secret };
});