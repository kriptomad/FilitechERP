// src/app/api/billing/checkout/route.ts — Cap. 9.3
//
// REGRA INEGOCIÁVEL: este endpoint NÃO ativa nada.
//
// O comportamento anterior era: recebia o clique em "Assinar", gravava a
// Subscription como ACTIVE, ativava os TenantModule e devolvia sucesso — sem
// consultar PSP, sem QR Code, sem esperar confirmação. O cliente saía do fluxo
// com tudo liberado sem ter pago nada.
//
// Fluxo correto:
//   1. Calcula o valor (fonte: catálogo real) e devolve o breakdown.
//   2. Cria a cobrança NO PSP e persiste um PaymentCharge PENDING.
//   3. Devolve o instrumento de pagamento (QR Code Pix copia-e-cola / link de checkout).
//   4. O Tenant só é promovido para ACTIVE quando o WEBHOOK do provedor chega.
import { randomUUID } from 'node:crypto';
import { prismaUnscoped } from '@/server/db';
import { DomainError, jsonSuccess } from '@/server/api-envelope';
import { invalidateModulesCache } from '@/server/cache';
import { readJson, optionalString, requireStringArray } from '@/server/request';
import { withTenant } from '@/server/tenant-context';
import { readSession } from '@/server/session';
import { round2 } from '@/server/billing-catalog';
import { absoluteUrl } from '@/server/env';
import { resolveGateway, gatewayDisplayName } from '@/server/payment/gateway';
import { activateFreePlan, confirmCharge } from '@/server/payment/confirm-charge';
import { handle } from '@/server/handler';

export const dynamic = 'force-dynamic';

interface CheckoutBody {
  planCode?: unknown;
  selectedModuleCodes?: unknown;
  billingCycle?: unknown;
  paymentGateway?: unknown;
  paymentMethod?: unknown;
}

