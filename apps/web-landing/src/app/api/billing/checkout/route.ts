// src/app/api/billing/checkout/route.ts — Cap. 9.3
//
// Sem sessão: devolve o cálculo + URL de onboarding (criação de conta).
// Com sessão: contrata de fato — cria/atualiza Subscription, ativa os módulos
// do plano + add-ons, registra BillingEvent e invalida o cache (Cap. 6.1).
import { randomUUID } from 'node:crypto';
import { prismaUnscoped } from '@/server/db';
import { DomainError, jsonSuccess } from '@/server/api-envelope';
import { invalidateModulesCache } from '@/server/cache';
import { readJson, optionalString, requireStringArray } from '@/server/request';
import { withTenant } from '@/server/tenant-context';
import { readSession } from '@/server/session';
import { round2 } from '@/server/billing-catalog';
import { absoluteUrl } from '@/server/env';

export const dynamic = 'force-dynamic';

interface CheckoutBody {
  planCode?: unknown;
  selectedModuleCodes?: unknown;
  billingCycle?: unknown;
  paymentGateway?: unknown;
  paymentMethod?: unknown;
}

export async function POST(request: Request) {
  const body = await readJson<CheckoutBody>(request);
  const planCode = optionalString(body.planCode, 'planCode', 40) ?? 'BASIC';
  const billingCycle = optionalString(body.billingCycle, 'billingCycle', 20) ?? 'MONTHLY';
  const paymentGateway = optionalString(body.paymentGateway, 'paymentGateway', 20) ?? 'ASAAS';
  const selectedModuleCodes = requireStringArray(body.selectedModuleCodes, 'selectedModuleCodes');

  const plan = await prismaUnscoped.plan.findUnique({ where: { code: planCode } });
  if (!plan) {
    throw new DomainError('INVALID_PLAN', 'Plano não encontrado no catálogo.');
  }

  const requested =
    selectedModuleCodes.length > 0 ? selectedModuleCodes : [...plan.includedModules];

  const modules = await prismaUnscoped.module.findMany({ where: { code: { in: requested } } });
  if (modules.length !== new Set(requested).size) {
    throw new DomainError('INVALID_MODULE', 'Um ou mais códigos de módulo não existem no catálogo.');
  }

  // Módulos inclusos no plano não são cobrados de novo — o breakdown só pode
  // mostrar o que será efetivamente cobrado (transparência radical).
  const breakdown = [
    { code: plan.code, label: `Plano ${plan.label} (base)`, price: Number(plan.basePrice) },
    ...modules
      .filter((m) => plan.includedModules.includes(m.code) || Number(m.monthlyPrice) > 0)
      .map((m) => ({
        code: m.code,
        label: m.label,
        price: plan.includedModules.includes(m.code) ? 0 : Number(m.monthlyPrice),
      })),
  ];
  const computedMrr = round2(breakdown.reduce((sum, b) => sum + b.price, 0));
  const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const session = await readSession(request);

  // ── Sem sessão: cálculo + onboarding (Cap. 9.3) ─────────────────────────
  if (!session) {
    const extraCodes = modules
      .filter((m) => !plan.includedModules.includes(m.code))
      .map((m) => m.code)
      .join(',');

    const qs = new URLSearchParams({ plan: plan.code, cycle: billingCycle });
    if (extraCodes) qs.set('mods', extraCodes);

    return jsonSuccess({
      subscriptionId: `preview_${Date.now()}`,
      computedMrr,
      billingCycle,
      breakdown,
      requiresAccount: true,
      checkoutRedirectUrl: absoluteUrl(`/cadastro?${qs.toString()}`),
    });
  }

  // ── Com sessão: contratação efetiva ─────────────────────────────────────
  const tenantId = session.tenantId;

  const subscriptionId = await withTenant(
    { tenantId, userId: session.userId, role: session.role },
    async () => {
      const existing = await prismaUnscoped.subscription.findFirst({ where: { tenantId } });

      const subscription = existing
        ? await prismaUnscoped.subscription.update({
            where: { id: existing.id },
            data: {
              planId: plan.id,
              status: 'ACTIVE',
              currentPeriodEnd: periodEnd,
              pastDueSince: null,
            },
          })
        : await prismaUnscoped.subscription.create({
            data: {
              tenantId,
              planId: plan.id,
              provider: paymentGateway.toLowerCase(),
              externalSubscriptionId: `sub_${randomUUID()}`,
              status: 'ACTIVE',
              currentPeriodEnd: periodEnd,
            },
          });

      // Ativa módulos do plano + add-ons selecionados.
      const codesToActivate = [...new Set([...plan.includedModules, ...modules.map((m) => m.code)])];
      for (const moduleCode of codesToActivate) {
        await prismaUnscoped.tenantModule.upsert({
          where: { tenantId_moduleCode: { tenantId, moduleCode } },
          create: { tenantId, moduleCode, active: true, activatedAt: new Date() },
          update: { active: true, activatedAt: new Date(), deactivatedAt: null },
        });
      }

      await prismaUnscoped.billingEvent.create({
        data: {
          subscriptionId: subscription.id,
          provider: paymentGateway.toLowerCase(),
          externalEventKey: `checkout_${randomUUID()}`,
          type: 'checkout.completed',
          payload: { computedMrr, billingCycle, breakdown, planCode: plan.code },
        },
      });

      await prismaUnscoped.tenant.update({
        where: { id: tenantId },
        data: { status: 'ACTIVE' },
      });

      // Invalidação de cache na mesma ação — Cap. 6.1.
      await invalidateModulesCache(tenantId);

      return subscription.id;
    },
  );

  return jsonSuccess({
    subscriptionId,
    computedMrr,
    billingCycle,
    breakdown,
    requiresAccount: false,
    checkoutRedirectUrl: absoluteUrl('/painel?checkout=sucesso'),
  });
}