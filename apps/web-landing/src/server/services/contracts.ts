// src/server/services/contracts.ts — Cap. 11.18 / 12
//
// Contratos de serviço. Antes, as rotas devolviam um único contrato fictício
// ("CTR-2024-0001", Mercado Central) e a rota de PDF fabricava uma URL para um
// endpoint inexistente — o painel abria uma aba e levava a um 404.
import { Prisma, type PrismaClient } from '@prisma/client';
import { DomainError } from '../api-envelope';

export interface ContractRow {
  id: string;
  contractNumber: string;
  clientId: string;
  clientName: string;
  title: string;
  description: string | null;
  status: string;
  totalAmount: number;
  startDate: string;
  endDate: string | null;
  signedAt: string | null;
  itemCount: number;
  createdAt: string;
}

export interface ContractItemInput {
  serviceId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

function dec(value: Prisma.Decimal | null | undefined): number {
  return value ? Number(value) : 0;
}

/**
 * Numeração `CTR-AAAA-NNNNNN` sequencial por ano.
 * A versão anterior usava os últimos 4 dígitos de Date.now() — colide em
 * qualquer requisição no mesmo milissegundo e reinicia a cada ano sem
 * consultar o que já existe.
 */
async function nextContractNumber(db: PrismaClient): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `CTR-${year}-`;
  const last = await db.serviceContract.findFirst({
    where: { contractNumber: { startsWith: prefix } },
    orderBy: { contractNumber: 'desc' },
    select: { contractNumber: true },
  });

  const lastSeq = last ? Number(last.contractNumber.slice(prefix.length)) : 0;
  const next = (Number.isFinite(lastSeq) ? lastSeq : 0) + 1;
  return `${prefix}${String(next).padStart(6, '0')}`;
}

