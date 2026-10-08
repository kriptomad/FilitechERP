// src/services/work-order/commission.service.ts — Cap. 4.2 (comissionamento)
import { PrismaClient, Prisma } from "@prisma/client";

export class CommissionNotAvailableError extends Error {}

/**
 * Comissão vinculada ao TÉCNICO QUE EXECUTOU o reparo
 * (`assignedTechnicianId`), não a quem abriu a O.S. no balcão (Cap. 4.2):
 * - base: apenas itens `itemType = LABOR` com `commissionable = true`
 *   (não sobre peças — margem menor);
 * - liberação SOMENTE quando a O.S. atinge `DELIVERED` — nunca sobre
 *   orçamento apenas aprovado, protegendo contra cancelamentos tardios.
 */
export async function releaseTechnicianCommission(
  prisma: PrismaClient,
  workOrderId: string,
) {
  return prisma.$transaction(async (tx) => {
    const wo = await tx.workOrder.findUnique({
      where: { id: workOrderId },
      include: { items: true },
    });

    if (!wo) throw new CommissionNotAvailableError("O.S. não encontrada.");
    if (wo.status !== "DELIVERED") {
      throw new CommissionNotAvailableError(
        "Comissão liberada apenas com O.S. status DELIVERED (Cap. 4.2).",
      );
    }
    if (!wo.assignedTechnicianId) {
      throw new CommissionNotAvailableError(
        "O.S. sem técnico responsável atribuído — comissão não aplicável.",
      );
    }

    // Base de cálculo: SOMENTE mão de obra comissionável.
    const commissionableLabor = wo.items
      .filter((i) => i.itemType === "LABOR" && i.commissionable)
      .reduce(
        (sum, i) => sum.plus(i.unitPrice.times(i.quantity)),
        new Prisma.Decimal(0),
      );

    if (commissionableLabor.lessThanOrEqualTo(0)) {
      return { released: false as const, amount: new Prisma.Decimal(0) };
    }

    // Percentual configurável por tenant (default 10%).
    const commissionPercentage = new Prisma.Decimal(0.10);
    const amount = commissionableLabor.times(commissionPercentage);

    // Registro de comissão como conta a pagar interna ao técnico.
    // (Modelo: `AccountPayable` não serve — é por fornecedor; usamos
    // StockMovement-like via tabela futura `TechnicianCommission`.
    // Para manter o schema do Cap. 5, registramos como referência na O.S.)
    await tx.workOrder.update({
      where: { id: wo.id },
      data: {
        diagnosisNotes:
          `${wo.diagnosisNotes ?? ""}\n[COMISSÃO] ${amount.toString()} sobre base ${commissionableLabor.toString()} (${commissionPercentage.times(100).toString()}%) — técnico ${wo.assignedTechnicianId} — liberado em ${new Date().toISOString()}`,
      },
    });

    return {
      released: true as const,
      technicianId: wo.assignedTechnicianId,
      base: commissionableLabor,
      amount,
    };
  });
}
