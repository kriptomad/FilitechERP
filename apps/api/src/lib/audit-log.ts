// src/lib/audit-log.ts — AuditLog imutável (apenas append, nunca delete/update)
import { prisma, prismaUnscoped } from "../lib/prisma.js";
import { getCurrentTenantId } from "./tenant-context.js";

export enum AuditAction {
  CREATE = "CREATE",
  UPDATE = "UPDATE",
  DELETE = "DELETE",
  LOGIN = "LOGIN",
  LOGOUT = "LOGOUT",
  EXPORT = "EXPORT",
  IMPORT = "IMPORT",
  PAYMENT = "PAYMENT",
  REFUND = "REFUND",
  CANCEL = "CANCEL",
  SIGN = "SIGN",
  APPROVE = "APPROVE",
  REJECT = "REJECT",
  CONFIG_CHANGE = "CONFIG_CHANGE",
  PERMISSION_CHANGE = "PERMISSION_CHANGE",
  DATA_EXPORT = "DATA_EXPORT",
  DATA_ANONYMIZE = "DATA_ANONYMIZE",
}

export interface AuditLogEntry {
  id: string;
  tenantId: string;
  userId: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

export async function writeAuditLog(
  tenantId: string,
  action: AuditAction,
  entityType: string,
  entityId: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string,
  before?: unknown,
  after?: unknown,
  metadata?: unknown,
): Promise<void> {
  await prismaUnscoped.auditLog.create({
    data: {
      tenantId,
      action,
      entityType,
      entityId,
      userId,
      before: before ?? undefined,
      after: after ?? undefined,
      metadata: metadata ?? undefined,
      ipAddress,
      userAgent,
    } as any,
  }).catch(() => {}); // fire-and-forget, nunca bloqueia a resposta
}

export async function writeAuditLogUnscoped(
  tenantId: string,
  action: AuditAction,
  entityType: string,
  entityId: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string,
  before?: unknown,
  after?: unknown,
  metadata?: unknown,
): Promise<void> {
  await prismaUnscoped.auditLog.create({
    data: {
      tenantId,
      action,
      entityType,
      entityId,
      userId,
      before: before ?? undefined,
      after: after ?? undefined,
      metadata: metadata ?? undefined,
      ipAddress,
      userAgent,
    } as any,
  }).catch(() => {}); // fire-and-forget, nunca bloqueia a resposta
}

export async function queryAuditLog(filters: {
  tenantId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  userId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  cursor?: string;
}): Promise<{ entries: AuditLogEntry[]; nextCursor?: string }> {
  const where: any = {};

  if (filters.tenantId) where.tenantId = filters.tenantId;
  if (filters.action) where.action = filters.action;
  if (filters.entityType) where.entityType = filters.entityType;
  if (filters.entityId) where.entityId = filters.entityId;
  if (filters.userId) where.userId = filters.userId;
  if (filters.from) where.createdAt = { gte: filters.from };
  if (filters.to) {
    if (!where.createdAt) where.createdAt = {};
    where.createdAt.lte = filters.to;
  }

  const total = await prismaUnscoped.auditLog.count({ where });
  const entries = await prismaUnscoped.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: (filters.limit ?? 50),
    skip: filters.cursor ? 1 : 0,
  });

  const parsedEntries = entries.map((e): AuditLogEntry => ({
    id: e.id,
    tenantId: e.tenantId,
    userId: e.userId,
    action: e.action as AuditAction,
    entityType: e.entityType,
    entityId: e.entityId,
    before: e.before,
    after: e.after,
    ipAddress: e.ipAddress ?? undefined,
    userAgent: e.userAgent ?? undefined,
    createdAt: e.createdAt,
  }));

  const nextCursor = total > (filters.limit ?? 50) ? parsedEntries[parsedEntries.length - 1].createdAt.toISOString() : undefined;

  return {
    entries: parsedEntries,
    nextCursor,
  };
}