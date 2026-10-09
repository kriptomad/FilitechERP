'use client';
// src/app/(auth)/entrar/login-form.tsx — Cap. 9.2
//
// Formulário de login com redirecionamento pós-sucesso.
//
// A sessão é um cookie HttpOnly: este componente nunca vê o token. O sucesso é
// detectado pela resposta 200 do endpoint e pelo cookie já gravado.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { post, ApiError } from '@/lib/api';

const inputClass =
  'w-full rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-3 text-sm text-zinc-100 outline-none transition focus:border-indigo-500/70';

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Destino após o login. `next` é validado contra allowlist para não virar
  // redirecionamento aberto (o próprio Next rejeita URLs externas, mas o
  // path interno ainda precisa ser restringido ao que existe).
  const nextParam = params.get('next');
  const destination =
    nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//')
      ? nextParam
      : '/app';

  useEffect(() => {
    // Já autenticado? Não faz sentido mostrar o formulário.
    fetch('/api/auth/me', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (json?.success) router.replace(destination);
      })
      .catch(() => undefined);
  }, [destination, router]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await post('/api/auth/login', { email, password });
      router.push(destination);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        // 402 = assinatura suspensa: a mensagem do servidor já diz o que fazer.
        setError(err.message);
      } else {
        setError('Falha de conexão. Tente novamente em alguns instantes.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-md px-5 py-16">
      <div className="rounded-2xl border border-white/10 bg-zinc-900/40 p-8">
        <h1 className="text-2xl font-bold tracking-tight">Entrar</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Use as credenciais da sua conta Filitech.
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

          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm text-zinc-400">
              Senha
            </label>
            <input
              id="password"
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

        <div className="mt-6 space-y-2 text-center text-sm">
          <Link href="/esqueci-senha" className="block text-zinc-500 hover:text-zinc-300">
            Esqueci minha senha
          </Link>
          <p className="text-zinc-500">
            Ainda não tem conta?{' '}
            <Link href="/cadastro" className="text-indigo-400 hover:text-indigo-300">
              Começar grátis
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}