// src/app/app/ordens-servico/page.tsx — Cap. 4.2 / 6.4
//
// O.S. da assistência técnica: lista real do banco com protocolo sequencial,
// filtro por status e abertura de nova OS. A sidebar já linkava para cá —
// antes era 404.

import { prismaUnscoped } from '@/server/db';
import { getSessionContext } from '@/server/session-context';
import { listWorkOrders } from '@/server/services/work-orders';
import { listClients } from '@/server/services/admin-clients';
import { OrdensServicoView } from './ordens-servico-view';

export const dynamic = 'force-dynamic';

export default async function OrdensServicoPage() {
  const context = await getSessionContext();
  if (!context) return null;

  const [orders, clients, technicians] = await Promise.all([
    listWorkOrders(prismaUnscoped, context.tenant.id),
    listClients(prismaUnscoped, context.tenant.id),
    prismaUnscoped.user.findMany({
      where: {
        tenantId: context.tenant.id,
        active: true,
        role: { in: ['TECHNICIAN', 'MANAGER', 'OWNER'] },
      },
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  const byStatus = orders.reduce<Record<string, number>>((acc, order) => {
    acc[order.status] = (acc[order.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <OrdensServicoView
      initialOrders={orders}
      clients={clients.map((c) => ({ id: c.id, name: c.name }))}
      technicians={technicians}
      byStatus={byStatus}
    />
  );
}
