// src/app/api/auth/signup/route.ts — Cap. 1.2.1 / 2.4
//
// POST /api/auth/signup — cadastro PLG sem cartão de crédito.
// Cria Tenant (TRIAL) + User OWNER + Subscription + TenantModules e abre
// sessão imediatamente (onboarding sem fricção).
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { prismaUnscoped } from '@/server/db';
import { jsonError, jsonSuccess } from '@/server/api-envelope';
import { attachSessionCookie, createSession } from '@/server/session';
import { hashPassword } from '@/server/password';
import {
  optionalString,
  readJson,
  requireEmail,
  requireString,
  requireStringArray,
  slugify,
} from '@/server/request';

export const dynamic = 'force-dynamic';

interface SignupBody {
  tradeName?: unknown;
  legalName?: unknown;
  cnpj?: unknown;
  email?: unknown;
  password?: unknown;
  name?: unknown;
  planCode?: unknown;
  selectedModuleCodes?: unknown;
  billingCycle?: unknown;
  termsAccepted?: unknown;
  privacyPolicyAccepted?: unknown;
}

export async function POST(request: Request) {
  const body = await readJson<SignupBody>(request);

  const tradeName = requireString(body.tradeName, 'nome fantasia', { min: 2, max: 160 });
  const name = requireString(body.name, 'nome', { min: 2, max: 160 });
  const email = requireEmail(body.email);
  const password = requireString(body.password, 'senha', { min: 8, max: 200 });
  const planCode = optionalString(body.planCode, 'planCode', 40) ?? 'FREE';
  const billingCycle = optionalString(body.billingCycle, 'billingCycle', 20) ?? 'MONTHLY';
  const selectedModuleCodes = requireStringArray(body.selectedModuleCodes, 'selectedModuleCodes');

  // Cap. 1.2.1: aceite explícito (checkbox não pré-marcado) de Termos e
  // Política de Privacidade é requisito de conformidade (LGPD art. 7º) — sem ele
  // a conta não é criada.
  if (body.termsAccepted !== true || body.privacyPolicyAccepted !== true) {
    return jsonError(
      400,
      'TERMS_NOT_ACCEPTED',
      'É necessário aceitar os Termos de Uso e a Política de Privacidade.',
    );
  }

  const plan = await prismaUnscoped.plan.findUnique({ where: { code: planCode } });
  if (!plan) {
    return jsonError(400, 'INVALID_PLAN', 'Plano não encontrado no catálogo.');
  }

  // Valida add-ons contra o catálogo antes de gravar qualquer TenantModule —
  // um código inexistente viraria FK inválida só na transação.
  let requestedModules: { code: string; monthlyPrice: unknown }[] = [];
  if (selectedModuleCodes.length > 0) {
    requestedModules = await prismaUnscoped.module.findMany({
      where: { code: { in: selectedModuleCodes }, active: true },
      select: { code: true, monthlyPrice: true },
    });
    if (requestedModules.length !== selectedModuleCodes.length) {
      return jsonError(400, 'INVALID_MODULE', 'Um ou mais módulos não existem no catálogo.');
    }
  }

  const existingUser = await prismaUnscoped.user.findFirst({ where: { email } });
  if (existingUser) {
    return jsonError(409, 'EMAIL_TAKEN', 'Já existe uma conta com este e-mail.');
  }

  const cnpj = optionalString(body.cnpj, 'cnpj', 18);
  if (cnpj) {
    const existingTenant = await prismaUnscoped.tenant.findUnique({ where: { cnpj } });
    if (existingTenant) {
      return jsonError(409, 'CNPJ_TAKEN', 'Já existe uma conta com este CNPJ.');
    }
  }

  // Slug único derivado do nome fantasia (Cap. 1.2.1).
  const baseSlug = slugify(tradeName) || 'loja';
  let slug = baseSlug;
  for (let i = 2; ; i++) {
    const clash = await prismaUnscoped.tenant.findUnique({ where: { slug } });
    if (!clash) break;
    slug = `${baseSlug}-${i}`;
  }

  const activeCodes = Array.from(
    new Set([...plan.includedModules, ...selectedModuleCodes]),
  );

  const computedMrr =
    Math.round(
      (Number(plan.basePrice) +
        requestedModules.reduce((sum, m) => sum + Number(m.monthlyPrice), 0)) *
        100,
    ) / 100;

  const passwordHash = await hashPassword(password);
  const isFree = plan.code === 'FREE';
  const now = new Date();
  const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  try {
    const created = await prismaUnscoped.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          slug,
          legalName: optionalString(body.legalName, 'legalName', 180) ?? tradeName,
          tradeName,
          // `cnpj` é @unique e obrigatório no schema (Cap. 5); placeholder único
          // para quem cadastra pela vitrine sem documento na hora.
          cnpj: cnpj ?? `PENDENTE-${randomUUID().slice(0, 12).toUpperCase()}`,
          status: isFree ? 'TRIAL' : 'ACTIVE',
        },
      });

      const user = await tx.user.create({
        data: { tenantId: tenant.id, name, email, passwordHash, role: 'OWNER' },
      });

      if (activeCodes.length > 0) {
        await tx.tenantModule.createMany({
          data: activeCodes.map((moduleCode) => ({
            tenantId: tenant.id,
            moduleCode,
            active: true,
          })),
          skipDuplicates: true,
        });
      }

      const subscription = await tx.subscription.create({
        data: {
          tenantId: tenant.id,
          planId: plan.id,
          provider: 'asaas',
          externalSubscriptionId: `sub_${randomUUID()}`,
          status: isFree ? 'TRIAL' : 'ACTIVE',
          currentPeriodEnd: periodEnd,
        },
      });

      await tx.billingEvent.create({
        data: {
          subscriptionId: subscription.id,
          provider: 'asaas',
          externalEventKey: `signup_${randomUUID()}`,
          type: isFree ? 'signup' : 'checkout.completed',
          payload: {
            planCode: plan.code,
            billingCycle,
            selectedModuleCodes,
            isFree,
            computedMrr,
            // Prova de consentimento (LGPD art. 7º) — Cap. 1.2.1.
            termsAcceptedAt: now.toISOString(),
            privacyPolicyAcceptedAt: now.toISOString(),
            termsVersion: process.env.TERMS_VERSION ?? '2026-01-v1',
          },
        },
      });

      return { tenant, user, subscription };
    });

    const { accessToken } = await createSession({
      userId: created.user.id,
      tenantId: created.tenant.id,
      role: 'OWNER',
    });

    const response = NextResponse.json(
      jsonSuccess({
        accessToken,
        user: {
          id: created.user.id,
          name: created.user.name,
          role: created.user.role,
          tenantId: created.tenant.id,
          tenantSubdomain: created.tenant.slug,
        },
        activeModules: activeCodes,
        plan: plan.code,
        subscriptionId: created.subscription.id,
        computedMrr,
      }),
      { status: 201 },
    );

    return attachSessionCookie(response, accessToken);
  } catch (err) {
    if (typeof err === 'object' && err !== null && 'code' in err) {
      const code = String((err as { code: unknown }).code);
      if (code === 'P2002') {
        return jsonError(409, 'DUPLICATED', 'Já existe uma conta com estes dados.');
      }
    }
    console.error('[signup] falha ao criar conta:', err);
    return jsonError(500, 'INTERNAL_ERROR', 'Erro interno ao criar a conta.');
  }
}