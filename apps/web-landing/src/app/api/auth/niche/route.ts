// src/app/api/auth/niche/route.ts â€” Cap. 1.2.2
//
// Escolha de nicho no cadastro. Grava a preferÃªncia e devolve o template de
// catÃ¡logo + mÃ³dulos sugeridos, para que o tenant comece com algo real em vez
// de tela em branco.
import { prismaUnscoped } from '@/server/db';
import { DomainError } from '@/server/api-envelope';
import { readSession } from '@/server/session';
import { writeAuditLog } from '@/server/audit';
import type { NicheCode } from '@prisma/client';
import { handle } from '@/server/handler';

export const dynamic = 'force-dynamic';

export const PATCH = handle(async (request: Request) => {
  const session = await readSession(request);
  if (!session) throw new DomainError('UNAUTHENTICATED', 'SessÃ£o ausente ou expirada.', 401);

  const body = (await request.json()) as { nicheCode?: unknown };
  const code = typeof body.nicheCode === 'string' ? (body.nicheCode as NicheCode) : null;

  if (!code) {
    throw new DomainError('VALIDATION_ERROR', 'Informe o nicho do seu negÃ³cio.');
  }

  const niche = await prismaUnscoped.niche.findFirst({
    where: { code, active: true },
    include: {
      features: { orderBy: { sortOrder: 'asc' } },
      templateItems: { orderBy: { sortOrder: 'asc' } },
    },
  });

  if (!niche) {
    throw new DomainError('NICHE_NOT_FOUND', 'Nicho invÃ¡lido.', 404);
  }

  const tenant = await prismaUnscoped.tenant.update({
    where: { id: session.tenantId },
    data: { nicheCode: code },
    select: { id: true, slug: true, tradeName: true, nicheCode: true },
  });

  await writeAuditLog({
    tenantId: session.tenantId,
    userId: session.userId,
    action: 'NICHE_SELECTED',
    entityType: 'Tenant',
    entityId: tenant.id,
    after: { nicheCode: code, label: niche.label },
  });

  return {
    tenant,
    niche: {
      code: niche.code,
      label: niche.label,
      tagline: niche.tagline,
      suggestedModules: niche.suggestedModules,
      features: niche.features.map((f) => ({
        title: f.title,
        description: f.description,
        chapterRef: f.chapterRef,
        icon: f.icon,
      })),
    },
    templateProducts: niche.templateItems.map((t) => ({
      name: t.name,
      category: t.category,
      unitPrice: Number(t.unitPrice),
    })),
  };
});
