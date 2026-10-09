// src/app/(auth)/redefinir-senha/page.tsx — Cap. 14.3
// Landing do link de redefinição enviado por e-mail.
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ResetPasswordForm } from './reset-password-form';

export const metadata: Metadata = {
  title: 'Redefinir senha',
  robots: { index: false, follow: false },
};

export default function RedefinirSenhaPage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-[60vh] place-items-center text-zinc-500">
          Carregando…
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}