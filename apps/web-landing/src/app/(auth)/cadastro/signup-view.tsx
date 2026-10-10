'use client';
// src/app/(auth)/cadastro/signup-view.tsx — Cap. 1.2.1 / 1.2.2 / 2.4
//
// Cadastro PLG sem cartão de crédito.
//
// Bugs que esta versão corrige:
//   1. O formulário NÃO enviava `termsAccepted`/`privacyPolicyAccepted`, mas a
//      API exige aceite explícito (LGPD art. 7º). Resultado: todo cadastro
//      voltava 400 e o usuário ficava preso na tela sem saber por quê.
//   2. "Já tem uma conta? Entrar" apontava para `/painel` (que exibe o login
//      embutido) em vez de `/entrar`.
//   3. Não havia escolha de nicho — a conta nascia genérica, sem template de
//      catálogo, que é justamente o que o Cap. 1.2.2 promete.

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ApiError, post } from '../../../lib/api';
import type { NicheSummary } from '../../../lib/niches';

interface SignupResponse {
  niche: { code: string; label: string } | null;
  onboarding: {
    nextStep: string;
    message: string;
    /** Presente quando há algo a pagar — leva direto ao checkout. */
    checkoutUrl?: string | null;
  };
  pendingModuleCodes?: string[];
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
  optional?: boolean;
}) {
  const { label, type = 'text', value, onChange, autoComplete, minLength, required, optional } =
    props;

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
      {optional && (
        <span className="block text-xs text-zinc-600">
          Pode deixar em branco e completar depois.
        </span>
      )}
    </label>
  );
}

