// src/shared/offline/pending-sales-queue.tsx — UI da fila offline
import { useEffect, useState } from "react";
import { offlineDb, PendingSale } from "./db";
import { syncPendingSales, installManualSyncFallback } from "./sync-engine";
import { useOfflineStatus } from "./use-offline-status";

export default function PendingSalesQueue() {
  const [sales, setSales] = useState<PendingSale[]>([]);
  const [stats, setStats] = useState<string>("");
  const online = useOfflineStatus();

  async function refresh() {
    const all = await offlineDb.pendingSales.orderBy("createdAt").reverse().toArray();
    setSales(all);
  }

  useEffect(() => {
    refresh();
    installManualSyncFallback();
  }, []);

  async function handleSync() {
    setStats("Sincronizando…");
    const result = await syncPendingSales();
    setStats(
      `${result.synced} sincronizada(s), ${result.failed} falha(s), ${result.pending} pendente(s).`,
    );
    refresh();
  }

  const statusColor: Record<PendingSale["syncStatus"], string> = {
    PENDING: "text-amber-400",
    SYNCING: "text-indigo-400",
    SYNCED: "text-emerald-400",
    FAILED: "text-red-400",
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Fila de sincronização</h1>
        <button
          onClick={handleSync}
          disabled={!online}
          className="rounded-lg bg-indigo-600 px-5 py-2.5 font-semibold hover:bg-indigo-500
                     transition-colors disabled:opacity-40"
        >
          Sincronizar agora
        </button>
      </div>
      {!online && (
        <p className="mb-4 text-amber-400 text-sm">
          Sem conexão — as vendas permanecem seguras localmente (IndexedDB).
        </p>
      )}
      {stats && <p className="mb-4 text-sm text-zinc-400">{stats}</p>}

      <div className="space-y-2">
        {sales.length === 0 && (
          <p className="text-zinc-500">Nenhuma venda na fila. Tudo sincronizado ✓</p>
        )}
        {sales.map((sale) => (
          <div
            key={sale.localId}
            className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3"
          >
            <div>
              <p className="text-sm font-mono">{sale.localId.slice(0, 8)}…</p>
              <p className="text-xs text-zinc-500">
                {new Date(sale.createdAt).toLocaleString("pt-BR")} · {sale.syncAttempts} tentativa(s)
              </p>
            </div>
            <span className={`text-sm font-semibold ${statusColor[sale.syncStatus]}`}>
              {sale.syncStatus}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
