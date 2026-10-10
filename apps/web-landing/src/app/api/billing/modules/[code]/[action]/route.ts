// src/app/api/billing/modules/[code]/[action]/route.ts — Cap. 2.6 / 8.4.4
//
// Antes devolvia `Módulo ativado com sucesso.` sem gravar — ligar/desligar um
// módulo no painel não fazia nada, e a tela só "parecia" funcionar.
//
// Agora: transação real sobre TenantModule, com as regras do Cap. 2.6:
//   • módulo precisa existir no catálogo;
//   • módulo já INCLUSO no plano não pode ser desligado (está contratado);
//   • ativar/desativar é auditado com antes→depois;
//   • cache de módulos ativos é invalidado (é o que o gatekeeper lê).
import { prismaUnscoped } from '@/server/db';
import { DomainError, jsonError } from '@/server/api-envelope';
import { requireSession } from '@/server/session';
import { roleHasPermission } from '@/server/gatekeeper';
import { invalidateModulesCache } from '@/server/cache';
import { writeAuditLog, requestFingerprint } from '@/server/audit';
import { handle } from '@/server/handler';

export const dynamic = 'force-dynamic';

const ACTIONS = ['activate', 'deactivate'] as const;
type Action = (typeof ACTIONS)[number];

interface Params {
  params: { code: string; action: string };
}

export const POST = handle(async (request: Request, { params }: Params) => {
  const session = await requireSession(request);

  if (!roleHasPermission(session.role, 'billing:manage')) {
    throw new DomainError('FORBIDDEN', 'Seu nível de acesso não permite alterar módulos.', 403);
  }

  const { code, action } = params;
  if (!ACTIONS.includes(action as Action)) {
    return jsonError(400, 'INVALID_ACTION', `Ação inválida: "${action}".`);
  }

  const module = await prismaUnscoped.module.findUnique({ where: { code } });
  if (!module) {
    return jsonError(404, 'MODULE_NOT_FOUND', `Módulo "${code}" não existe no catálogo.`);
  }

  const subscription = await prismaUnscoped.subscription.findFirst({
    where: { tenantId: session.tenantId },
    include: { plan: { select: { code: true, includedModules: true } } },
    orderBy: { createdAt: 'desc' },
  });

  // Módulo incluso no plano: desligá-lo deixaria o cliente sem algo que pagou.
  const includedInPlan = subscription?.plan.includedModules.includes(code) ?? false;

  if (action === 'deactivate' && includedInPlan) {
    return jsonError(
      409,
      'MODULE_INCLUDED_IN_PLAN',
      `"${module.label}" faz parte do seu plano e não pode ser desligado. Para removê-lo, cancele o plano.`,
    );
  }

  const existing = await prismaUnscoped.tenantModule.findUnique({
    where: { tenantId_moduleCode: { tenantId: session.tenantId, moduleCode: code } },
  });

  const active = action === 'activate';
  const now = new Date();

  await prismaUnscoped.tenantModule.upsert({
    where: { tenantId_moduleCode: { tenantId: session.tenantId, moduleCode: code } },
    create: {
      tenantId: session.tenantId,
      moduleCode: code,
      active,
      // `activatedAt` tem default now() e não aceita null — usar undefined
      // deixa o Prisma aplicar o default apenas quando a ativacao acontece.
      activatedAt: active ? now : undefined,
      deactivatedAt: active ? null : now,
    },
    update: {
      active,
      activatedAt: active ? now : undefined,
      deactivatedAt: active ? null : now,
    },
  });

  await invalidateModulesCache(session.tenantId);

  await writeAuditLog({
    tenantId: session.tenantId,
    userId: session.userId,
    action: active ? 'MODULE_ACTIVATED' : 'MODULE_DEACTIVATED',
    entityType: 'TenantModule',
    entityId: code,
    before: { active: existing?.active ?? false },
    after: { active, includedInPlan },
    ...requestFingerprint(request),
  });

  return {
    success: true,
    data: {
      moduleCode: code,
      label: module.label,
      active,
      action,
      message: active ? `Módulo "${module.label}" ativado.` : `Módulo "${module.label}" desativado.`,
    },
    error: null,
  };
});
