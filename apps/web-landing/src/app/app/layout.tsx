// src/app/app/layout.tsx — Cap. 8 (frontend do ERP)
//
// Puxa a sessão NO SERVIDOR. Isso é deliberado: sem sessão o usuário nunca chega
// ao shell do ERP, e não existe tela "piscar" do login para o app.

import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getSessionContext } from '@/server/session-context';
import { AppShell } from './app-shell';

export const metadata: Metadata = {
  title: 'ERP',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const context = await getSessionContext();

  if (!context) {
    redirect('/entrar?next=/app');
  }

  return (
    <AppShell
      user={context.user}
      activeModules={context.activeModules}
      tenant={context.tenant}
      niche={context.niche}
    >
      {children}
    </AppShell>
  );
}