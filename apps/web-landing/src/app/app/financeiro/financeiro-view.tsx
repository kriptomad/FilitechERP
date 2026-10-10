'use client';
// src/app/app/financeiro/financeiro-view.tsx — Cap. 17.2 / 17.3 / 4.1
//
// Painel financeiro: DRE do mês, contas a receber/pagar, próximos vencimentos
// e histórico de caixas. Todos os números vêm agregados do banco no servidor.

import { useState } from 'react';
import { brl } from '@/lib/api';

interface Entry {
  id: string;
  description: string;
  party: string | null;
  amount: number;
  dueDate: string;
}

interface RegisterRow {
  id: string;
  status: string;
  openingAmount: number;
  closingAmount: number | null;
  expectedAmount: number | null;
  divergenceAmount: number | null;
  openedAt: string;
  closedAt: string | null;
}

interface Props {
  periodStart: string;
  grossRevenue: number;
  totalExpenses: number;
  netResult: number;
  saleCount: number;
  pendingReceivableTotal: number;
  overdueReceivableCount: number;
  pendingPayableTotal: number;
  overduePayableCount: number;
  upcomingReceivables: Entry[];
  upcomingPayables: Entry[];
  registers: RegisterRow[];
}

type Tab = 'visao' | 'receber' | 'pagar' | 'caixas';

const TABS: { key: Tab; label: string }[] = [
  { key: 'visao', label: 'Visão geral' },
  { key: 'receber', label: 'A receber' },
  { key: 'pagar', label: 'A pagar' },
  { key: 'caixas', label: 'Caixas' },
];

export function FinanceiroView(props: Props) {
  const [tab, setTab] = useState<Tab>('visao');

  const margin =
    props.grossRevenue > 0
      ? Math.round((props.netResult / props.grossRevenue) * 100)
      : null;

  const ticket =
    props.saleCount > 0 ? props.grossRevenue / props.saleCount : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Financeiro</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Competência:{' '}
          {new Date(props.periodStart).toLocaleDateString('pt-BR', {
            month: 'long',
            year: 'numeric',
          })}
        </p>
      </div>

      <nav className="flex gap-1 border-b border-white/10">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm transition ${
              tab === item.key
                ? 'border-indigo-500 text-indigo-300'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {tab === 'visao' && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              label="Receita bruta"
              value={brl(props.grossRevenue)}
              hint={`${props.saleCount} venda(s)`}
              tone="up"
            />
            <Metric
              label="Despesas pagas"
              value={brl(props.totalExpenses)}
              hint="no mês corrente"
              tone="down"
            />
            <Metric
              label="Resultado"
              value={brl(props.netResult)}
              hint={margin === null ? 'sem receita no período' : `margem de ${margin}%`}
              tone={props.netResult >= 0 ? 'up' : 'down'}
            />
            <Metric
              label="Ticket médio"
              value={brl(ticket)}
              hint="por venda"
              tone="neutral"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel
              title="Contas a receber"
              total={props.pendingReceivableTotal}
              alert={
                props.overdueReceivableCount > 0
                  ? `${props.overdueReceivableCount} vencida(s)`
                  : null
              }
              empty="Nenhum título em aberto."
            />
            <Panel
              title="Contas a pagar"
              total={props.pendingPayableTotal}
              alert={
                props.overduePayableCount > 0
                  ? `${props.overduePayableCount} vencida(s)`
                  : null
              }
              empty="Nenhum título em aberto."
            />
          </div>
        </div>
      )}

      {tab === 'receber' && (
        <EntryList
          entries={props.upcomingReceivables}
          empty="Nenhum título a receber nos próximos 30 dias."
          accent="text-emerald-300"
        />
      )}

      {tab === 'pagar' && (
        <EntryList
          entries={props.upcomingPayables}
          empty="Nenhum título a pagar nos próximos 30 dias."
          accent="text-amber-300"
        />
      )}

      {tab === 'caixas' && <Registers registers={props.registers} />}
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: 'up' | 'down' | 'neutral';
}) {
  const color =
    tone === 'up'
      ? 'text-emerald-300'
      : tone === 'down'
        ? 'text-amber-300'
        : 'text-zinc-100';

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <p className="text-xs uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={`mt-2 text-xl font-semibold ${color}`}>{value}</p>
      <p className="mt-1 text-xs text-zinc-600">{hint}</p>
    </div>
  );
}

