// src/app/api/search/route.ts — Cap. 8.4.4 Busca Global (Command Palette)
import { prismaUnscoped } from '@/server/db';
import { readSession } from '@/server/session';
import { handle } from '@/server/handler';
import { DomainError } from '@/server/api-envelope';

export const dynamic = 'force-dynamic';

export const GET = handle(async (request: Request) => {
  const session = await readSession(request);
  if (!session) throw new DomainError('UNAUTHENTICATED', 'Sessão ausente ou expirada.', 401);

  const url = new URL(request.url);
  const term = (url.searchParams.get('q') ?? '').trim();

  if (term.length < 2) return { results: [] };

  const [products, clients, workOrders] = await Promise.all([
    prismaUnscoped.product.findMany({
      where: { tenantId: session.tenantId, name: { contains: term, mode: 'insensitive' } },
      select: { id: true, name: true, sku: true },
      take: 10,
    }),
    prismaUnscoped.client.findMany({
      where: { tenantId: session.tenantId, name: { contains: term, mode: 'insensitive' } },
      select: { id: true, name: true, document: true },
      take: 10,
    }),
    prismaUnscoped.workOrder.findMany({
      where: { tenantId: session.tenantId, equipmentDescription: { contains: term, mode: 'insensitive' } },
      select: { id: true, equipmentDescription: true, status: true },
      take: 10,
    }),
  ]);

  return {
    results: [
      ...products.map((p) => ({ type: 'PRODUCT' as const, id: p.id, label: p.name, subtitle: p.sku, route: '/app/produtos' })),
      ...clients.map((c) => ({ type: 'CLIENT' as const, id: c.id, label: c.name, subtitle: c.document, route: '/app/clientes' })),
      ...workOrders.map((w) => ({ type: 'WORK_ORDER' as const, id: w.id, label: w.equipmentDescription, subtitle: w.status, route: '/app/ordens-servico' })),
    ],
  };
});