// src/services/cash-register/cash-register.service.ts — Cap. 4.1 (Gaveta Cega)
import { Prisma, PrismaClient } from "@prisma/client";

export class RegisterNotOpenError extends Error {}
export class RegisterAlreadyClosedError extends Error {}

export async function openCashRegister(
  prisma: PrismaClient,
  input: { tenantId: string; openedById: string; openingAmount: number },
) {
  const open = await prisma.cashRegister.findFirst({
    where: { tenantId: input.tenantId, status: "OPEN" },
  });
  if (open) throw new RegisterNotOpenError("Já existe um caixa aberto para este tenant.");

  return prisma.cashRegister.create({
    data: {
      tenantId: input.tenantId,
      openedById: input.openedById,
      openingAmount: input.openingAmount,
      status: "OPEN",
    },
  });
}

/**
 * Fecha o caixa em modo GAVETA CEGA (Cap. 4.1):
 * 1. O sistema NUNCA devolve `expectedAmount` antes da contagem física.
 * 2. O operador informa a contagem por meio de pagamento.
 * 3. Só então o sistema calcula e revela a divergência (sobra/falta).
 */
export async function closeCashRegisterBlind(
  prisma: PrismaClient,
  input: {
    tenantId: string;
    cashRegisterId: string;
    /** Contagem física informada pelo operador, por meio de pagamento. */
    countedByMethod: {
      method: "CASH" | "DEBIT_CARD" | "CREDIT_CARD" | "PIX" | "BOLETO" | "STORE_CREDIT";
      amount: number;
    }[];
  },
) {
  return prisma.$transaction(async (tx) => {
    const register = await tx.cashRegister.findFirst({
      where: { id: input.cashRegisterId, tenantId: input.tenantId },
    });
    if (!register) throw new RegisterNotOpenError("Caixa não encontrado.");
    if (register.status === "CLOSED") throw new RegisterAlreadyClosedError("Caixa já fechado.");

    // Soma esperada = fundo de troco + pagamentos confirmados das vendas deste caixa.
    const payments = await tx.payment.groupBy({
      by: ["method"],
      where: {
        sale: { cashRegisterId: input.cashRegisterId, tenantId: input.tenantId },
        status: "CONFIRMED",
      },
      _sum: { amount: true },
    });

    const salesByMethod = new Map<string, Prisma.Decimal>();
    for (const p of payments) {
      salesByMethod.set(p.method, p._sum.amount ?? new Prisma.Decimal(0));
    }

    const expectedAmount = register.openingAmount.plus(
      Array.from(salesByMethod.values()).reduce((a, b) => a.plus(b), new Prisma.Decimal(0)),
    );

    const countedTotal = input.countedByMethod.reduce(
      (sum, c) => sum + c.amount,
      0,
    );
    const countedDecimal = new Prisma.Decimal(countedTotal);
    const divergenceAmount = countedDecimal.minus(expectedAmount);

    // Agora, e somente agora, o sistema grava e revela os valores.
    return tx.cashRegister.update({
      where: { id: register.id },
      data: {
        status: "CLOSED",
        closedAt: new Date(),
        closingAmount: countedDecimal,
        expectedAmount, // gravado junto — exposição só acontece após esta transação
        divergenceAmount,
      },
    });
  });
}

/**
 * Forma de resposta pós-fechamento: inclui divergência apenas depois de CLOSED.
 * Nunca serializar `expectedAmount` em endpoints que listam caixas abertos.
 */
export function serializeRegisterForList(register: {
  id: string;
  status: string;
  openingAmount: Prisma.Decimal;
  closingAmount: Prisma.Decimal | null;
  expectedAmount: Prisma.Decimal | null;
  divergenceAmount: Prisma.Decimal | null;
}) {
  const base = {
    id: register.id,
    status: register.status,
    openingAmount: register.openingAmount,
    closingAmount: register.closingAmount,
  };
  if (register.status !== "CLOSED") {
    // GAVETA CEGA: valores ocultos até a confirmação da contagem.
    return { ...base, blindClose: true };
  }
  return {
    ...base,
    blindClose: false,
    expectedAmount: register.expectedAmount,
    divergenceAmount: register.divergenceAmount,
  };
}
