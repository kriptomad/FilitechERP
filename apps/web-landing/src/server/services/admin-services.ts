// src/server/services/admin-services.ts — Cap. 11 (nicho de serviços)
//
// Serviços prestados (Assistência, Salão, Pet, Ótica, Automotiva...). A versão
// anterior devolvia DEMO_SERVICES com duas linhas fictícias e contagens de
// appointment/package que nunca existiram.
import { Prisma, type PrismaClient } from '@prisma/client';
import { DomainError } from '../api-envelope';

export interface ServiceRow {
  id: string;
  name: string;
  nicheTag: string;
  basePrice: number;
  estimatedDurationMinutes: number;
  commissionPercentage: number;
  active: boolean;
  appointmentCount: number;
  packageCount: number;
  createdAt: string;
}

function dec(value: Prisma.Decimal | null | undefined): number {
  return value ? Number(value) : 0;
}

export async function listServices(db: PrismaClient, tenantId: string): Promise<ServiceRow[]> {
  const services = await db.service.findMany({
    where: { tenantId },
    orderBy: { name: 'asc' },
    take: 200,
  });

  if (services.length === 0) return [];

  const ids = services.map((s) => s.id);

  // Duas contagens agregadas, em vez de 2N queries.
  const [appointments, packages] = await Promise.all([
    db.appointment.groupBy({
      by: ['serviceId'],
      where: { tenantId, serviceId: { in: ids } },
      _count: { _all: true },
    }),
    db.clientServicePackage.groupBy({
      by: ['serviceId'],
      where: { tenantId, serviceId: { in: ids } },
      _count: { _all: true },
    }),
  ]);

  const apptCount = new Map(appointments.map((a) => [a.serviceId, a._count._all]));
  const pkgCount = new Map(packages.map((p) => [p.serviceId, p._count._all]));

  return services.map((s) => ({
    id: s.id,
    name: s.name,
    nicheTag: s.nicheTag,
    basePrice: dec(s.basePrice),
    estimatedDurationMinutes: s.estimatedDurationMinutes,
    commissionPercentage: dec(s.commissionPercentage),
    active: s.active,
    appointmentCount: apptCount.get(s.id) ?? 0,
    packageCount: pkgCount.get(s.id) ?? 0,
    createdAt: s.createdAt.toISOString(),
  }));
}

export interface ServiceInput {
  name: string;
  nicheTag: string;
  basePrice: number;
  estimatedDurationMinutes: number;
  commissionPercentage?: number;
  active?: boolean;
}

export async function createService(
  db: PrismaClient,
  tenantId: string,
  input: ServiceInput,
): Promise<ServiceRow> {
  if (input.basePrice < 0) {
    throw new DomainError('VALIDATION_ERROR', 'Preço não pode ser negativo.');
  }
  if (input.commissionPercentage && (input.commissionPercentage < 0 || input.commissionPercentage > 100)) {
    throw new DomainError('VALIDATION_ERROR', 'Comissão deve estar entre 0 e 100%.');
  }

  const created = await db.service.create({
    data: {
      tenantId,
      name: input.name,
      nicheTag: input.nicheTag,
      basePrice: new Prisma.Decimal(input.basePrice),
      estimatedDurationMinutes: input.estimatedDurationMinutes,
      commissionPercentage: new Prisma.Decimal(input.commissionPercentage ?? 0),
      active: input.active ?? true,
    },
  });

  return {
    id: created.id,
    name: created.name,
    nicheTag: created.nicheTag,
    basePrice: dec(created.basePrice),
    estimatedDurationMinutes: created.estimatedDurationMinutes,
    commissionPercentage: dec(created.commissionPercentage),
    active: created.active,
    appointmentCount: 0,
    packageCount: 0,
    createdAt: created.createdAt.toISOString(),
  };
}

export async function updateService(
  db: PrismaClient,
  tenantId: string,
  id: string,
  input: Partial<ServiceInput>,
): Promise<ServiceRow> {
  const existing = await db.service.findFirst({ where: { id, tenantId } });
  if (!existing) throw new DomainError('NOT_FOUND', 'Serviço não encontrado.', 404);

  const data: Prisma.ServiceUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.nicheTag !== undefined) data.nicheTag = input.nicheTag;
  if (input.basePrice !== undefined) data.basePrice = new Prisma.Decimal(input.basePrice);
  if (input.estimatedDurationMinutes !== undefined) {
    data.estimatedDurationMinutes = input.estimatedDurationMinutes;
  }
  if (input.commissionPercentage !== undefined) {
    if (input.commissionPercentage < 0 || input.commissionPercentage > 100) {
      throw new DomainError('VALIDATION_ERROR', 'Comissão deve estar entre 0 e 100%.');
    }
    data.commissionPercentage = new Prisma.Decimal(input.commissionPercentage);
  }
  if (input.active !== undefined) data.active = input.active;

  const updated = await db.service.update({ where: { id }, data });

  const [apptCount, pkgCount] = await Promise.all([
    db.appointment.count({ where: { tenantId, serviceId: id } }),
    db.clientServicePackage.count({ where: { tenantId, serviceId: id } }),
  ]);

  return {
    id: updated.id,
    name: updated.name,
    nicheTag: updated.nicheTag,
    basePrice: dec(updated.basePrice),
    estimatedDurationMinutes: updated.estimatedDurationMinutes,
    commissionPercentage: dec(updated.commissionPercentage),
    active: updated.active,
    appointmentCount: apptCount,
    packageCount: pkgCount,
    createdAt: updated.createdAt.toISOString(),
  };
}

export async function deleteService(
  db: PrismaClient,
  tenantId: string,
  id: string,
): Promise<{ deleted: boolean }> {
  const existing = await db.service.findFirst({ where: { id, tenantId } });
  if (!existing) throw new DomainError('NOT_FOUND', 'Serviço não encontrado.', 404);

  // Serviço já vendido não pode sumir: o histórico de OS/contrato perderia a
  // referência de preço e comissão.
  const [appointments, packages, contractItems] = await Promise.all([
    db.appointment.count({ where: { tenantId, serviceId: id } }),
    db.clientServicePackage.count({ where: { tenantId, serviceId: id } }),
    db.serviceContractItem.count({ where: { tenantId, serviceId: id } }),
  ]);

  if (appointments + packages + contractItems > 0) {
    throw new DomainError(
      'SERVICE_IN_USE',
      'Não é possível excluir um serviço já utilizado. Desative-o em vez de excluir.',
      409,
      { appointments, packages, contractItems },
    );
  }

  await db.service.delete({ where: { id } });
  return { deleted: true };
}