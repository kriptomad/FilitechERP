// src/app/app/configuracoes/page.tsx — Cap. 5 / 14.2 / 1.2.2
//
// Configurações da conta: dados fiscais, segurança (2FA) e nicho.
// A sidebar já linkava para cá — antes era 404.

import { prismaUnscoped } from '@/server/db';
import { getSessionContext } from '@/server/session-context';
import { ConfiguracoesView } from './configuracoes-view';

export const dynamic = 'force-dynamic';

export default async function ConfiguracoesPage() {
  const context = await getSessionContext();
  if (!context) return null;

  const [account, niches] = await Promise.all([
    prismaUnscoped.user.findUnique({
      where: { id: context.user.id },
      select: {
        totpConfirmedAt: true,
        backupCodes: { where: { usedAt: null }, select: { id: true } },
      },
    }),
    prismaUnscoped.niche.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
      select: { code: true, label: true, tagline: true, colorHex: true },
    }),
  ]);

  return (
    <ConfiguracoesView
      user={context.user}
      tenant={context.tenant}
      niches={niches}
      twoFactorEnabled={Boolean(account?.totpConfirmedAt)}
      remainingBackupCodes={account?.backupCodes.length ?? 0}
      activeModules={context.activeModules}
      subscription={context.subscription}
    />
  );
}
