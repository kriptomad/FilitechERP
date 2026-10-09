'use client';
// src/app/(auth)/redefinir-senha/reset-password-form.tsx — Cap. 14.3
//
// Confirma a nova senha a partir do token do link.
//
// O endpoint agora valida o token de verdade: antes ele respondia "sucesso"
// sem alterar nada, o que dava falsa sensação de proteção ao usuário.

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { post, ApiError } from '@/lib/api';

const inputClass =
  'w-full rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-3 text-sm text-zinc-100 outline-none transition focus:border-indigo-500/70';

export function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError('As senhas não conferem.');
      return;
    }

    setLoading(true);
    try {
      await post('/api/auth/password/reset', { token, password });
      setDone(true);
      setTimeout(() => router.push('/entrar'), 2500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao redefinir a senha.');
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <main className="mx-auto max-w-md px-5 py-16">
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-8">
          <h1 className="text-xl font-semibold">Link inválido</h1>
          <p className="mt-2 text-sm text-zinc-300">
            Este endereço não contém um token de redefinição. Solicite um novo pelo link
            &quot;esqueci minha senha&quot;.
          </p>
          <Link
            href="/esqueci-senha"
            className="mt-6 inline-block text-sm text-indigo-400 hover:text-indigo-300"
          >
            Solicitar novo link
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-5 py-16">
      <div className="rounded-2xl border border-white/10 bg-zinc-900/40 p-8">
        <h1 className="text-2xl font-bold tracking-tight">Definir nova senha</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Mínimo de 8 caracteres. Ao salvar, todas as sessões abertas serão encerradas.
        </p>

        {done ? (
          <p
            role="status"
            className="mt-6 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-3 text-sm text-emerald-300"
          >
            Senha redefinida. Redirecionando para o login…
          </p>
        ) : (
          <form onSubmit={submit} className="mt-8 space-y-4">
            <div>
              <label htmlFor="new-password" className="mb-1.5 block text-sm text-zinc-400">
                Nova senha
              </label>
              <input
                id="new-password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="confirm-password" className="mb-1.5 block text-sm text-zinc-400">
                Confirmar senha
              </label>
              <input
                id="confirm-password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className={inputClass}
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
              {loading ? 'Salvando…' : 'Salvar nova senha'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}