// src/app/(portal)/painel/page.tsx — sistema de administração da assinatura
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PainelView } from './painel-view';

export const metadata: Metadata = {
  title: 'Painel de administração',
  description:
    'Gerencie plano, módulos, faturas e equipe da sua empresa Filitech com transparência total de cobrança.',
};

export default function PainelPage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-[60vh] place-items-center text-zinc-500">
          Carregando…
        </div>
      }
    >
      <PainelView />
    </Suspense>
  );
}
