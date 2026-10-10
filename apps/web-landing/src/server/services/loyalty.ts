// src/server/services/loyalty.ts — Cap. 4.1.1
//
// Fidelidade. Dois princípios que este arquivo não abre mão:
//
//   1. O saldo vive em `LoyaltyAccount.pointsBalance`, e CADA movimentação é
//      uma linha em `LoyaltyTransaction`. Só o saldo é a fonte de verdade —
//      o histórico explica o saldo, nunca o contrário (some um EARN do
//      histórico e o saldo continua igual; some o saldo e o histórico perde
//      consistência).
//
//   2. Resgate é CONDICIONAL (`WHERE pointsBalance >= ?`). Um saldo lido em
//      uma tela e decrementado logo depois é a corrida clássica que entrega
//      pontos em dobro com dois caixas abertos.
//
// Nada aqui roda quando `LoyaltyProgram.active` é falso — o programa é
// opt-in por tenant, não um comportamento escondido do PDV.
import { Prisma, type PrismaClient } from '@prisma/client';
import { DomainError } from '../api-envelope';
import { prismaUnscoped } from '../db';

// Todas as rotas de escrita recebem `db` para participarem da transação da
// venda; apenas o resumo e a expiração (operações próprias, fora de venda)
// usam o cliente direto.
const prismaUnscopedRef = () => prismaUnscoped;

type Db = Prisma.TransactionClient | PrismaClient;

export interface LoyaltyProgramView {
  active: boolean;
  pointsPerCurrencyUnit: number;
  redemptionValuePerPoint: number;
  minPointsToRedeem: number;
  pointsExpireAfterDays: number | null;
}

const PROGRAM_SELECT = {
  active: true,
  pointsPerCurrencyUnit: true,
  redemptionValuePerPoint: true,
  minPointsToRedeem: true,
  pointsExpireAfterDays: true,
} as const;

export async function getProgram(db: Db, tenantId: string): Promise<LoyaltyProgramView | null> {
  const program = await db.loyaltyProgram.findUnique({
    where: { tenantId },
    select: PROGRAM_SELECT,
  });
  if (!program) return null;

  return {
    active: program.active,
    pointsPerCurrencyUnit: Number(program.pointsPerCurrencyUnit),
    redemptionValuePerPoint: Number(program.redemptionValuePerPoint),
    minPointsToRedeem: program.minPointsToRedeem,
    pointsExpireAfterDays: program.pointsExpireAfterDays,
  };
}

/** Pontos que uma compra gera. Arredondado para baixo: nunca ponto fracionado. */
export function pointsForAmount(program: LoyaltyProgramView, amount: number): number {
  const raw = amount * program.pointsPerCurrencyUnit;
  return raw > 0 ? Math.floor(raw) : 0;
}

/** Valor em R$ que `points` valem na resgate. */
export function cashValueForPoints(program: LoyaltyProgramView, points: number): number {
  return Math.round(points * program.redemptionValuePerPoint * 100) / 100;
}

async function ensureAccount(db: Db, tenantId: string, clientId: string) {
  // Upsert condicional em duas etapas: se outro caixa criou a conta no mesmo
  // instante, a segunda chamada reaproveita em vez de estourar unique.
  const existing = await db.loyaltyAccount.findUnique({
    where: { clientId },
    select: { id: true, tenantId: true },
  });

  if (existing) {
    if (existing.tenantId !== tenantId) {
      // `clientId` é unique global — a conta pertence a outro tenant.
      throw new DomainError('LOYALTY_ACCOUNT_MISMATCH', 'Conta de fidelidade de outro tenant.', 403);
    }
    return existing.id;
  }

  const created = await db.loyaltyAccount.create({
    data: { tenantId, clientId, pointsBalance: 0 },
    select: { id: true },
  });
  return created.id;
}

export interface AccrueInput {
  tenantId: string;
  clientId: string | null;
  saleId: string;
  /** Total líquido da venda (já com desconto), em BRL. */
  amount: number;
}

/**
 * Lança os pontos de uma venda. Chamado DENTRO da transação da venda, então um
 * rollback de venda também desfaz os pontos — nunca pontos de venda anulada.
 *
 * Retorna os pontos creditados (0 quando o programa está off ou o cliente não
 * foi identificado).
 */
export async function accrueLoyaltyPoints(db: Db, input: AccrueInput): Promise<number> {
  if (!input.clientId || input.amount <= 0) return 0;

  const program = await getProgram(db, input.tenantId);
  if (!program || !program.active) return 0;

  const points = pointsForAmount(program, input.amount);
  if (points <= 0) return 0;

  const accountId = await ensureAccount(db, input.tenantId, input.clientId);
  const expiresAt =
    program.pointsExpireAfterDays && program.pointsExpireAfterDays > 0
      ? new Date(Date.now() + program.pointsExpireAfterDays * 24 * 60 * 60 * 1000)
      : null;

  await db.loyaltyTransaction.create({
    data: {
      loyaltyAccountId: accountId,
      type: 'EARN',
      points,
      saleId: input.saleId,
      expiresAt,
      reason: `Compra ${input.saleId}`,
    },
  });

  await db.loyaltyAccount.update({
    where: { id: accountId },
    data: { pointsBalance: { increment: points } },
  });

  return points;
}

export interface RedeemInput {
  tenantId: string;
  clientId: string;
  points: number;
  reason?: string;
}

/**
 * Resgate condicional. Falha com 409 quando o saldo não cobre — e não deixa
 * saldo negativo no caminho.
 */
