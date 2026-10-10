// src/app/api/pdv/clients/route.ts — Cap. 4.1 / 4.6
//
// Busca de cliente DENTRO do PDV.
//
// Por que uma rota própria em vez de reusar `/api/admin/clients`: essa é
// gatekeepada pelo módulo `crm` (só no PRO), e o caixa não pode ficar sem
// identificar o comprador só porque a loja não contratou CRM. Identificar
// cliente no balcão é parte do PDV — daí o módulo ser `pdv` (incluso em todo
// plano) e a permissão `crm:read` (que CASHIER já tem na matriz do Cap. 5).
//
// A resposta traz só o necessário para escolher — nada de limite de crédito ou
// histórico aqui: isso é dado da ficha do cliente, não da fila do caixa.
import { prismaUnscoped } from '@/server/db';
import { apiSuccess } from '@/server/api-envelope';
import { requireSession } from '@/server/session';
import { gatekeeper } from '@/server/gatekeeper';
import { handle } from '@/server/handler';

export const dynamic = 'force-dynamic';

const MAX_TAKE = 20;

export const GET = handle(async (request: Request) => {
  const session = await requireSession(request);
  await gatekeeper(session, { moduleCode: 'pdv', requiredPermission: 'crm:read' });

  const url = new URL(request.url);
  const term = (url.searchParams.get('q') ?? '').trim();

  const clients = await prismaUnscoped.client.findMany({
    where: {
      tenantId: session.tenantId,
      ...(term
        ? {
            OR: [
              { name: { contains: term, mode: 'insensitive' as const } },
              { document: { contains: term, mode: 'insensitive' as const } },
              { phone: { contains: term } },
              { email: { contains: term, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    },
    orderBy: { name: 'asc' },
    take: MAX_TAKE,
    select: { id: true, name: true, document: true, phone: true },
  });

  return apiSuccess({ clients, truncated: clients.length === MAX_TAKE });
});
