'use client';
// src/app/app/configuracoes/configuracoes-view.tsx — Cap. 5 / 14.2 / 1.2.2
//
// Quatro abas:
//   • Dados fiscais → PATCH /api/tenant/settings (não existia endpoint antes);
//   • Segurança     → ativação/desativação real do 2FA (Cap. 14.2);
//   • Nicho         → PATCH /api/auth/niche, que carrega o template de catálogo;
//   • Fidelidade    → PATCH /api/loyalty, programa de pontos (Cap. 4.1.1).
//
// Nenhum valor é presumido aqui: o que está marcado como "ativo" veio do banco
// na renderização do servidor.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, post, patch, ApiError } from '@/lib/api';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface Tenant {
  id: string;
  slug: string;
  tradeName: string;
  legalName: string;
  cnpj: string;
  nicheCode: string | null;
  taxRegime: string;
  simplesNacionalAnexo: string | null;
  inscricaoEstadual: string | null;
  uf: string | null;
  status: string;
}

interface Niche {
  code: string;
  label: string;
  tagline: string;
  colorHex: string | null;
}

interface Subscription {
  planCode: string;
  planLabel: string;
  status: string;
  currentPeriodEnd: string | null;
}

interface Props {
  user: User;
  tenant: Tenant;
  niches: Niche[];
  twoFactorEnabled: boolean;
  remainingBackupCodes: number;
  activeModules: string[];
  subscription: Subscription | null;
}

type Tab = 'fiscal' | 'seguranca' | 'nicho' | 'fidelidade';

const TABS: { key: Tab; label: string }[] = [
  { key: 'fiscal', label: 'Dados fiscais' },
  { key: 'seguranca', label: 'Segurança' },
  { key: 'nicho', label: 'Nicho do negócio' },
  { key: 'fidelidade', label: 'Fidelidade' },
];

const inputClass =
  'w-full rounded-xl border border-white/10 bg-zinc-900/60 px-3.5 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-indigo-500/70';

const TAX_REGIMES = [
  { value: 'MEI', label: 'MEI — Microempreendedor Individual' },
  { value: 'SIMPLES_NACIONAL', label: 'Simples Nacional' },
  { value: 'LUCRO_PRESUMIDO', label: 'Lucro Presumido' },
  { value: 'LUCRO_REAL', label: 'Lucro Real' },
] as const;

const UFS = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS',
  'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC',
  'SE', 'SP', 'TO',
];

/** OWNER (curinga) e MANAGER têm `billing:manage` na matriz padrão (Cap. 5). */
function canManageTax(role: string): boolean {
  return role === 'OWNER' || role === 'MANAGER';
}

function Notice({ tone, children }: { tone: 'ok' | 'error'; children: React.ReactNode }) {
  return (
    <p
      className={`rounded-lg border px-3 py-2 text-sm ${
        tone === 'ok'
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
          : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
      }`}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      {children}
    </p>
  );
}