export async function redeemLoyaltyPoints(db: Db, input: RedeemInput) {
  const program = await getProgram(db, input.tenantId);
  if (!program || !program.active) {
    throw new DomainError('LOYALTY_INACTIVE', 'O programa de fidelidade está desativado.', 409);
  }

  if (!Number.isInteger(input.points) || input.points <= 0) {
    throw new DomainError('VALIDATION_ERROR', 'Quantidade de pontos inválida.', 400, {
      field: 'points',
    });
  }

  if (input.points < program.minPointsToRedeem) {
    throw new DomainError(
      'LOYALTY_MIN_POINTS',
      `O resgate mínimo é de ${program.minPointsToRedeem} pontos.`,
      409,
      { minPointsToRedeem: program.minPointsToRedeem },
    );
  }

  const account = await db.loyaltyAccount.findUnique({
    where: { clientId: input.clientId },
    select: { id: true, tenantId: true, pointsBalance: true },
  });

  if (!account || account.tenantId !== input.tenantId) {
    throw new DomainError('LOYALTY_ACCOUNT_NOT_FOUND', 'Cliente sem conta de fidelidade.', 404);
  }

  // O decremento CONDICIONAL é a trava real — a leitura acima só serve para
  // dar uma mensagem boa, não para decidir.
  const applied = await db.loyaltyAccount.updateMany({
    where: { id: account.id, pointsBalance: { gte: input.points } },
    data: { pointsBalance: { decrement: input.points } },
  });

  if (applied.count === 0) {
    throw new DomainError('LOYALTY_INSUFFICIENT', 'Saldo de pontos insuficiente.', 409, {
      available: account.pointsBalance,
      requested: input.points,
    });
  }

  await db.loyaltyTransaction.create({
    data: {
      loyaltyAccountId: account.id,
      type: 'REDEEM',
      points: input.points,
      reason: input.reason ?? 'Resgate no PDV',
    },
  });

  return {
    points: input.points,
    value: cashValueForPoints(program, input.points),
    remaining: Math.max(0, account.pointsBalance - input.points),
  };
}

export interface LoyaltySummary {
  program: LoyaltyProgramView | null;
  balance: number;
  expiringPoints: number;
  expiringUntil: string | null;
  history: Array<{
    id: string;
    type: string;
    points: number;
    reason: string | null;
    saleId: string | null;
    expiresAt: string | null;
    createdAt: string;
  }>;
}

export async function getLoyaltySummary(
  tenantId: string,
  clientId: string,
  take = 30,
): Promise<LoyaltySummary> {
  const [program, account] = await Promise.all([
    getProgram(prismaUnscopedRef(), tenantId),
    prismaUnscopedRef().loyaltyAccount.findUnique({
      where: { clientId },
      select: { id: true, tenantId: true, pointsBalance: true },
    }),
  ]);

  if (!account || account.tenantId !== tenantId) {
    return { program, balance: 0, expiringPoints: 0, expiringUntil: null, history: [] };
  }

  const horizon = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const [expiring, history] = await Promise.all([
    prismaUnscopedRef().loyaltyTransaction.aggregate({
      where: {
        loyaltyAccountId: account.id,
        type: 'EARN',
        expiresAt: { gt: new Date(), lte: horizon },
      },
      _sum: { points: true },
    }),
    prismaUnscopedRef().loyaltyTransaction.findMany({
      where: { loyaltyAccountId: account.id },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        type: true,
        points: true,
        reason: true,
        saleId: true,
        expiresAt: true,
        createdAt: true,
      },
    }),
  ]);

  return {
    program,
    balance: account.pointsBalance,
    expiringPoints: expiring._sum.points ?? 0,
    expiringUntil: horizon.toISOString(),
    history: history.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt?.toISOString() ?? null,
    })),
  };
}

/**
 * Expira pontos vencidos (cron diário).
 *
 * O `pointsBalance` só desce quando há saldo para descontar — um ajuste
 * manual que deixou a conta em 0 não gera saldo negativo.
 */
export async function expireLoyaltyPoints(): Promise<{
  accounts: number;
  points: number;
}> {
  const now = new Date();

  const due = await prismaUnscopedRef().loyaltyTransaction.findMany({
    where: { type: 'EARN', expiresAt: { lte: now } },
    select: { id: true, loyaltyAccountId: true, points: true, saleId: true, expiresAt: true },
    take: 500,
  });

  let accounts = 0;
  let points = 0;

  for (const row of due) {
    const applied = await prismaUnscopedRef().loyaltyAccount.updateMany({
      where: { id: row.loyaltyAccountId, pointsBalance: { gte: row.points } },
      data: { pointsBalance: { decrement: row.points } },
    });

    if (applied.count === 0) {
      // Saldo já drenado por resgates: registra o evento com 0 e encerra a
      // linha (senão ela expiraria de novo toda noite para sempre).
      await prismaUnscopedRef().loyaltyTransaction.create({
        data: {
          loyaltyAccountId: row.loyaltyAccountId,
          type: 'EXPIRE',
          points: 0,
          reason: `Expiração de pontos da venda ${row.saleId ?? '—'} (sem saldo a descontar)`,
        },
      });
      await prismaUnscopedRef().loyaltyTransaction.update({
        where: { id: row.id },
        data: { expiresAt: null },
      });
      continue;
    }

    await prismaUnscopedRef().loyaltyTransaction.create({
      data: {
        loyaltyAccountId: row.loyaltyAccountId,
        type: 'EXPIRE',
        points: row.points,
        saleId: row.saleId,
        reason: 'Pontos vencidos',
      },
    });
    // Marca como processada (venceu e foi debitada) — não é mais candidata.
    await prismaUnscopedRef().loyaltyTransaction.update({
      where: { id: row.id },
      data: { expiresAt: null },
    });

    accounts += 1;
    points += row.points;
  }

  return { accounts, points };
}
