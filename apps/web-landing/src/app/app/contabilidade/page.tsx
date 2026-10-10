'use client';
// src/app/app/contabilidade/page.tsx — Cap. 21.18
//
// Módulo Escritório de Contabilidade. Cinco abas, todas com dados reais:
//
//   • Vínculos   — o que existe hoje entre o tenant e um escritório, com o
//                  histórico de eventos (21.18.3) e as ações de aceite/revogar.
//   • Tarefas    — o motor recorrente (21.18.4): nasce do taxRegime + scopes,
//                  não de cadastro manual.
//   • Documentos — Caminho B (21.18.1): exportar para o contador de fora.
//   • Marketplace— escolher um escritório da plataforma (21.18.6).
//
// Nada aqui finge transmissão: o arquivo sai com status GENERATED e sem
// protocolo, porque protocolo exige assinatura digital fora da plataforma.
import { useCallback, useEffect, useState } from 'react';
import { ApiError, api, patch, post, brl } from '@/lib/api';

const SCOPES = [
  { code: 'FULL_BOOKKEEPING', label: 'Contabilidade completa' },
  { code: 'TAX_FILING', label: 'Apuração e entrega de impostos' },
  { code: 'PAYROLL_ESOCIAL', label: 'Folha / eSocial' },
  { code: 'PERSONAL_INCOME_TAX', label: 'IRPF do titular e sócios' },
  { code: 'DOCUMENT_EXPORT_ONLY', label: 'Apenas exportação de documentos' },
] as const;

const TASK_LABEL: Record<string, string> = {
  ECD_GERACAO: 'Geração de ECD',
  ECF_GERACAO: 'Geração de ECF',
  EFD_REINF_ENVIO: 'Envio de EFD-Reinf',
  DCTFWEB_GERACAO: 'Geração de DCTFWeb',
  DEFIS_ENVIO: 'Envio de DEFIS',
  FOLHA_FECHAMENTO: 'Fechamento de folha',
  DAS_GERACAO: 'Emissão de DAS',
  DARF_GERACAO: 'Emissão de DARF',
  IRPF_DECLARACAO: 'Declaração de IRPF',
};

const STATUS_LABEL: Record<string, string> = {
  PENDING_ACCOUNTANT_ACCEPTANCE: 'Aguardando aceite do escritório',
  ACTIVE: 'Ativo',
  REVOKED_BY_CLIENT: 'Revogado por você',
  REVOKED_BY_ACCOUNTANT: 'Revogado pelo escritório',
  EXPIRED: 'Expirado',
};

const inputClass =
  'rounded-xl border border-white/10 bg-zinc-900/60 px-3.5 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-indigo-500/70';

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

interface Dashboard {
  role: 'firm' | 'client';
  firmProfile: { crcNumber: string; listed: boolean; servicesOffered: string[] } | null;
  engagements: Array<{
    id: string;
    status: string;
    scopes: string[];
    firm: { id: string; tradeName: string };
    client: { id: string; tradeName: string; cnpj?: string };
    mine: 'client' | 'firm';
    acceptanceDeadlineAt: string;
    acceptedAt: string | null;
    revokedAt: string | null;
    revokedReason: string | null;
    taskCount: number;
    feeCount: number;
  }>;
  tasks: Array<{
    id: string;
    taskType: string;
    competencia: string;
    dueDate: string;
    status: string;
    completedAt: string | null;
    client: string;
    firm: string;
  }>;
  taskCounts: Record<string, number>;
  tasksDueSoon: number;
  documents: Array<{
    id: string;
    documentType: string;
    status: string;
    layoutVersion: string;
    competenciaInicio: string;
    competenciaFim: string;
    generatedAt: string;
    hasProtocol: boolean;
    downloadUrl: string;
  }>;
}

interface Firm {
  tenantId: string;
  tradeName: string;
  uf: string | null;
  responsibleAccountantName: string;
  bio: string | null;
  servicesOffered: string[];
  baseMonthlyFee: number | null;
  marketplaceRatingAverage: number;
  marketplaceRatingCount: number;
}

interface FirmProfile {
  id?: string;
  crcNumber: string;
  responsibleAccountantName: string;
  responsibleAccountantCrc: string;
  bio: string | null;
  servicesOffered: string[];
  baseMonthlyFee: number | null;
  isListedInMarketplace: boolean;
  createdAt?: string;
}

type Tab = 'vinculos' | 'tarefas' | 'documentos' | 'marketplace' | 'perfil';

