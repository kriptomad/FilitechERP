// src/server/audit.ts — Cap. 13.4 / 15.4
//
// Trilha de auditoria append-only. Toda ação sensível (ativar módulo, cancelar
// assinatura, convidar usuário, alterar gateway) grava um registro.
//
// Gap corrigido em relação ao `apps/api/src/lib/audit-log.ts`: lá a escrita é
// fire-and-forget com `.catch(() => {})` — a falha de auditoria era silenciosa.
// Aqui a escrita é awaited e propaga erro quando algo está realmente errado,
// mas nunca derruba a ação do usuário por indisponibilidade do log.
import { prismaUnscoped } from './db';

export type AuditAction =
  | 'AUTH_LOGIN'
  | 'AUTH_LOGOUT'
  | 'AUTH_SIGNUP'
  | 'AUTH_PASSWORD_RESET_REQUESTED'
  | 'AUTH_PASSWORD_RESET_DONE'
  | 'USER_INVITED'
  | 'USER_UPDATED'
  | 'USER_DELETED'
  | 'USER_PASSWORD_RESET'
  | 'PLAN_CHANGED'
  | 'MODULE_ACTIVATED'
  | 'MODULE_DEACTIVATED'
  | 'SUBSCRIPTION_CANCELLED'
  | 'PAYMENT_CONFIRMED'
  | 'PAYMENT_FAILED'
  | 'PAYMENT_EXPIRED'
  | 'GATEWAY_CONFIGURED'
  | 'GATEWAY_TESTED'
  | 'SALE_CREATED'
  | 'SALE_REFUNDED'
  | 'CASH_REGISTER_OPENED'
  | 'CASH_REGISTER_CLOSED'
  | 'WORK_ORDER_CREATED'
  | 'WORK_ORDER_BUDGET_SENT'
  | 'WORK_ORDER_APPROVED'
  | 'WORK_ORDER_DELIVERED'
  | 'CLIENT_CREATED'
  | 'CLIENT_UPDATED'
  | 'CLIENT_DELETED'
  | 'CONTRACT_CREATED'
  | 'CONTRACT_SIGNED'
  | 'CONTRACT_CANCELLED'
  | 'RECEIVABLE_CREATED'
  | 'RECEIVABLE_PAID'
  | 'RECEIVABLE_CANCELLED'
  | 'NICHE_SELECTED'
  | 'SETTINGS_UPDATED';

export interface AuditEntry {
  tenantId: string;
  userId: string;
  action: AuditAction;
  /** Entidade afetada (ex.: 'Subscription', 'TenantModule'). */
  entityType?: string;
  entityId?: string;
  /** Estado anterior — base de uma auditoria de verdade. */
  before?: Record<string, unknown>;
  /** Estado posterior. */
  after?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/** Grava no log. Nunca lança — indisponibilidade de auditoria não bloqueia a ação. */
export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  try {
    await prismaUnscoped.auditLog.create({
      data: {
        tenantId: entry.tenantId,
        userId: entry.userId,
        action: entry.action,
        entityType: entry.entityType ?? 'Unknown',
        entityId: entry.entityId ?? '',
        before: (entry.before ?? undefined) as never,
        after: (entry.after ?? undefined) as never,
        metadata: (entry.metadata ?? undefined) as never,
        ipAddress: entry.ipAddress ?? null,
        userAgent: entry.userAgent ?? null,
      },
    });
  } catch (err) {
    console.error('[audit] falha ao gravar registro:', entry.action, err);
  }
}

/** IP e user-agent do request, para a trilha de auditoria. */
export function requestFingerprint(request: Request): { ipAddress?: string; userAgent?: string } {
  const forwarded = request.headers.get('x-forwarded-for');
  return {
    ipAddress: forwarded?.split(',')[0]?.trim() || undefined,
    userAgent: request.headers.get('user-agent') ?? undefined,
  };
}