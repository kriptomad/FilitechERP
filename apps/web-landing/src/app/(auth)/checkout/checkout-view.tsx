'use client';
// src/app/(auth)/checkout/checkout-view.tsx — contratação com transparência
// total: breakdown itemizado, escolha de método e confirmação (login ou
// cadastro embutido conforme a sessão).

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ApiError, brl, post } from '../../../lib/api';
import {
  FALLBACK_CATALOG,
  computeBreakdown,
  type Catalog,
} from '../../../lib/catalog';
import { LoginCard } from '../../../components/login-card';

interface CheckoutResponse {
  subscriptionId: string;
  computedMrr: number;
}

interface SignupResponse {
  accessToken: string;
}

const PAYMENT_METHODS = [
  { code: 'CARTAO', label: 'Cartão de crédito', hint: 'Recorrência automática' },
  { code: 'PIX', label: 'PIX', hint: 'QrCode — confirmação imediata' },
  { code: 'BOLETO', label: 'Boleto bancário', hint: 'Compensação em até 2 dias úteis' },
];

const inputClass =
  'w-full rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-3 text-sm text-zinc-100 outline-none transition focus:border-indigo-500/70';

export function CheckoutView() {
  const router = useRouter();
  const params = useSearchParams();

  const planCode = params.get('plan') ?? 'BASIC';
  const cycle = params.get('cycle') ?? 'MONTHLY';
  const moduleCodes = useMemo(
    () => (params.get('mods') ?? '').split(',').filter(Boolean),
    [params],
  );

  const [catalog, setCatalog] = useState<Catalog>(FALLBACK_CATALOG);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [method, setMethod] = useState('CARTAO');
  const [mode, setMode] = useState<'signup' | 'login'>('signup');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Signup embutido
  const [form, setForm] = useState({
    tradeName: '',
    name: '',
    email: '',
    password: '',
  });

  useEffect(() => {
    // Check auth via /api/auth/me (uses cookies)
    fetch('/api/auth/me', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('auth'))))
      .then((json) => {
        if (json?.success) setLoggedIn(true);
        else setLoggedIn(false);
      })
      .catch(() => setLoggedIn(false));

    let cancelled = false;
    fetch('/api/billing/catalog', { credentials: 'include' })
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
  const plan = catalog.plans.find((p) => p.code === planCode) ?? catalog.plans[1];

  async function confirmWithSession() {
    setError(null);
    setBusy(true);
    try {
      await post<CheckoutResponse>('/api/billing/checkout', {
        planCode: plan.code,
        selectedModuleCodes: moduleCodes,
        billingCycle: cycle,
        paymentGateway: 'ASAAS',
        paymentMethod: method,
      });
      router.push('/painel?checkout=sucesso');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setLoggedIn(false);
        setError('Sua sessão expirou. Entre novamente para concluir.');
      } else {
        setError(err instanceof ApiError ? err.message : 'Falha ao processar o checkout.');
      }
      setBusy(false);
    }
  }

  async function signupAndSubscribe(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const data = await post<SignupResponse>('/api/auth/signup', {
        tradeName: form.tradeName,
        name: form.name,
        email: form.email,
        password: form.password,
        planCode: plan.code,
        selectedModuleCodes: moduleCodes,
        billingCycle: cycle,
      });
      // Token is set via HTTP-only cookie by the API
      router.push('/painel?checkout=sucesso');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao criar a conta.');
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto grid max-w-6xl gap-10 px-5 py-12 lg:grid-cols-[1fr_400px]">
      <section>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-400">
          Checkout transparente
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          Confirme antes de pagar
        </h1>
        <p className="mt-3 max-w-xl text-zinc-400">
          Este é o valor exato que será cobrado — itemizado linha a linha. Nada
          aparece na fatura que não esteja visível nesta tela.
        </p>

        {/* Breakdown */}
        <div className="card-site mt-8 p-6">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold text-zinc-100">
              Plano {plan.label} · mensal
            </h2>
            <span className="rounded-md bg-white/5 px-2 py-1 text-xs text-zinc-400">
              Ciclo {cycle === 'ANNUAL' ? 'anual' : 'mensal'}
            </span>
          </div>

          <div className="mt-5 space-y-3 text-sm">
            {breakdown.lines.map((line) => (
              <div
                key={line.code}
                className="flex items-center justify-between border-b border-white/5 pb-3"
              >
                <span className="text-zinc-300">{line.label}</span>
                <span className="font-medium text-zinc-100">{brl(line.price)}</span>
              </div>
            ))}
          </div>

          <div className="mt-5 flex items-center justify-between">
            <div>
              <p className="text-sm text-zinc-400">Total mensal</p>
              <p className="text-xs text-zinc-600">
                primeira cobrança hoje · próxima em 30 dias
              </p>
            </div>
            <p className="text-4xl font-bold">{brl(breakdown.total)}</p>
          </div>

          <div className="mt-5 grid gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4 text-xs text-emerald-200 sm:grid-cols-3">
            <span>✓ Sem taxa de setup</span>
            <span>✓ Sem fidelidade</span>
            <span>✓ Cancelamento em 1 clique</span>
          </div>
        </div>

        {/* Método de pagamento */}
        <fieldset className="mt-6">
          <legend className="mb-3 text-sm font-medium text-zinc-300">
            Forma de pagamento
          </legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {PAYMENT_METHODS.map((pm) => (
              <label
                key={pm.code}
                className={`cursor-pointer rounded-xl border p-4 transition ${
                  method === pm.code
                    ? 'border-indigo-500/70 bg-indigo-500/[0.08]'
                    : 'border-white/10 bg-zinc-900/40 hover:border-white/25'
                }`}
              >
                <input
                  type="radio"
                  name="payment"
                  className="sr-only"
                  value={pm.code}
                  checked={method === pm.code}
                  onChange={() => setMethod(pm.code)}
                />
                <span className="block text-sm font-medium text-zinc-100">
                  {pm.label}
                </span>
                <span className="mt-0.5 block text-xs text-zinc-500">{pm.hint}</span>
              </label>
            ))}
          </div>
          <p className="mt-3 text-xs text-zinc-600">
            Ambiente de demonstração: gateway simulado (Asaas sandbox) — nenhum
            valor real é cobrado.
          </p>
        </fieldset>

        {/* Ação: conta */}
        <div className="card-site mt-6 p-6">
          {loggedIn === null ? (
            <p className="text-sm text-zinc-500">Verificando sessão…</p>
          ) : loggedIn ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-zinc-100">
                    Sua sessão está ativa
                  </p>
                  <p className="text-sm text-zinc-500">
                    A contratação entra no painel da sua empresa.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    // Clear cookie by calling logout endpoint
                    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
                    setLoggedIn(false);
                  }}
                  className="text-sm text-zinc-400 underline hover:text-zinc-200"
                >
                  Usar outra conta
                </button>
              </div>
              {error && (
                <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                  {error}
                </p>
              )}
              <button
                type="button"
                onClick={confirmWithSession}
                disabled={busy}
                className="w-full rounded-xl bg-indigo-500 py-3.5 font-medium text-white transition hover:bg-indigo-400 disabled:opacity-60"
              >
                {busy
                  ? 'Processando…'
                  : `Confirmar contratação — ${brl(breakdown.total)}/mês`}
              </button>
            </div>
          ) : mode === 'login' ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="font-medium text-zinc-100">Já tenho conta</p>
                <button
                  type="button"
                  onClick={() => setMode('signup')}
                  className="text-sm text-indigo-400 hover:text-indigo-300"
                >
                  Criar conta nova →
                </button>
              </div>
              <LoginCard
                compact
                onSuccess={() => {
                  setLoggedIn(true);
                  setError(null);
                }}
              />
            </div>
          ) : (
            <form onSubmit={signupAndSubscribe} className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-zinc-100">
                    Crie sua conta para concluir
                  </p>
                  <p className="text-sm text-zinc-500">
                    Leva menos de 1 minuto — ou{' '}
                    <button
                      type="button"
                      onClick={() => setMode('login')}
                      className="text-indigo-400 hover:text-indigo-300"
                    >
                      entre se já tem conta
                    </button>
                    .
                  </p>
                </div>
              </div>

              <input
                required
                value={form.tradeName}
                onChange={(e) => setForm((f) => ({ ...f, tradeName: e.target.value }))}
                className={inputClass}
                placeholder="Nome da empresa *"
                aria-label="Nome da empresa"
              />
              <input
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className={inputClass}
                placeholder="Seu nome *"
                aria-label="Seu nome"
                autoComplete="name"
              />
              <input
                required
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className={inputClass}
                placeholder="E-mail *"
                aria-label="E-mail"
                autoComplete="email"
              />
              <input
                required
                type="password"
                minLength={8}
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                className={inputClass}
                placeholder="Senha (mín. 8 caracteres) *"
                aria-label="Senha"
                autoComplete="new-password"
              />

              {error && (
                <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-xl bg-indigo-500 py-3.5 font-medium text-white transition hover:bg-indigo-400 disabled:opacity-60"
              >
                {busy
                  ? 'Processando…'
                  : `Criar conta e contratar — ${brl(breakdown.total)}/mês`}
              </button>
            </form>
          )}
        </div>
      </section>

      {/* Coluna lateral: garantias + alterar configuração */}
      <aside className="h-fit space-y-5 lg:sticky lg:top-24">
        <div className="card-site p-6">
          <p className="text-sm font-semibold text-zinc-300">O que está incluído</p>
          <ul className="mt-4 space-y-2.5 text-sm text-zinc-400">
            {breakdown.lines.map((line) => (
              <li key={line.code} className="flex items-center justify-between gap-3">
                <span>{line.label}</span>
                <span className="text-xs text-zinc-600">incluso</span>
              </li>
            ))}
          </ul>
          <div className="mt-5 space-y-2 border-t border-white/5 pt-4 text-xs text-zinc-500">
            <p>✓ PDV offline-first desde o primeiro dia</p>
            <p>✓ Suporte prioritário</p>
            <p>✓ Exportação total dos dados (CSV/XML) a qualquer momento</p>
            <p>✓ Isolamento multi-tenant com teste canário de vazamento-zero</p>
          </div>
        </div>

        <div className="card-site p-6">
          <p className="text-sm font-semibold text-zinc-300">Quer ajustar?</p>
          <p className="mt-2 text-sm text-zinc-500">
            Monte outra combinação na calculadora ou compare todos os planos e
            combos antes de fechar.
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <Link
              href="/planos"
              className="rounded-xl border border-white/15 py-2.5 text-center text-sm text-zinc-200 transition hover:bg-white/5"
            >
              Ver planos e combos
            </Link>
            <Link
              href="/#calculadora"
              className="rounded-xl border border-white/15 py-2.5 text-center text-sm text-zinc-200 transition hover:bg-white/5"
            >
              Recalcular na calculadora
            </Link>
          </div>
        </div>
      </aside>
    </main>
  );
}

interface SignupResponse {
  accessToken: string;
}