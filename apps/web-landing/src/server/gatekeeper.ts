// src/server/gatekeeper.ts — Cap. 6.1
// Portão único de toda rota de negócio. Aplica, em ordem de precedência:
//   1. sessão autenticada;
//   2. status financeiro do tenant (inadimplência bloqueia com 402);
//   3. módulo contratado e ativo (feature gating + upsell contextual);
//   4. permissão do papel na matriz padrão, com override por usuário.
import { prismaUnscoped } from './db';
import { withTenant } from './tenant-context';
import { DomainError, type ApiEnvelope } from './api-envelope';
import type { SessionClaims } from './jwt';

// Matriz padrão por papel — Cap. 5. O OWNER tem curinga; os demais listam
// explicitamente, e qualquer papel fora daqui não tem permissão alguma.
export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  OWNER: ['*'],
  MANAGER: [
    'pdv:sell',
    'pdv:close-register',
    'pdv:approve-discount',
    'estoque:read',
    'estoque:adjust',
    'estoque:purchase',
    'financeiro:read',
    'financeiro:pay',
    'crm:read',
    'crm:write',
    'work-order:create',
    'work-order:budget',
    'work-order:deliver',
    'work-order:assign',
    'fiscal:emit',
    'report:read',
    'billing:manage',
  ],
  TECHNICIAN: [
    'pdv:sell',
    'estoque:read',
    'crm:read',
    'work-order:create',
    'work-order:budget',
    'work-order:update',
    'report:read',
  ],
  CASHIER: ['pdv:sell', 'pdv:close-register', 'estoque:read', 'crm:read', 'crm:write'],
};

export function roleHasPermission(
  role: string,
  permission: string,
  userOverrides?: { permission: string; granted: boolean }[],
): boolean {
  // 1. Override explícito do usuário tem precedência (conceder OU revogar).
  const override = userOverrides?.find((o) => o.permission === permission);
  if (override) return override.granted;

  // 2. Matriz padrão do papel.
  const defaults = DEFAULT_ROLE_PERMISSIONS[role] ?? [];
  if (defaults.includes('*')) return true;
  return defaults.includes(permission);
}

export interface GatekeeperOptions {
  /** Código do módulo exigido (ver @filitech/shared MODULE_CODES). */
  moduleCode: string;
  /** Permissão exigida dentro do módulo já contratado. */
  requiredPermission?: string;
}

/**
 * Valida sessão + tenant + módulo + permissão.
 * Lança DomainError (402/403/401) — o wrapper `route()` converte no envelope.
 * Todo acesso ao banco acontece dentro de withTenant(),满足 a extensão (Cap. 7.2).
 */
export async function gatekeeper(
  session: SessionClaims,
  options: GatekeeperOptions,
): Promise<void> {
  return withTenant(
    { tenantId: session.tenantId, userId: session.userId, role: session.role },
    async () => {
      // 1. Inadimplência tem precedência absoluta (Cap. 6.1).
      const tenant = await prismaUnscoped.tenant.findUnique({
        where: { id: session.tenantId },
        select: { status: true },
      });

      if (!tenant) {
        throw new DomainError('TENANT_NOT_FOUND', 'Conta não encontrada.', 401);
      }

      if (tenant.status === 'SUSPENDED' || tenant.status === 'CANCELLED') {
        throw new DomainError(
          'TENANT_SUSPENDED',
          'Assinatura suspensa por inadimplência. Regularize o pagamento para continuar.',
          402,
        );
      }

      // 2. Módulo contratado e ativo.
      const tenantModule = await prismaUnscoped.tenantModule.findUnique({
        where: {
          tenantId_moduleCode: { tenantId: session.tenantId, moduleCode: options.moduleCode },
        },
      });

      if (!tenantModule?.active) {
        const moduleInfo = await prismaUnscoped.module.findUnique({
          where: { code: options.moduleCode },
        });
        const upsell: NonNullable<ApiEnvelope<null>['upsell']> = {
          moduleCode: options.moduleCode,
          label: moduleInfo?.label ?? options.moduleCode,
          price: Number(moduleInfo?.monthlyPrice ?? 0),
          checkoutUrl: `/checkout?mods=${options.moduleCode}`,
        };
        throw new DomainError(
          'MODULE_NOT_ACTIVE',
          `O módulo "${upsell.label}" não está contratado para sua conta.`,
          402,
        ).withUpsell(upsell);
      }

      // 3. RBAC — matriz padrão do papel + override por usuário.
      if (options.requiredPermission) {
        const userOverrides = await prismaUnscoped.rolePermission.findMany({
          where: { tenantId: session.tenantId, userId: session.userId },
          select: { permission: true, granted: true },
        });

        if (!roleHasPermission(session.role, options.requiredPermission, userOverrides)) {
          throw new DomainError(
            'FORBIDDEN',
            'Seu nível de acesso não permite esta ação.',
            403,
          );
        }
      }

      },
  );
}