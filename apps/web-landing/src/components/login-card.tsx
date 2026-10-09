'use client';
// src/components/login-card.tsx — card de login reutilizável (Cap. 9.2)
//
// Sessão via cookie HTTP-only: este componente NÃO guarda o token. Antes ele
// chamava `setToken()` (localStorage), o que era ao mesmo tempo inseguro e
// incompatível com a sessão do resto do sistema.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { post, ApiError } from '@/lib/api';

export function LoginCard({
  onSuccess,
  compact = false,
}: {
  onSuccess?: () => void;
  compact?: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await post('/api/auth/login', { email, password });
      if (onSuccess) {
        onSuccess();
      } else {
        router.push('/app');
        router.refresh();
      }
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Falha ao entrar. Tente novamente.',
      );
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    'w-full rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-3 text-sm text-zinc-100 outline-none transition focus:border-indigo-500/70';

  return (
    <form onSubmit={submit} className="space-y-4">
      {!compact && (
        <div>
          <h2 className="text-xl font-semibold">Entrar</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Use as credenciais da sua conta Filitech.
          </p>
        </div>
      )}

      <div>
        <label htmlFor="login-email" className="mb-1.5 block text-sm text-zinc-400">
          E-mail
        </label>
        <input
          id="login-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
          placeholder="voce@suaempresa.com.br"
        />
      </div>

      <div>
        <label htmlFor="login-password" className="mb-1.5 block text-sm text-zinc-400">
          Senha
        </label>
        <input
          id="login-password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
          placeholder="••••••••"
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
        {loading ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}