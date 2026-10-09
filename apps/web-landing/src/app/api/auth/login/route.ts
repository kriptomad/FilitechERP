// src/app/api/auth/login/route.ts — Cap. 9.2
//
// POST /api/auth/login — autentica e abre a sessão em cookie HTTP-only.
//
// A versão anterior aceitava apenas `demo@filitech.dev` / `caixa@filitech.dev`
// de um array hardcoded no próprio arquivo (e o commit mais recente chegou a
// colocar o cadastro no MESMO endpoint). Por isso "login não funcionava": não
// havia consulta ao banco, apenas dois usuários fictícios em memória.
import { NextResponse } from 'next/server';
import { prismaUnscoped } from '@/server/db';
import { jsonError } from '@/server/api-envelope';
import { attachSessionCookie, createSession } from '@/server/session';
import { verifyPassword } from '@/server/password';
import { handle } from '@/server/handler';
import { readJson, requireEmail, requireString } from '@/server/request';

export const dynamic = 'force-dynamic';

interface LoginBody {
  email?: unknown;
  password?: unknown;
}

export const POST = handle(async (request: Request) => {
  const body = await readJson<LoginBody>(request);
  const email = requireEmail(body.email);
  const password = requireString(body.password, 'password', { min: 1, max: 200 });

  // Lookup com cliente não-escopado: o login antecede o contexto de tenant.
  const found = await prismaUnscoped.user.findFirst({
    where: { email, active: true },
    include: {
      tenant: {
        select: {
          id: true,
          slug: true,
          status: true,
          tenantModules: {
            where: { active: true },
            select: { moduleCode: true },
          },
        },
      },
    },
  });

  // Mensagem única para e-mail inexistente e senha errada: distinguir os dois
  // permitiria enumerar contas válidas.
  const invalid = jsonError(401, 'INVALID_CREDENTIALS', 'E-mail ou senha inválidos.');
  if (!found) return invalid;

  const valid = await verifyPassword(found.passwordHash, password);
  if (!valid) return invalid;

  // Bloqueio por inadimplência tem precedência absoluta (Cap. 6.1).
  if (found.tenant.status === 'SUSPENDED' || found.tenant.status === 'CANCELLED') {
    return jsonError(
      402,
      'TENANT_SUSPENDED',
      'Assinatura suspensa por inadimplência. Regularize o pagamento para continuar.',
    );
  }

  const { accessToken } = await createSession({
    userId: found.id,
    tenantId: found.tenant.id,
    role: found.role,
  });

  const response = NextResponse.json({
    success: true,
    data: {
      accessToken,
      user: {
        id: found.id,
        name: found.name,
        role: found.role,
        tenantId: found.tenant.id,
        tenantSubdomain: found.tenant.slug,
      },
      activeModules: found.tenant.tenantModules.map((tm) => tm.moduleCode),
    },
    error: null,
  });

  return attachSessionCookie(response, accessToken);
});