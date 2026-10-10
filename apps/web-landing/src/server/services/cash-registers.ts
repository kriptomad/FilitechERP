// src/server/services/cash-registers.ts — Cap. 4.1 (Gaveta Cega)
//
// Abertura e fechamento de caixa.
//
// O ponto central do Cap. 4.1: o sistema NUNCA devolve `expectedAmount` para
// um caixa ainda aberto. Mostrar o esperado antes da contagem física convida o
// operador a ajustar a contagem até "bater" — que é exatamente o que a gaveta
// cega existe para impedir. O valor só é calculado e gravado na transação de
// fechamento, depois que a contagem já foi informada.
import { Prisma, type PrismaClient } from '@prisma/client';
import { DomainError } from '../api-envelope';

type Tx = Prisma.TransactionClient;

export interface RegisterRow {
  id: string;
  status: string;
  openingAmount: number;
  closingAmount: number | null;
  expectedAmount: number | null;
  divergenceAmount: number | null;
  openedAt: string;
  closedAt: string | null;
  /** Sempre true enquanto aberto: a UI não pode exibir o esperado. */
  blindClose: boolean;
}

const dec = (v: Prisma.Decimal | null | undefined): number | null =>
  v === null || v === undefined ? null : Number(v);

/**
 * Forma de resposta pós-fechamento.
 * Nunca serializa `expectedAmount` de um caixa aberto — nem por acidente.
 */
export function serializeRegister(register: {
  id: string;
  status: string;
  openingAmount: Prisma.Decimal;
  closingAmount: Prisma.Decimal | null;
  expectedAmount: Prisma.Decimal | null;
  divergenceAmount: Prisma.Decimal | null;
  openedAt: Date;
  closedAt: Date | null;
}): RegisterRow {
  const closed = register.status === 'CLOSED';

  return {
    id: register.id,
    status: register.status,
    openingAmount: Number(register.openingAmount),
    closingAmount: closed ? dec(register.closingAmount) : null,
    expectedAmount: closed ? dec(register.expectedAmount) : null,
    divergenceAmount: closed ? dec(register.divergenceAmount) : null,
    openedAt: register.openedAt.toISOString(),
    closedAt: register.closedAt?.toISOString() ?? null,
    blindClose: !closed,
  };
}

/** Lista os caixas do tenant — mais recente primeiro. */
export async function listRegisters(
  db: PrismaClient,
  tenantId: string,
  take = 50,
): Promise<RegisterRow[]> {
  const registers = await db.cashRegister.findMany({
    where: { tenantId },
    orderBy: { openedAt: 'desc' },
    take,
  });
  return registers.map(serializeRegister);
}

/** CAIXA ABERTO mais recente — o que o PDV usa para saber se pode vender. */
export async function getOpenRegister(
  db: PrismaClient,
  tenantId: string,
): Promise<RegisterRow | null> {
  const register = await db.cashRegister.findFirst({
    where: { tenantId, status: 'OPEN' },
    orderBy: { openedAt: 'desc' },
  });
  return register ? serializeRegister(register) : null;
}

export async function openRegister(
  db: PrismaClient,
  tenantId: string,
  openedById: string,
  openingAmount: number,
): Promise<RegisterRow> {
  if (openingAmount < 0) {
    throw new DomainError('VALIDATION_ERROR', 'O fundo de troco não pode ser negativo.', 400);
  }

  const open = await db.cashRegister.findFirst({
    where: { tenantId, status: 'OPEN' },
    select: { id: true },
  });

  if (open) {
    throw new DomainError(
      'REGISTER_ALREADY_OPEN',
      'Já existe um caixa aberto para este tenant.',
      409,
    );
  }

  const created = await db.cashRegister.create({
    data: {
      tenantId,
      openedById,
      openingAmount: new Prisma.Decimal(openingAmount),
      status: 'OPEN',
    },
  });

  // O enum só tem INJECTION (entrada) e WITHDRAWAL (saída) — a abertura é uma
  // INJEÇÃO de troco, e o fechamento registra a contagem como WITHDRAWAL.
  await db.cashRegisterMovement.create({
    data: {
      cashRegisterId: created.id,
      type: 'INJECTION',
      amount: new Prisma.Decimal(openingAmount),
      reason: 'Abertura de caixa (fundo de troco)',
      performedByUserId: openedById,
    },
  });

  return serializeRegister(created);
}

export interface CountEntry {
  method: string;
  amount: number;
}

/**
 * Fecha o caixa em MODO GAVETA CEGA (Cap. 4.1).
 *
 * 1. O sistema nunca devolve `expectedAmount` antes da contagem física.
 * 2. O operador informa a contagem por meio de pagamento.
 * 3. Só então o sistema calcula e revela a divergência (sobra/falta).
 */
export async function closeRegister(
  db: PrismaClient,
  tenantId: string,
  cashRegisterId: string,
  counted: CountEntry[],
  performedByUserId: string,
): Promise<RegisterRow> {
  return db.$transaction(async (tx: Tx) => {
    const register = await tx.cashRegister.findFirst({
      where: { id: cashRegisterId, tenantId },
    });

    if (!register) {
      throw new DomainError('REGISTER_NOT_FOUND', 'Caixa não encontrado.', 404);
    }
    if (register.status === 'CLOSED') {
      throw new DomainError('REGISTER_ALREADY_CLOSED', 'Caixa já fechado.', 409);
    }

    // Soma esperada = fundo de troco + pagamentos CONFIRMADOS das vendas deste caixa.
    const payments = await tx.payment.groupBy({
      by: ['method'],
      where: {
        sale: { cashRegisterId, tenantId },
        status: 'CONFIRMED',
      },
      _sum: { amount: true },
    });

    const salesByMethod = new Map<string, Prisma.Decimal>();
    for (const p of payments) {
      salesByMethod.set(p.method, p._sum.amount ?? new Prisma.Decimal(0));
    }

    const expected = register.openingAmount.plus(
      Array.from(salesByMethod.values()).reduce((a, b) => a.plus(b), new Prisma.Decimal(0)),
    );

    const countedTotal = counted.reduce((sum, c) => sum + (Number.isFinite(c.amount) ? c.amount : 0), 0);
    const countedDecimal = new Prisma.Decimal(countedTotal);
    const divergence = countedDecimal.minus(expected);

    // Agora, e somente agora, o sistema grava e revela os valores.
    const updated = await tx.cashRegister.update({
      where: { id: register.id },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        closingAmount: countedDecimal,
        expectedAmount: expected,
        divergenceAmount: divergence,
      },
    });

    await tx.cashRegisterMovement.create({
      data: {
        cashRegisterId: register.id,
        type: 'WITHDRAWAL',
        amount: countedDecimal,
        reason: `Fechamento de caixa (divergência ${divergence.toFixed(2)})`,
        performedByUserId,
      },
    });

    return serializeRegister(updated);
  });
}
