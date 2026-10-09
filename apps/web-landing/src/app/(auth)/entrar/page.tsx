// src/app/(auth)/entrar/page.tsx — Cap. 9.2
//
// Página de login DEDICADA.
//
// Gap corrigido: o botão "Entrar" da landing apontava para
// `NEXT_PUBLIC_ERP_APP_URL ?? ''`. Sem a variável, o href ficava vazio e o
// clique apenas recarregava a própria landing — o usuário nunca chegava ao
// formulário. Aqui a rota existe de fato.
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Entrar',
  description: 'Acesse o painel e o ERP da sua conta Filitech.',
  robots: { index: false, follow: false },
};

export default function EntrarPage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-[60vh] place-items-center text-zinc-500">
          Carregando…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}