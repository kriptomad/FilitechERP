// src/app/api/auth/password/forgot/route.ts — Cap. 14.3
//
// Antes devolvia "E-mail de recuperação enviado se o e-mail existir." sem
// gravar nada — o usuário recebia falsa sensação de que um link sairia.
//
// Agora: gera um token de 32 bytes, grava APENAS o hash (nunca o valor em
// claro — um vazamento do banco não pode virar reset de senha), com validade
// de 2 horas, e envia o link por e-mail real.
//
// A resposta é sempre a mesma exista ou não a conta (OWASP): diferenciá-la
// permitiria enumerar e-mails cadastrados.
import { createHash, randomBytes } from 'node:crypto';
import { prismaUnscoped } from '@/server/db';
import { jsonSuccess } from '@/server/api-envelope';
import { readJson, requireEmail } from '@/server/request';
import { emitNotification } from '@/server/services/notifications';
import { absoluteUrl } from '@/server/env';
import { handle } from '@/server/handler';

export const dynamic = 'force-dynamic';

const TOKEN_TTL_MS = 2 * 60 * 60 * 1000; // 2 horas

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

interface ForgotBody {
  email?: unknown;
}

export const POST = handle(async (request: Request) => {
  const body = await readJson<ForgotBody>(request);
  const email = requireEmail(body.email);

  // Lookup não-escopado: o usuário nem está autenticado (não há contexto de
  // tenant), e o e-mail é único globalmente no fluxo de login.
  const user = await prismaUnscoped.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' }, active: true },
    select: { id: true, tenantId: true, name: true, tenant: { select: { tradeName: true } } },
  });

  // Resposta idêntica com e sem conta.
  const genericResponse = {
    message: 'Se existir uma conta com este e-mail, você receberá em instantes as instruções.',
    sent: true,
  };

  if (!user) {
    return jsonSuccess(genericResponse);
  }

  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  // Transação: invalida os tokens anteriores e cria o novo juntos — nunca
  // podem coexistir dois links válidos para a mesma conta.
  await prismaUnscoped.$transaction([
    prismaUnscoped.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prismaUnscoped.passwordResetToken.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt,
      },
    }),
  ]);

  const resetUrl = absoluteUrl(`/redefinir-senha?token=${encodeURIComponent(token)}`);

  const result = await emitNotification({
    tenantId: user.tenantId,
    recipientId: user.id,
    category: 'PASSWORD_RESET',
    title: 'Redefinição de senha',
    body:
      `Olá ${user.name}, recebemos uma solicitação para redefinir a senha da sua conta ` +
      `no ${user.tenant.tradeName}. O link abaixo é válido por 2 horas.\n\n` +
      `${resetUrl}\n\n` +
      'Se você não solicitou esta alteração, ignore esta mensagem — nada foi modificado.',
    channels: ['IN_APP', 'EMAIL'],
    actionUrl: resetUrl,
    priority: 'HIGH',
    expiresAt,
    data: { kind: 'password_reset' },
  });

  if (result.email === 'failed') {
    // Não vaza para o cliente que o e-mail falhou (isso seria um canal de
    // enumeração), mas o evento fica visível nos logs do servidor.
    console.error(
      `[password-reset] falha ao enviar e-mail para tenant ${user.tenantId} (token gerado).`,
    );
  }

  // Auditoria: registra a SOLICITAÇÃO (não o token) — Cap. 13.4.
  await prismaUnscoped.auditLog.create({
    data: {
      tenantId: user.tenantId,
      userId: user.id,
      action: 'AUTH_PASSWORD_RESET_REQUESTED',
      entityType: 'User',
      entityId: user.id,
      after: { emailDomain: email.split('@')[1] ?? null, expiresAt: expiresAt.toISOString() },
    },
  });

  return jsonSuccess(genericResponse);
});
