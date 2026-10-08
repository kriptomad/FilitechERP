// src/services/work-order/approve-budget.service.ts — Cap. 6.4
import { PrismaClient } from "@prisma/client";

export class BudgetAlreadyProcessedError extends Error {}
export class BudgetExpiredError extends Error {}

/**
 * Aprovação atômica e à prova de clique duplo:
 * 1. Lê a O.S. pelo token ANTES do UPDATE (o token é apagado na aprovação);
 * 2. UPDATE condicional (token + status + validade) — se 0 linhas afetadas,
 *    outro clique venceu a corrida → erro, sem dupla aprovação.
 */
export async function approveBudget(
  prisma: PrismaClient,
  approvalToken: string,
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.workOrder.findFirst({
      where: { budgetApprovalToken: approvalToken },
    });

    if (!existing) {
      throw new BudgetAlreadyProcessedError(
        "Este orçamento já foi aprovado ou o link é inválido.",
      );
    }

    if (
      existing.budgetValidUntil &&
      existing.budgetValidUntil < new Date()
    ) {
      throw new BudgetExpiredError(
        "Orçamento expirado. Solicite um novo orçamento ao técnico.",
      );
    }

    // Guarda atômica: só aprova se ainda estiver aguardando e dentro da validade.
    const updated = await tx.$executeRaw`
      UPDATE work_orders
      SET status = 'IN_REPAIR', "budgetApprovedAt" = NOW(), "budgetApprovalToken" = NULL
      WHERE id = ${existing.id}
        AND status = 'AWAITING_APPROVAL'
        AND "budgetValidUntil" > NOW()
    `;

    if (updated === 0) {
      throw new BudgetAlreadyProcessedError(
        "Este orçamento já foi aprovado ou não está mais pendente.",
      );
    }

    return {
      ...existing,
      status: "IN_REPAIR" as const,
      budgetApprovedAt: new Date(),
      budgetApprovalToken: null,
    };
  });
}
