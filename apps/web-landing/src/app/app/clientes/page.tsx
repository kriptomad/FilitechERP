// src/app/app/clientes/page.tsx — Cap. 4.6 / 6.6
//
// Carteira de clientes do tenant com saldo em aberto (crediário).
// A sidebar já linkava para cá — antes era 404.

import { prismaUnscoped } from '@/server/db';
import { getSessionContext } from '@/server/session-context';
import { listClients } from '@/server/services/admin-clients';
import { ClientesView } from './clientes-view';

export const dynamic = 'force-dynamic';

export default async function ClientesPage() {
  const context = await getSessionContext();
  if (!context) return null;

  const clients = await listClients(prismaUnscoped, context.tenant.id);

  const stats = await prismaUnscoped.client.aggregate({
    where: { tenantId: context.tenant.id },
    _count: { _all: true },
    _sum: { creditLimit: true, creditBalanceUsed: true },
  });

  return (
    <ClientesView
      initialClients={clients}
      totalCreditLimit={Number(stats._sum.creditLimit ?? 0)}
      totalCreditUsed={Number(stats._sum.creditBalanceUsed ?? 0)}
    />
  );
}
