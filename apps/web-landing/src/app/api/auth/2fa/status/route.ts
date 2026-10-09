// src/app/api/auth/2fa/status/route.ts — Cap. 14.2 Status do 2FA
import { prismaUnscoped } from '@/server/db';
import { readSession } from '@/server/session';
import { handle } from '@/server/handler';
import { DomainError } from '@/server/api-envelope';

export const dynamic = 'force-dynamic';

export const GET = handle(async (request: Request) => {
  const session = await readSession(request);
  if (!session) throw new DomainError('UNAUTHENTICATED', 'Sessão ausente ou expirada.', 401);

  const user = await prismaUnscoped.user.findUnique({
    where: { id: session.userId },
    select: { totpConfirmedAt: true },
  });

  if (!user) throw new DomainError('NOT_FOUND', 'Usuário não encontrado.', 404);

  const remainingBackupCodes = await prismaUnscoped.twoFactorBackupCode.count({
    where: { userId: session.userId, usedAt: null },
  });

  return {
    enabled: !!user.totpConfirmedAt,
    enrolledAt: user.totpConfirmedAt?.toISOString() ?? null,
    remainingBackupCodes,
  };
});
