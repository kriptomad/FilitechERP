// src/app/app/caixa/page.tsx — Cap. 4.1
import { Suspense } from 'react';
import { CaixaView } from './caixa-view';

export const dynamic = 'force-dynamic';

export default function CaixaPage() {
  return (
    <Suspense fallback={<div className="text-zinc-500">Carregando…</div>}>
      <CaixaView />
    </Suspense>
  );
}