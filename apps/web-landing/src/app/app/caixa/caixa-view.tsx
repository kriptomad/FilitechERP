'use client';
// src/app/app/caixa/caixa-view.tsx — Cap. 4.1 (gaveta cega) / 6.7
//
// Abertura e fechamento de caixa.
//
// Ponto crítico do Cap. 4.1: enquanto o caixa está aberto, a tela NÃO mostra o
// valor esperado no fechamento. O operador primeiro digita a contagem física e
// só então vê a divergência. Mostrar o esperado antes faria o operador ajustar
// a contagem para "bater" — que é exatamente o que a gaveta cega existe para
// impedir.

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';

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

const inputClass =
  'w-full rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-3 text-sm text-zinc-100 outline-none transition focus:border-indigo-500/70';

const bzl = (value: number) =>
  `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function CaixaView() {
  const [registers, setRegisters] = useState<RegisterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [openingAmount, setOpeningAmount] = useState('');
  const [countedAmount, setCountedAmount] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await api<RegisterRow[]>('/api/cash-register');
      setRegisters(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao carregar o caixa.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const open = registers.find((r) => r.status === 'OPEN') ?? null;

  async function openRegister(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      await fetch('/api/cash-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ openingAmount: Number(openingAmount) }),
      }).then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new ApiError(res.status, json?.error?.code ?? 'ERROR', json?.error?.message ?? 'Falha ao abrir o caixa.');
        }
        return json;
      });

      setOpeningAmount('');
      setNotice('Caixa aberto.');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao abrir o caixa.');
    } finally {
      setBusy(false);
    }
  }

  async function closeRegister(event: React.FormEvent) {
    event.preventDefault();
    if (!open) return;

    setBusy(true);
    setError(null);

    try {
      const json = await api<RegisterRow & { message: string }>('/api/cash-register', {
        method: 'PATCH',
        body: JSON.stringify({
          registerId: open.id,
          countedAmount: Number(countedAmount),
        }),
      });

      setCountedAmount('');
      setNotice(json.message);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao fechar o caixa.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="text-zinc-500">Carregando caixa…</div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Caixa</h1>
        <p className="mt-1 text-sm text-zinc-500">
          O fechamento é em gaveta cega: o valor esperado só aparece depois da sua
          contagem física.
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
          {notice}
        </p>
      )}

      {open ? (
        <section className="rounded-2xl border border-white/10 bg-zinc-900/40 p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.15em] text-emerald-400">
                Caixa aberto
              </p>
              <p className="mt-1.5 text-lg">
                Desde{' '}
                {new Date(open.openedAt).toLocaleString('pt-BR', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                })}
              </p>
              <p className="text-sm text-zinc-500">Fundo inicial {bzl(open.openingAmount)}</p>
            </div>
          </div>

          <form onSubmit={closeRegister} className="mt-8 max-w-sm space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm text-zinc-400">
                Contagem física de dinheiro
              </span>
              <input
                required
                type="number"
                step="0.01"
                min="0"
                className={inputClass}
                value={countedAmount}
                onChange={(e) => setCountedAmount(e.target.value)}
                placeholder="0,00"
              />
              <span className="mt-1 block text-xs text-zinc-600">
                Conte o que está na gaveta e informe aqui. O sistema calcula a diferença
                em seguida.
              </span>
            </label>

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-indigo-600 py-3 font-medium text-white transition hover:bg-indigo-500 disabled:opacity-60"
            >
              {busy ? 'Fechando…' : 'Fechar caixa'}
            </button>
          </form>
        </section>
      ) : (
        <section className="rounded-2xl border border-white/10 bg-zinc-900/40 p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.15em] text-amber-400">
            Caixa fechado
          </p>
          <p className="mt-1.5 text-sm text-zinc-500">
            Abra o caixa com o fundo de troco para poder registrar vendas.
          </p>

          <form onSubmit={openRegister} className="mt-6 max-w-sm space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm text-zinc-400">Fundo de troco</span>
              <input
                required
                type="number"
                step="0.01"
                min="0"
                className={inputClass}
                value={openingAmount}
                onChange={(e) => setOpeningAmount(e.target.value)}
                placeholder="0,00"
              />
            </label>

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-indigo-600 py-3 font-medium text-white transition hover:bg-indigo-500 disabled:opacity-60"
            >
              {busy ? 'Abrindo…' : 'Abrir caixa'}
            </button>
          </form>
        </section>
      )}

      {/* Histórico */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-zinc-500">
          Histórico
        </h2>

        {registers.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">Nenhuma abertura registrada.</p>
        ) : (
          <div className="mt-3 overflow-hidden rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Abertura</th>
                  <th className="px-4 py-3 font-medium">Fundo</th>
                  <th className="px-4 py-3 text-right font-medium">Esperado</th>
                  <th className="px-4 py-3 text-right font-medium">Contado</th>
                  <th className="px-4 py-3 text-right font-medium">Diferença</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {registers.map((register) => (
                  <tr key={register.id}>
                    <td className="px-4 py-3 text-zinc-400">
                      {new Date(register.openedAt).toLocaleString('pt-BR', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </td>
                    <td className="px-4 py-3">{bzl(register.openingAmount)}</td>
                    <td className="px-4 py-3 text-right text-zinc-400">
                      {register.expectedAmount !== null ? bzl(register.expectedAmount) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {register.closingAmount !== null ? bzl(register.closingAmount) : '—'}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-medium ${
                        register.divergenceAmount === null
                          ? ''
                          : register.divergenceAmount === 0
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                      }`}
                    >
                      {register.divergenceAmount !== null
                        ? bzl(register.divergenceAmount)
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded px-2 py-0.5 text-xs ${
                          register.status === 'OPEN'
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : 'bg-white/5 text-zinc-400'
                        }`}
                      >
                        {register.status === 'OPEN' ? 'aberto' : 'fechado'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}