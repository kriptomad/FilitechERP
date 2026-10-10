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

  // ── Template de catálogo (Cap. 1.2.2) ─────────────────────────────────────
  // A versão anterior gravava APENAS o `nicheCode` e devolvia a lista de
  // template na resposta — o cliente via "produtos carregados" e o banco ficava
  // vazio. Escolher o nicho é justamente o que deve popular o catálogo.
  //
  // Só aplicamos quando o tenant ainda não tem produtos: trocar de nicho numa
  // loja que já vende não pode duplicar/injetar SKUs por cima do estoque real.
  const productCount = await prismaUnscoped.product.count({
    where: { tenantId: session.tenantId },
  });

  let templateApplied = 0;

  if (productCount === 0 && niche.templateItems.length > 0) {
    const baseSku = code.slice(0, 4);

    await prismaUnscoped.product.createMany({
      data: niche.templateItems.map((item, index) => ({
        tenantId: session.tenantId,
        name: item.name,
        sku: `${baseSku}-${String(index + 1).padStart(4, '0')}`,
        category: item.category ?? niche.label,
        unitPrice: item.unitPrice,
        // 60% do preço de venda como custo inicial — ponto de partida, não o
        // custo real: a ficha técnica precisa ser ajustada pelo lojista.
        costPrice: Math.round(Number(item.unitPrice) * 0.6 * 100) / 100,
        stockQuantity: 0,
        active: true,
      })),
    });

    templateApplied = niche.templateItems.length;
  }

  await writeAuditLog({
    tenantId: session.tenantId,
    userId: session.userId,
    action: 'NICHE_SELECTED',
    entityType: 'Tenant',
    entityId: tenant.id,
    after: { nicheCode: code, label: niche.label, templateApplied, productCount },
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
    templateApplied,
    // Dizemos a VERDADE ao cliente: se o template não entrou (já havia
    // produtos), a tela não pode mostrar "catálogo carregado".
    templateMessage:
      templateApplied > 0
        ? `${templateApplied} produto(s) do template de ${niche.label} carregados.`
        : productCount > 0
          ? `Catálogo já possui ${productCount} produto(s) — o template não foi injetado para não duplicar SKUs.`
          : 'Este nicho não possui template de produtos.',
    templateProducts: niche.templateItems.map((t) => ({
      name: t.name,
      category: t.category,
      unitPrice: Number(t.unitPrice),
    })),
  };
});
