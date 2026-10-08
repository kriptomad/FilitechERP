// src/services/contracts/service-contract.service.ts — emissão de contrato de serviço
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { getCurrentTenantId } from "../../lib/tenant-context.js";
import { uploadTenantAsset } from "../../infra/storage/r2-client.js";
import { logger } from "../../lib/logger.js";

export class ContractError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ContractError";
  }
}

function parseOrThrow<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input ?? {});
  if (!result.success) {
    const first = result.error.issues[0];
    throw new ContractError(400, "VALIDATION_ERROR", first?.message ?? "Dados inválidos.", {
      fields: result.error.flatten().fieldErrors,
    });
  }
  return result.data;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

const contractItemSchema = z.object({
  serviceId: z.string().min(1, "Selecione o serviço.").optional(),
  description: z.string().trim().min(3, "Descrição: mínimo de 3 caracteres.").max(200),
  quantity: z.coerce.number().positive("Quantidade deve ser positiva."),
  unitPrice: z.coerce.number().min(0, "Preço unitário não pode ser negativo."),
});

const contractSchema = z.object({
  clientId: z.string().min(1, "Selecione o cliente."),
  title: z.string().trim().min(3, "Título: mínimo de 3 caracteres.").max(200),
  description: z.string().trim().max(2000).optional(),
  startDate: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Data de início inválida."),
  endDate: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Data de término inválida.").optional(),
  items: z.array(contractItemSchema).min(1, "Informe ao menos um item."),
});

export interface AdminContract {
  id: string;
  contractNumber: string;
  clientId: string;
  clientName: string;
  title: string;
  description: string | null;
  status: string;
  totalAmount: number;
  startDate: Date;
  endDate: Date | null;
  signedAt: Date | null;
  pdfUrl: string | null;
  itemCount: number;
  createdAt: Date;
}

