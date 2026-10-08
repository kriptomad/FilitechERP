// src/modules/general-retail/credit/credit-screen.tsx — Cap. 4.6 (crediário)
import { useEffect, useState } from "react";
import { apiFetch } from "../../../shared/auth/session";

interface CreditAccount {
  id: string;
  clientName: string;
  creditLimit: number;
  creditBalanceUsed: number;
  openBalance: number;
}

export default function CreditScreen() {
  const [accounts, setAccounts] = useState<CreditAccount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/admin/clients")
      .then((r) => r.json())
      .then((json) => setAccounts(json.data ?? []))
      .catch(() => setAccounts([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-8">
      <h1 className="text-2xl font-bold mb-6">Crediário — Vendas a Prazo</h1>
      {loading && <p className="text-zinc-500">Carregando…</p>}
      <div className="space-y-3">
        {accounts.map((acct) => {
          const available = acct.creditLimit - acct.creditBalanceUsed;
          const pct = acct.creditLimit > 0 ? (acct.creditBalanceUsed / acct.creditLimit) * 100 : 0;
          return (
            <div
              key={acct.id}
              className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-5 py-4"
            >
              <div className="flex items-center justify-between">
                <p className="font-medium">{acct.clientName}</p>
                <span className="text-sm text-zinc-400">
                  Disponível: R$ {available.toFixed(2).replace(".", ",")}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-800">
                <div
                  className={`h-full rounded-full ${pct > 80 ? "bg-amber-500" : "bg-indigo-500"}`}
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                Limite: R$ {acct.creditLimit.toFixed(2).replace(".", ",")} • Em uso: R$ {acct.creditBalanceUsed.toFixed(2).replace(".", ",")}
              </p>
            </div>
          );
        })}
        {!loading && accounts.length === 0 && (
          <p className="text-zinc-500">Nenhum cliente com limite de crédito.</p>
        )}
      </div>
    </div>
  );
}
