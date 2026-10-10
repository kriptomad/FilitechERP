// src/app/api/auth/password/reset/route.ts — Cap. 14.3
//
// Antes devolvia "Senha redefinida com sucesso." sem tocar no banco: qualquer
// string de "token" era aceita e a senha não mudava.
//
// Agora valida o token por HASH contra o banco, com janela de 2 horas e uso
// único (a segunda tentativa com o mesmo token falha). Sucesso encerra todas
// as sessões abertas do usuário — Cap. 14.3.
import { createHash } from 'node:crypto';
import { prismaUnscoped } from '@/server/db';
import { DomainError, jsonSuccess } from '@/server/api-envelope';
import { readJson, requireString } from '@/server/request';
import { hashPassword } from '@/server/password';
import { handle } from '@/server/handler';

export const dynamic = 'force-dynamic';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

interface ResetBody {
  token?: unknown;
  password?: unknown;
}

export const POST = handle(async (request: Request) => {
  const body = await readJson<ResetBody>(request);
  const token = requireString(body.token, 'token', { min: 10, max: 200 });
  const password = requireString(body.password, 'password', { min: 8, max: 200 });

  const record = await prismaUnscoped.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { id: true, tenantId: true, active: true } } },
  });

  if (!record || !record.user) {
    throw new DomainError('INVALID_TOKEN', 'Link de redefinição inválido ou expirado.', 400);
  }
  if (record.usedAt) {
    throw new DomainError(
      'TOKEN_ALREADY_USED',
      'Este link já foi utilizado. Solicite um novo.',
      400,
    );
  }
  if (record.expiresAt.getTime() < Date.now()) {
    throw new DomainError('TOKEN_EXPIRED', 'Link expirado. Solicite um novo.', 400);
  }
  if (!record.user.active) {
    throw new DomainError('ACCOUNT_DISABLED', 'Conta desativada.', 403);
  }

  const passwordHash = await hashPassword(password);
  const now = new Date();

  await prismaUnscoped.$transaction(async (tx) => {
    // Uso único garantido por UPDATE condicional: dois cliques simultâneos no
    // mesmo link só um passa pela checagem `usedAt IS NULL`.
    const consumed = await tx.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: now },
    });
    if (consumed.count === 0) {
      throw new DomainError('TOKEN_ALREADY_USED', 'Este link já foi utilizado.', 400);
    }

    await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });

    // Encerra todas as sessões ativas (Cap. 14.3): trocar a senha derruba
    // qualquer sessão que um atacante possa já ter estabelecido.
    await tx.activeSession.deleteMany({ where: { userId: record.userId } });

    // E invalida qualquer outro token pendente da mesma conta.
    await tx.passwordResetToken.updateMany({
      where: { userId: record.userId, usedAt: null },
      data: { usedAt: now },
    });

    await tx.auditLog.create({
      data: {
        tenantId: record.tenantId,
        userId: record.userId,
        action: 'AUTH_PASSWORD_RESET_DONE',
        entityType: 'User',
        entityId: record.userId,
        after: { sessionsRevoked: true, at: now.toISOString() },
      },
    });
  });

  return jsonSuccess({
    message: 'Senha redefinida com sucesso. Todas as sessões abertas foram encerradas.',
  });
});
