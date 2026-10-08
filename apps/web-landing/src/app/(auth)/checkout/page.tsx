// src/app/(auth)/checkout/page.tsx — checkout transparente (Cap. 9.3)
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CheckoutView } from './checkout-view';

export const metadata: Metadata = {
  title: 'Checkout — confirmar contratação',
  description:
    'Veja o breakdown completo do plano antes de confirmar: base, módulos, total mensal e próximos passos. Sem taxas escondidas.',
};

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-[60vh] place-items-center text-zinc-500">
          Carregando…
        </div>
      }
    >
      <CheckoutView />
    </Suspense>
  );
}
