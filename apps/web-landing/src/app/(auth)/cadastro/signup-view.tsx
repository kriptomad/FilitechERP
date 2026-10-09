'use client';
// src/app/(auth)/cadastro/signup-view.tsx — criação de conta (Cap. 1.2.1 / 2.4)

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ApiError, post } from '../../../lib/api';

interface SignupPayload {
  tradeName: string;
  name: string;
  email: string;
  password: string;
  planCode?: string;
  selectedModuleCodes?: string[];
  billingCycle?: string;
}

interface SignupResponse {
  accessToken?: string;
}

const inputClass =
  'w-full rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-3 text-sm text-zinc-100 outline-none transition focus:border-indigo-500/70';

function Field(props: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  minLength?: number;
  required?: boolean;
}) {
  const { label, type = 'text', value, onChange, autoComplete, minLength, required } = props;
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-zinc-400">
        {label}
      </span>
      <input
        required={required !== false}
        type={type}
        value={value}
        minLength={minLength}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      />
    </label>
  );
}

export function SignupView() {
  const router = useRouter();
  const params = useSearchParams();

  const [form, setForm] = useState<SignupPayload>({
    tradeName: '',
    name: '',
    email: '',
    password: '',
    planCode: params.get('plan') ?? undefined,
    selectedModuleCodes: (params.get('mods') ?? '').split(',').filter(Boolean),
    billingCycle: params.get('cycle') ?? undefined,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await post<SignupResponse>('/api/auth/signup', form);
      router.push('/painel?cadastro=sucesso');
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Não foi possível criar a conta.',
      );
      setBusy(false);
    }
  }

  function set(key: keyof SignupPayload) {
    return (v: string) => setForm((f) => ({ ...f, [key]: v }));
  }

  return (
    <main className="mx-auto w-full max-w-md px-5 py-14">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-400">
        Tier grátis · sem cartão
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-50">
        Crie sua conta
      </h1>
      <p className="mt-3 text-sm text-zinc-400">
        Menos de 1 minuto. Você começa no plano gratuito e pode evoluir quando
        quiser.
      </p>

      <form onSubmit={submit} className="card-site mt-8 space-y-4 p-6">
        <Field label="Nome da empresa *" value={form.tradeName} onChange={set('tradeName')} />
        <Field label="Seu nome *" value={form.name} onChange={set('name')} autoComplete="name" />
        <Field
          label="E-mail *"
          type="email"
          value={form.email}
          onChange={set('email')}
          autoComplete="email"
        />
        <Field
          label="Senha *"
          type="password"
          value={form.password}
          onChange={set('password')}
          autoComplete="new-password"
          minLength={8}
        />

        {error ? (
          <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-indigo-500 py-3.5 font-medium text-white transition hover:bg-indigo-400 disabled:opacity-60"
        >
          {busy ? 'Criando conta…' : 'Criar conta grátis'}
        </button>

        <p className="text-center text-sm text-zinc-500">
          Já tem uma conta?{' '}
          <Link href="/painel" className="text-indigo-400 hover:text-indigo-300">
            Entrar
          </Link>
        </p>
      </form>
    </main>
  );
}