function Panel({
  title,
  total,
  alert,
  empty,
}: {
  title: string;
  total: number;
  alert: string | null;
  empty: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">{title}</h2>
        {alert && (
          <span className="rounded bg-rose-500/15 px-2 py-0.5 text-[11px] font-medium text-rose-300">
            {alert}
          </span>
        )}
      </div>
      <p className="mt-3 text-2xl font-semibold">{brl(total)}</p>
      <p className="mt-1 text-xs text-zinc-600">{total === 0 ? empty : 'saldo em aberto'}</p>
    </div>
  );
}

function EntryList({
  entries,
  empty,
  accent,
}: {
  entries: Entry[];
  empty: string;
  accent: string;
}) {
  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/15 p-12 text-center">
        <p className="text-sm text-zinc-500">{empty}</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-white/10">
      <table className="w-full text-sm">
        <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-wider text-zinc-500">
          <tr>
            <th className="px-4 py-3 font-medium">Descrição</th>
            <th className="px-4 py-3 font-medium">Terceiro</th>
            <th className="px-4 py-3 text-right font-medium">Valor</th>
            <th className="px-4 py-3 text-right font-medium">Vencimento</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {entries.map((entry) => {
            const due = new Date(entry.dueDate);
            const overdue = due.getTime() < Date.now();
            return (
              <tr key={entry.id} className="hover:bg-white/[0.02]">
                <td className="px-4 py-3">{entry.description}</td>
                <td className="px-4 py-3 text-zinc-500">{entry.party ?? '—'}</td>
                <td className={`px-4 py-3 text-right font-medium ${accent}`}>
                  {brl(entry.amount)}
                </td>
                <td
                  className={`px-4 py-3 text-right text-xs ${
                    overdue ? 'font-medium text-rose-400' : 'text-zinc-500'
                  }`}
                >
                  {due.toLocaleDateString('pt-BR')}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Registers({ registers }: { registers: RegisterRow[] }) {
  if (registers.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/15 p-12 text-center">
        <p className="text-sm text-zinc-500">Nenhum caixa aberto ou fechado ainda.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-white/10">
      <table className="w-full text-sm">
        <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-wider text-zinc-500">
          <tr>
            <th className="px-4 py-3 font-medium">Abertura</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 text-right font-medium">Fundo de troco</th>
            <th className="px-4 py-3 text-right font-medium">Contagem</th>
            <th className="px-4 py-3 text-right font-medium">Divergência</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {registers.map((register) => {
            const closed = register.status === 'CLOSED';
            const divergence = register.divergenceAmount ?? 0;
            return (
              <tr key={register.id} className="hover:bg-white/[0.02]">
                <td className="px-4 py-3 text-zinc-400">
                  {new Date(register.openedAt).toLocaleString('pt-BR')}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded px-2 py-1 text-[11px] font-medium ${
                      closed ? 'bg-white/10 text-zinc-400' : 'bg-emerald-500/15 text-emerald-300'
                    }`}
                  >
                    {closed ? 'Fechado' : 'Aberto'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">{brl(register.openingAmount)}</td>
                <td className="px-4 py-3 text-right">
                  {closed ? brl(register.closingAmount ?? 0) : <span className="text-zinc-600">—</span>}
                </td>
                <td
                  className={`px-4 py-3 text-right ${
                    !closed
                      ? 'text-zinc-600'
                      : divergence === 0
                        ? 'text-emerald-300'
                        : 'text-rose-400'
                  }`}
                >
                  {/* Gaveta cega (Cap. 4.1): divergência só existe pós-fechamento. */}
                  {closed ? brl(divergence) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
