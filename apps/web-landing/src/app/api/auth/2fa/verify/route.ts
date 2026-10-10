// src/app/api/auth/2fa/verify/route.ts — Cap. 14.2 Passo 2 do login
//
// Antes exigia uma SESSÃO JÁ ABERTA para validar o código — o que tornava o
// 2FA decorativo: o login já tinha concedido a sessão completa antes de o
// código ser pedido. Nenhum cliente chamava a rota, e quem ativava 2FA ficava
// com a mesma segurança de quem não ativava.
//
// Agora o fluxo é o do Cap. 14.2:
//   POST /api/auth/login  → senha OK + 2FA ativo ⇒ desafio (5 min), sem cookie
//   POST /api/auth/2fa/verify { twoFactorToken, code } ⇒ sessão real + cookie
//
// Aceita TOTP do aplicativo OU código de backup de uso único.
import { authenticator } from 'otplib';
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { prismaUnscoped } from '@/server/db';
import { jsonError } from '@/server/api-envelope';
import { verifyChallengeToken, signSessionToken } from '@/server/jwt';
import { attachSessionCookie } from '@/server/session';
import { handle } from '@/server/handler';
import { readJson, requireString } from '@/server/request';
import { backupCodeHash } from '@/server/two-factor';
import { isLegacyTotpSecret, openTotpSecret, sealTotpSecret } from '@/server/totp-secret';

export const dynamic = 'force-dynamic';

interface VerifyBody {
  twoFactorToken?: unknown;
  code?: unknown;
}

export const POST = handle(async (request: Request) => {
  const body = await readJson<VerifyBody>(request);

  const challengeToken = requireString(body.twoFactorToken, 'twoFactorToken', {
    min: 20,
    max: 4000,
  });
  const code = requireString(body.code, 'código', { min: 6, max: 20 }).trim();

  // O desafio é o ÚNICO caminho para a sessão aqui — ele só existe depois de
  // a senha ter sido validada no /login.
  let userId: string;
  try {
    userId = await verifyChallengeToken(challengeToken);
  } catch {
    return jsonError(
      401,
      'CHALLENGE_INVALID',
      'Sessão de verificação expirada. Entre novamente.',
    );
  }

  const user = await prismaUnscoped.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      tenantId: true,
      name: true,
      role: true,
      active: true,
      totpSecretEncrypted: true,
      totpConfirmedAt: true,
      tenant: {
        select: {
          slug: true,
          status: true,
          tenantModules: { where: { active: true }, select: { moduleCode: true } },
        },
      },
    },
  });

  if (!user || !user.active) {
    return jsonError(401, 'CHALLENGE_INVALID', 'Conta indisponível.');
  }
  if (!user.totpConfirmedAt || !user.totpSecretEncrypted) {
    return jsonError(400, '2FA_NOT_ENABLED', '2FA não está ativo para esta conta.');
  }

  // Inadimplência tem precedência absoluta (Cap. 6.1) — vale também aqui.
  if (user.tenant.status === 'SUSPENDED' || user.tenant.status === 'CANCELLED') {
    return jsonError(
      402,
      'TENANT_SUSPENDED',
      'Assinatura suspensa por inadimplência. Regularize o pagamento para continuar.',
    );
  }

  const secret = openTotpSecret(user.totpSecretEncrypted);
  const normalized = code.replace(/[\s-]/g, '');
  const isTotp = /^\d{6}$/.test(normalized) && authenticator.verify({ token: normalized, secret });

  if (!isTotp) {
    // Fallback: código de backup (Cap. 14.2). Consumido em transação para que
    // dois usos simultâneos do MESMO código não passem — UPDATE condicional.
    const now = new Date();
    const consumed = await prismaUnscoped.twoFactorBackupCode.updateMany({
      where: { userId: user.id, code: backupCodeHash(normalized), usedAt: null },
      data: { usedAt: now },
    });

    if (consumed.count === 0) {
      // Mensagem única: não revelar se foi TOTP errado, backup usado ou inexistente.
      return jsonError(401, 'INVALID_2FA_CODE', 'Código inválido.');
    }
  }

  // Migração pós-login: segredo ainda no formato legado (base64 puro) sai
  // cifrado assim que o dono prova que é o dono. A falha não pode barrar o
  // login — o dado continua legível, só não foi reescrito desta vez.
  if (isLegacyTotpSecret(user.totpSecretEncrypted)) {
    try {
      await prismaUnscoped.user.update({
        where: { id: user.id },
        data: { totpSecretEncrypted: sealTotpSecret(secret) },
      });
    } catch (err) {
      console.error('[2fa] falha ao cifrar segredo legado (login segue):', err);
    }
  }

  const accessToken = await signSessionToken({
    userId: user.id,
    tenantId: user.tenantId,
    role: user.role,
    sessionId: randomUUID(),
  });

  const response = NextResponse.json({
    success: true,
    data: {
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
        tenantSubdomain: user.tenant.slug,
      },
      activeModules: user.tenant.tenantModules.map((tm) => tm.moduleCode),
    },
    error: null,
  });

  return attachSessionCookie(response, accessToken);
});