export interface AdminContractItem {
  id: string;
  serviceId: string | null;
  serviceName: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

function serializeContract(
  row: {
    id: string;
    contractNumber: string;
    client: { id: string; name: string };
    title: string;
    description: string | null;
    status: string;
    totalAmount: Prisma.Decimal;
    startDate: Date;
    endDate: Date | null;
    signedAt: Date | null;
    pdfStorageKey: string | null;
    createdAt: Date;
    _count?: { items: number };
  },
  pdfUrl: string | null = null,
): AdminContract {
  return {
    id: row.id,
    contractNumber: row.contractNumber,
    clientId: row.client.id,
    clientName: row.client.name,
    title: row.title,
    description: row.description,
    status: row.status,
    totalAmount: Number(row.totalAmount),
    startDate: row.startDate,
    endDate: row.endDate,
    signedAt: row.signedAt,
    pdfUrl,
    itemCount: row._count?.items ?? 0,
    createdAt: row.createdAt,
  };
}

export async function listContracts(status?: string): Promise<AdminContract[]> {
  const where: Prisma.ServiceContractWhereInput = {};
  if (status) where.status = status as never;

  const rows = await prisma.serviceContract.findMany({
    where,
    include: {
      client: { select: { id: true, name: true } },
      _count: { select: { items: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return rows.map((row) => serializeContract(row));
}

export async function getContract(id: string): Promise<{
  contract: AdminContract;
  items: AdminContractItem[];
}> {
  const row = await prisma.serviceContract.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true, document: true, email: true, phone: true } },
      items: { include: { service: { select: { name: true } } } },
    },
  });
  if (!row) throw new ContractError(404, "NOT_FOUND", "Contrato não encontrado.");

  const pdfUrl = row.pdfStorageKey
    ? await getSignedUrlSafe(row.pdfStorageKey)
    : null;

  const contract = serializeContract(row, pdfUrl);
  const items: AdminContractItem[] = row.items.map((item) => ({
    id: item.id,
    serviceId: item.serviceId,
    serviceName: item.service?.name ?? null,
    description: item.description,
    quantity: Number(item.quantity),
    unitPrice: Number(item.unitPrice),
    totalPrice: Number(item.totalPrice),
  }));

  return { contract, items };
}

async function getSignedUrlSafe(key: string): Promise<string | null> {
  try {
    const { getSignedAssetUrl } = await import("../../infra/storage/r2-client.js");
    return await getSignedAssetUrl(key, 3600);
  } catch {
    return null;
  }
}

export async function createContract(input: unknown): Promise<AdminContract> {
  const data = parseOrThrow(contractSchema, input);
  const tenantId = getCurrentTenantId();

  const client = await prisma.client.findUnique({ where: { id: data.clientId } });
  if (!client) throw new ContractError(404, "NOT_FOUND", "Cliente não encontrado.");

  const totalAmount = round2(
    data.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
  );

  const count = await prisma.serviceContract.count();
  const contractNumber = `CTR-${new Date().getFullYear()}-${String(count + 1).padStart(6, "0")}`;

  const created = await prisma.serviceContract.create({
    data: {
      tenantId,
      clientId: data.clientId,
      contractNumber,
      title: data.title,
      description: data.description ?? null,
      status: "DRAFT",
      totalAmount,
      startDate: new Date(data.startDate),
      endDate: data.endDate ? new Date(data.endDate) : null,
      items: {
        create: data.items.map((item) => ({
          tenantId,
          serviceId: item.serviceId ?? null,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: round2(item.quantity * item.unitPrice),
        })),
      },
    },
    include: {
      client: { select: { id: true, name: true } },
      _count: { select: { items: true } },
    },
  });

  logger.info({ contractId: created.id, contractNumber, tenantId }, "contract_created");
  return serializeContract(created);
}

export async function signContract(id: string): Promise<AdminContract> {
  const existing = await prisma.serviceContract.findUnique({ where: { id } });
  if (!existing) throw new ContractError(404, "NOT_FOUND", "Contrato não encontrado.");
  if (existing.status === "SIGNED" || existing.status === "ACTIVE") {
    throw new ContractError(409, "INVALID_STATUS", "Contrato já está assinado.");
  }
  if (existing.status === "CANCELLED") {
    throw new ContractError(409, "INVALID_STATUS", "Contrato cancelado não pode ser assinado.");
  }

  const updated = await prisma.serviceContract.update({
    where: { id },
    data: { status: "ACTIVE", signedAt: new Date() },
    include: {
      client: { select: { id: true, name: true } },
      _count: { select: { items: true } },
    },
  });

  logger.info({ contractId: id }, "contract_signed");
  return serializeContract(updated);
}

export async function cancelContract(id: string): Promise<AdminContract> {
  const existing = await prisma.serviceContract.findUnique({ where: { id } });
  if (!existing) throw new ContractError(404, "NOT_FOUND", "Contrato não encontrado.");
  if (existing.status === "COMPLETED") {
    throw new ContractError(409, "INVALID_STATUS", "Contrato concluído não pode ser cancelado.");
  }

  const updated = await prisma.serviceContract.update({
    where: { id },
    data: { status: "CANCELLED" },
    include: {
      client: { select: { id: true, name: true } },
      _count: { select: { items: true } },
    },
  });

  logger.info({ contractId: id }, "contract_cancelled");
  return serializeContract(updated);
}

export async function generateContractPdf(id: string): Promise<{ pdfUrl: string }> {
  const contract = await prisma.serviceContract.findUnique({
    where: { id },
    include: {
      client: { select: { name: true, document: true, email: true, phone: true } },
      items: { include: { service: { select: { name: true } } } },
      tenant: { select: { tradeName: true, legalName: true, cnpj: true } },
    },
  });
  if (!contract) throw new ContractError(404, "NOT_FOUND", "Contrato não encontrado.");

  const pdfBuffer = renderContractPdf(contract);
  const storageKey = `tenants/${contract.tenantId}/contracts/${contract.contractNumber}.pdf`;

  // Tenta upload para R2; se falhar (não configurado), continua com PDF local
  try {
    await uploadTenantAsset({
      tenantId: contract.tenantId,
      category: "fiscal-xml",
      fileName: `${contract.contractNumber}.pdf`,
      body: pdfBuffer,
      contentType: "application/pdf",
    });
    await prisma.serviceContract.update({
      where: { id },
      data: { pdfStorageKey: storageKey },
    });
  } catch {
    // R2 não configurado — PDF gerado localmente, URL será sob demanda
    logger.warn({ contractId: id }, "contract_pdf_r2_unavailable");
  }

  const pdfUrl = await getSignedUrlSafe(storageKey);
  logger.info({ contractId: id, storageKey }, "contract_pdf_generated");
  return { pdfUrl: pdfUrl ?? "" };
}

function renderContractPdf(contract: {
  contractNumber: string;
  title: string;
  description: string | null;
  totalAmount: Prisma.Decimal;
  startDate: Date;
  endDate: Date | null;
  status: string;
  client: { name: string; document: string | null; email: string | null; phone: string | null };
  tenant: { tradeName: string; legalName: string; cnpj: string };
  items: { description: string; quantity: Prisma.Decimal; unitPrice: Prisma.Decimal; totalPrice: Prisma.Decimal; service: { name: string } | null }[];
}): Buffer {
  // PDF simples em texto puro (em produção, usar pdfkit/puppeteer)
  const lines = [
    "══════════════════════════════════════════════════════════════",
    "                    CONTRATO DE SERVIÇO",
    "══════════════════════════════════════════════════════════════",
    "",
    `Contrato Nº: ${contract.contractNumber}`,
    `Data: ${contract.startDate.toLocaleDateString("pt-BR")}`,
    "",
    `CONTRATANTE: ${contract.tenant.legalName}`,
    `CNPJ: ${contract.tenant.cnpj}`,
    "",
    `CONTRATADO: ${contract.client.name}`,
    `Documento: ${contract.client.document ?? "não informado"}`,
    `E-mail: ${contract.client.email ?? "não informado"}`,
    `Telefone: ${contract.client.phone ?? "não informado"}`,
    "",
    "──────────────────────────────────────────────────────────────",
    `TÍTULO: ${contract.title}`,
    "──────────────────────────────────────────────────────────────",
    "",
    contract.description ?? "",
    "",
    "ITENS CONTRATADOS:",
    "",
    ...contract.items.map(
      (item, i) =>
        `  ${i + 1}. ${item.description}${item.service ? ` (${item.service.name})` : ""}\n     Qtd: ${item.quantity} × R$ ${Number(item.unitPrice).toFixed(2).replace(".", ",")} = R$ ${Number(item.totalPrice).toFixed(2).replace(".", ",")}`,
    ),
    "",
    "──────────────────────────────────────────────────────────────",
    `VALOR TOTAL: R$ ${Number(contract.totalAmount).toFixed(2).replace(".", ",")}`,
    "──────────────────────────────────────────────────────────────",
    "",
    `Vigência: ${contract.startDate.toLocaleDateString("pt-BR")} até ${contract.endDate?.toLocaleDateString("pt-BR") ?? "indeterminado"}`,
    "",
    `Status: ${contract.status}`,
    "",
    "══════════════════════════════════════════════════════════════",
    "Documento gerado eletronicamente pelo Filitech ERP.",
  ];

  return Buffer.from(lines.join("\n"), "utf-8");
}
