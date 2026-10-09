'use client';
// src/app/(auth)/esqueci-senha/forgot-password-form.tsx — Cap. 14.3
//
// A mensagem exibida é sempre a mesma, exista ou não a conta —
//
// isso é intencional (OWASP): responder "e-mail não encontrado" permitiria a
// um terceiro descobrir quais e-mails têm conta no sistema.

import { useState } from 'react';
import Link from 'next/link';
import { post, ApiError } from '@/lib/api';

const inputClass =
  'w-full rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-3 text-sm text-zinc-100 outline-none transition focus:border-indigo-500/70';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await post('/api/auth/password/forgot', { email });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível processar agora.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-md px-5 py-16">
      <div className="rounded-2xl border border-white/10 bg-zinc-900/40 p-8">
        <h1 className="text-2xl font-bold tracking-tight">Recuperar senha</h1>

        {sent ? (
          <div role="status" className="mt-6">
            <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-3 text-sm text-emerald-300">
              Se existir uma conta com este e-mail, você receberá em instantes as instruções
              para redefinir a senha.
            </p>
            <Link
              href="/entrar"
              className="mt-6 inline-block text-sm text-indigo-400 hover:text-indigo-300"
            >
              Voltar para o login
            </Link>
          </div>
        ) : (
          <>
            <p className="mt-2 text-sm text-zinc-400">
              Informe seu e-mail e enviaremos um link seguro para definir uma nova senha.
            </p>

            <form onSubmit={submit} className="mt-8 space-y-4">
              <div>
                <label htmlFor="email" className="mb-1.5 block text-sm text-zinc-400">
                  E-mail
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                  placeholder="voce@suaempresa.com.br"
                />
              </div>

              {error && (
                <p
                  role="alert"
                  className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300"
                >
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-indigo-500 py-3 font-medium text-white transition hover:bg-indigo-400 disabled:opacity-60"
              >
                {loading ? 'Enviando…' : 'Enviar link de recuperação'}
              </button>
            </form>

            <Link
              href="/entrar"
              className="mt-6 inline-block text-sm text-zinc-500 hover:text-zinc-300"
            >
              ← Voltar para o login
            </Link>
          </>
        )}
      </div>
    </main>
  );
}