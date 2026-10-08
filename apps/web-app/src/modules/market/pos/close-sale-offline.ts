// src/modules/market/pos/close-sale-offline.ts — Cap. 8.3
import { v4 as uuid } from "uuid";
import { offlineDb } from "../../../shared/offline/db";
import { computeSaleTotals, OfflinePaymentMethod } from "./sale-totals";

interface CloseSaleInput {
  items: { productId: string; quantity: number; unitPrice: number }[];
  paymentMethod: OfflinePaymentMethod;
  amountTendered?: number;
}

export async function closeSaleOffline(input: CloseSaleInput) {
  const localId = uuid();
  const { totalAmount, changeDue } = computeSaleTotals(
    input.items,
    input.paymentMethod,
    input.amountTendered,
  );

  await offlineDb.pendingSales.add({
    localId,
    payload: { ...input, totalAmount, idempotencyKey: localId },
    createdAt: Date.now(),
    syncStatus: "PENDING",
    syncAttempts: 0,
  });

  // Decremento otimista do snapshot local
  for (const item of input.items) {
    const cached = await offlineDb.products.get(item.productId);
    if (cached) {
      await offlineDb.products.update(item.productId, {
        stockQuantitySnapshot: cached.stockQuantitySnapshot - item.quantity,
      });
    }
  }

  await registerBackgroundSync();

  return { localId, totalAmount, changeDue };
}

async function registerBackgroundSync() {
  if ("serviceWorker" in navigator && "SyncManager" in window) {
    const registration = await navigator.serviceWorker.ready;
    // SyncManager não existe na lib.dom do TS — tipamos localmente.
    type SyncManagerLike = { register(tag: string): Promise<void> };
    await (
      registration as ServiceWorkerRegistration & { sync: SyncManagerLike }
    ).sync.register("sync-pending-sales");
  } else {
    window.dispatchEvent(new Event("filitech:force-sync"));
  }
}