export default function ContabilidadePage() {
  const [tab, setTab] = useState<Tab>('vinculos');
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [firms, setFirms] = useState<Firm[]>([]);
  const [profile, setProfile] = useState<FirmProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [dashboard, marketplace, ownProfile] = await Promise.all([
        api<Dashboard>('/api/accounting-office/dashboard'),
        api<{ firms: Firm[] }>('/api/accounting-office/marketplace'),
        api<{ profile: FirmProfile | null }>('/api/accounting-office/firm-profile'),
      ]);
      setDash(dashboard);
      setFirms(marketplace.firms);
      setProfile(ownProfile.profile);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao carregar o módulo.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function action(engagementId: string, action: string, reason?: string) {
    setBusy(true);
    setNotice(null);
    try {
      await post(`/api/accounting-office/engagements/${engagementId}/action`, {
        action,
        reason: reason || undefined,
      });
      setNotice({
        tone: 'ok',
        text:
          action === 'accept'
            ? 'Procuração aceita — o vínculo está ativo.'
            : action === 'revoke'
              ? 'Procuração revogada. O acesso cross-tenant caiu imediatamente.'
              : 'Procuração recusada.',
      });
      await load();
    } catch (err) {
      setNotice({
        tone: 'error',
        text: err instanceof ApiError ? err.message : 'Ação não concluída.',
      });
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Contabilidade</h1>
        <Notice tone="error">{error}</Notice>
      </div>
    );
  }

  if (!dash) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Contabilidade</h1>
        <p className="text-sm text-zinc-500">Carregando…</p>
      </div>
    );
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'vinculos', label: `Vínculos (${dash.engagements.length})` },
    { key: 'tarefas', label: `Tarefas (${dash.tasks.filter((t) => t.status !== 'DONE').length})` },
    { key: 'documentos', label: `Documentos (${dash.documents.length})` },
    ...(dash.role === 'client'
      ? [{ key: 'marketplace' as Tab, label: `Escritórios (${firms.length})` }]
      : []),
    // Sempre visível: um lojista pode ao mesmo tempo ser contabilidade de
    // outrem (Caminho A) e ter contador de fora (Caminho B).
    { key: 'perfil', label: profile ? 'Perfil do escritório' : 'Sou escritório' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contabilidade</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {dash.role === 'firm'
              ? `Escritório · CRC ${dash.firmProfile?.crcNumber ?? '—'} · ${
                  dash.engagements.length
                } cliente(s)`
              : 'Procuração eletrônica para um escritório da plataforma, ou exportação para o seu contador de fora (Cap. 21.18).'}
          </p>
        </div>
        {dash.role === 'client' && dash.engagements.some((e) => e.status === 'ACTIVE') && (
          <span className="rounded bg-emerald-500/15 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
            PROCURAÇÃO ATIVA
          </span>
        )}
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

      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

      {tab === 'vinculos' && <Vinculos dash={dash} busy={busy} onAction={action} />}
      {tab === 'tarefas' && <Tarefas dash={dash} />}
      {tab === 'documentos' && <Documentos dash={dash} onChanged={load} />}
      {tab === 'marketplace' && (
        <Marketplace
          firms={firms}
          busy={busy}
          onDone={async (message) => {
            setNotice({ tone: 'ok', text: message });
            setTab('vinculos');
            await load();
          }}
          onError={(message) => setNotice({ tone: 'error', text: message })}
          onBusy={setBusy}
        />
      )}
      {tab === 'perfil' && (
        <Perfil
          profile={profile}
          onChanged={async (message) => {
            setNotice({ tone: 'ok', text: message });
            await load();
          }}
          onError={(message) => setNotice({ tone: 'error', text: message })}
        />
      )}
    </div>
  );
}

// ─── Vínculos ───────────────────────────────────────────────────────────────

