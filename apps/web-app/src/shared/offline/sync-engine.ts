// src/shared/offline/sync-engine.ts — Cap. 8.3
import { offlineDb, PendingSale } from "./db";
import { getToken } from "../auth/session";

export async function syncPendingSales(): Promise<{
  synced: number;
  failed: number;
  pending: number;
}> {
  const pending = await offlineDb.pendingSales
    .filter((s) => s.syncStatus === "PENDING")
    .toArray();

  let synced = 0;
  let failed = 0;

  for (const sale of pending) {
    await offlineDb.pendingSales.update(sale.localId, { syncStatus: "SYNCING" });
    try {
      const response = await fetch("/api/sales", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": sale.localId,
          ...(getToken()
            ? { Authorization: `Bearer ${getToken()}` }
            : {}),
        },
        credentials: "include",
        body: JSON.stringify(sale.payload),
      });

      if (response.ok) {
        await offlineDb.pendingSales.update(sale.localId, { syncStatus: "SYNCED" });
        synced++;
      } else if (response.status >= 400 && response.status < 500) {
        // Erro de negócio (ex.: estoque esgotado) — não retentar.
        await offlineDb.pendingSales.update(sale.localId, { syncStatus: "FAILED" });
        failed++;
      } else {
        // 5xx — mantém PENDING para nova tentativa.
        await offlineDb.pendingSales.update(sale.localId, {
          syncStatus: "PENDING",
          syncAttempts: sale.syncAttempts + 1,
        });
      }
    } catch {
      await offlineDb.pendingSales.update(sale.localId, {
        syncStatus: "PENDING",
        syncAttempts: sale.syncAttempts + 1,
      });
    }
  }

  const remaining = await offlineDb.pendingSales
    .filter((s) => s.syncStatus === "PENDING")
    .count();

  return { synced, failed, pending: remaining };
}

/** Fallback para navegadores sem Background Sync (Safari/iOS). */
export function installManualSyncFallback() {
  window.addEventListener("online", () => {
    syncPendingSales();
  });
  window.addEventListener("filitech:force-sync", () => {
    syncPendingSales();
  });
}
