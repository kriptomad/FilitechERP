// src/app/api/accounting-office/marketplace/route.ts — Cap. 21.18.6
//
// Lista pública (dentro do produto) do marketplace de contadores: só
// escritórios que são tenant da plataforma E que ligaram
// `isListedInMarketplace`. O rating é agregado recalculado (21.18.9) — nunca um
// campo editável.
import { jsonSuccess } from '@/server/api-envelope';
import { requireSession } from '@/server/session';
import { handle } from '@/server/handler';
import { listMarketplace } from '@/server/services/accounting-office';

export const dynamic = 'force-dynamic';

export const GET = handle(async (request: Request) => {
  await requireSession(request);

  const firms = await listMarketplace();

  return jsonSuccess({
    firms,
    total: firms.length,
    // Quem já é escritório não "contrata" a si mesmo — a tela usa isto para
    // esconder o botão de contratação do próprio perfil.
    note: 'O vículo nasce como PENDING_ACCOUNTANT_ACCEPTANCE e só vira acesso após o aceite do escritório.',
  });
});
