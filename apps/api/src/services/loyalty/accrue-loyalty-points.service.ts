// src/modules/loyalty/accrue-loyalty-points.service.ts
import { Prisma, PrismaClient } from "@prisma/client";
import { addDays } from "date-fns";

export class DomainError extends Error {
  constructor(public readonly code: string, public readonly details?: Record<string, unknown>) {
    super(code);
    this.name = "DomainError";
  }
}

export async function accrueLoyaltyPoints(tx: Prisma.TransactionClient, sale: Prisma.SaleGetPayload<{}>) {
  if (!sale.clientId) return;

  const program = await tx.loyaltyProgram.findUnique({ where: { tenantId: sale.tenantId } });
  if (!program?.active) return;

  const earnedPoints = Math.floor(sale.totalAmount.mul(program.pointsPerCurrencyUnit).toNumber());
  if (earnedPoints <= 0) return;

  const account = await tx.loyaltyAccount.upsert({
    where: { clientId: sale.clientId },
    create: { tenantId: sale.tenantId, clientId: sale.clientId, pointsBalance: earnedPoints },
    update: { pointsBalance: { increment: earnedPoints } },
  });

  await tx.loyaltyTransaction.create({
    data: {
      loyaltyAccountId: account.id,
      type: "EARN",
      points: earnedPoints,
      saleId: sale.id,
      expiresAt: program.pointsExpireAfterDays ? addDays(new Date(), program.pointsExpireAfterDays) : null,
    },
  });
}

export async function redeemLoyaltyPoints(
  tx: Prisma.TransactionClient,
  clientId: string,
  pointsToRedeem: number,
  saleId: string,
) {
  const program = await tx.loyaltyProgram.findFirstOrThrow({ where: { active: true } });
  if (pointsToRedeem < program.minPointsToRedeem) {
    throw new DomainError("LOYALTY_REDEMPTION_BELOW_MINIMUM", { minPointsToRedeem: program.minPointsToRedeem });
  }

  const result = await tx.loyaltyAccount.updateMany({
    where: { clientId, pointsBalance: { gte: pointsToRedeem } },
    data: { pointsBalance: { decrement: pointsToRedeem } },
  });
  if (result.count === 0) {
    throw new DomainError("INSUFFICIENT_LOYALTY_POINTS");
  }

  const account = await tx.loyaltyAccount.findUniqueOrThrow({ where: { clientId } });
  await tx.loyaltyTransaction.create({
    data: { loyaltyAccountId: account.id, type: "REDEEM", points: -pointsToRedeem, saleId },
  });

  return pointsToRedeem * program.redemptionValuePerPoint.toNumber();
}