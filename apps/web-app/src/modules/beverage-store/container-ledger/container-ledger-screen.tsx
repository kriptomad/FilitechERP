// src/modules/beverage-store/container-ledger/container-ledger-screen.tsx — Cap. 4.3 (cascos)
import { useEffect, useState } from "react";
import { apiFetch } from "../../../shared/auth/session";

interface ContainerEntry {
  id: string;
  productId: string;
  direction: "BORROWED" | "RETURNED";
  quantity: number;
  createdAt: string;
}

export default function ContainerLedgerScreen() {
  const [entries, setEntries] = useState<ContainerEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/containers/outstanding")
      .then((r) => r.json())
      .then((json) => setEntries(json.data ?? []))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-8">
      <h1 className="text-2xl font-bold mb-6">Conta-Corrente de Cascos</h1>
      {loading && <p className="text-zinc-500">Carregando…</p>}
      <div className="space-y-3">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/60 px-5 py-4"
          >
            <div>
              <p className="font-medium">
                {entry.direction === "BORROWED" ? "Empréstimo" : "Devolução"} — {entry.quantity} un.
              </p>
              <p className="text-xs text-zinc-500">
                {new Date(entry.createdAt).toLocaleDateString("pt-BR")}
              </p>
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                entry.direction === "BORROWED"
                  ? "bg-amber-500/15 text-amber-400"
                  : "bg-emerald-500/15 text-emerald-400"
              }`}
            >
              {entry.direction === "BORROWED" ? "SAÍDA" : "ENTRADA"}
            </span>
          </div>
        ))}
        {!loading && entries.length === 0 && (
          <p className="text-zinc-500">Nenhum lançamento de cascos.</p>
        )}
      </div>
    </div>
  );
}
