// src/app/api/auth/2fa/disable/route.ts — Cap. 14.2 Desabilitar 2FA
import { prismaUnscoped } from '@/server/db';
import { readSession } from '@/server/session';
import { handle } from '@/server/handler';
import { DomainError } from '@/server/api-envelope';

export const dynamic = 'force-dynamic';

export const POST = handle(async (request: Request) => {
  const session = await readSession(request);
  if (!session) throw new DomainError('UNAUTHENTICATED', 'Sessão ausente ou expirada.', 401);

  const body = (await request.json()) as { password?: unknown };
  const password = typeof body.password === 'string' ? body.password : '';

  if (!password) throw new DomainError('VALIDATION_ERROR', 'Senha obrigatória.');

  const user = await prismaUnscoped.user.findUnique({ where: { id: session.userId } });
  if (!user) throw new DomainError('NOT_FOUND', 'Usuário não encontrado.', 404);

  const { verifyPassword } = await import('@/server/password');
  const valid = await verifyPassword(user.passwordHash, password);
  if (!valid) throw new DomainError('INVALID_PASSWORD', 'Senha incorreta.', 401);

  await prismaUnscoped.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { totpSecretEncrypted: null, totpConfirmedAt: null },
    });
    await tx.twoFactorBackupCode.deleteMany({ where: { userId: user.id } });
  });

  return { success: true, data: { disabled: true }, error: null };
});