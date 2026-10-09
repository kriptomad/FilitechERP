// src/app/api/niches/route.ts — Cap. 11 / 1.2.2
//
// Catálogo de nichos para a vitrine interativa e o onboarding.
//
// A versão anterior devolvia uma lista de 5 strings hardcoded — a landing
// mostrava 18 nichos e a API só conhecia 5, sem nenhuma informação de
// funcionalidade. Agora tudo vem do banco (seed-niches.ts), incluindo as
// features exibidas ao clicar num nicho e o template de catálogo do tenant.
import { jsonSuccess } from '@/server/api-envelope';
import { prismaUnscoped } from '@/server/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  const niches = await prismaUnscoped.niche.findMany({
    where: { active: true, ...(code ? { code: code as never } : {}) },
    orderBy: { sortOrder: 'asc' },
    include: {
      features: { orderBy: { sortOrder: 'asc' } },
      templateItems: { orderBy: { sortOrder: 'asc' }, take: 8 },
    },
  });

  return jsonSuccess({
    niches: niches.map((niche) => ({
      code: niche.code,
      label: niche.label,
      tagline: niche.tagline,
      description: niche.description,
      colorHex: niche.colorHex,
      icon: niche.icon,
      suggestedModules: niche.suggestedModules,
      selectableOnSignup: niche.selectableOnSignup,
      features: niche.features.map((f) => ({
        title: f.title,
        description: f.description,
        chapterRef: f.chapterRef,
        icon: f.icon,
      })),
      templateItems: niche.templateItems.map((t) => ({
        name: t.name,
        category: t.category,
        unitPrice: Number(t.unitPrice),
      })),
    })),
  });
}