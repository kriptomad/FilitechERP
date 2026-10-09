// src/app/api/tenant/me/route.ts — Cap. 1.2.2 / 5
import { prismaUnscoped } from '@/server/db';
import { DomainError, jsonSuccess } from '@/server/api-envelope';
import { readSession } from '@/server/session';
import { getActiveModuleCodes } from '@/server/cache';
import { handle } from '@/server/handler';

export const dynamic = 'force-dynamic';

export const GET = handle(async (request: Request) => {
  const session = await readSession(request);
  if (!session) throw new DomainError('UNAUTHENTICATED', 'Sessão ausente ou expirada.', 401);

  const { tenantId, userId, role } = session;

  const [tenant, user, subscription, activeModules, categories, productsCount] =
    await Promise.all([
      prismaUnscoped.tenant.findUnique({
        where: { id: tenantId },
        select: {
          id: true,
          slug: true,
          tradeName: true,
          legalName: true,
          cnpj: true,
          status: true,
          nicheCode: true,
          taxRegime: true,
          simplesNacionalAnexo: true,
          inscricaoEstadual: true,
          uf: true,
          createdAt: true,
        },
      }),
      prismaUnscoped.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true, role: true, phone: true },
      }),
      prismaUnscoped.subscription.findFirst({
        where: { tenantId },
        include: { plan: true },
      }),
      getActiveModuleCodes(tenantId),
      prismaUnscoped.product.findMany({
        where: { tenantId, category: { not: null } },
        distinct: ['category'],
        select: { category: true },
      }),
      prismaUnscoped.product.count({ where: { tenantId } }),
    ]);

  if (!tenant) throw new DomainError('TENANT_NOT_FOUND', 'Conta não encontrada.', 404);

  const niche = tenant.nicheCode
    ? await prismaUnscoped.niche.findUnique({
        where: { code: tenant.nicheCode },
        select: { code: true, label: true, tagline: true },
      })
    : null;

  return jsonSuccess({
    tenant: {
      ...tenant,
      createdAt: tenant.createdAt.toISOString(),
    },
    user,
    role,
    niche,
    categories: categories
      .map((c) => c.category)
      .filter((c): c is string => Boolean(c)),
    productsCount,
    subscription: subscription
      ? {
          id: subscription.id,
          status: subscription.status,
          planCode: subscription.plan.code,
          planLabel: subscription.plan.label,
          includedModules: subscription.plan.includedModules,
          currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
        }
      : null,
    activeModules,
  });
});
