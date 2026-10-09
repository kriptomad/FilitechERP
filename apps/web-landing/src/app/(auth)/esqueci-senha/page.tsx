// src/app/(auth)/esqueci-senha/page.tsx — Cap. 14.3
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ForgotPasswordForm } from './forgot-password-form';

export const metadata: Metadata = {
  title: 'Recuperar senha',
  robots: { index: false, follow: false },
};

export default function EsqueciSenhaPage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-[60vh] place-items-center text-zinc-500">
          Carregando…
        </div>
      }
    >
      <ForgotPasswordForm />
    </Suspense>
  );
}