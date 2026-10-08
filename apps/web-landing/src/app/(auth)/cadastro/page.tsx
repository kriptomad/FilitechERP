// src/app/(auth)/cadastro/page.tsx — criação de conta (Cap. 1.2.1 / 2.4)
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SignupView } from './signup-view';

export const metadata: Metadata = {
  title: 'Criar conta grátis',
  description:
    'Cadastro gratuito sem cartão de crédito: crie sua empresa, entre no Tier Free ou contrate um plano com preço visível antes da confirmação.',
};

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-[60vh] place-items-center text-zinc-500">
          Carregando…
        </div>
      }
    >
      <SignupView />
    </Suspense>
  );
}