function Vinculos({
  dash,
  busy,
  onAction,
}: {
  dash: Dashboard;
  busy: boolean;
  onAction: (id: string, action: string, reason?: string) => void;
}) {
  if (dash.engagements.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 p-5 text-sm text-zinc-500">
        Nenhum vínculo contábil ainda. Use a aba{' '}
        <span className="text-indigo-300">Escritórios</span> para conceder uma procuração, ou
        gere os arquivos na aba <span className="text-indigo-300">Documentos</span> para entregar
        ao seu contador de fora.
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {dash.engagements.map((item) => (
        <li key={item.id} className="rounded-2xl border border-white/10 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium">
                {item.mine === 'client' ? item.firm.tradeName : item.client.tradeName}
                <span className="ml-2 text-xs text-zinc-500">
                  {item.mine === 'client' ? 'escritório contratado' : 'cliente'}
                </span>
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                Concedido em {new Date(item.acceptanceDeadlineAt).toLocaleDateString('pt-BR')} ·
                prazo de aceite até {new Date(item.acceptanceDeadlineAt).toLocaleDateString('pt-BR')}
              </p>
            </div>
            <span
              className={`rounded px-2.5 py-1 text-[11px] font-medium ${
                item.status === 'ACTIVE'
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : item.status === 'PENDING_ACCOUNTANT_ACCEPTANCE'
                    ? 'bg-amber-500/15 text-amber-300'
                    : 'bg-zinc-500/15 text-zinc-400'
              }`}
            >
              {STATUS_LABEL[item.status] ?? item.status}
            </span>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {item.scopes.map((scope) => (
              <span
                key={scope}
                className="rounded border border-white/10 bg-zinc-900 px-2 py-0.5 text-[11px] text-zinc-400"
              >
                {SCOPES.find((s) => s.code === scope)?.label ?? scope}
              </span>
            ))}
          </div>

          {item.status === 'PENDING_ACCOUNTANT_ACCEPTANCE' && (
            <div className="mt-4 flex flex-wrap gap-2">
              {item.mine === 'firm' ? (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onAction(item.id, 'accept')}
                    className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-60"
                  >
                    Aceitar procuração
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onAction(item.id, 'reject')}
                    className="rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-400 transition hover:bg-white/5 disabled:opacity-60"
                  >
                    Recusar
                  </button>
                </>
              ) : (
                <p className="text-xs text-amber-400">
                  Aguardando o escritório aceitar. Até lá, nenhum dado é acessível a ele.
                </p>
              )}
            </div>
          )}

          {(item.status === 'ACTIVE' || item.status === 'PENDING_ACCOUNTANT_ACCEPTANCE') && (
            <div className="mt-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => onAction(item.id, 'revoke')}
                className="rounded-xl border border-rose-500/40 px-4 py-2 text-sm text-rose-300 transition hover:bg-rose-500/10 disabled:opacity-60"
              >
                {item.mine === 'client' ? 'Revogar procuração' : 'Encerrar atendimento'}
              </button>
            </div>
          )}

          {item.revokedReason && (
            <p className="mt-3 text-xs text-zinc-500">Motivo: {item.revokedReason}</p>
          )}
        </li>
      ))}
    </ul>
  );
}

// ─── Tarefas ────────────────────────────────────────────────────────────────

