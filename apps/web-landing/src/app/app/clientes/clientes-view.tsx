'use client';
// src/app/app/clientes/clientes-view.tsx — Cap. 4.6 / 6.6
//
// Carteira de clientes: busca, criação e edição de limite de crédito.
// Todos os dados vêm do banco via /api/admin/clients — nenhum array local.

import { useMemo, useState } from 'react';
import { post, patch, ApiError, brl } from '@/lib/api';

interface ClientRow {
  id: string;
  name: string;
  document: string | null;
  phone: string | null;
  email: string | null;
  creditLimit: number;
  creditBalanceUsed: number;
  isBusinessAccount: boolean;
  openBalance: number;
  createdAt: string;
}

interface Props {
  initialClients: ClientRow[];
  totalCreditLimit: number;
  totalCreditUsed: number;
}

const inputClass =
  'w-full rounded-xl border border-white/10 bg-zinc-900/60 px-3.5 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-indigo-500/70';

const emptyForm = {
  name: '',
  document: '',
  phone: '',
  email: '',
  creditLimit: '',
};

export function ClientesView({ initialClients, totalCreditLimit, totalCreditUsed }: Props) {
  const [clients, setClients] = useState<ClientRow[]>(initialClients);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return clients;
    return clients.filter((client) =>
      [client.name, client.document ?? '', client.email ?? '', client.phone ?? '']
        .join(' ')
        .toLowerCase()
        .includes(term),
    );
  }, [clients, query]);

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
    setOpen(true);
  }

  function startEdit(client: ClientRow) {
    setEditingId(client.id);
    setForm({
      name: client.name,
      document: client.document ?? '',
      phone: client.phone ?? '',
      email: client.email ?? '',
      creditLimit: String(client.creditLimit),
    });
    setError(null);
    setOpen(true);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const payload = {
      name: form.name.trim(),
      document: form.document.trim() || undefined,
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      creditLimit: form.creditLimit === '' ? 0 : Number(form.creditLimit),
    };

    try {
      if (editingId) {
        const updated = await patch<ClientRow>(`/api/admin/clients/${editingId}`, payload);
        setClients((prev) => prev.map((c) => (c.id === editingId ? { ...c, ...updated } : c)));
      } else {
        const created = await post<ClientRow>('/api/admin/clients', payload);
        setClients((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      }
      setOpen(false);
      setForm(emptyForm);
      setEditingId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao salvar cliente.');
    } finally {
      setBusy(false);
    }
  }

  const withOpenBalance = clients.filter((c) => c.openBalance > 0).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clientes</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {clients.length} na carteira · {withOpenBalance} com saldo em aberto ·{' '}
            {brl(totalCreditUsed)} de {brl(totalCreditLimit)} em crédito utilizado.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome, CPF/CNPJ, e-mail…"
            className={`${inputClass} w-64`}
          />
          <button
            type="button"
            onClick={startCreate}
            className="rounded-xl bg-indigo-600 px-5 py-2.5 font-medium text-white transition hover:bg-indigo-500"
          >
            Novo cliente
          </button>
        </div>
      </div>

      {open && (
        <form
          onSubmit={submit}
          className="rounded-2xl border border-indigo-500/30 bg-indigo-500/[0.04] p-5"
        >
          <h2 className="text-sm font-semibold uppercase tracking-wider text-indigo-300">
            {editingId ? 'Editar cliente' : 'Novo cliente'}
          </h2>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="sm:col-span-2">
              <label htmlFor="c-name" className="mb-1.5 block text-xs text-zinc-400">
                Nome / Razão social *
              </label>
              <input
                id="c-name"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="c-doc" className="mb-1.5 block text-xs text-zinc-400">
                CPF / CNPJ
              </label>
              <input
                id="c-doc"
                value={form.document}
                onChange={(e) => setForm({ ...form, document: e.target.value })}
                className={inputClass}
                placeholder="000.000.000-00"
              />
            </div>
            <div>
              <label htmlFor="c-phone" className="mb-1.5 block text-xs text-zinc-400">
                Telefone
              </label>
              <input
                id="c-phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="c-limit" className="mb-1.5 block text-xs text-zinc-400">
                Limite de crédito
              </label>
              <input
                id="c-limit"
                type="number"
                min={0}
                step="0.01"
                value={form.creditLimit}
                onChange={(e) => setForm({ ...form, creditLimit: e.target.value })}
                className={inputClass}
                placeholder="0,00"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="c-email" className="mb-1.5 block text-xs text-zinc-400">
                E-mail
              </label>
              <input
                id="c-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className={inputClass}
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
              disabled={busy}
              className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-60"
            >
              {busy ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Criar cliente'}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
              className="rounded-xl border border-white/10 px-5 py-2.5 text-sm text-zinc-400 transition hover:bg-white/5"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 p-12 text-center">
          <p className="text-lg font-medium">
            {clients.length === 0 ? 'Nenhum cliente cadastrado' : 'Nenhum resultado para a busca'}
          </p>
          <p className="mt-2 text-sm text-zinc-500">
            {clients.length === 0
              ? 'Cadastre o primeiro cliente para liberar vendas a prazo e orçamentos.'
              : 'Tente outro termo de busca.'}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Documento</th>
                <th className="px-4 py-3 font-medium">Contato</th>
                <th className="px-4 py-3 text-right font-medium">Em aberto</th>
                <th className="px-4 py-3 text-right font-medium">Limite</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map((client) => {
                const utilization =
                  client.creditLimit > 0
                    ? Math.min(100, Math.round((client.creditBalanceUsed / client.creditLimit) * 100))
                    : 0;
                return (
                  <tr key={client.id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <span className="font-medium">{client.name}</span>
                      {client.isBusinessAccount && (
                        <span className="ml-2 rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium text-sky-300">
                          PJ
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-500">
                      {client.document ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">
                      <div>{client.phone ?? '—'}</div>
                      {client.email && <div className="text-xs text-zinc-600">{client.email}</div>}
                    </td>
                    <td
                      className={`px-4 py-3 text-right ${
                        client.openBalance > 0 ? 'text-amber-300' : 'text-zinc-500'
                      }`}
                    >
                      {brl(client.openBalance)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div>{brl(client.creditLimit)}</div>
                      {client.creditLimit > 0 && (
                        <div className="mt-1 h-1 w-24 overflow-hidden rounded bg-white/10">
                          <div
                            className={`h-full ${
                              utilization >= 90 ? 'bg-rose-500' : 'bg-indigo-500'
                            }`}
                            style={{ width: `${utilization}%` }}
                          />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => startEdit(client)}
                        className="text-xs text-indigo-400 transition hover:text-indigo-300"
                      >
                        Editar
                      </button>
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
