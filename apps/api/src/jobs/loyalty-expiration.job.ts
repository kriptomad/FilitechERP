// src/jobs/loyalty-expiration.job.ts — expiração automática de pontos de fidelidade
import { prismaUnscoped } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";

export async function expireLoyaltyPoints() {
  const now = new Date();

  // Busca contas que já tiveram expiração registrada
  const alreadyExpiredAccounts = await prismaUnscoped.loyaltyTransaction.findMany({
    where: {
      type: "EXPIRE",
      createdAt: { gte: now },
    },
    select: { loyaltyAccountId: true },
  });

  const alreadyExpiredAccountIds = alreadyExpiredAccounts.map((t) => t.loyaltyAccountId);

  const expiredTransactions = await prismaUnscoped.loyaltyTransaction.findMany({
    where: {
      type: "EARN",
      expiresAt: { lte: now },
      // Já não compensa esta conta (já teve EXPIRE após a data de expiração)
      NOT: {
        loyaltyAccountId: {
          in: alreadyExpiredAccountIds,
        },
      },
    },
  });

  let expiredCount = 0;
  for (const tx of expiredTransactions) {
    const pointsToExpire = tx.points;
    await prismaUnscoped.$transaction(async (txPrisma) => {
      await txPrisma.loyaltyAccount.update({
        where: { id: tx.loyaltyAccountId },
        data: { pointsBalance: { decrement: pointsToExpire } },
      });
      await txPrisma.loyaltyTransaction.create({
        data: {
          loyaltyAccountId: tx.loyaltyAccountId,
          type: "EXPIRE",
          points: -pointsToExpire,
          reason: `Expiração automática de ${pointsToExpire} pontos`,
        },
      });
    });
    expiredCount++;
  }

  logger.info({ job: "loyalty-expiration", expiredCount }, "loyalty_expiration_completed");
  return { expiredCount };
}

export function registerLoyaltyExpirationWorker() {
  return {
    name: "loyalty-expiration",
    handler: () => expireLoyaltyPoints(),
    schedule: "0 2 * * *", // diário às 2h
  };
}