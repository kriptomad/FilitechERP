// src/server/payment/confirm-charge.ts — Cap. 2.7.4
//
// Confirmação de pagamento — ÚNICO ponto autorizado a promover uma assinatura
// para ACTIVE e liberar módulos.
//
// Extraído para módulo próprio (e não para dentro do Route Handler) por dois
// motivos:
//   1. Route Handlers do App Router só podem exportar os verbos HTTP — exportar
//      `confirmCharge` junto quebra a checagem de tipos do Next;
//   2. o webhook e o checkout precisam chamar exatamente a MESMA rotina. Duas
//      cópias significariam dois lugares able de liberar acesso — exatamente o
//      tipo de brecha que o Cap. 2.7 quer fechar.
import { randomUUID } from 'node:crypto';
import { prismaUnscoped } from '../db';
import { invalidateModulesCache } from '../cache';

export interface ConfirmChargeResult {
  alreadyConfirmed: boolean;
  tenantId: string;
  subscriptionId: string | null;
}

/**
 * Marca a cobrança como paga e libera o acesso.
 * Idempotente: chamar duas vezes não duplica nem regride estado.
 */
export async function confirmCharge(
  paymentChargeId: string,
): Promise<ConfirmChargeResult> {
  const charge = await prismaUnscoped.paymentCharge.findUnique({
    where: { id: paymentChargeId },
    include: { subscription: { include: { plan: true } } },
  });

  if (!charge) {
    throw new Error(`PaymentCharge ${paymentChargeId} não encontrado.`);
  }

  if (charge.status === 'PAID') {
    return {
      alreadyConfirmed: true,
      tenantId: charge.tenantId,
      subscriptionId: charge.subscriptionId,
    };
  }

  // O plano que está sendo pago vem da cobrança (`planCode`) — não da
  // assinatura atual, que pode ainda estar em FREE. É por isto que um upgrade
  // via checkout precisa trocar o `planId` aqui; antes, o cliente pagava o PRO
  // e a assinatura continuava apontando para o plano antigo.
  const plan = charge.planCode
    ? await prismaUnscoped.plan.findUnique({ where: { code: charge.planCode } })
    : (charge.subscription?.plan ?? null);

  // Cobranças criadas antes de o vínculo virar obrigatório chegam sem
  // subscriptionId. Sem esta resolução a ativação ficaria órfã: módulos seriam
  // liberados, mas a assinatura continuaria TRIAL e o próximo dunning a
  // suspenderia.
  const subscriptionId =
    charge.subscriptionId ??
    (
      await prismaUnscoped.subscription.findFirst({
        where: { tenantId: charge.tenantId },
        orderBy: { createdAt: 'desc' },
      })
    )?.id ??
    null;

  const paidAt = new Date();
  const nextPeriodEnd = new Date(paidAt.getTime() + 30 * 24 * 60 * 60 * 1000);

  await prismaUnscoped.$transaction(async (tx) => {
    await tx.paymentCharge.update({
      where: { id: charge.id },
      data: { status: 'PAID', paidAt, failureReason: null },
    });

    if (subscriptionId) {
      await tx.subscription.update({
        where: { id: subscriptionId },
        data: {
          status: 'ACTIVE',
          ...(plan ? { planId: plan.id } : {}),
          pastDueSince: null,
          failedPaymentAttempts: 0,
          nextRetryAt: null,
          currentPeriodEnd: nextPeriodEnd,
          firstChargedAt: charge.subscription?.firstChargedAt ?? paidAt,
        },
      });
    }

    // Só AGORA os módulos são liberados — depois da prova de pagamento.
    const purchased = new Set<string>([
      ...(plan?.includedModules ?? []),
      ...(charge.moduleCodes ?? []),
    ]);

    for (const moduleCode of purchased) {
      await tx.tenantModule.upsert({
        where: { tenantId_moduleCode: { tenantId: charge.tenantId, moduleCode } },
        create: { tenantId: charge.tenantId, moduleCode, active: true, activatedAt: paidAt },
        update: { active: true, activatedAt: paidAt, deactivatedAt: null },
      });
    }

    // Metade da troca de plano é desligar. Sem isto, quem saía de PRO para um
    // plano menor continuava com os add-ons pagos ativos — o gatekeeper só
    // olha `active`, então o vazamento era silencioso.
    if (plan && purchased.size > 0) {
      await tx.tenantModule.updateMany({
        where: {
          tenantId: charge.tenantId,
          active: true,
          moduleCode: { notIn: [...purchased] },
        },
        data: { active: false, deactivatedAt: paidAt },
      });
    }

    // `gracePeriodEndsAt` é limpo aqui de propósito: ele foi preenchido no
    // cadastro do trial e, se ficasse com data no passado, o cron (régua 4)
    // voltaria a suspender um tenant acabado de pagar.
    await tx.tenant.update({
      where: { id: charge.tenantId },
      data: { status: 'ACTIVE', gracePeriodEndsAt: null },
    });

    await tx.billingEvent.create({
      data: {
        subscriptionId,
        paymentChargeId: charge.id,
        provider: charge.provider,
        externalEventKey: `paid_${charge.externalProviderId ?? charge.id}_${paidAt.getTime()}`,
        type: 'payment.succeeded',
        payload: {
          amount: Number(charge.amount),
          providerChargeId: charge.externalProviderId,
          planCode: charge.planCode,
          moduleCodes: charge.moduleCodes,
          confirmedAt: paidAt.toISOString(),
        },
      },
    });
  });

  await invalidateModulesCache(charge.tenantId);

  return {
    alreadyConfirmed: false,
    tenantId: charge.tenantId,
    // Devolve o ID resolvido: quem chamou precisa saber qual assinatura foi
    // de fato promovida (pode ter sido resolvida por tenant quando a cobrança
    // antiga chegou sem vínculo).
    subscriptionId,
  };
}

