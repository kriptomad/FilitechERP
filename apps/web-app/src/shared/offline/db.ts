// src/shared/offline/db.ts — Cap. 8.3
import Dexie, { Table } from "dexie";

export interface CachedProduct {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  unitPrice: number;
  stockQuantitySnapshot: number;
}

export interface PendingSale {
  localId: string;
  payload: Record<string, unknown>;
  createdAt: number;
  syncStatus: "PENDING" | "SYNCING" | "SYNCED" | "FAILED";
  syncAttempts: number;
}

class FilitechOfflineDatabase extends Dexie {
  products!: Table<CachedProduct, string>;
  pendingSales!: Table<PendingSale, string>;

  constructor() {
    super("filitech-pos-offline");
    this.version(1).stores({
      products: "id, sku, barcode",
      pendingSales: "localId, syncStatus, createdAt",
    });
  }
}

export const offlineDb = new FilitechOfflineDatabase();
