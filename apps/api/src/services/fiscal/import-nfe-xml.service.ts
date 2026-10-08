// src/services/fiscal/import-nfe-xml.service.ts — Cap. 6.5
import { PrismaClient, Prisma } from "@prisma/client";
import { parseNfeXml } from "../../lib/nfe-xml-parser.js";

interface ImportNfeXmlInput {
  tenantId: string;
  xmlBuffer: Buffer;
  xmlStorageKey: string;
}

export class DuplicateNfeError extends Error {}
export class UnmatchedProductError extends Error {}

export async function importNfeXml(
  prisma: PrismaClient,
  input: ImportNfeXmlInput,
) {
  const parsed = parseNfeXml(input.xmlBuffer);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.fiscalDocument.findUnique({
      where: { accessKey: parsed.accessKey },
    });
    if (existing) {
      throw new DuplicateNfeError(
        `NF-e ${parsed.accessKey} já foi importada anteriormente.`,
      );
    }

    let supplier = await tx.supplier.findUnique({
      where: {
        tenantId_document: {
          tenantId: input.tenantId,
          document: parsed.supplierCnpj,
        },
      },
    });

    if (!supplier) {
      supplier = await tx.supplier.create({
        data: {
          tenantId: input.tenantId,
          document: parsed.supplierCnpj,
          name: parsed.supplierName,
          email: null,
          phone: null,
        },
      });
    }

    for (const line of parsed.items) {
      const product = await tx.product.findUnique({
        where: {
          tenantId_barcode: {
            tenantId: input.tenantId,
            barcode: line.eanCode,
          },
        },
      });

      if (!product) {
        throw new UnmatchedProductError(
          `Produto com EAN ${line.eanCode} ("${line.description}") não encontrado no catálogo. Cadastre-o antes de importar esta NF-e.`,
        );
      }

      if (product.trackingType === "BATCH") {
        await tx.productBatch.create({
          data: {
            tenantId: input.tenantId,
            productId: product.id,
            batchNumber:
              line.batchNumber ?? `NFE-${parsed.accessKey.slice(-8)}`,
            expirationDate:
              line.expirationDate ??
              new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            quantity: new Prisma.Decimal(line.quantity),
          },
        });
      }

      await tx.product.update({
        where: { id: product.id },
        data: { stockQuantity: { increment: line.quantity } },
      });

      await tx.stockMovement.create({
        data: {
          tenantId: input.tenantId,
          productId: product.id,
          type: "PURCHASE_IN",
          quantity: new Prisma.Decimal(line.quantity),
          referenceId: parsed.accessKey,
        },
      });
    }

    const fiscalDocument = await tx.fiscalDocument.create({
      data: {
        tenantId: input.tenantId,
        type: "NFE_ENTRADA",
        status: "AUTHORIZED",
        accessKey: parsed.accessKey,
        xmlStorageKey: input.xmlStorageKey,
      },
    });

    const accountPayable = await tx.accountPayable.create({
      data: {
        tenantId: input.tenantId,
        supplierId: supplier.id,
        description: `NF-e ${parsed.accessKey} — ${supplier.name}`,
        amount: new Prisma.Decimal(parsed.totalValue),
        dueDate:
          parsed.dueDate ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        sourceNfeKey: parsed.accessKey,
      },
    });

    return { fiscalDocument, accountPayable };
  });
}