/**
 * Ativação do plano gratuito (MRR = 0).
 *
 * Este é o ÚNICO caminho de ativação sem prova de pagamento, e existe porque
 * não há nada a cobrar. Deixar isso explícito em uma função separada impede
 * que alguém reaproveite o caminho "sem cobrança" para um plano pago.
 */
export async function activateFreePlan(
  tenantId: string,
  planId: string,
  /**
   * Add-ons escolhidos que também custam zero (ex.: `crm`, que o catálogo
   * marca como "incluso no PRO" e não em FREE). Sem estes, um FREE + add-on
   * gratuito acabava em `computedMrr === 0` e o add-on nunca saía de
   * `active: false` — o cliente clicava, o cobrança não pedia nada, e o
   * módulo seguia respondendo 402.
   */
  extraModuleCodes: string[] = [],
): Promise<string> {
  const now = new Date();
  const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const subscriptionId = await prismaUnscoped.$transaction(async (tx) => {
    const plan = await tx.plan.findUnique({ where: { id: planId } });
    if (!plan) throw new Error('Plano não encontrado.');
    if (Number(plan.basePrice) > 0) {
      // Guarda de segurança: plano pago NUNCA entra por este caminho.
      throw new Error('activateFreePlan chamada com plano pago.');
    }

    const existing = await tx.subscription.findFirst({ where: { tenantId } });
    const subscription = existing
      ? await tx.subscription.update({
          where: { id: existing.id },
          data: { planId, status: 'TRIAL', pastDueSince: null, currentPeriodEnd: periodEnd },
        })
      : await tx.subscription.create({
          data: {
            tenantId,
            planId,
            provider: 'internal',
            externalSubscriptionId: `free_${randomUUID()}`,
            status: 'TRIAL',
            currentPeriodEnd: periodEnd,
          },
        });

    const included = Array.from(new Set([...plan.includedModules, ...extraModuleCodes]));

    for (const moduleCode of included) {
      await tx.tenantModule.upsert({
        where: { tenantId_moduleCode: { tenantId, moduleCode } },
        create: { tenantId, moduleCode, active: true, activatedAt: now },
        update: { active: true, activatedAt: now, deactivatedAt: null },
      });
    }

    // Só ativar faltava o outro lado: quem desce para o plano gratuito
    // mantinha os add-ons pagos ativos (o registro continuava `active: true`,
    // e o gatekeeper só olha isto). Agora os módulos fora do plano novo saem.
    await tx.tenantModule.updateMany({
      where: {
        tenantId,
        active: true,
        moduleCode: { notIn: included },
      },
      data: { active: false, deactivatedAt: now },
    });

    await tx.tenant.update({
      where: { id: tenantId },
      // Trial sem data de fim = plano local, nunca alcançado pela régua do cron.
      data: { status: 'TRIAL', gracePeriodEndsAt: null },
    });
    return subscription.id;
  });

  await invalidateModulesCache(tenantId);
  return subscriptionId;
}