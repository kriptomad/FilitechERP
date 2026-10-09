// src/app/(auth)/checkout/checkout-view.tsx — substitui a versão anterior.
// Ver o arquivo original no histórico git; as correções estão inline abaixo.

'use client';
// src/app/(auth)/checkout/checkout-view.tsx — Cap. 9.3
//
// Checkout com confirmação de pagamento REAL.
//
// Gap crítico corrigido: a versão anterior chamava `POST /api/billing/checkout`
// e, ao receber sucesso, já mandava o cliente para `/painel?checkout=sucesso`
// como se a cobrança tivesse sido feita. O endpoint, por sua vez, ativava o
// Tenant sem consultar PSP nenhum. O resultado: "Assinar" liberava o sistema
// sem pagamento, sem QR Code e sem nada.
//
// Agora o fluxo é:
//   1. `POST /api/billing/checkout` cria a cobrança no PSP e devolve o
//      instrumento (QR Code Pix copia-e-cola / link de checkout);
//   2. a tela mostra o QR Code e faz polling em `/api/billing/charge/{id}`;
//   3. a ativação acontece quando o WEBHOOK do provedor chega — não quando o
//      usuário clica em "Já paguei".
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ApiError, brl, post, api } from '@/lib/api';
import { FALLBACK_CATALOG, fetchCatalogClient, type Catalog } from '@/lib/catalog';
import { LoginCard } from '@/components/login-card';

interface CheckoutResponse {
  mode: 'quote' | 'free' | 'charge';
  paymentChargeId?: string;
  subscriptionId?: string;
  totalMrr: number;
  billingCycle: string;
  breakdown: { code: string; label: string; price: number }[];
  requiresAccount: boolean;
  message?: string;
  tenantName?: string | null;
  providerLabel?: string | null;
  status?: 'PAID' | 'AWAITING_PAYMENT';
  payment?: {
    method: string;
    pixQrCodePayload: string | null;
    pixQrCodeBase64: string | null;
    hostedCheckoutUrl: string | null;
    expiresAt: string;
  };
  checkoutRedirectUrl: string;
}

interface RegisterResponse {
  user: { id: string; name: string; email: string; role: string };
  activeModules: string[];
  plan: string;
  subscriptionId: string;
  niche: { code: string; label: string } | null;
  onboarding: { nextStep: string; message: string };
}

interface ChargeStatus {
  id: string;
  status: string;
  amount: number;
  provider: string;
  message: string;
  pixQrCodePayload: string | null;
  pixQrCodeBase64: string | null;
  hostedCheckoutUrl: string | null;
}

const inputClass =
  'w-full rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-3 text-sm text-zinc-100 outline-none transition focus:border-indigo-500/70';

const PAYMENT_METHODS = [
  { code: 'PIX', label: 'Pix', hint: 'QR Code na hora, confirmação automática' },
  { code: 'CREDIT_CARD', label: 'Cartão de crédito', hint: 'Checkout seguro do provedor' },
  { code: 'BOLETO', label: 'Boleto bancário', hint: 'Compensação em até 2 dias úteis' },
];

/** Intervalo do polling. 4s é o suficiente para o webhook chegar sem martelar a API. */
const POLL_INTERVAL_MS = 4000;

