// src/services/admin/portal-admin.service.ts — sistema de administração do portal
// ─────────────────────────────────────────────────────────────────────────
// Regras de negócio dos endpoints /api/admin/* consumidos pelo painel /painel:
//   • Clientes        — Cap. 5  (model Client)
//   • Serviços        — Cap. 12 (model Service)
//   • Cobranças       — Cap. 5  (model AccountReceivable — contas a receber)
//
// Responsabilidades desta camada: validação de entrada (zod, mensagens PT-BR),
// regras de domínio (limite de crédito, transições de fatura, exclusão
// protegida contra perda de histórico) e serialização (Decimal → number).
//
// Isolamento multi-tenant (Cap. 7.2): todo acesso usa o cliente Prisma com
// escopo estrutural — um registro de outro tenant "não existe" (findUnique →
// null → 404), nunca é atualizado nem excluído. Fora de contexto de tenant a
// extensão falha fechada (Cap. 7.3).
// ─────────────────────────────────────────────────────────────────────────
import { z } from "zod";
import { Prisma } from "@prisma/client";
import type { AccountReceivable, Client, Service } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { getCurrentTenantId } from "../../lib/tenant-context.js";

// ── Erro de domínio → envelope padrão (Cap. 9.1) ─────────────────────────
export class AdminError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AdminError";
  }
}

function parseOrThrow<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input ?? {});
  if (!result.success) {
    const first = result.error.issues[0];
    throw new AdminError(400, "VALIDATION_ERROR", first?.message ?? "Dados inválidos.", {
      fields: result.error.flatten().fieldErrors,
    });
  }
  return result.data;
}

function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    (err.code === "P2002" || err.code === "P2014")
  );
}

function isRelationViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003";
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Remove chaves com `undefined` para que o PATCH só altere o que foi enviado. */
function definedOnly<T extends object>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

// ── Esquemas de entrada (zod) ────────────────────────────────────────────
// Cap. 12 documenta estes nichos para Service.nicheTag; GERAL cobre serviços
// multinicho (ex.: assistência técnica) sem forçar um falso nicho.
export const ADMIN_NICHE_TAGS = [
  "GERAL",
  "PETSHOP",
  "BEAUTY_SALON",
  "CAR_DETAILING",
  "AUTOMOTIVE_WORKSHOP",
] as const;

const documentOrNull = z
  .string({ invalid_type_error: "Documento inválido." })
  .trim()
  .max(20, "Documento: máximo de 20 caracteres.")
  .refine(
    (value) => value === "" || value.length >= 4,
    "Documento muito curto (mínimo de 4 caracteres).",
  )
  .nullish();

const emailOrNull = z
  .string({ invalid_type_error: "E-mail inválido." })
  .trim()
  .max(160, "E-mail: máximo de 160 caracteres.")
  .refine(
    (value) => value === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
    "E-mail inválido.",
  )
  .nullish();

const textOrNull = (max: number, label: string) =>
  z
    .string({ invalid_type_error: `${label} inválido.` })
    .trim()
    .max(max, `${label}: máximo de ${max} caracteres.`)
    .nullish();

/** String vazia → null (evita colisão de `@@unique([tenantId, document])`). */
const emptyToNull = (value?: string | null): string | null | undefined =>
  value === "" ? null : value;

const moneyField = (label: string) =>
  z
    .coerce.number({ invalid_type_error: `${label} deve ser um número.` })
    .min(0, `${label} não pode ser negativo.`)
    .max(99999999.99, `${label} acima do limite permitido.`);

const clientSchema = z.object({
  name: z
    .string({ required_error: "Informe o nome do cliente." })
    .trim()
    .min(2, "Nome do cliente: mínimo de 2 caracteres.")
    .max(160, "Nome do cliente: máximo de 160 caracteres."),
  document: documentOrNull,
  phone: textOrNull(20, "Telefone"),
  email: emailOrNull,
  creditLimit: moneyField("Limite de crédito").optional(),
  isBusinessAccount: z.boolean().optional(),
});