// `handle()` converte DomainError (JSON inválido, plano inexistente, gateway
// ausente) no envelope de erro correto — sem ele, `readJson` lançando num JSON
// malformado virava 500 genérico.
export const POST = handle(async (request: Request) => {
  const body = await readJson<CheckoutBody>(request);
  const planCode = optionalString(body.planCode, 'planCode', 40) ?? 'BASIC';
  const billingCycle = optionalString(body.billingCycle, 'billingCycle', 20) ?? 'MONTHLY';
  const paymentGateway = optionalString(body.paymentGateway, 'paymentGateway', 20) ?? 'ASAAS';
  const paymentMethod = (optionalString(body.paymentMethod, 'paymentMethod', 20) ?? 'PIX').toUpperCase() as 'PIX' | 'CREDIT_CARD' | 'BOLETO';
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

  // ── Sem sessão: só simula o cálculo e aponta para o cadastro (Cap. 9.3) ────
  if (!session) {
    const extraCodes = modules
      .filter((m) => !plan.includedModules.includes(m.code))
      .map((m) => m.code)
      .join(',');

    const qs = new URLSearchParams({ plan: plan.code, cycle: billingCycle });
    if (extraCodes) qs.set('mods', extraCodes);

    return jsonSuccess({
      // Nenhuma assinatura foi criada nesta rota (não há sessão): um ID aqui
      // seria inventado e não existiria no banco. Quem vê este payload está
      // apenas olhando o cálculo.
      subscriptionId: null,
      preview: true,
      computedMrr,
      billingCycle,
      breakdown,
      requiresAccount: true,
      checkoutRedirectUrl: absoluteUrl(`/cadastro?${qs.toString()}`),
    });
  }

  // ── Plano gratuito: não há o que cobrar ───────────────────────────────────
  if (computedMrr === 0) {
    const subscriptionId = await activateFreePlan(
      session.tenantId,
      plan.id,
      selectedModuleCodes,
    );

    return jsonSuccess({
      subscriptionId,
      computedMrr: 0,
      billingCycle,
      breakdown,
      requiresAccount: false,
      mode: 'free',
      message: 'Plano Free ativado.',
      checkoutRedirectUrl: absoluteUrl('/painel?checkout=sucesso'),
    });
  }

  // ── Plano pago: exige gateway configurado ─────────────────────────────────
  const gateway = resolveGateway();
  if (!gateway) {
    throw new DomainError(
      'GATEWAY_NOT_CONFIGURED',
      'Nenhum provedor de pagamento está configurado. Defina BILLING_GATEWAY e a chave ' +
        'do provedor (MERCADO_PAGO_ACCESS_TOKEN ou ASAAS_API_KEY) para habilitar a cobrança.',
      503,
    );
  }

  const [tenant, owner] = await Promise.all([
    prismaUnscoped.tenant.findUnique({
      where: { id: session.tenantId },
      select: { id: true, tradeName: true, cnpj: true },
    }),
    prismaUnscoped.user.findUnique({
      where: { id: session.userId },
      select: { name: true, email: true },
    }),
  ]);

  if (!tenant || !owner) {
    throw new DomainError('TENANT_NOT_FOUND', 'Conta não encontrada.', 404);
  }

  // ── Vínculo obrigatório com a assinatura ─────────────────────────────────
  //
  // `PaymentCharge.subscriptionId` é anulável, e este endpoint criava a
  // cobrança SEM ele. Consequência: quando o webhook chegava, confirmCharge()
  // não tinha subscription para promover a ACTIVE, e — como o plano vinha do
  // `subscription.plan` — também não ativava nenhum módulo do plano. O cliente
  // pagava e continuava bloqueado, sem nenhum log de erro.
  const subscription =
    (await prismaUnscoped.subscription.findFirst({
      where: { tenantId: session.tenantId },
      orderBy: { createdAt: 'desc' },
    })) ??
    (await prismaUnscoped.subscription.create({
      data: {
        tenantId: session.tenantId,
        planId: plan.id,
        provider: 'internal',
        externalSubscriptionId: `pending_${randomUUID()}`,
        status: 'TRIAL',
        currentPeriodEnd: periodEnd,
      },
    }));

  const description = `Filitech ERP — plano ${plan.label}${
    selectedModuleCodes.length > 0 ? ` + ${selectedModuleCodes.length} módulo(s)` : ''
  }`;

  // Chamada real ao PSP. Se falhar, nada foi ativado e o erro é propagado.
  const charge = await gateway.createCharge({
    tenantId: session.tenantId,
    customerEmail: owner.email,
    customerName: owner.name,
    customerDocument: tenant.cnpj,
    amount: computedMrr,
    method: paymentMethod,
    description,
    externalReference: session.tenantId,
  });

  const paymentCharge = await prismaUnscoped.paymentCharge.create({
    data: {
      tenantId: session.tenantId,
      subscriptionId: subscription.id,
      planCode: plan.code,
      moduleCodes: selectedModuleCodes,
      type: 'SUBSCRIPTION',
      status: charge.status === 'PAID' ? 'PAID' : 'PENDING',
      amount: computedMrr,
      provider: gateway.name,
      externalProviderId: charge.providerChargeId,
      pixQrCodePayload: charge.pixQrCodePayload ?? null,
      pixQrCodeBase64: charge.pixQrCodeBase64 ?? null,
      hostedCheckoutUrl: charge.hostedCheckoutUrl ?? null,
      dueDate: charge.dueDate ?? new Date(),
      expiresAt: charge.expiresAt,
      paidAt: charge.status === 'PAID' ? new Date() : null,
    },
  });

  await prismaUnscoped.billingEvent.create({
    data: {
      subscriptionId: subscription.id,
      paymentChargeId: paymentCharge.id,
      provider: gateway.name,
      externalEventKey: `checkout_${randomUUID()}`,
      type: 'checkout.pending',
      payload: { computedMrr, billingCycle, breakdown, planCode: plan.code, paymentMethod },
    },
  });

  // Coincidência rara: PSP confirma já na criação. Ainda assim passa por
  // confirmCharge(), para que existe UM só caminho de ativação.
  if (charge.status === 'PAID') {
    await confirmCharge(paymentCharge.id);
    await invalidateModulesCache(session.tenantId);
  }

  return jsonSuccess({
    paymentChargeId: paymentCharge.id,
    subscriptionId: subscription.id,
    computedMrr,
    billingCycle,
    breakdown,
    requiresAccount: false,
    mode: 'charge',
    provider: gateway.name,
    providerLabel: gatewayDisplayName(),
    status: paymentCharge.status === 'PAID' ? 'PAID' : 'AWAITING_PAYMENT',
    payment: {
      method: paymentMethod,
      pixQrCodePayload: charge.pixQrCodePayload ?? null,
      pixQrCodeBase64: charge.pixQrCodeBase64 ?? null,
      hostedCheckoutUrl: charge.hostedCheckoutUrl ?? null,
      expiresAt: charge.expiresAt.toISOString(),
    },
    message:
      paymentCharge.status === 'PAID'
        ? 'Pagamento confirmado. Sua assinatura está ativa.'
        : 'Cobrança criada. Finalize o pagamento para ativar a assinatura.',
    checkoutRedirectUrl: absoluteUrl(
      `/painel?checkout=${paymentCharge.status === 'PAID' ? 'sucesso' : 'pendente'}&charge=${paymentCharge.id}`,
    ),
  });
});