export function ConfiguracoesView({
  user,
  tenant,
  niches,
  twoFactorEnabled: initialTwoFactor,
  remainingBackupCodes: initialBackupCodes,
  subscription,
}: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('fiscal');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {tenant.tradeName} · {user.name} ({user.role})
          {subscription ? ` · plano ${subscription.planLabel}` : ''}
        </p>
      </div>

      <nav className="flex gap-1 overflow-x-auto border-b border-white/10">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`-mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm transition ${
              tab === item.key
                ? 'border-indigo-500 text-indigo-300'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {tab === 'fiscal' && <FiscalTab tenant={tenant} role={user.role} />}
      {tab === 'seguranca' && (
        <SecurityTab
          enabled={initialTwoFactor}
          remaining={initialBackupCodes}
          onDone={() => router.refresh()}
        />
      )}
      {tab === 'nicho' && <NicheTab currentCode={tenant.nicheCode} niches={niches} />}
      {tab === 'fidelidade' && <LoyaltyTab role={user.role} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Dados fiscais
// ─────────────────────────────────────────────────────────────────────────────

function FiscalTab({ tenant, role }: { tenant: Tenant; role: string }) {
  const editable = canManageTax(role);

  const [taxRegime, setTaxRegime] = useState(tenant.taxRegime);
  const [anexo, setAnexo] = useState(tenant.simplesNacionalAnexo ?? '');
  const [inscricaoEstadual, setInscricaoEstadual] = useState(tenant.inscricaoEstadual ?? '');
  const [uf, setUf] = useState(tenant.uf ?? '');
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const dirty =
    taxRegime !== tenant.taxRegime ||
    anexo !== (tenant.simplesNacionalAnexo ?? '') ||
    inscricaoEstadual !== (tenant.inscricaoEstadual ?? '') ||
    uf !== (tenant.uf ?? '');

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    try {
      // Campos no payload mas NÃO alterados são omitidos — o PATCH só grava o
      // que o usuário mexeu, preservando o `before` da auditoria.
      const payload: Record<string, string> = {};
      if (taxRegime !== tenant.taxRegime) payload.taxRegime = taxRegime;
      if (anexo !== (tenant.simplesNacionalAnexo ?? '')) payload.simplesNacionalAnexo = anexo;
      if (inscricaoEstadual !== (tenant.inscricaoEstadual ?? ''))
        payload.inscricaoEstadual = inscricaoEstadual;
      if (uf !== (tenant.uf ?? '')) payload.uf = uf;

      if (Object.keys(payload).length === 0) {
        setMessage({ tone: 'ok', text: 'Nada alterado.' });
        return;
      }

      await patch('/api/tenant/settings', payload);
      setMessage({ tone: 'ok', text: 'Dados fiscais atualizados e registrados na auditoria.' });
    } catch (err) {
      setMessage({
        tone: 'error',
        text: err instanceof ApiError ? err.message : 'Falha ao salvar os dados fiscais.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-5 rounded-2xl border border-white/10 p-5">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
          Identificação fiscal
        </h2>
        <p className="mt-1 text-xs text-zinc-600">
          CNPJ {tenant.cnpj} · {tenant.legalName}. Estes campos não são editáveis aqui — mudar a
          identificação da pessoa jurídica exige revalidação no cadastro.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="f-regime" className="mb-1.5 block text-xs text-zinc-400">
            Regime tributário
          </label>
          <select
            id="f-regime"
            value={taxRegime}
            disabled={!editable}
            onChange={(e) => setTaxRegime(e.target.value)}
            className={`${inputClass} disabled:opacity-60`}
          >
            {TAX_REGIMES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-[11px] text-zinc-600">
            Define o cálculo de imposto em cada venda (Cap. 21.1) — não há alíquota fixa no código.
          </p>
        </div>

        <div>
          <label htmlFor="f-uf" className="mb-1.5 block text-xs text-zinc-400">
            UF
          </label>
          <select
            id="f-uf"
            value={uf}
            disabled={!editable}
            onChange={(e) => setUf(e.target.value)}
            className={`${inputClass} disabled:opacity-60`}
          >
            <option value="">Não informada</option>
            {UFS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="f-ie" className="mb-1.5 block text-xs text-zinc-400">
            Inscrição estadual
          </label>
          <input
            id="f-ie"
            value={inscricaoEstadual}
            disabled={!editable}
            onChange={(e) => setInscricaoEstadual(e.target.value)}
            className={`${inputClass} disabled:opacity-60`}
            placeholder="ISENTO"
          />
        </div>

        <div>
          <label htmlFor="f-anexo" className="mb-1.5 block text-xs text-zinc-400">
            Anexo do Simples Nacional
          </label>
          <input
            id="f-anexo"
            value={anexo}
            disabled={!editable || taxRegime !== 'SIMPLES_NACIONAL'}
            onChange={(e) => setAnexo(e.target.value)}
            className={`${inputClass} disabled:opacity-60`}
            placeholder="I, II, III, IV ou V"
          />
          <p className="mt-1.5 text-[11px] text-zinc-600">
            Aplica-se somente ao Simples Nacional.
          </p>
        </div>
      </div>

      {!editable && (
        <Notice tone="error">
          Seu papel ({role}) não tem permissão para alterar dados fiscais — apenas OWNER e
          MANAGER.
        </Notice>
      )}

      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={!editable || !dirty || busy}
          className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-60"
        >
          {busy ? 'Salvando…' : 'Salvar dados fiscais'}
        </button>
        {dirty && !busy && (
          <span className="self-center text-xs text-amber-400">Alterações não salvas</span>
        )}
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Segurança (2FA)
// ─────────────────────────────────────────────────────────────────────────────

function SecurityTab({
  enabled,
  remaining,
  onDone,
}: {
  enabled: boolean;
  remaining: number;
  onDone: () => void;
}) {
  const [active, setActive] = useState(enabled);
  const [codes, setCodes] = useState<number>(remaining);

  const [step, setStep] = useState<'idle' | 'started' | 'confirmed'>('idle');
  const [secret, setSecret] = useState('');
  const [otpauthUrl, setOtpauthUrl] = useState('');
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [password, setPassword] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    setMessage(null);
    try {
      const data = await post<{ otpauthUrl: string; secret: string }>(
        '/api/auth/2fa/enroll/start',
        {},
      );
      setOtpauthUrl(data.otpauthUrl);
      setSecret(data.secret);
      setStep('started');
    } catch (err) {
      setMessage({
        tone: 'error',
        text: err instanceof ApiError ? err.message : 'Falha ao iniciar a ativação.',
      });
    } finally {
      setBusy(false);
    }
  }

  async function confirm(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const data = await post<{ backupCodes: string[] }>('/api/auth/2fa/enroll/confirm', {
        totpCode: code,
      });
      setBackupCodes(data.backupCodes);
      setStep('confirmed');
    } catch (err) {
      setMessage({
        tone: 'error',
        text: err instanceof ApiError ? err.message : 'Código recusado.',
      });
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    if (!acknowledged) return;
    setBusy(true);
    try {
      setActive(true);
      setCodes(backupCodes.length);
      setBackupCodes([]);
      setStep('idle');
      setCode('');
      setMessage({
        tone: 'ok',
        text: '2FA ativo. A partir de agora o login pede também o código do aplicativo.',
      });
      onDone();
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMessage(null);
    try {
      await post('/api/auth/2fa/disable', { password });
      setActive(false);
      setCodes(0);
      setPassword('');
      setMessage({ tone: 'ok', text: '2FA desativado. Sua conta volta a usar apenas a senha.' });
      onDone();
    } catch (err) {
      setMessage({
        tone: 'error',
        text: err instanceof ApiError ? err.message : 'Falha ao desativar o 2FA.',
      });
    } finally {
      setBusy(false);
    }
  }

  if (step === 'started') {
    return (
      <div className="space-y-5 rounded-2xl border border-indigo-500/30 bg-indigo-500/[0.04] p-5">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-indigo-300">
            1 de 2 — vincule o aplicativo
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            Abra Google Authenticator, Aegis, 1Password ou outro app compatível e adicione a conta
            informando o segredo abaixo.
          </p>
        </div>

        <div>
          <p className="mb-1.5 text-xs text-zinc-400">Segredo (entrada manual)</p>
          <code className="block break-all rounded-lg border border-white/10 bg-zinc-950 px-3 py-2.5 font-mono text-sm text-emerald-300">
            {secret}
          </code>
        </div>

        <div>
          <p className="mb-1.5 text-xs text-zinc-400">Ou cole este URI no app</p>
          <code className="block break-all rounded-lg border border-white/10 bg-zinc-950 px-3 py-2.5 font-mono text-xs text-zinc-400">
            {otpauthUrl}
          </code>
        </div>

        <form onSubmit={confirm} className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="t-code" className="mb-1.5 block text-xs text-zinc-400">
              Código de 6 dígitos
            </label>
            <input
              id="t-code"
              inputMode="numeric"
              required
              maxLength={6}
              pattern="\d{6}"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className={`${inputClass} w-40 font-mono`}
              placeholder="000000"
            />
          </div>
          <button
            type="submit"
            disabled={busy || code.length !== 6}
            className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-60"
          >
            {busy ? 'Conferindo…' : 'Confirmar'}
          </button>
          <button
            type="button"
            onClick={() => {
              setStep('idle');
              setCode('');
              setMessage(null);
            }}
            className="rounded-xl border border-white/10 px-5 py-2.5 text-sm text-zinc-400 transition hover:bg-white/5"
          >
            Cancelar
          </button>
        </form>

        {message && <Notice tone={message.tone}>{message.text}</Notice>}
      </div>
    );
  }

  if (step === 'confirmed') {
    return (
      <div className="space-y-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.04] p-5">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-emerald-300">
            2 de 2 — guarde os códigos de backup
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            Estes 10 códigos funcionam uma única vez cada, para quando você não tiver o
            aplicativo. Eles NÃO serão exibidos de novo — guarde-os em cofre/chaveiro.
          </p>
        </div>

        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {backupCodes.map((item) => (
            <li
              key={item}
              className="rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-center font-mono text-sm text-emerald-300"
            >
              {item}
            </li>
          ))}
        </ul>

        <label className="flex items-start gap-2.5 text-sm text-zinc-400">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-indigo-500"
          />
          Guardei estes códigos em local seguro e entendo que não verei de novo.
        </label>

        <button
          type="button"
          onClick={finish}
          disabled={!acknowledged || busy}
          className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-60"
        >
          Concluir ativação
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 rounded-2xl border border-white/10 p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
            Verificação em duas etapas
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            {active
              ? `Ativo desde o cadastro do app · ${codes} código(s) de backup restante(s).`
              : 'Desativada. Com o 2FA ativo, a senha sozinha não abre a sessão.'}
          </p>
        </div>

        <span
          className={`rounded px-2.5 py-1 text-[11px] font-medium ${
            active ? 'bg-emerald-500/15 text-emerald-300' : 'bg-zinc-500/15 text-zinc-400'
          }`}
        >
          {active ? 'ATIVO' : 'INATIVO'}
        </span>
      </div>

      {active ? (
        <div className="space-y-3">
          {codes === 0 && (
            <Notice tone="error">
              Você não tem códigos de backup restantes — se perder o aplicativo, ficará fora da
              conta. Desative e ative novamente para gerar uma nova lista.
            </Notice>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <div className="w-56">
              <label htmlFor="d-pass" className="mb-1.5 block text-xs text-zinc-400">
                Confirme com sua senha
              </label>
              <input
                id="d-pass"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
                placeholder="••••••••"
              />
            </div>
            <button
              type="button"
              onClick={disable}
              disabled={busy || password.length === 0}
              className="rounded-xl border border-rose-500/40 px-5 py-2.5 text-sm font-medium text-rose-300 transition hover:bg-rose-500/10 disabled:opacity-60"
            >
              {busy ? 'Desativando…' : 'Desativar 2FA'}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={start}
          disabled={busy}
          className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-60"
        >
          {busy ? 'Preparando…' : 'Ativar verificação em duas etapas'}
        </button>
      )}

      {message && <Notice tone={message.tone}>{message.text}</Notice>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Nicho
// ─────────────────────────────────────────────────────────────────────────────

function NicheTab({
  currentCode,
  niches,
}: {
  currentCode: string | null;
  niches: Niche[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(currentCode);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function choose() {
    if (!selected) return;
    setBusy(true);
    setMessage(null);

    try {
      // `patch` devolve `data` do envelope — a rota inclui a verdade sobre o
      // template (aplicado, ou não aplicado por já haver produtos).
      const result = await patch<{ templateMessage?: string }>('/api/auth/niche', {
        nicheCode: selected,
      });
      setMessage({
        tone: 'ok',
        text: result?.templateMessage ?? 'Nicho atualizado.',
      });
      router.refresh();
    } catch (err) {
      setMessage({
        tone: 'error',
        text: err instanceof ApiError ? err.message : 'Falha ao trocar de nicho.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5 rounded-2xl border border-white/10 p-5">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
          Nicho do negócio
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Define o catálogo inicial e quais módulos a vitrine sugere (Cap. 1.2.2). O template só é
          aplicado quando o catálogo ainda está vazio — nunca injeta SKUs por cima de estoque real.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {niches.map((niche) => {
          const isActive = selected === niche.code;
          return (
            <button
              key={niche.code}
              type="button"
              onClick={() => setSelected(niche.code)}
              className={`rounded-xl border p-4 text-left transition ${
                isActive
                  ? 'border-indigo-500/60 bg-indigo-500/10'
                  : 'border-white/10 hover:bg-white/[0.03]'
              }`}
            >
              <span className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: niche.colorHex ?? '#6366F1' }}
                />
                <span className="text-sm font-medium">{niche.label}</span>
              </span>
              <span className="mt-1.5 block text-xs text-zinc-500">{niche.tagline}</span>
            </button>
          );
        })}
      </div>

      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      <button
        type="button"
        onClick={choose}
        disabled={busy || !selected || selected === currentCode}
        className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-60"
      >
        {busy ? 'Aplicando…' : selected === currentCode ? 'Nicho atual' : 'Aplicar nicho'}
      </button>
    </div>
  );
}

// ─── Fidelidade (Cap. 4.1.1) ────────────────────────────────────────────────

interface LoyaltyProgramView {
  active: boolean;
  pointsPerCurrencyUnit: number;
  redemptionValuePerPoint: number;
  minPointsToRedeem: number;
  pointsExpireAfterDays: number | null;
}

/**
 * Configuração do programa de pontos.
 *
 * O saldo e o histórico NÃO ficam aqui: eles só existem por cliente (a aba
 * Clientes/PDV). Esta tela cuida da única coisa que é da conta toda — ativar,
 * quanto vale o ponto e quando ele vence.
 */
function LoyaltyTab({ role }: { role: string }) {
  const [program, setProgram] = useState<LoyaltyProgramView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const [active, setActive] = useState(false);
  const [pointsPerCurrencyUnit, setPerBrl] = useState('1');
  const [redemptionValuePerPoint, setPointValue] = useState('0.01');
  const [minPointsToRedeem, setMinRedeem] = useState('100');
  const [pointsExpireAfterDays, setExpireDays] = useState('');

  const managed = role === 'OWNER' || role === 'MANAGER';

  useEffect(() => {
    let cancelled = false;

    void api<{ program: LoyaltyProgramView | null }>('/api/loyalty')
      .then((result) => {
        if (cancelled) return;
        const value = result.program;
        setProgram(value);
        if (value) {
          setActive(value.active);
          setPerBrl(String(value.pointsPerCurrencyUnit));
          setPointValue(String(value.redemptionValuePerPoint));
          setMinRedeem(String(value.minPointsToRedeem));
          setExpireDays(
            value.pointsExpireAfterDays === null ? '' : String(value.pointsExpireAfterDays),
          );
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setMessage({
            tone: 'error',
            text: err instanceof ApiError ? err.message : 'Falha ao carregar a fidelidade.',
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      await patch<LoyaltyProgramView | null>('/api/loyalty', {
        active,
        pointsPerCurrencyUnit: Number(pointsPerCurrencyUnit.replace(',', '.')),
        redemptionValuePerPoint: Number(redemptionValuePerPoint.replace(',', '.')),
        minPointsToRedeem: Number(minPointsToRedeem),
        // Vazio = sem validade; limpar a validade depois de haver uma é
        // uma decisão, então manda null explicitamente (o servidor trata).
        pointsExpireAfterDays:
          pointsExpireAfterDays.trim() === '' ? null : Number(pointsExpireAfterDays),
      });
      setMessage({
        tone: 'ok',
        text: active
          ? 'Programa ativo: a partir de agora cada venda de cliente identificado pontua no PDV.'
          : 'Programa salvo e desativado: nenhuma venda pontua até religar.',
      });
    } catch (err) {
      setMessage({
        tone: 'error',
        text: err instanceof ApiError ? err.message : 'Não foi possível salvar.',
      });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-zinc-500">Carregando fidelidade…</p>;
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-white/10 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
              Programa de pontos
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-zinc-500">
              Válido só para venda com cliente identificado. Os pontos nascem dentro da mesma
              transação da venda, então cancelar a venda desfaz os pontos junto. Resgate é feito no
              PDV e nunca deixa o saldo negativo.
            </p>
          </div>
          <span
            className={`rounded px-2.5 py-1 text-[11px] font-medium ${
              program?.active
                ? 'bg-emerald-500/15 text-emerald-300'
                : 'bg-zinc-500/15 text-zinc-400'
            }`}
          >
            {program?.active ? 'ATIVO' : 'INATIVO'}
          </span>
        </div>

        <label className="mt-4 flex items-center gap-3 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            disabled={!managed}
            className="h-4 w-4 rounded border-white/20 bg-zinc-900"
          />
          Ativar acúmulo de pontos
        </label>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <LoyaltyField
            id="points-per-brl"
            label="Pontos por R$ 1,00"
            value={pointsPerCurrencyUnit}
            onChange={setPerBrl}
            disabled={!managed}
          />
          <LoyaltyField
            id="point-value"
            label="Valor de 1 ponto (R$)"
            value={redemptionValuePerPoint}
            onChange={setPointValue}
            disabled={!managed}
          />
          <LoyaltyField
            id="min-redeem"
            label="Mínimo para resgatar"
            value={minPointsToRedeem}
            onChange={setMinRedeem}
            disabled={!managed}
          />
          <LoyaltyField
            id="expire-days"
            label="Validade (dias, vazio = sem)"
            value={pointsExpireAfterDays}
            onChange={setExpireDays}
            disabled={!managed}
          />
        </div>

        {!managed && (
          <p className="mt-3 text-xs text-amber-400">
            Somente OWNER ou MANAGER pode alterar o programa de fidelidade.
          </p>
        )}

        {message && (
          <div className="mt-4">
            <Notice tone={message.tone}>{message.text}</Notice>
          </div>
        )}

        <button
          type="button"
          onClick={save}
          disabled={busy || !managed}
          className="mt-5 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-60"
        >
          {busy ? 'Salvando…' : 'Salvar fidelidade'}
        </button>
      </div>

      <div className="rounded-2xl border border-white/10 p-5 text-sm text-zinc-500">
        <p className="font-medium text-zinc-400">Como o cliente vê</p>
        <p className="mt-1">
          O saldo, os pontos a vencer nos próximos 30 dias e o histórico saem de{' '}
          <code className="text-zinc-300">GET /api/loyalty?clientId=…</code>, que é o mesmo dado
          que a ficha do cliente e o PDV consultam — não existe contador separado.
        </p>
      </div>
    </div>
  );
}

function LoyaltyField({
  id,
  label,
  value,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs text-zinc-400">
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={inputClass}
      />
    </div>
  );
}