export function CheckoutView() {
  const router = useRouter();
  const params = useSearchParams();

  const planCode = params.get('plan') ?? 'BASIC';
  const cycle = params.get('cycle') ?? 'MONTHLY';
  const nicheCode = params.get('nicho') ?? undefined;
  const moduleCodes = useMemo(
    () => (params.get('mods') ?? '').split(',').filter(Boolean),
    [params],
  );

  const [catalog, setCatalog] = useState<Catalog>(FALLBACK_CATALOG);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [method, setMethod] = useState('PIX');
  const [mode, setMode] = useState<'signup' | 'login'>('signup');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CheckoutResponse | null>(null);
  const [charge, setCharge] = useState<ChargeStatus | null>(null);

  const [form, setForm] = useState({ tradeName: '', name: '', email: '', password: '' });

  useEffect(() => {
    fetchCatalogClient().then(setCatalog).catch(() => undefined);

    fetch('/api/auth/me', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('anon'))))
      .then((json) => setLoggedIn(Boolean(json?.success)))
      .catch(() => setLoggedIn(false));
  }, []);

  // Polling da cobrança: o usuário não precisa recarregar para ver a confirmação.
  const pollCharge = useCallback((chargeId: string) => {
    const timer = setInterval(async () => {
      try {
        const status = await api<ChargeStatus>(`/api/billing/charge/${chargeId}`);
        setCharge(status);
        if (status.status === 'PAID') {
          clearInterval(timer);
          setResult((prev) =>
            prev
              ? { ...prev, status: 'PAID', message: status.message }
              : prev,
          );
        }
      } catch {
        // Falha de polling não cancela nada — o webhook resolve mesmo assim.
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (result?.paymentChargeId && result.status === 'AWAITING_PAYMENT') {
      return pollCharge(result.paymentChargeId);
    }
    return undefined;
  }, [result, pollCharge]);

  const plan = catalog.plans.find((p) => p.code === planCode) ?? catalog.plans[1];

  async function signInAndPay() {
    setError(null);
    setBusy(true);
    try {
      await post('/api/auth/login', { email: form.email, password: form.password });
      setLoggedIn(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível entrar.');
    } finally {
      setBusy(false);
    }
  }

  async function signupAndPay(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await post('/api/auth/signup', {
        tradeName: form.tradeName,
        name: form.name,
        email: form.email,
        password: form.password,
        planCode: plan.code,
        selectedModuleCodes: moduleCodes,
        billingCycle: cycle,
        nicheCode,
        termsAccepted: true,
        privacyPolicyAccepted: true,
      });
      setLoggedIn(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao criar a conta.');
    } finally {
      setBusy(false);
    }
  }

  async function startCheckout() {
    setError(null);
    setBusy(true);
    try {
      const response = await post<CheckoutResponse>('/api/billing/checkout', {
        planCode: plan.code,
        selectedModuleCodes: moduleCodes,
        billingCycle: cycle,
        paymentMethod: method,
      });

      setResult(response);

      // Plano gratuito é ativado na hora (não há o que cobrar).
      if (response.mode === 'free') {
        router.push('/painel?checkout=sucesso');
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível iniciar a cobrança. Tente novamente.',
      );
    } finally {
      setBusy(false);
    }
  }

  const totalMrr = useMemo(() => {
    if (!plan) return 0;
    const addons = catalog.modules
      .filter((m) => moduleCodes.includes(m.code) && !plan.includedModules.includes(m.code))
      .reduce((sum, m) => sum + m.monthlyPrice, 0);
    return Math.round((plan.basePrice + addons) * 100) / 100;
  }, [catalog, moduleCodes, plan]);

  // ── Tela de pagamento em andamento ──────────────────────────────────────
  if (result?.paymentChargeId && result.status === 'AWAITING_PAYMENT') {
    const payment = result.payment;
    const liveStatus = charge?.status ?? 'PENDING';

    return (
      <main className="mx-auto max-w-lg px-5 py-12">
        <div className="rounded-2xl border border-white/10 bg-zinc-900/40 p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-400">
            {result.providerLabel ?? 'Pagamento'}
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">
            {liveStatus === 'PAID' ? 'Pagamento confirmado' : 'Finalize o pagamento'}
          </h1>

          <p className="mt-3 text-sm leading-relaxed text-zinc-400">
            {liveStatus === 'PAID'
              ? 'Sua assinatura foi ativada. Redirecionando para o painel…'
              : 'Aguardando a confirmação do provedor de pagamento. Assim que o pagamento for identificado, sua assinatura é ativada automaticamente — você não precisa recarregar esta página.'}
          </p>

          <div className="mt-6 rounded-xl border border-white/10 bg-black/20 p-5">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-zinc-400">Valor</span>
              <span className="text-xl font-bold">{brl(result.totalMrr)}</span>
            </div>
            <ul className="mt-4 space-y-1.5 text-sm text-zinc-400">
              {result.breakdown.map((line) => (
                <li key={line.code} className="flex justify-between gap-3">
                  <span className="truncate">{line.label}</span>
                  <span className="shrink-0">{brl(line.price)}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Pix: QR Code + copia-e-cola */}
          {payment?.method === 'PIX' && (
            <div className="mt-6">
              <p className="mb-3 text-sm font-medium text-zinc-300">
                Escaneie o QR Code com o app do seu banco:
              </p>

              {payment.pixQrCodeBase64 ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`data:image/png;base64,${payment.pixQrCodeBase64}`}
                  alt="QR Code Pix para pagamento da assinatura"
                  className="mx-auto h-56 w-56 rounded-xl bg-white p-3"
                />
              ) : (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                  O provedor ainda está gerando o QR Code. Atualize em alguns instantes.
                </p>
              )}

              {payment.pixQrCodePayload && (
                <div className="mt-4">
                  <label
                    htmlFor="pix-payload"
                    className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-zinc-500"
                  >
                    Pix copia e cola
                  </label>
                  <textarea
                    id="pix-payload"
                    readOnly
                    rows={3}
                    value={payment.pixQrCodePayload}
                    className={`${inputClass} font-mono text-xs`}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                </div>
              )}
            </div>
          )}

          {/* Cartão/boleto: link hospedado do provedor */}
          {payment?.hostedCheckoutUrl && payment.method !== 'PIX' && (
            <a
              href={payment.hostedCheckoutUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 block w-full rounded-xl bg-indigo-600 py-4 text-center font-semibold text-white transition hover:bg-indigo-500"
            >
              Pagar {brl(result.totalMrr)} com segurança
            </a>
          )}

          <div
            role="status"
            aria-live="polite"
            className="mt-6 flex items-center gap-2 text-xs text-zinc-500"
          >
            {liveStatus === 'PAID' ? (
              <span className="text-emerald-400">Assinatura ativa.</span>
            ) : (
              <>
                <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
                Verificando confirmação a cada {POLL_INTERVAL_MS / 1000}s…
              </>
            )}
          </div>

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={() => router.push('/painel')}
              className="flex-1 rounded-xl border border-white/10 px-4 py-3 text-sm text-zinc-300 transition hover:bg-white/5"
            >
              Ir para o painel
            </button>
            {liveStatus === 'PAID' && (
              <button
                type="button"
                onClick={() => router.push('/app')}
                className="flex-1 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-indigo-500"
              >
                Abrir o ERP
              </button>
            )}
          </div>
        </div>
      </main>
    );
  }

  // ── Tela de confirmação de plano grátis ─────────────────────────────────
  if (result?.mode === 'free') {
    return (
      <main className="mx-auto max-w-lg px-5 py-12">
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-8">
          <h1 className="text-2xl font-bold tracking-tight">Plano Free ativado</h1>
          <p className="mt-3 text-sm text-zinc-300">{result.message}</p>
          <Link
            href="/app"
            className="mt-6 block rounded-xl bg-indigo-600 py-4 text-center font-semibold text-white transition hover:bg-indigo-500"
          >
            Abrir o ERP
          </Link>
        </div>
      </main>
    );
  }

  // ── Tela de confirmação imediata (PSP já confirmou) ─────────────────────
  if (result?.status === 'PAID') {
    return (
      <main className="mx-auto max-w-lg px-5 py-12">
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-8">
          <h1 className="text-2xl font-bold tracking-tight">Pagamento confirmado</h1>
          <p className="mt-3 text-sm text-zinc-300">{result.message}</p>
          <Link
            href="/app"
            className="mt-6 block rounded-xl bg-indigo-600 py-4 text-center font-semibold text-white transition hover:bg-indigo-500"
          >
            Abrir o ERP
          </Link>
        </div>
      </main>
    );
  }

  if (!plan) {
    return (
      <main className="grid min-h-[50vh] place-items-center text-zinc-500">
        Carregando catálogo…
      </main>
    );
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
          Você vê exatamente o que será cobrado. Nada é ativado antes da confirmação do
          pagamento.
        </p>

        {!loggedIn ? (
          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            <div
              className={`rounded-2xl border p-6 transition ${
                mode === 'signup' ? 'border-indigo-500/60 bg-indigo-500/5' : 'border-white/10'
              }`}
            >
              <h2 className="text-lg font-semibold">Criar conta</h2>
              <p className="mt-1 text-sm text-zinc-400">
                Leva menos de um minuto e começa no plano Free.
              </p>

              <form onSubmit={signupAndPay} className="mt-5 space-y-3">
                <input
                  required
                  placeholder="Nome da empresa"
                  className={inputClass}
                  value={form.tradeName}
                  onChange={(e) => setForm({ ...form, tradeName: e.target.value })}
                />
                <input
                  required
                  placeholder="Seu nome"
                  className={inputClass}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
                <input
                  required
                  type="email"
                  placeholder="E-mail"
                  className={inputClass}
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
                <input
                  required
                  type="password"
                  minLength={8}
                  placeholder="Senha (mínimo 8)"
                  className={inputClass}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />

                <p className="text-xs text-zinc-500">
                  Ao criar a conta você aceita os{' '}
                  <Link href="/termos" className="text-indigo-400 hover:underline">
                    Termos de Uso
                  </Link>{' '}
                  e a{' '}
                  <Link href="/privacidade" className="text-indigo-400 hover:underline">
                    Política de Privacidade
                  </Link>
                  .
                </p>

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-xl bg-indigo-600 py-3 font-medium text-white transition hover:bg-indigo-500 disabled:opacity-60"
                >
                  {busy ? 'Criando conta…' : 'Criar conta e continuar'}
                </button>
              </form>
            </div>

            <div
              className={`rounded-2xl border p-6 transition ${
                mode === 'login' ? 'border-indigo-500/60 bg-indigo-500/5' : 'border-white/10'
              }`}
            >
              <h2 className="text-lg font-semibold">Já tenho conta</h2>
              <p className="mt-1 text-sm text-zinc-400">Entre para contratar o plano.</p>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void signInAndPay();
                }}
                className="mt-5 space-y-3"
              >
                <input
                  required
                  type="email"
                  placeholder="E-mail"
                  className={inputClass}
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
                <input
                  required
                  type="password"
                  placeholder="Senha"
                  className={inputClass}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-xl border border-white/15 py-3 font-medium text-zinc-200 transition hover:bg-white/5 disabled:opacity-60"
                >
                  {busy ? 'Entrando…' : 'Entrar'}
                </button>
              </form>
            </div>
          </div>
        ) : (
          <div className="mt-10">
            <h2 className="text-lg font-semibold">Forma de pagamento</h2>
            <p className="mt-1 text-sm text-zinc-400">
              O pagamento é processado por {`${totalMrr > 0 ? 'provedor de pagamento' : 'nenhum provador'}`}. Sua
              assinatura só é ativada depois da confirmação.
            </p>

            <div className="mt-5 space-y-3">
              {PAYMENT_METHODS.map((option) => (
                <button
                  key={option.code}
                  type="button"
                  onClick={() => setMethod(option.code)}
                  className={`flex w-full items-center justify-between rounded-xl border p-4 text-left transition ${
                    method === option.code
                      ? 'border-indigo-500/60 bg-indigo-500/5'
                      : 'border-white/10 hover:border-white/20'
                  }`}
                >
                  <span>
                    <span className="block text-sm font-medium">{option.label}</span>
                    <span className="block text-xs text-zinc-500">{option.hint}</span>
                  </span>
                  <span
                    className={`h-4 w-4 rounded-full border-2 ${
                      method === option.code ? 'border-indigo-500' : 'border-zinc-700'
                    }`}
                  />
                </button>
              ))}
            </div>

            {error && (
              <p
                role="alert"
                className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300"
              >
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={startCheckout}
              disabled={busy || totalMrr === 0}
              className="mt-6 w-full rounded-xl bg-indigo-600 py-4 font-semibold text-white shadow-[0_0_30px_rgba(99,102,241,0.3)] transition hover:bg-indigo-500 disabled:opacity-60"
            >
              {busy
                ? 'Processando…'
                : totalMrr === 0
                  ? 'Ativar plano Free'
                  : `Pagar ${brl(totalMrr)}`}
            </button>

            <p className="mt-4 text-center text-xs text-zinc-600">
              Sem fidelidade. Cancele quando quiser pelo painel.
            </p>
          </div>
        )}
      </section>

      <aside className="h-fit rounded-2xl border border-white/10 bg-zinc-900/40 p-6 lg:sticky lg:top-24">
        <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-zinc-500">
          Resumo do contrato
        </h2>

        <ul className="mt-5 space-y-2.5 text-sm">
          {[
            { code: plan.code, label: `Plano ${plan.label} (base)`, price: plan.basePrice },
            ...catalog.modules
              .filter((m) => moduleCodes.includes(m.code) && !plan.includedModules.includes(m.code))
              .map((m) => ({ code: m.code, label: m.label, price: m.monthlyPrice })),
          ].map((line) => (
            <li key={line.code} className="flex justify-between gap-3 text-zinc-300">
              <span className="truncate">{line.label}</span>
              <span className="shrink-0">{brl(line.price)}</span>
            </li>
          ))}
        </ul>

        <div className="mt-5 flex items-baseline justify-between border-t border-white/10 pt-5">
          <span className="text-sm text-zinc-400">Total mensal</span>
          <span className="text-2xl font-bold">{brl(totalMrr)}</span>
        </div>

        {nicheCode && (
          <p className="mt-4 rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-400">
            Configuração para o nicho <strong>{nicheCode}</strong> — o catálogo inicial
            desse nicho já será carregado na sua conta.
          </p>
        )}

        <ul className="mt-5 space-y-2 text-xs text-zinc-500">
          <li>· Sem fidelidade contratual</li>
          <li>· Cancele pelo painel a qualquer momento</li>
          <li>· Reembolso integral nos 7 primeiros dias (Art. 49 CDC)</li>
        </ul>
      </aside>
    </main>
  );
}

// Reexportado para o panel reutilizar o card de login com o novo fluxo.
export { LoginCard };