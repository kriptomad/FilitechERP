// src/server/services/admin-clients.ts — Cap. 4.6 / 6.6
//
// Regras de negócio de cliente e crediário, extraídas do controller para que
// rotas de contexto diferente (portal, ERP, integrações) compartilhem a MESMA
// lógica. A versão anterior mantinha essas regras dentro do arquivo de rota, o que
// impedia reutilização e permitia divergência entre telas.
import { Prisma, type PrismaClient } from '@prisma/client';
import { DomainError } from '../api-envelope';

export interface ClientRow {
  id: string;
  name: string;
  document: string | null;
  phone: string | null;
  email: string | null;
  creditLimit: number;
  creditBalanceUsed: number;
  isBusinessAccount: boolean;
  openBalance: number;
  createdAt: string;
}

function dec(value: Prisma.Decimal | null | undefined): number {
  return value ? Number(value) : 0;
}

/** Lista clientes com o saldo em aberto agregado (Cap. 4.6). */
export async function listClients(
  db: PrismaClient,
  tenantId: string,
  search?: string,
): Promise<ClientRow[]> {
  const clients = await db.client.findMany({
    where: {
      tenantId,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { document: { contains: search } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: { name: 'asc' },
    take: 200,
  });

  if (clients.length === 0) return [];

  // Uma única agregação para todos os clientes, em vez de N+1.
  const receivables = await db.accountReceivable.groupBy({
    by: ['clientId'],
    where: {
      tenantId,
      clientId: { in: clients.map((c) => c.id) },
      status: { in: ['PENDING', 'OVERDUE'] },
    },
    _sum: { amount: true },
  });

  const openByClient = new Map(
    receivables.map((r) => [r.clientId, dec(r._sum.amount)]),
  );

  return clients.map((c) => ({
    id: c.id,
    name: c.name,
    document: c.document,
    phone: c.phone,
    email: c.email,
    creditLimit: dec(c.creditLimit),
    creditBalanceUsed: dec(c.creditBalanceUsed),
    isBusinessAccount: c.isBusinessAccount,
    openBalance: openByClient.get(c.id) ?? 0,
    createdAt: c.createdAt.toISOString(),
  }));
}

export interface CreateClientInput {
  name: string;
  document?: string;
  phone?: string;
  email?: string;
  creditLimit?: number;
  isBusinessAccount?: boolean;
}

export async function createClient(
  db: PrismaClient,
  tenantId: string,
  input: CreateClientInput,
): Promise<ClientRow> {
  const duplicate = await db.client.findFirst({
    where: { tenantId, ...(input.document ? { document: input.document } : {}) },
    select: { id: true },
  });
  if (duplicate) {
    throw new DomainError('DOCUMENT_TAKEN', 'Já existe um cliente com este documento.', 409);
  }

  const created = await db.client.create({
    data: {
      tenantId,
      name: input.name,
      document: input.document ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      creditLimit: new Prisma.Decimal(input.creditLimit ?? 0),
      isBusinessAccount: input.isBusinessAccount ?? false,
    },
  });

  return {
    id: created.id,
    name: created.name,
    document: created.document,
    phone: created.phone,
    email: created.email,
    creditLimit: dec(created.creditLimit),
    creditBalanceUsed: dec(created.creditBalanceUsed),
    isBusinessAccount: created.isBusinessAccount,
    openBalance: 0,
    createdAt: created.createdAt.toISOString(),
  };
}

export interface UpdateClientInput {
  name?: string;
  document?: string | null;
  phone?: string | null;
  email?: string | null;
  creditLimit?: number;
  isBusinessAccount?: boolean;
}

export async function updateClient(
  db: PrismaClient,
  tenantId: string,
  id: string,
  input: UpdateClientInput,
): Promise<ClientRow> {
  const existing = await db.client.findFirst({ where: { id, tenantId } });
  if (!existing) throw new DomainError('NOT_FOUND', 'Cliente não encontrado.', 404);

  // Reduzir o limite abaixo do saldo já usado deixaria o cliente em situação
  // impossível (dívida maior que o próprio limite). Bloqueia com 409.
  if (input.creditLimit !== undefined) {
    const used = dec(existing.creditBalanceUsed);
    if (input.creditLimit < used) {
      throw new DomainError(
        'CREDIT_LIMIT_BELOW_BALANCE',
        `O limite não pode ser menor que o saldo usado (R$ ${used.toFixed(2)}).`,
        409,
      );
    }
  }

  const data: Prisma.ClientUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.document !== undefined) data.document = input.document;
  if (input.phone !== undefined) data.phone = input.phone;
  if (input.email !== undefined) data.email = input.email;
  if (input.creditLimit !== undefined) {
    data.creditLimit = new Prisma.Decimal(input.creditLimit);
  }
  if (input.isBusinessAccount !== undefined) {
    data.isBusinessAccount = input.isBusinessAccount;
  }

  const updated = await db.client.update({ where: { id }, data });

  const open = await db.accountReceivable.aggregate({
    where: { tenantId, clientId: id, status: { in: ['PENDING', 'OVERDUE'] } },
    _sum: { amount: true },
  });

  return {
    id: updated.id,
    name: updated.name,
    document: updated.document,
    phone: updated.phone,
    email: updated.email,
    creditLimit: dec(updated.creditLimit),
    creditBalanceUsed: dec(updated.creditBalanceUsed),
    isBusinessAccount: updated.isBusinessAccount,
    openBalance: dec(open._sum.amount),
    createdAt: updated.createdAt.toISOString(),
  };
}

/**
 * Exclusão protegida (Cap. 4.6).
 *
 * Antes de remover, conta o histórico vinculado. Cliente com histórico é
 * desativado logicamente pelo ERP; apagar a linha quebraria a trilha
 * financeira e fiscal — e o cadastro é a origem de CPF em nota.
 */
const LINKED_HISTORY: { model: keyof PrismaClient; label: string }[] = [
  { model: 'sale', label: 'vendas' },
  { model: 'workOrder', label: 'ordens de serviço' },
  { model: 'accountReceivable', label: 'contas a receber' },
  { model: 'appointment', label: 'agendamentos' },
  { model: 'comanda', label: 'comandas' },
  { model: 'returnableContainerLedger', label: 'movimentos de vasilhame' },
  { model: 'clientServicePackage', label: 'pacotes de serviço' },
  { model: 'opticalPrescription', label: 'receitas de grau' },
  { model: 'pet', label: 'pets' },
  { model: 'vehicle', label: 'veículos' },
  { model: 'serviceContract', label: 'contratos' },
];

export async function deleteClient(
  db: PrismaClient,
  tenantId: string,
  id: string,
): Promise<{ deleted: boolean; reason?: string }> {
  const client = await db.client.findFirst({ where: { id, tenantId } });
  if (!client) throw new DomainError('NOT_FOUND', 'Cliente não encontrado.', 404);

  const counts = await Promise.all(
    LINKED_HISTORY.map(async ({ model, label }) => {
      const delegate = db[model] as unknown as { count(args: unknown): Promise<number> };
      return { label, count: await delegate.count({ where: { tenantId, clientId: id } }) };
    }),
  );

  const linked = counts.filter((c) => c.count > 0);

  if (linked.length > 0) {
    throw new DomainError(
      'CLIENT_IN_USE',
      'Não é possível excluir um cliente com histórico vinculado.',
      409,
      { historico: linked },
    );
  }

  await db.client.delete({ where: { id } });
  return { deleted: true };
}

/**
 * Verifica se o cliente pode receber nova venda a prazo (Cap. 4.6).
 *
 * O limite considera o MAIOR entre o espelho de crediário (creditBalanceUsed) e
 * a soma das faturas em aberto — se o ERP aceita venda fiada enquanto o
 * cliente tem boleto vencido, o crediário nunca fecha.
 */
export async function assertCreditAvailable(
  db: PrismaClient,
  tenantId: string,
  clientId: string,
  amount: number,
): Promise<void> {
  const client = await db.client.findFirst({ where: { id: clientId, tenantId } });
  if (!client) throw new DomainError('NOT_FOUND', 'Cliente não encontrado.', 404);

  const open = await db.accountReceivable.aggregate({
    where: { tenantId, clientId, status: { in: ['PENDING', 'OVERDUE'] } },
    _sum: { amount: true },
  });

  const used = Math.max(dec(client.creditBalanceUsed), dec(open._sum.amount));
  const limit = dec(client.creditLimit);

  if (limit <= 0) {
    throw new DomainError(
      'CREDIT_NOT_CONFIGURED',
      'Este cliente não possui limite de crédito configurado para venda a prazo.',
      422,
    );
  }

  if (used + amount > limit) {
    throw new DomainError(
      'CREDIT_LIMIT_EXCEEDED',
      `Limite de crédito insuficiente. Disponível: R$ ${(limit - used).toFixed(2)}.`,
      422,
      { limit, used, requested: amount, available: limit - used },
    );
  }
}