'use client';
// src/app/app/ordens-servico/ordens-servico-view.tsx — Cap. 4.2 / 6.4
//
// Lista de O.S. + abertura de nova O.S. Tudo via /api/work-order — os dados
// exibidos vêm do banco, e o protocolo vem calculado pelo servidor.

import { useMemo, useState } from 'react';
import { post, ApiError } from '@/lib/api';

interface WorkOrderRow {
  id: string;
  protocol: string;
  clientId: string;
  clientName: string;
  equipmentDescription: string;
  reportedIssue: string;
  status: string;
  diagnosisNotes: string | null;
  assignedTechnicianId: string | null;
  technicianName: string | null;
  budgetTotal: number;
  budgetValidUntil: string | null;
  warrantyDays: number | null;
  createdAt: string;
  deliveredAt: string | null;
  itemCount: number;
}

interface Props {
  initialOrders: WorkOrderRow[];
  clients: { id: string; name: string }[];
  technicians: { id: string; name: string; role: string }[];
  byStatus: Record<string, number>;
}

const inputClass =
  'w-full rounded-xl border border-white/10 bg-zinc-900/60 px-3.5 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-indigo-500/70';

export const STATUS_LABEL: Record<string, string> = {
  RECEIVED: 'Recebida',
  DIAGNOSING: 'Em diagnóstico',
  AWAITING_APPROVAL: 'Aguardando aprovação',
  IN_REPAIR: 'Em reparo',
  READY: 'Pronta',
  DELIVERED: 'Entregue',
  CANCELLED: 'Cancelada',
};

const STATUS_STYLE: Record<string, string> = {
  RECEIVED: 'bg-zinc-500/15 text-zinc-300',
  DIAGNOSING: 'bg-sky-500/15 text-sky-300',
  AWAITING_APPROVAL: 'bg-amber-500/15 text-amber-300',
  IN_REPAIR: 'bg-indigo-500/15 text-indigo-300',
  READY: 'bg-emerald-500/15 text-emerald-300',
  DELIVERED: 'bg-white/10 text-zinc-500',
  CANCELLED: 'bg-rose-500/15 text-rose-300',
};

const emptyForm = {
  clientId: '',
  equipmentDescription: '',
  reportedIssue: '',
  assignedTechnicianId: '',
  warrantyDays: '',
};

