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

  const plan = charge.subscription?.plan;
  const paidAt = new Date();

  await prismaUnscoped.$transaction(async (tx) => {
    await tx.paymentCharge.update({
      where: { id: charge.id },
      data: { status: 'PAID', paidAt, failureReason: null },
    });

    if (charge.subscriptionId) {
      await tx.subscription.update({
        where: { id: charge.subscriptionId },
        data: {
          status: 'ACTIVE',
          pastDueSince: null,
          failedPaymentAttempts: 0,
          nextRetryAt: null,
          firstChargedAt: charge.subscription?.firstChargedAt ?? paidAt,
        },
      });
    }

    // Só AGORA os módulos são liberados — depois da prova de pagamento.
    const codes = new Set<string>([
      ...(plan?.includedModules ?? []),
      ...(charge.moduleCodes ?? []),
    ]);

    for (const moduleCode of codes) {
      await tx.tenantModule.upsert({
        where: { tenantId_moduleCode: { tenantId: charge.tenantId, moduleCode } },
        create: { tenantId: charge.tenantId, moduleCode, active: true, activatedAt: paidAt },
        update: { active: true, activatedAt: paidAt, deactivatedAt: null },
      });
    }

    await tx.tenant.update({ where: { id: charge.tenantId }, data: { status: 'ACTIVE' } });

    await tx.billingEvent.create({
      data: {
        subscriptionId: charge.subscriptionId,
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
    subscriptionId: charge.subscriptionId,
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

    for (const moduleCode of plan.includedModules) {
      await tx.tenantModule.upsert({
        where: { tenantId_moduleCode: { tenantId, moduleCode } },
        create: { tenantId, moduleCode, active: true, activatedAt: now },
        update: { active: true, activatedAt: now, deactivatedAt: null },
      });
    }

    await tx.tenant.update({ where: { id: tenantId }, data: { status: 'TRIAL' } });
    return subscription.id;
  });

  await invalidateModulesCache(tenantId);
  return subscriptionId;
}