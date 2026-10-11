// src/app/api/auth/signup/route.ts — Cap. 1.2.1 / 2.4
//
// POST /api/auth/signup — cadastro PLG sem cartão de crédito.
// Cria Tenant (TRIAL) + User OWNER + Subscription + TenantModules e abre
// sessão imediatamente (onboarding sem fricção).
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
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
  nicheCode?: unknown;
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

  // Nicho (Cap. 1.2.2): define o template de catálogo e os módulos sugeridos.
  // Sem ele a conta funciona, mas o lojista cai na tela em branco.
  const nicheCodeInput = optionalString(body.nicheCode, 'nicho', 40);
  let niche: { code: string; label: string; suggestedModules: string[] } | null = null;
  if (nicheCodeInput) {
    const found = await prismaUnscoped.niche.findFirst({
      where: { code: nicheCodeInput as never, active: true },
      select: { code: true, label: true, suggestedModules: true },
    });
    if (!found) {
      return jsonError(400, 'INVALID_NICHE', 'Nicho inválido.');
    }
    niche = found;
  }

  // Slug único derivado do nome fantasia (Cap. 1.2.1).
  const baseSlug = slugify(tradeName) || 'loja';
  let slug = baseSlug;
  for (let i = 2; ; i++) {
    const clash = await prismaUnscoped.tenant.findUnique({ where: { slug } });
    if (!clash) break;
    slug = `${baseSlug}-${i}`;
  }

  // ── O que é liberado AGORA ───────────────────────────────────────────────────
  // Só o que o plano escolhido realmente inclui. Módulos sugeridos pelo nicho e
  // add-ons clicados na vitrine entram como `pendingModuleCodes` — eles têm
  // preço, e ativá-los aqui seria entregar produto pago sem cobrar (o mesmo
  // vazamento que o checkout já estava fechado: "nada é liberado antes do PSP").
  const activatedCodes = Array.from(new Set(plan.includedModules));
  const requestedCodes = Array.from(
    new Set([...selectedModuleCodes, ...(niche?.suggestedModules ?? [])]),
  );
  const pendingModuleCodes = requestedCodes.filter(
    (code) => !activatedCodes.includes(code),
  );
  const activeCodes = activatedCodes;

  const computedMrr =
    Math.round(
      (Number(plan.basePrice) +
        requestedModules.reduce((sum, m) => sum + Number(m.monthlyPrice), 0)) *
        100,
    ) / 100;

  const passwordHash = await hashPassword(password);
  // "Plano gratuito" é o que tem preço zero — a mesma guarda de
  // activateFreePlan(), não uma comparação de string de código.
  const isFree = Number(plan.basePrice) === 0;
  const now = new Date();
  const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Janela do trial do plano pago. Ela precisa EXISTIR: um tenant em TRIAL sem
  // data de fim nunca é alcançado pela régua do dunning, e o plano escolhido
  // ficaria liberado para sempre sem ninguém ter pago. TRIAL_DAYS=0 desliga.
  const trialDays = Math.max(0, Number(process.env.TRIAL_DAYS ?? '7') || 0);
  const gracePeriodEndsAt =
    isFree || trialDays === 0
      ? null
      : new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);

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
          // TRIAL, nunca ACTIVE: promover para ACTIVE é exclusivo de
          // confirmCharge() após confirmação do PSP. O plano gratuito fica em
          // TRIAL permanente (gracePeriodEndsAt nulo — nada a vencer).
          status: 'TRIAL',
          gracePeriodEndsAt,
          nicheCode: niche?.code as never,
        },
      });

      const user = await tx.user.create({
        data: { tenantId: tenant.id, name, email, passwordHash, role: 'OWNER' },
      });

      // Template de catálogo do nicho (Cap. 1.2.2): o tenant abre o sistema com
      // produtos de exemplo já cadastrados, em vez de uma grade vazia.
      if (niche) {
        const template = await tx.nicheTemplateProduct.findMany({
          where: { nicheCode: niche.code as never },
          orderBy: { sortOrder: 'asc' },
          take: 12,
        });

        if (template.length > 0) {
          await tx.product.createMany({
            data: template.map((item, index) => ({
              tenantId: tenant.id,
              sku: `TPL-${String(index + 1).padStart(3, '0')}`,
              name: item.name,
              category: item.category,
              unitPrice: item.unitPrice,
              // Custo médio = 60% do preço de venda (mesmo cálculo do template de nicho)
              averageCost: Math.round(Number(item.unitPrice) * 0.6 * 100) / 100,
              stockQuantity: new Prisma.Decimal(0),
              active: true,
              unit: "un",
            })),
          });
        }
      }

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

      // Módulos pedidos mas não incluídos: registrados como INATIVOS. Assim a
      // vitrine/dor do cliente aparece como "disponível para contratar" em vez
      // de simplesmente sumir — e o gatekeeper continua recusando qualquer
      // requisição a eles (402 com upsell) até o pagamento chegar.
      if (pendingModuleCodes.length > 0) {
        await tx.tenantModule.createMany({
          data: pendingModuleCodes.map((moduleCode) => ({
            tenantId: tenant.id,
            moduleCode,
            active: false,
          })),
          skipDuplicates: true,
        });
      }

      const subscription = await tx.subscription.create({
        data: {
          tenantId: tenant.id,
          planId: plan.id,
          // Sem PSP escolhido ainda: não existe assinatura no provedor até o
          // checkout criar a cobrança. O ID `sub_...` fabricado aqui era
          // indistinguível de um registro real para quem auditasse o banco.
          provider: 'internal',
          externalSubscriptionId: `pending_${randomUUID()}`,
          status: 'TRIAL',
          currentPeriodEnd: gracePeriodEndsAt ?? periodEnd,
        },
      });

      await tx.billingEvent.create({
        data: {
          subscriptionId: subscription.id,
          provider: isFree ? 'free' : 'internal',
          externalEventKey: `signup_${randomUUID()}`,
          // `checkout.completed` documentaria um checkout que não aconteceu.
          // O cadastro gera dois estados distintos e o próprio banco precisa
          // dizer qual foi.
          type: isFree ? 'signup' : 'signup.pending_payment',
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
        // Módulos pedidos que ainda dependem de pagamento — o cliente precisa
        // disto para saber o que está esperando, e não receber um "sucesso"
        // com metade dos itens faltando.
        pendingModuleCodes,
        plan: plan.code,
        subscriptionId: created.subscription.id,
        computedMrr,
        niche: niche ? { code: niche.code, label: niche.label } : null,
        // O onboarding usa isto para levar o lojista ao primeiro passo real.
        // `checkout` vem antes de tudo quando há algo a pagar: abrir o caixa
        // sem ter contratado o que o cliente escolheu geraria um ERP que
        // responde 402 na primeira tela.
        onboarding: {
          nextStep: !isFree || pendingModuleCodes.length > 0 ? 'checkout' : niche ? 'abrir-caixa' : 'escolher-nicho',
          message: !isFree
            ? `Plano ${plan.label} pré-liberado por ${trialDays === 0 ? '0' : trialDays} dia(s). Conclua o pagamento para confirmar a assinatura.`
            : pendingModuleCodes.length > 0
              ? `${pendingModuleCodes.length} módulo(s) extras aguardando contratação. Continue para o checkout quando quiser ativá-los.`
              : niche
                ? `Catálogo inicial de ${niche.label} carregado. Abra o caixa para começar a vender.`
                : 'Escolha seu nicho para carregar o catálogo inicial.',
          checkoutUrl: !isFree || pendingModuleCodes.length > 0
            ? `/checkout?plan=${encodeURIComponent(plan.code)}&mods=${encodeURIComponent(pendingModuleCodes.join(','))}&nicho=${encodeURIComponent(niche?.code ?? '')}`
            : null,
        },
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