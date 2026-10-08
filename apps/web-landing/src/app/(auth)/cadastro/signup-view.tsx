'use client';
// src/app/(auth)/cadastro/signup-view.tsx — formulário de cadastro com
// resumo transparente do plano escolhido (query ?plan=&mods=).

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { post, setToken, ApiError } from '../../../lib/api';
import {
  FALLBACK_CATALOG,
  computeBreakdown,
  type Catalog,
} from '../../../lib/catalog';
import { brl } from '../../../lib/api';

interface SignupResponse {
  accessToken: string;
  plan: string;
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm text-zinc-400">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-zinc-600">{hint}</p>}
    </div>
  );
}

const inputClass =
  'w-full rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-3 text-sm text-zinc-100 outline-none transition focus:border-indigo-500/70';

export function SignupView() {
  const router = useRouter();
  const params = useSearchParams();

  const planCode = params.get('plan') ?? 'FREE';
  const moduleCodes = useMemo(
    () => (params.get('mods') ?? '').split(',').filter(Boolean),
    [params],
  );

  const [catalog, setCatalog] = useState<Catalog>(FALLBACK_CATALOG);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/billing/catalog')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('catalog'))))
      .then((json) => {
        if (!cancelled && json?.success && json.data) setCatalog(json.data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const breakdown = computeBreakdown(catalog, planCode, moduleCodes);
  const plan = catalog.plans.find((p) => p.code === planCode) ?? catalog.plans[0];
  const isFree = plan.code === 'FREE';

  const [form, setForm] = useState({
    tradeName: '',
    legalName: '',
    cnpj: '',
    name: '',
    email: '',
    password: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await post<SignupResponse>('/api/auth/signup', {
        tradeName: form.tradeName,
        legalName: form.legalName || undefined,
        cnpj: form.cnpj || undefined,
        name: form.name,
        email: form.email,
        password: form.password,
        planCode: plan.code,
        selectedModuleCodes: moduleCodes,
        billingCycle: params.get('cycle') ?? 'MONTHLY',
      });
      setToken(data.accessToken);
      router.push(
        isFree ? '/painel?boas-vindas=1' : '/painel?checkout=sucesso',
      );
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Erro ao criar a conta. Tente novamente.',
      );
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto grid max-w-6xl gap-10 px-5 py-12 lg:grid-cols-[1fr_380px]">
      {/* Formulário */}
      <section>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-400">
          {isFree ? 'Tier Free · sem cartão' : 'Contratação'}
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          Crie sua conta em 1 minuto
        </h1>
        <p className="mt-3 max-w-xl text-zinc-400">
          Sem formulário de 10 campos e sem ligação de vendedor. Você entra
          direto no sistema com o plano escolhido e pode ajustar tudo pelo
          painel depois.
        </p>

        <form onSubmit={submit} className="mt-8 grid max-w-xl gap-4 sm:grid-cols-2">
          <Field id="tradeName" label="Nome da empresa *">
            <input
              id="tradeName"
              required
              value={form.tradeName}
              onChange={set('tradeName')}
              className={inputClass}
              placeholder="Mercado da Esquina"
            />
          </Field>
          <Field id="legalName" label="Razão social" hint="Opcional — pode preencher depois.">
            <input
              id="legalName"
              value={form.legalName}
              onChange={set('legalName')}
              className={inputClass}
              placeholder="Mercado da Esquina ME Ltda"
            />
          </Field>
          <Field id="cnpj" label="CNPJ" hint="Opcional no início — exigível para emissão fiscal.">
            <input
              id="cnpj"
              value={form.cnpj}
              onChange={set('cnpj')}
              className={inputClass}
              placeholder="00.000.000/0001-00"
            />
          </Field>
          <Field id="name" label="Seu nome *">
            <input
              id="name"
              required
              autoComplete="name"
              value={form.name}
              onChange={set('name')}
              className={inputClass}
              placeholder="Maria Silva"
            />
          </Field>
          <Field id="email" label="E-mail *">
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={form.email}
              onChange={set('email')}
              className={inputClass}
              placeholder="voce@suaempresa.com.br"
            />
          </Field>
          <Field id="password" label="Senha *" hint="Mínimo de 8 caracteres.">
            <input
              id="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={form.password}
              onChange={set('password')}
              className={inputClass}
              placeholder="••••••••"
            />
          </Field>

          {error && (
            <p className="sm:col-span-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
              {error}
            </p>
          )}

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-indigo-500 py-3.5 font-medium text-white transition hover:bg-indigo-400 disabled:opacity-60"
            >
              {loading
                ? 'Criando conta…'
                : isFree
                  ? 'Criar conta grátis'
                  : `Criar conta e contratar por ${brl(breakdown.total)}/mês`}
            </button>
            <p className="mt-3 text-xs text-zinc-600">
              Ao continuar você concorda com os{' '}
              <Link href="/termos" className="text-zinc-400 underline">
                Termos de Uso
              </Link>{' '}
              e a{' '}
              <Link href="/privacidade" className="text-zinc-400 underline">
                Política de Privacidade
              </Link>
              . Dados fictícios em ambiente de demonstração.
            </p>
          </div>
        </form>
      </section>

      {/* Resumo transparente */}
      <aside className="card-site h-fit p-6 lg:sticky lg:top-24">
        <p className="text-sm font-semibold text-zinc-300">Resumo do plano</p>
        <div className="mt-4 space-y-2 text-sm">
          {breakdown.lines.map((line) => (
            <div key={line.code} className="flex items-start justify-between gap-3">
              <span className="text-zinc-400">{line.label}</span>
              <span className="shrink-0 font-medium text-zinc-200">
                {brl(line.price)}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4">
          <span className="text-sm text-zinc-400">Total mensal</span>
          <span className="text-2xl font-bold">{brl(breakdown.total)}</span>
        </div>
        <ul className="mt-5 space-y-2 text-xs text-zinc-500">
          <li>✓ Sem taxa de setup</li>
          <li>✓ Sem fidelidade — cancelamento em 1 clique</li>
          <li>✓ Mesmo breakdown vira fatura no painel</li>
          <li>✓ {isFree ? 'Sem cartão de crédito' : 'Cobrança recorrente mensal'}</li>
        </ul>
        {!isFree && (
          <p className="mt-4 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2.5 text-xs text-indigo-200">
            Ambiente de demonstração: o gateway de pagamento é simulado — nenhum
            valor real é cobrado.
          </p>
        )}
        <Link
          href="/planos"
          className="mt-5 block text-center text-sm text-indigo-400 hover:text-indigo-300"
        >
          Comparar todos os planos →
        </Link>
      </aside>
    </main>
  );
}