export function SignupView() {
  const router = useRouter();
  const params = useSearchParams();

  const [form, setForm] = useState({
    tradeName: '',
    legalName: '',
    cnpj: '',
    name: '',
    email: '',
    password: '',
  });

  const [niches, setNiches] = useState<NicheSummary[]>([]);
  const [nicheCode, setNicheCode] = useState<string | null>(params.get('nicho'));
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/niches', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('niches'))))
      .then((json) => setNiches(json?.data?.niches ?? []))
      .catch(() => setNiches([]));
  }, []);

  const planCode = params.get('plan') ?? undefined;
  const moduleCodes = (params.get('mods') ?? '').split(',').filter(Boolean);
  const billingCycle = params.get('cycle') ?? undefined;

  const activeNiche = niches.find((n) => n.code === nicheCode);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    // Validação local do aceite: o servidor exige, e o erro 400 sem dizer o quê
    // é péssimo para conversão.
    if (!termsAccepted || !privacyAccepted) {
      setError('É necessário aceitar os Termos de Uso e a Política de Privacidade.');
      return;
    }

    setBusy(true);
    try {
      const response = await post<SignupResponse>('/api/auth/signup', {
        tradeName: form.tradeName,
        legalName: form.legalName || undefined,
        cnpj: form.cnpj || undefined,
        name: form.name,
        email: form.email,
        password: form.password,
        planCode,
        selectedModuleCodes: moduleCodes,
        billingCycle,
        nicheCode: nicheCode ?? undefined,
        termsAccepted,
        privacyPolicyAccepted: privacyAccepted,
      });

      // Plano pago (ou add-ons extras escolhidos) não estão ativos ainda: sem
      // pagamento nada é liberado. Mandar direto para o painel deixaria o
      // cliente a navegar num ERP que responde 402 em todos os módulos.
      if (response.onboarding.nextStep === 'checkout' && response.onboarding.checkoutUrl) {
        router.push(response.onboarding.checkoutUrl);
        return;
      }

      router.push(`/painel?cadastro=sucesso&niche=${response.niche?.code ?? ''}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível criar a conta.');
      setBusy(false);
    }
  }

  function set(key: keyof typeof form) {
    return (value: string) => setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-14">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-400">
        {planCode && planCode !== 'FREE'
          ? `Plano ${planCode} · pagamento no próximo passo`
          : 'Tier grátis · sem cartão'}
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-50">
        Crie sua conta
      </h1>
      <p className="mt-3 text-sm text-zinc-400">
        {planCode && planCode !== 'FREE'
          ? 'Menos de um minuto. A conta é criada agora e nada é cobrado até você concluir o pagamento na tela seguinte.'
          : 'Menos de um minuto. Você começa no plano gratuito e evolui quando quiser.'}
      </p>

      <form onSubmit={submit} className="card-site mt-8 space-y-6 p-6">
        {/* Nicho (Cap. 1.2.2) */}
        <fieldset>
          <legend className="text-sm font-medium text-zinc-200">
            Qual é o seu negócio?
          </legend>
          <p className="mt-1 text-xs text-zinc-500">
            Escolher o nicho carrega um catálogo inicial e sugere os módulos certos.
            Dá para trocar depois no painel.
          </p>

          {niches.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">Carregando nichos…</p>
          ) : (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {niches
                .filter((n) => n.selectableOnSignup)
                .map((niche) => {
                  const isActive = niche.code === nicheCode;
                  return (
                    <button
                      key={niche.code}
                      type="button"
                      onClick={() => setNicheCode(isActive ? null : niche.code)}
                      className={`flex items-center gap-2 rounded-xl border p-3 text-left text-sm transition ${
                        isActive
                          ? 'bg-white/[0.04]'
                          : 'border-white/10 hover:border-white/20'
                      }`}
                      style={
                        isActive
                          ? { borderColor: niche.colorHex }
                          : undefined
                      }
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: niche.colorHex }}
                      />
                      <span className="leading-snug">{niche.label}</span>
                    </button>
                  );
                })}
            </div>
          )}

          {activeNiche && (
            <p className="mt-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-400">
              {activeNiche.tagline}
              {activeNiche.templateItems.length > 0 && (
                <span className="mt-1 block text-zinc-500">
                  Você receberá {activeNiche.templateItems.length} produtos de exemplo
                  já cadastrados.
                </span>
              )}
            </p>
          )}
        </fieldset>

        {/* Dados da empresa */}
        <fieldset className="space-y-4">
          <legend className="text-sm font-medium text-zinc-200">Sua empresa</legend>

          <Field label="Nome fantasia *" value={form.tradeName} onChange={set('tradeName')} />
          <Field
            label="Razão social"
            value={form.legalName}
            onChange={set('legalName')}
            optional
          />
          <Field label="CNPJ" value={form.cnpj} onChange={set('cnpj')} optional />
        </fieldset>

        {/* Seus dados */}
        <fieldset className="space-y-4">
          <legend className="text-sm font-medium text-zinc-200">Seus dados</legend>

          <Field
            label="Seu nome *"
            value={form.name}
            onChange={set('name')}
            autoComplete="name"
          />
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
          <p className="text-xs text-zinc-600">Mínimo de 8 caracteres.</p>
        </fieldset>

        {/* Aceite (Cap. 1.2.1) */}
        <fieldset className="space-y-3 border-t border-white/10 pt-5">
          <legend className="sr-only">Termos legais</legend>

          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-white/20 bg-zinc-900 accent-indigo-500"
            />
            <span className="text-zinc-300">
              Li e aceito os{' '}
              <Link href="/termos" className="text-indigo-400 hover:underline">
                Termos de Uso
              </Link>{' '}
              da Filitech ERP.
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={privacyAccepted}
              onChange={(e) => setPrivacyAccepted(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-white/20 bg-zinc-900 accent-indigo-500"
            />
            <span className="text-zinc-300">
              Li e aceito a{' '}
              <Link href="/privacidade" className="text-indigo-400 hover:underline">
                Política de Privacidade
              </Link>{' '}
              e o tratamento de dados descrito nela.
            </span>
          </label>
        </fieldset>

        {error && (
          <p
            role="alert"
            className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-indigo-500 py-3.5 font-medium text-white transition hover:bg-indigo-400 disabled:opacity-60"
        >
          {busy
            ? 'Criando conta…'
            : planCode && planCode !== 'FREE'
              ? 'Criar conta e continuar'
              : 'Criar conta grátis'}
        </button>

        <p className="text-center text-sm text-zinc-500">
          Já tem uma conta?{' '}
          <Link href="/entrar" className="text-indigo-400 hover:text-indigo-300">
            Entrar
          </Link>
        </p>
      </form>
    </main>
  );
}