export async function listContracts(
  db: PrismaClient,
  tenantId: string,
  status?: string,
): Promise<ContractRow[]> {
  const contracts = await db.serviceContract.findMany({
    where: {
      tenantId,
      ...(status ? { status: status as never } : {}),
    },
    include: {
      client: { select: { name: true } },
      items: { select: { id: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return contracts.map((c) => ({
    id: c.id,
    contractNumber: c.contractNumber,
    clientId: c.clientId,
    clientName: c.client.name,
    title: c.title,
    description: c.description,
    status: c.status,
    totalAmount: dec(c.totalAmount),
    startDate: c.startDate.toISOString(),
    endDate: c.endDate?.toISOString() ?? null,
    signedAt: c.signedAt?.toISOString() ?? null,
    itemCount: c.items.length,
    createdAt: c.createdAt.toISOString(),
  }));
}

export interface CreateContractInput {
  clientId: string;
  title: string;
  description?: string;
  startDate: string;
  endDate?: string;
  items: ContractItemInput[];
}

export async function createContract(
  db: PrismaClient,
  tenantId: string,
  input: CreateContractInput,
): Promise<ContractRow> {
  if (input.items.length === 0) {
    throw new DomainError('VALIDATION_ERROR', 'O contrato precisa de ao menos um item.');
  }

  const client = await db.client.findFirst({ where: { id: input.clientId, tenantId } });
  if (!client) throw new DomainError('CLIENT_NOT_FOUND', 'Cliente não encontrado.', 404);

  const startDate = new Date(input.startDate);
  if (Number.isNaN(startDate.getTime())) {
    throw new DomainError('VALIDATION_ERROR', 'Data de início inválida.');
  }

  const items = input.items.map((item) => ({
    tenantId,
    serviceId: item.serviceId ?? null,
    description: item.description,
    quantity: new Prisma.Decimal(item.quantity),
    unitPrice: new Prisma.Decimal(item.unitPrice),
    totalPrice: new Prisma.Decimal(
      Math.round(item.quantity * item.unitPrice * 100) / 100,
    ),
  }));

  const totalAmount = items.reduce((sum, i) => sum + Number(i.totalPrice), 0);
  const contractNumber = await nextContractNumber(db);

  const created = await db.serviceContract.create({
    data: {
      tenantId,
      clientId: input.clientId,
      contractNumber,
      title: input.title,
      description: input.description ?? null,
      totalAmount: new Prisma.Decimal(Math.round(totalAmount * 100) / 100),
      startDate,
      endDate: input.endDate ? new Date(input.endDate) : null,
      items: { create: items },
    },
    include: { client: { select: { name: true } }, items: { select: { id: true } } },
  });

  return {
    id: created.id,
    contractNumber: created.contractNumber,
    clientId: created.clientId,
    clientName: created.client.name,
    title: created.title,
    description: created.description,
    status: created.status,
    totalAmount: dec(created.totalAmount),
    startDate: created.startDate.toISOString(),
    endDate: created.endDate?.toISOString() ?? null,
    signedAt: null,
    itemCount: created.items.length,
    createdAt: created.createdAt.toISOString(),
  };
}

export async function signContract(
  db: PrismaClient,
  tenantId: string,
  id: string,
): Promise<ContractRow> {
  const contract = await db.serviceContract.findFirst({ where: { id, tenantId } });
  if (!contract) throw new DomainError('NOT_FOUND', 'Contrato não encontrado.', 404);

  if (contract.status === 'CANCELLED') {
    throw new DomainError('CONTRACT_CANCELLED', 'Contrato cancelado não pode ser assinado.', 409);
  }
  if (contract.status === 'ACTIVE' || contract.status === 'SIGNED') {
    throw new DomainError('ALREADY_SIGNED', 'Contrato já assinado.', 409);
  }

  const signedAt = new Date();
  const updated = await db.serviceContract.update({
    where: { id },
    data: { status: 'ACTIVE', signedAt },
    include: { client: { select: { name: true } }, items: { select: { id: true } } },
  });

  return {
    id: updated.id,
    contractNumber: updated.contractNumber,
    clientId: updated.clientId,
    clientName: updated.client.name,
    title: updated.title,
    description: updated.description,
    status: updated.status,
    totalAmount: dec(updated.totalAmount),
    startDate: updated.startDate.toISOString(),
    endDate: updated.endDate?.toISOString() ?? null,
    signedAt: updated.signedAt?.toISOString() ?? null,
    itemCount: updated.items.length,
    createdAt: updated.createdAt.toISOString(),
  };
}

export async function cancelContract(
  db: PrismaClient,
  tenantId: string,
  id: string,
): Promise<ContractRow> {
  const contract = await db.serviceContract.findFirst({ where: { id, tenantId } });
  if (!contract) throw new DomainError('NOT_FOUND', 'Contrato não encontrado.', 404);

  if (contract.status === 'COMPLETED') {
    throw new DomainError(
      'CONTRACT_COMPLETED',
      'Contrato concluído não pode ser cancelado.',
      409,
    );
  }
  if (contract.status === 'CANCELLED') {
    throw new DomainError('ALREADY_CANCELLED', 'Contrato já cancelado.', 409);
  }

  const updated = await db.serviceContract.update({
    where: { id },
    data: { status: 'CANCELLED' },
    include: { client: { select: { name: true } }, items: { select: { id: true } } },
  });

  return {
    id: updated.id,
    contractNumber: updated.contractNumber,
    clientId: updated.clientId,
    clientName: updated.client.name,
    title: updated.title,
    description: updated.description,
    status: updated.status,
    totalAmount: dec(updated.totalAmount),
    startDate: updated.startDate.toISOString(),
    endDate: updated.endDate?.toISOString() ?? null,
    signedAt: updated.signedAt?.toISOString() ?? null,
    itemCount: updated.items.length,
    createdAt: updated.createdAt.toISOString(),
  };
}

export interface ContractDetail extends ContractRow {
  items: {
    id: string;
    description: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    serviceId: string | null;
  }[];
  client: {
    id: string;
    name: string;
    document: string | null;
    email: string | null;
    phone: string | null;
  };
  tenant: { tradeName: string; legalName: string; cnpj: string };
}

export async function getContract(
  db: PrismaClient,
  tenantId: string,
  id: string,
): Promise<ContractDetail> {
  const contract = await db.serviceContract.findFirst({
    where: { id, tenantId },
    include: {
      client: { select: { id: true, name: true, document: true, email: true, phone: true } },
      items: true,
      tenant: { select: { tradeName: true, legalName: true, cnpj: true } },
    },
  });

  if (!contract) throw new DomainError('NOT_FOUND', 'Contrato não encontrado.', 404);

  return {
    id: contract.id,
    contractNumber: contract.contractNumber,
    clientId: contract.clientId,
    clientName: contract.client.name,
    title: contract.title,
    description: contract.description,
    status: contract.status,
    totalAmount: dec(contract.totalAmount),
    startDate: contract.startDate.toISOString(),
    endDate: contract.endDate?.toISOString() ?? null,
    signedAt: contract.signedAt?.toISOString() ?? null,
    itemCount: contract.items.length,
    createdAt: contract.createdAt.toISOString(),
    items: contract.items.map((i) => ({
      id: i.id,
      description: i.description,
      quantity: dec(i.quantity),
      unitPrice: dec(i.unitPrice),
      totalPrice: dec(i.totalPrice),
      serviceId: i.serviceId,
    })),
    client: contract.client,
    tenant: contract.tenant,
  };
}