const serviceSchema = z.object({
  name: z
    .string({ required_error: "Informe o nome do serviço." })
    .trim()
    .min(2, "Nome do serviço: mínimo de 2 caracteres.")
    .max(160, "Nome do serviço: máximo de 160 caracteres."),
  nicheTag: z.enum(ADMIN_NICHE_TAGS, {
    errorMap: () => ({ message: "Nicho inválido — escolha um dos nichos suportados." }),
  }),
  basePrice: moneyField("Preço base"),
  estimatedDurationMinutes: z
    .coerce.number({ invalid_type_error: "Duração inválida." })
    .int("Duração deve ser um número inteiro de minutos.")
    .min(1, "Duração mínima de 1 minuto.")
    .max(1440, "Duração máxima de 24 horas (1440 minutos)."),
  commissionPercentage: z
    .coerce.number({ invalid_type_error: "Comissão inválida." })
    .min(0, "Comissão não pode ser negativa.")
    .max(100, "Comissão máxima de 100%.")
    .optional(),
  active: z.boolean().optional(),
});

const receivableSchema = z.object({
  clientId: z
    .string({ required_error: "Selecione o cliente." })
    .min(1, "Selecione o cliente."),
  description: z
    .string({ required_error: "Descreva a cobrança." })
    .trim()
    .min(3, "Descrição: mínimo de 3 caracteres.")
    .max(200, "Descrição: máximo de 200 caracteres."),
  amount: z
    .coerce.number({ invalid_type_error: "Valor inválido." })
    .positive("O valor deve ser maior que zero.")
    .max(99999999.99, "Valor acima do limite permitido."),
  dueDate: z
    .string({ required_error: "Informe o vencimento." })
    .refine((value) => !Number.isNaN(Date.parse(value)), "Vencimento inválido."),
});

export const RECEIVABLE_STATUSES = ["PENDING", "PAID", "OVERDUE", "CANCELLED"] as const;
type ReceivableStatusFilter = (typeof RECEIVABLE_STATUSES)[number];

