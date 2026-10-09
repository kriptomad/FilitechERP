'use client';
// src/app/aprovacao/[token]/approval-view.tsx — Cap. 4.2 / 6.4
//
// O cliente aprova o orçamento pelo celular, sem voltar à loja.
//
// Duplo clique é tratado pelo backend com UPDATE condicional (Cap. 6.4): a
// segunda tentativa recebe ALREADY_PROCESSED em vez de aprovar de novo.

import { useCallback, useEffect, useState } from 'react';
import { api, post, ApiError } from '@/lib/api';

interface BudgetView {
  protocol: string;
  equipment: string;
  items: { description: string; quantity: number; unitPrice: number; total: number }[];
  total: number;
  validUntil: string | null;
  status: string;
  alreadyApproved: boolean;
}

const bzl = (value: number) =>
  `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function ApprovalView({ token }: { token: string }) {
  const [budget, setBudget] = useState<BudgetView | null>(null);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<BudgetView>(`/api/work-order/public/${token}`);
      setBudget(data);
      if (data.alreadyApproved) setApproved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Orçamento não encontrado.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function approve() {
    setApproving(true);
    setError(null);

    try {
      await post('/api/work-order/approve', { token });
      setApproved(true);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível aprovar.');
      // Recarrega para refletir o estado real (pode já ter sido aprovado em
      // outro dispositivo).
      await load();
    } finally {
      setApproving(false);
    }
  }

  const expired =
    budget?.validUntil !== null &&
    budget?.validUntil !== undefined &&
    new Date(budget.validUntil).getTime() < Date.now();

  return (
    <main className="mx-auto min-h-screen w-full max-w-lg bg-[#05060A] px-5 py-14 text-zinc-100">
      <div className="mb-8 flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-500 text-sm font-black text-white">
          F
        </span>
        <span className="text-[15px] font-semibold tracking-tight">
          Filitech <span className="text-zinc-500">ERP</span>
        </span>
      </div>

      {loading ? (
        <p className="text-zinc-500">Carregando orçamento…</p>
      ) : !budget ? (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6">
          <h1 className="text-lg font-semibold">Orçamento indisponível</h1>
          <p className="mt-2 text-sm text-zinc-300">{error}</p>
          <p className="mt-3 text-xs text-zinc-500">
            Solicite um novo orçamento à assistência técnica.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-zinc-900/40 p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-indigo-400">
            {budget.protocol}
          </p>
          <h1 className="mt-2 text-xl font-bold">Orçamento de serviço</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Equipamento: {budget.equipment}
          </p>

          <ul className="mt-6 divide-y divide-white/5">
            {budget.items.map((item, index) => (
              <li key={`${item.description}-${index}`} className="py-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm text-zinc-200">{item.description}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {item.quantity} × {bzl(item.unitPrice)}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-medium">{bzl(item.total)}</span>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex items-baseline justify-between border-t border-white/10 pt-4">
            <span className="text-sm text-zinc-400">Total</span>
            <span className="text-2xl font-bold">{bzl(budget.total)}</span>
          </div>

          {budget.validUntil && (
            <p className={`mt-3 text-xs ${expired ? 'text-rose-400' : 'text-zinc-500'}`}>
              {expired
                ? `Este orçamento expirou em ${new Date(budget.validUntil).toLocaleDateString('pt-BR')}.`
                : `Válido até ${new Date(budget.validUntil).toLocaleDateString('pt-BR')}.`}
            </p>
          )}

          {error && (
            <p role="alert" className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
              {error}
            </p>
          )}

          {approved ? (
            <div
              role="status"
              className="mt-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-center"
            >
              <p className="text-sm font-medium text-emerald-300">Orçamento aprovado</p>
              <p className="mt-1 text-xs text-zinc-400">
                A assistência técnica já foi notificada e pode iniciar o reparo.
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={approve}
              disabled={approving || expired}
              className="mt-6 w-full rounded-xl bg-emerald-600 py-4 font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60"
            >
              {approving
                ? 'Aprovando…'
                : expired
                  ? 'Orçamento expirado'
                  : `Aprovar ${bzl(budget.total)}`}
            </button>
          )}

          <p className="mt-4 text-center text-xs text-zinc-600">
            Ao aprovar, você autoriza a execução do serviço pelo valor informado.
          </p>
        </div>
      )}
    </main>
  );
}