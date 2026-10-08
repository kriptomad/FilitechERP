// src/services/pharmacy/prescription.service.ts — Cap. 4.5 (SNGPC/SNCR + retenção)
import { PrismaClient } from "@prisma/client";
import { uploadTenantAsset } from "../../infra/storage/r2-client.js";
import { prismaUnscoped } from "../../lib/prisma.js";

export class PrescriptionRetentionRequiredError extends Error {}

export type PrescriptionType =
  | "NOTIFICACAO_B_AZUL"
  | "RECEITA_A_AMARELA"
  | "RECEITA_ELETRONICA_SNCR";

export interface RegisterPrescriptionInput {
  tenantId: string;
  saleItemId: string;
  prescriptionType: PrescriptionType;
  /** Exigência RDC 1.000/2025 (SNCR) — numeração única da receita eletrônica. */
  electronicPrescriptionNumber?: string;
  /** Digitalização da receita física (retenção obrigatória). */
  documentBuffer?: Buffer;
  /** CPF do paciente — dado de saúde, sensibilidade máxima (LGPD Cap. 10.1). */
  patientDocument: string;
  validatedByUserId: string;
}

/**
 * Retenção de receita (Cap. 4.5): toda venda de produto com
 * `requiresPrescriptionRetention = true` EXIGE um PrescriptionRecord —
 * sem ele a venda não pode ser concluída.
 */
export class PrescriptionService {
  constructor(private readonly prisma: PrismaClient) {}

  async registerAndValidateSaleItem(input: RegisterPrescriptionInput) {
    // 1. Verifica que o item pertence a produto que exige retenção.
    const saleItem = await this.prisma.saleItem.findUnique({
      where: { id: input.saleItemId },
      include: { product: true },
    });
    if (!saleItem) throw new Error("SALE_ITEM_NOT_FOUND");

    if (!saleItem.product.requiresPrescriptionRetention) {
      throw new Error("PRODUCT_DOES_NOT_REQUIRE_PRESCRIPTION");
    }

    // 2. Armazena o documento digitalizado no R2 (chave nunca exposta em log).
    let storageKey: string | undefined;
    if (input.documentBuffer) {
      storageKey = await uploadTenantAsset({
        tenantId: input.tenantId,
        category: "client-signature",
        fileName: `prescription-${input.saleItemId}.pdf`,
        body: input.documentBuffer,
        contentType: "application/pdf",
      });
    }

    // SNCR exige ou retenção digitalizada ou numeração eletrônica — ao menos um.
    if (!storageKey && !input.electronicPrescriptionNumber) {
      throw new PrescriptionRetentionRequiredError(
        "Receita obrigatória: anexe a digitalização ou informe a numeração eletrônica (SNCR).",
      );
    }

    return this.prisma.prescriptionRecord.create({
      data: {
        tenantId: input.tenantId,
        saleItemId: input.saleItemId,
        prescriptionType: input.prescriptionType,
        electronicPrescriptionNumber: input.electronicPrescriptionNumber,
        retainedDocumentStorageKey: storageKey,
        patientDocument: input.patientDocument,
        validatedByUserId: input.validatedByUserId,
      },
    });
  }

  /**
   * Escrituração SNGPC (Cap. 4.5): gera o registro de movimentação de
   * controlados (Portaria 344/1998, Lista B) a transmitir ao sistema nacional.
   */
  async generateSngpcMovementEntry(tenantId: string, since: Date) {
    const movements = await this.prisma.saleItem.findMany({
      where: {
        tenantId,
        sale: { createdAt: { gte: since }, status: "PAID" },
        product: { isControlledSubstance: true },
      },
      include: { sale: true, product: true },
    });

    return movements.map((m) => ({
      cnpjDestino: null,
      produto: { nome: m.product.name, sku: m.product.sku },
      quantidade: Number(m.quantity),
      dataMovimentacao: m.sale.createdAt,
      tipoReceita: "NOTIFICACAO_B_AZUL",
      receitaRetida: true,
    }));
  }

  /** Busca a receita retenida de um item (auditoria sanitária). */
  async getRetainedPrescription(saleItemId: string) {
    // Query explícita fora do escopo automático apenas se necessário —
    // PrescriptionRecord é tenant-scoped; aqui o contexto já está ativo.
    void prismaUnscoped;
    return this.prisma.prescriptionRecord.findUnique({ where: { saleItemId } });
  }
}