// ── Tipos serializados (Decimal → number) ────────────────────────────────
export interface AdminClient {
  id: string;
  name: string;
  document: string | null;
  phone: string | null;
  email: string | null;
  creditLimit: number;
  creditBalanceUsed: number;
  isBusinessAccount: boolean;
  openBalance: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminService {
  id: string;
  name: string;
  nicheTag: string;
  basePrice: number;
  estimatedDurationMinutes: number;
  commissionPercentage: number;
  active: boolean;
  appointmentCount: number;
  packageCount: number;
}

export interface AdminReceivable {
  id: string;
  clientId: string;
  clientName: string;
  description: string;
  amount: number;
  dueDate: Date;
  status: string;
  /** PENDING com vencimento no passado — exibido como "vencida" na UI. */
  isOverdue: boolean;
  paidAt: Date | null;
  createdAt: Date;
}

function serializeClient(row: Client, openBalance: number): AdminClient {
  return {
    id: row.id,
    name: row.name,
    document: row.document,
    phone: row.phone,
    email: row.email,
    creditLimit: Number(row.creditLimit),
    creditBalanceUsed: Number(row.creditBalanceUsed),
    isBusinessAccount: row.isBusinessAccount,
    openBalance,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function serializeService(
  row: Service & { _count?: { appointments: number; clientPackages: number } },
): AdminService {
  return {
    id: row.id,
    name: row.name,
    nicheTag: row.nicheTag,
    basePrice: Number(row.basePrice),
    estimatedDurationMinutes: row.estimatedDurationMinutes,
    commissionPercentage: Number(row.commissionPercentage),
    active: row.active,
    appointmentCount: row._count?.appointments ?? 0,
    packageCount: row._count?.clientPackages ?? 0,
  };
}

function serializeReceivable(
  row: AccountReceivable & { client: { id: string; name: string } },
): AdminReceivable {
  return {
    id: row.id,
    clientId: row.clientId,
    clientName: row.client.name,
    description: row.description,
    amount: Number(row.amount),
    dueDate: row.dueDate,
    status: row.status,
    isOverdue: row.status === "PENDING" && row.dueDate.getTime() < Date.now(),
    paidAt: row.paidAt,
    createdAt: row.createdAt,
  };
}

/** Soma das faturas em aberto (PENDING/OVERDUE) de um cliente. */
async function clientOpenBalance(clientId: string): Promise<number> {
  const agg = await prisma.accountReceivable.aggregate({
    where: { clientId, status: { in: ["PENDING", "OVERDUE"] } },
    _sum: { amount: true },
  });
  return agg._sum.amount ? round2(Number(agg._sum.amount)) : 0;
}

// ── CLIENTES (Cap. 5) ────────────────────────────────────────────────────

export async function listClients(q?: string): Promise<AdminClient[]> {
  const term = q?.trim();
  const where = term
    ? {
        OR: [
          { name: { contains: term, mode: "insensitive" as const } },
          { document: { contains: term } },
          { email: { contains: term, mode: "insensitive" as const } },
          { phone: { contains: term } },
        ],
      }
    : undefined;

  const [clients, openSums] = await Promise.all([
    prisma.client.findMany({ where, orderBy: { name: "asc" } }),
    prisma.accountReceivable.groupBy({
      by: ["clientId"],
      where: { status: { in: ["PENDING", "OVERDUE"] } },
      _sum: { amount: true },
    }),
  ]);

  const sums = new Map(
    openSums.map((row) => [row.clientId, row._sum.amount ? round2(Number(row._sum.amount)) : 0]),
  );
  return clients.map((row) => serializeClient(row, sums.get(row.id) ?? 0));
}

export async function createClient(input: unknown): Promise<AdminClient> {
  const parsed = parseOrThrow(clientSchema, input);
  const data = {
    ...parsed,
    document: emptyToNull(parsed.document),
    phone: emptyToNull(parsed.phone),
    email: emptyToNull(parsed.email),
  };

  try {
    // tenantId vem do contexto autenticado; a extensão reforça o escopo
    // estrutural em toda operação (Cap. 7.2).
    const created = await prisma.client.create({
      data: { ...data, tenantId: getCurrentTenantId() },
    });
    return serializeClient(created, 0);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AdminError(409, "DOCUMENT_TAKEN", "Já existe um cliente com este documento.");
    }
    throw err;
  }
}

export async function updateClient(id: string, input: unknown): Promise<AdminClient> {
  const existing = await prisma.client.findUnique({ where: { id } });
  if (!existing) {
    throw new AdminError(404, "NOT_FOUND", "Cliente não encontrado.");
  }

  const parsed = parseOrThrow(clientSchema.partial(), input);
  const data = definedOnly({
    ...parsed,
    document: emptyToNull(parsed.document),
    phone: emptyToNull(parsed.phone),
    email: emptyToNull(parsed.email),
  });
  if (Object.keys(data).length === 0) {
    throw new AdminError(400, "VALIDATION_ERROR", "Nenhum dado enviado para atualização.");
  }

  try {
    const updated = await prisma.client.update({ where: { id }, data });
    return serializeClient(updated, await clientOpenBalance(id));
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AdminError(409, "DOCUMENT_TAKEN", "Já existe um cliente com este documento.");
    }
    throw err;
  }
}

export async function deleteClient(id: string): Promise<{ id: string; deleted: true }> {
  const existing = await prisma.client.findUnique({ where: { id } });
  if (!existing) {
    throw new AdminError(404, "NOT_FOUND", "Cliente não encontrado.");
  }

  // Regra de negócio: histórico operacional nunca é apagado em cascata.
  // Vendas, O.S., faturas, agenda, comandas, cascos, pacotes e prescrições
  // vinculados bloqueiam a exclusão com mensagem acionável.
  const [sales, workOrders, receivables, appointments, comandas, containers, packages, prescriptions] =
    await Promise.all([
      prisma.sale.count({ where: { clientId: id } }),
      prisma.workOrder.count({ where: { clientId: id } }),
      prisma.accountReceivable.count({ where: { clientId: id } }),
      prisma.appointment.count({ where: { clientId: id } }),
      prisma.comanda.count({ where: { clientId: id } }),
      prisma.returnableContainerLedger.count({ where: { clientId: id } }),
      prisma.clientServicePackage.count({ where: { clientId: id } }),
      prisma.opticalPrescription.count({ where: { clientId: id } }),
    ]);

  const linked = {
    sales,
    workOrders,
    receivables,
    appointments,
    comandas,
    containers,
    packages,
    prescriptions,
  };
  const total = Object.values(linked).reduce((sum, count) => sum + count, 0);
  if (total > 0) {
    throw new AdminError(
      409,
      "CLIENT_IN_USE",
      "Este cliente possui histórico vinculado (vendas, O.S., faturas ou agenda) e não pode ser excluído. Cancele as faturas em aberto antes, se necessário.",
      { linked },
    );
  }

  try {
    await prisma.client.delete({ where: { id } });
  } catch (err) {
    if (isRelationViolation(err)) {
      throw new AdminError(
        409,
        "CLIENT_IN_USE",
        "Este cliente possui registros vinculados e não pode ser excluído.",
      );
    }
    throw err;
  }
  return { id, deleted: true };
}

// ── SERVIÇOS (Cap. 12) ───────────────────────────────────────────────────

export async function listServices(): Promise<AdminService[]> {
  const services = await prisma.service.findMany({
    orderBy: [{ nicheTag: "asc" }, { name: "asc" }],
    include: { _count: { select: { appointments: true, clientPackages: true } } },
  });
  return services.map(serializeService);
}

export async function createService(input: unknown): Promise<AdminService> {
  const data = parseOrThrow(serviceSchema, input);
  const created = await prisma.service.create({
    data: { ...data, tenantId: getCurrentTenantId() },
  });
  return serializeService(created);
}

export async function updateService(id: string, input: unknown): Promise<AdminService> {
  const existing = await prisma.service.findUnique({ where: { id } });
  if (!existing) {
    throw new AdminError(404, "NOT_FOUND", "Serviço não encontrado.");
  }

  const data = definedOnly(parseOrThrow(serviceSchema.partial(), input));
  if (Object.keys(data).length === 0) {
    throw new AdminError(400, "VALIDATION_ERROR", "Nenhum dado enviado para atualização.");
  }

  const updated = await prisma.service.update({ where: { id }, data });
  return serializeService(updated);
}

export async function deleteService(id: string): Promise<{ id: string; deleted: true }> {
  const existing = await prisma.service.findUnique({ where: { id } });
  if (!existing) {
    throw new AdminError(404, "NOT_FOUND", "Serviço não encontrado.");
  }

  const [appointments, packages] = await Promise.all([
    prisma.appointment.count({ where: { serviceId: id } }),
    prisma.clientServicePackage.count({ where: { serviceId: id } }),
  ]);
  if (appointments > 0 || packages > 0) {
    throw new AdminError(
      409,
      "SERVICE_IN_USE",
      "Este serviço tem agenda ou pacotes vinculados. Desative-o (mantém o histórico) em vez de excluí-lo.",
      { appointments, packages },
    );
  }

  try {
    await prisma.service.delete({ where: { id } });
  } catch (err) {
    if (isRelationViolation(err)) {
      throw new AdminError(
        409,
        "SERVICE_IN_USE",
        "Este serviço possui registros vinculados — desative-o em vez de excluí-lo.",
      );
    }
    throw err;
  }
  return { id, deleted: true };
}

// ── COBRANÇAS / CONTAS A RECEBER (Cap. 5) ────────────────────────────────

export async function listReceivables(
  status?: ReceivableStatusFilter,
  clientId?: string,
): Promise<AdminReceivable[]> {
  const where: Prisma.AccountReceivableWhereInput = {};
  if (clientId) where.clientId = clientId;
  if (status === "OVERDUE") {
    // "Vencidas" = OVERDUE persistido + PENDING com vencimento no passado.
    where.OR = [
      { status: "OVERDUE" },
      { status: "PENDING", dueDate: { lt: new Date() } },
    ];
  } else if (status) {
    where.status = status;
  }

  const rows = await prisma.accountReceivable.findMany({
    where,
    include: { client: { select: { id: true, name: true } } },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
  });
  return rows.map(serializeReceivable);
}

export async function createReceivable(input: unknown): Promise<AdminReceivable> {
  const data = parseOrThrow(receivableSchema, input);

  const client = await prisma.client.findUnique({ where: { id: data.clientId } });
  if (!client) {
    throw new AdminError(404, "NOT_FOUND", "Cliente não encontrado.");
  }

  // Limite de crédito (Cap. 5): `creditBalanceUsed` é o espelho do crediário
  // (vendas) e a soma de faturas em aberto é o espelho manual — usa-se o maior
  // dos dois para não contar a mesma dívida em dobro.
  const creditLimit = Number(client.creditLimit);
  if (creditLimit > 0) {
    const open = await clientOpenBalance(client.id);
    const used = Math.max(Number(client.creditBalanceUsed), open);
    if (round2(used + data.amount) > creditLimit) {
      throw new AdminError(
        409,
        "CREDIT_LIMIT_EXCEEDED",
        `Limite de crédito de ${client.name} excedido: disponível R$ ${round2(
          Math.max(0, creditLimit - used),
        ).toFixed(2).replace(".", ",")} de R$ ${creditLimit.toFixed(2).replace(".", ",")}.`,
        { creditLimit, alreadyUsed: round2(used), requested: round2(data.amount) },
      );
    }
  }

  const created = await prisma.accountReceivable.create({
    data: {
      tenantId: getCurrentTenantId(),
      clientId: data.clientId,
      description: data.description,
      amount: data.amount,
      dueDate: new Date(data.dueDate),
    },
    include: { client: { select: { id: true, name: true } } },
  });
  return serializeReceivable(created);
}

async function findReceivableOr404(id: string): Promise<AccountReceivable> {
  const row = await prisma.accountReceivable.findUnique({ where: { id } });
  if (!row) {
    throw new AdminError(404, "NOT_FOUND", "Fatura não encontrada.");
  }
  return row;
}

/** Baixa de pagamento: PENDING/OVERDUE → PAID (carimba paidAt). */
export async function payReceivable(id: string): Promise<AdminReceivable> {
  const row = await findReceivableOr404(id);
  if (row.status !== "PENDING" && row.status !== "OVERDUE") {
    throw new AdminError(
      409,
      "INVALID_STATUS",
      row.status === "PAID"
        ? "Esta fatura já está paga."
        : "Esta fatura está cancelada e não pode ser paga.",
    );
  }

  const updated = await prisma.accountReceivable.update({
    where: { id },
    data: { status: "PAID", paidAt: new Date() },
    include: { client: { select: { id: true, name: true } } },
  });
  return serializeReceivable(updated);
}

/** Cancelamento de cobrança: apenas faturas não pagas podem ser canceladas. */
export async function cancelReceivable(id: string): Promise<AdminReceivable> {
  const row = await findReceivableOr404(id);
  if (row.status === "PAID") {
    throw new AdminError(
      409,
      "INVALID_STATUS",
      "Fatura paga não pode ser cancelada — registre o estorno no financeiro.",
    );
  }
  if (row.status === "CANCELLED") {
    throw new AdminError(409, "INVALID_STATUS", "Esta fatura já está cancelada.");
  }

  const updated = await prisma.accountReceivable.update({
    where: { id },
    data: { status: "CANCELLED", paidAt: null },
    include: { client: { select: { id: true, name: true } } },
  });
  return serializeReceivable(updated);
}
