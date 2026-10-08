// src/modules/referral/apply-referral-reward.service.ts — recompensa por indicação convertida
import { prisma } from "../../lib/prisma.js";
import { addDays } from "date-fns";
// @typescript-eslint/no-var-requires
// @ts-ignore
import { emitNotification } from "../services/notifications/notification.service";

export async function applyReferralRewardOnFirstPayment(referredTenantId: string) {
  const referral = await prisma.referral.findUnique({
    where: { referredTenantId },
    include: { referralCode: true },
  });

  if (!referral || referral.status !== "PENDING") return; // tenant não veio de indicação, ou já processado — idempotente
  if (referral.expiresAt < new Date()) {
    await prisma.referral.update({ where: { id: referral.id }, data: { status: "EXPIRED" } });
    return;
  }

  await prisma.$transaction(async (tx) => {
    // Quem indicou ganha 1 mês de crédito na própria mensalidade
    // Primeiro encontra a subscrição do indicador
    const referrerSub = await tx.subscription.findFirst({
      where: { tenantId: referral.referralCode.tenantId },
    });
    if (referrerSub) {
      await tx.subscription.update({
        where: { id: referrerSub.id },
        data: { creditBalanceMonths: { increment: 1 } },
      });
    }
    // Quem foi indicado ganha 20% de desconto no primeiro ciclo cobrado
    const referredSub = await tx.subscription.findFirst({
      where: { tenantId: referredTenantId },
    });
    if (referredSub) {
      await tx.subscription.update({
        where: { id: referredSub.id },
        data: { firstCycleDiscountPercent: 20 },
      });
    }
    await tx.referral.update({
      where: { id: referral.id },
      data: { status: "CONVERTED", rewardAppliedAt: new Date() },
    });
  });

  // Reaproveita o sistema central de notificações — nunca um e-mail avulso
  // disparado fora do pipeline central de comunicação.
  await emitNotification({ recipientId: referral.referralCode.tenantId, category: "REFERRAL_CONVERTED", body: "Sua indicação virou assinante! 1 mês de crédito aplicado." });
}