function Tarefas({ dash }: { dash: Dashboard }) {
  const counts = Object.entries(dash.taskCounts);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Vencidas ou a 7 dias" value={String(dash.tasksDueSoon)} tone="warn" />
        <Stat
          label="Concluídas"
          value={String(dash.taskCounts.DONE ?? 0)}
          tone="ok"
        />
        <Stat label="Total acompanhado" value={String(dash.tasks.length)} />
      </div>

      {counts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {counts.map(([status, count]) => (
            <span
              key={status}
              className="rounded border border-white/10 bg-zinc-900 px-2.5 py-1 text-[11px] text-zinc-400"
            >
              {status}: {count}
            </span>
          ))}
        </div>
      )}

      {dash.tasks.length === 0 ? (
        <div className="rounded-2xl border border-white/10 p-5 text-sm text-zinc-500">
          Nenhuma obrigação gerada. Elas nascem sozinhas quando um escritório aceita a
          procuração — o motor roda diariamente pelo cron (Cap. 21.18.4).
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/60 text-left text-xs uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-4 py-3">Obrigação</th>
                <th className="px-4 py-3">Competência</th>
                <th className="px-4 py-3">Vencimento</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Escritório</th>
                <th className="px-4 py-3">Situação</th>
              </tr>
            </thead>
            <tbody>
              {dash.tasks.map((task) => {
                const overdue =
                  task.status !== 'DONE' && new Date(task.dueDate).getTime() < Date.now();
                return (
                  <tr key={task.id} className="border-t border-white/5">
                    <td className="px-4 py-3">{TASK_LABEL[task.taskType] ?? task.taskType}</td>
                    <td className="px-4 py-3 font-mono text-xs">{task.competencia}</td>
                    <td className="px-4 py-3">
                      {new Date(task.dueDate).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">{task.client}</td>
                    <td className="px-4 py-3 text-zinc-400">{task.firm}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded px-2 py-0.5 text-[11px] ${
                          task.status === 'DONE'
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : overdue || task.status === 'LATE'
                              ? 'bg-rose-500/15 text-rose-300'
                              : 'bg-zinc-500/15 text-zinc-400'
                        }`}
                      >
                        {task.status === 'DONE' ? 'CONCLUÍDA' : overdue ? 'ATRASADA' : task.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' }) {
  return (
    <div className="rounded-2xl border border-white/10 p-4">
      <p className="text-xs uppercase tracking-wider text-zinc-500">{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold ${
          tone === 'ok' ? 'text-emerald-300' : tone === 'warn' ? 'text-amber-300' : 'text-zinc-100'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

// ─── Documentos (Caminho B) ─────────────────────────────────────────────────

function Documentos({
  dash,
  onChanged,
}: {
  dash: Dashboard;
  onChanged: () => Promise<void>;
}) {
  const today = new Date();
  const [type, setType] = useState('ECD');
  const [inicio, setInicio] = useState(
    `${today.getUTCFullYear() - 1}-01-01`,
  );
  const [fim, setFim] = useState(`${today.getUTCFullYear() - 1}-12-31`);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  async function generate() {
    setBusy(true);
    setNotice(null);
    try {
      const result = await post<{
        bytes: number;
        tasksClosed: number;
        note: string;
        document: { documentType: string; layoutVersion: string };
      }>('/api/accounting-office/sped', {
        documentType: type,
        competenciaInicio: inicio,
        competenciaFim: fim,
      });
      setNotice({
        tone: 'ok',
        text: `${result.document.documentType} gerado (${result.bytes} bytes, leiaute ${result.document.layoutVersion}). ${result.note}`,
      });
      await onChanged();
    } catch (err) {
      setNotice({
        tone: 'error',
        text: err instanceof ApiError ? err.message : 'Falha ao gerar o arquivo.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-white/10 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
          Gerar arquivo para o contador
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-zinc-500">
          Caminho B do Cap. 21.18.1: você exporta e entrega ao seu contador de confiança. O
          arquivo é montado a partir do seu plano de contas e das suas vendas reais, com a
          versão de leiaute vigente no catálogo da plataforma. <strong>Não é transmissão</strong>{' '}
          — protocolo exige assinatura digital fora daqui.
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="sped-type" className="mb-1.5 block text-xs text-zinc-400">
              Documento
            </label>
            <select
              id="sped-type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              className={inputClass}
            >
              <option value="ECD">ECD — Escrituração Contábil Digital</option>
              <option value="ECF">ECF — Escrituração Contábil Fiscal</option>
              <option value="DEFIS">DEFIS — Declaração anual (Simples)</option>
            </select>
          </div>
          <div>
            <label htmlFor="sped-inicio" className="mb-1.5 block text-xs text-zinc-400">
              Início
            </label>
            <input
              id="sped-inicio"
              type="date"
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="sped-fim" className="mb-1.5 block text-xs text-zinc-400">
              Fim
            </label>
            <input
              id="sped-fim"
              type="date"
              value={fim}
              onChange={(e) => setFim(e.target.value)}
              className={inputClass}
            />
          </div>
          <button
            type="button"
            onClick={generate}
            disabled={busy}
            className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-60"
          >
            {busy ? 'Gerando…' : 'Gerar arquivo'}
          </button>
        </div>

        {notice && <div className="mt-4">{<Notice tone={notice.tone}>{notice.text}</Notice>}</div>}
      </div>

      {dash.documents.length === 0 ? (
        <div className="rounded-2xl border border-white/10 p-5 text-sm text-zinc-500">
          Nenhum documento gerado até agora.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/60 text-left text-xs uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Competência</th>
                <th className="px-4 py-3">Leiaute</th>
                <th className="px-4 py-3">Gerado em</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {dash.documents.map((doc) => (
                <tr key={doc.id} className="border-t border-white/5">
                  <td className="px-4 py-3 font-medium">{doc.documentType}</td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {doc.competenciaInicio.slice(0, 10)} → {doc.competenciaFim.slice(0, 10)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{doc.layoutVersion}</td>
                  <td className="px-4 py-3 text-zinc-400">
                    {new Date(doc.generatedAt).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-zinc-500/15 px-2 py-0.5 text-[11px] text-zinc-400">
                      {doc.status}
                      {doc.hasProtocol ? ' · PROTOCOLO' : ' · SEM PROTOCOLO'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <a
                      href={doc.downloadUrl}
                      className="text-sm text-indigo-400 underline-offset-2 hover:underline"
                    >
                      Baixar
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Marketplace ────────────────────────────────────────────────────────────

function Marketplace({
  firms,
  busy,
  onDone,
  onError,
  onBusy,
}: {
  firms: Firm[];
  busy: boolean;
  onDone: (message: string) => void;
  onError: (message: string) => void;
  onBusy: (value: boolean) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [scopes, setScopes] = useState<string[]>(['TAX_FILING']);

  async function hire() {
    if (!selected) return;
    if (scopes.length === 0) {
      onError('Selecione ao menos um escopo.');
      return;
    }

    onBusy(true);
    try {
      await post('/api/accounting-office/engagements', {
        firmTenantId: selected,
        scopes,
      });
      onDone(
        'Procuração enviada. Ela só vira ativa quando o escritório aceitar — até lá, nenhum dado é acessível.',
      );
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Não foi possível enviar a procuração.');
    } finally {
      onBusy(false);
    }
  }

  if (firms.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 p-5 text-sm text-zinc-500">
        Nenhum escritório listado no marketplace no momento. Você pode continuar exportando os
        arquivos para o seu contador de fora na aba{' '}
        <span className="text-indigo-300">Documentos</span>.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <ul className="grid gap-3 lg:grid-cols-2">
        {firms.map((firm) => {
          const isActive = selected === firm.tenantId;
          return (
            <li
              key={firm.tenantId}
              className={`rounded-2xl border p-5 transition ${
                isActive ? 'border-indigo-500/60 bg-indigo-500/[0.06]' : 'border-white/10'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{firm.tradeName}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    Responsável: {firm.responsibleAccountantName}
                    {firm.uf ? ` · ${firm.uf}` : ''}
                  </p>
                </div>
                {firm.marketplaceRatingCount > 0 && (
                  <span className="rounded bg-zinc-500/15 px-2 py-0.5 text-[11px] text-zinc-300">
                    {Number(firm.marketplaceRatingAverage).toFixed(1)} ★ (
                    {firm.marketplaceRatingCount})
                  </span>
                )}
              </div>

              {firm.bio && <p className="mt-2 text-sm text-zinc-400">{firm.bio}</p>}

              <div className="mt-3 flex flex-wrap gap-2">
                {firm.servicesOffered.map((scope) => (
                  <span
                    key={scope}
                    className="rounded border border-white/10 bg-zinc-900 px-2 py-0.5 text-[11px] text-zinc-400"
                  >
                    {SCOPES.find((s) => s.code === scope)?.label ?? scope}
                  </span>
                ))}
              </div>

              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-sm text-zinc-300">
                  {firm.baseMonthlyFee === null ? (
                    <span className="text-zinc-500">Honorário a combinar</span>
                  ) : (
                    <>
                      <span className="font-semibold">{brl(firm.baseMonthlyFee)}</span>
                      <span className="text-zinc-500">/mês</span>
                    </>
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => setSelected(firm.tenantId)}
                  className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                    isActive
                      ? 'bg-indigo-600 text-white hover:bg-indigo-500'
                      : 'border border-white/10 text-zinc-300 hover:bg-white/5'
                  }`}
                >
                  {isActive ? 'Selecionado' : 'Selecionar'}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {selected && (
        <div className="rounded-2xl border border-white/10 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
            Escopos da procuração
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            O que o escritório poderá fazer no seu tenant. Escopos fora desta lista são recusados
            pelo servidor (403 `ACCOUNTING_SCOPE_NOT_GRANTED`).
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            {SCOPES.map((scope) => {
              const checked = scopes.includes(scope.code);
              return (
                <button
                  key={scope.code}
                  type="button"
                  onClick={() =>
                    setScopes((current) =>
                      checked
                        ? current.filter((item) => item !== scope.code)
                        : [...current, scope.code],
                    )
                  }
                  className={`rounded-xl border px-3 py-2 text-sm transition ${
                    checked
                      ? 'border-indigo-500/60 bg-indigo-500/10 text-indigo-200'
                      : 'border-white/10 text-zinc-400 hover:bg-white/5'
                  }`}
                >
                  {scope.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={hire}
            disabled={busy || scopes.length === 0}
            className="mt-5 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-60"
          >
            {busy ? 'Enviando…' : 'Conceder procuração'}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Perfil do escritório ───────────────────────────────────────────────────

function Perfil({
  profile,
  onChanged,
  onError,
}: {
  profile: FirmProfile | null;
  onChanged: (message: string) => void | Promise<void>;
  onError: (message: string) => void;
}) {
  const [crcNumber, setCrc] = useState(profile?.crcNumber ?? '');
  const [name, setName] = useState(profile?.responsibleAccountantName ?? '');
  const [crc, setCrcResp] = useState(profile?.responsibleAccountantCrc ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [fee, setFee] = useState(
    profile?.baseMonthlyFee === null || profile?.baseMonthlyFee === undefined
      ? ''
      : String(profile.baseMonthlyFee),
  );
  const [scopes, setScopes] = useState<string[]>(profile?.servicesOffered ?? ['TAX_FILING']);
  const [listed, setListed] = useState(profile?.isListedInMarketplace ?? false);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (scopes.length === 0) {
      onError('Selecione ao menos um serviço oferecido.');
      return;
    }
    setBusy(true);
    try {
      await patch<FirmProfile>('/api/accounting-office/firm-profile', {
        crcNumber,
        responsibleAccountantName: name,
        responsibleAccountantCrc: crc,
        bio: bio || null,
        servicesOffered: scopes,
        baseMonthlyFee: fee === '' ? null : Number(fee.replace(',', '.')),
        isListedInMarketplace: listed,
      });
      await onChanged(
        listed
          ? 'Perfil salvo e publicado no marketplace.'
          : 'Perfil salvo. A publicação no marketplace está desligada.',
      );
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Não foi possível salvar o perfil.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-white/10 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
          {profile ? 'Perfil publicado' : 'Sou um escritório de contabilidade'}
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-zinc-500">
          Ao salvar, este tenant passa a ser tratado como <code>ACCOUNTING_OFFICE</code> e ganha um{' '}
          <code>accountingFirmProfile</code>. Publicar no marketplace é o que permite a outros
          lojistas concederem procuração eletrônica a você (Cap. 21.18.6). CRC e responsável são
          obrigatórios: sem eles a oferta não diz quem responde profissionalmente.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="CRC do escritório" value={crcNumber} onChange={setCrc} required />
          <Field label="Responsável técnico (nome)" value={name} onChange={setName} required />
          <Field label="CRC do responsável" value={crc} onChange={setCrcResp} required />
          <Field
            label="Honorário base (R$/mês)"
            value={fee}
            onChange={setFee}
            placeholder="Em branco = a combinar"
          />
        </div>

        <div className="mt-4">
          <label htmlFor="perfil-bio" className="mb-1.5 block text-xs text-zinc-400">
            Apresentação
          </label>
          <textarea
            id="perfil-bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            maxLength={600}
            placeholder="O que o escritório atende, segmentos e região."
            className={`${inputClass} w-full`}
          />
        </div>

        <div className="mt-4">
          <p className="mb-2 text-xs text-zinc-400">Serviços oferecidos</p>
          <div className="flex flex-wrap gap-2">
            {SCOPES.map((scope) => {
              const checked = scopes.includes(scope.code);
              return (
                <button
                  key={scope.code}
                  type="button"
                  onClick={() =>
                    setScopes((current) =>
                      checked
                        ? current.filter((item) => item !== scope.code)
                        : [...current, scope.code],
                    )
                  }
                  className={`rounded-xl border px-3 py-2 text-sm transition ${
                    checked
                      ? 'border-indigo-500/60 bg-indigo-500/10 text-indigo-200'
                      : 'border-white/10 text-zinc-400 hover:bg-white/5'
                  }`}
                >
                  {scope.label}
                </button>
              );
            })}
          </div>
        </div>

        <label className="mt-4 flex items-center gap-3 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={listed}
            onChange={(e) => setListed(e.target.checked)}
            className="h-4 w-4 rounded border-white/20 bg-zinc-900"
          />
          Publicar no marketplace de contadores
        </label>

        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="mt-5 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-60"
        >
          {busy ? 'Salvando…' : profile ? 'Salvar alterações' : 'Criar perfil de escritório'}
        </button>
      </div>

      {profile && profile.createdAt && (
        <p className="text-xs text-zinc-600">
          Perfil criado em {new Date(profile.createdAt).toLocaleDateString('pt-BR')}. Avaliações{' '}
          {profile.isListedInMarketplace ? 'visíveis' : 'ocultas'} no marketplace.
        </p>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs text-zinc-400">
        {label}
        {required && <span className="ml-1 text-rose-400">*</span>}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className={`${inputClass} w-full`}
      />
    </div>
  );
}