export function OrdensServicoView({ initialOrders, clients, technicians, byStatus }: Props) {
  const [orders, setOrders] = useState(initialOrders);
  const [statusFilter, setStatusFilter] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<WorkOrderRow | null>(null);
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(
    () => (statusFilter ? orders.filter((o) => o.status === statusFilter) : orders),
    [orders, statusFilter],
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const order = await post<WorkOrderRow>('/api/work-order', {
        clientId: form.clientId,
        equipmentDescription: form.equipmentDescription.trim(),
        reportedIssue: form.reportedIssue.trim(),
        assignedTechnicianId: form.assignedTechnicianId || undefined,
        warrantyDays: form.warrantyDays === '' ? undefined : Number(form.warrantyDays),
      });

      setOrders((prev) => [order, ...prev]);
      setCreated(order);
      setForm(emptyForm);
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao abrir a ordem de serviço.');
    } finally {
      setBusy(false);
    }
  }

  const totalBudget = filtered.reduce((sum, o) => sum + o.budgetTotal, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ordens de serviço</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {orders.length} O.S. · {brl(totalBudget)} em orçamentos no filtro atual.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setCreated(null);
            setError(null);
            setOpen((v) => !v);
          }}
          className="rounded-xl bg-indigo-600 px-5 py-2.5 font-medium text-white transition hover:bg-indigo-500"
        >
          {open ? 'Fechar' : 'Nova O.S.'}
        </button>
      </div>

      {/* Contadores por status */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setStatusFilter('')}
          className={`rounded-lg border px-3 py-1.5 text-xs transition ${
            statusFilter === ''
              ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-300'
              : 'border-white/10 text-zinc-400 hover:bg-white/5'
          }`}
        >
          Todas ({orders.length})
        </button>
        {Object.entries(STATUS_LABEL).map(([code, label]) =>
          byStatus[code] ? (
            <button
              key={code}
              type="button"
              onClick={() => setStatusFilter(code)}
              className={`rounded-lg border px-3 py-1.5 text-xs transition ${
                statusFilter === code
                  ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-300'
                  : 'border-white/10 text-zinc-400 hover:bg-white/5'
              }`}
            >
              {label} ({byStatus[code]})
            </button>
          ) : null,
        )}
      </div>

      {created && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          O.S. <span className="font-mono font-semibold">{created.protocol}</span> aberta para{' '}
          {created.clientName}. Envie o orçamento pelo WhatsApp para aprovação do cliente.
        </div>
      )}

      {open && (
        <form
          onSubmit={submit}
          className="rounded-2xl border border-indigo-500/30 bg-indigo-500/[0.04] p-5"
        >
          <h2 className="text-sm font-semibold uppercase tracking-wider text-indigo-300">
            Abrir ordem de serviço
          </h2>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div>
              <label htmlFor="wo-client" className="mb-1.5 block text-xs text-zinc-400">
                Cliente *
              </label>
              <select
                id="wo-client"
                required
                value={form.clientId}
                onChange={(e) => setForm({ ...form, clientId: e.target.value })}
                className={inputClass}
              >
                <option value="">Selecione…</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
              {clients.length === 0 && (
                <p className="mt-1.5 text-xs text-amber-400">
                  Cadastre um cliente antes de abrir O.S.
                </p>
              )}
            </div>

            <div>
              <label htmlFor="wo-tech" className="mb-1.5 block text-xs text-zinc-400">
                Técnico responsável
              </label>
              <select
                id="wo-tech"
                value={form.assignedTechnicianId}
                onChange={(e) => setForm({ ...form, assignedTechnicianId: e.target.value })}
                className={inputClass}
              >
                <option value="">A definir</option>
                {technicians.map((tech) => (
                  <option key={tech.id} value={tech.id}>
                    {tech.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="wo-equip" className="mb-1.5 block text-xs text-zinc-400">
                Equipamento *
              </label>
              <input
                id="wo-equip"
                required
                value={form.equipmentDescription}
                onChange={(e) => setForm({ ...form, equipmentDescription: e.target.value })}
                className={inputClass}
                placeholder="Ex.: iPhone 13 128GB — sem imagem"
              />
            </div>

            <div>
              <label htmlFor="wo-warranty" className="mb-1.5 block text-xs text-zinc-400">
                Garantia (dias)
              </label>
              <input
                id="wo-warranty"
                type="number"
                min={0}
                max={730}
                value={form.warrantyDays}
                onChange={(e) => setForm({ ...form, warrantyDays: e.target.value })}
                className={inputClass}
                placeholder="90"
              />
            </div>

            <div className="lg:col-span-2">
              <label htmlFor="wo-issue" className="mb-1.5 block text-xs text-zinc-400">
                Problema relatado *
              </label>
              <textarea
                id="wo-issue"
                required
                rows={3}
                value={form.reportedIssue}
                onChange={(e) => setForm({ ...form, reportedIssue: e.target.value })}
                className={inputClass}
                placeholder="Descreva o que o cliente relatou, incluindo o que já foi tentado."
              />
            </div>
          </div>

          {error && (
            <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
              {error}
            </p>
          )}

          <div className="mt-4 flex gap-3">
            <button
              type="submit"
              disabled={busy || clients.length === 0}
              className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-60"
            >
              {busy ? 'Abrindo…' : 'Abrir O.S.'}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-xl border border-white/10 px-5 py-2.5 text-sm text-zinc-400 transition hover:bg-white/5"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 p-12 text-center">
          <p className="text-lg font-medium">Nenhuma ordem de serviço</p>
          <p className="mt-2 text-sm text-zinc-500">
            {statusFilter
              ? 'Nenhuma O.S. neste status. Troque o filtro acima.'
              : 'Abra a primeira O.S. para registrar o equipamento, o problema relatado e o checklist de entrada.'}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-medium">Protocolo</th>
                <th className="px-4 py-3 font-medium">Cliente / Equipamento</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Técnico</th>
                <th className="px-4 py-3 text-right font-medium">Orçamento</th>
                <th className="px-4 py-3 text-right font-medium">Aberta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map((order) => (
                <tr key={order.id} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-3 font-mono text-xs text-indigo-300">
                    {order.protocol}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{order.clientName}</div>
                    <div className="mt-0.5 max-w-md truncate text-xs text-zinc-500">
                      {order.equipmentDescription}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded px-2 py-1 text-[11px] font-medium ${
                        STATUS_STYLE[order.status] ?? 'bg-white/10 text-zinc-300'
                      }`}
                    >
                      {STATUS_LABEL[order.status] ?? order.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{order.technicianName ?? '—'}</td>
                  <td className="px-4 py-3 text-right">
                    {order.budgetTotal > 0
                      ? brl(order.budgetTotal)
                      : <span className="text-zinc-600">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-zinc-500">
                    {new Date(order.createdAt).toLocaleDateString('pt-BR')}
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

function brl(value: number): string {
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
