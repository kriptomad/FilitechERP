// public/service-worker.js — Cap. 8.3
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-pending-sales") {
    event.waitUntil(syncPendingSales());
  }
});

async function openOfflineDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("filitech-pos-offline", 1);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("pendingSales")) {
        const store = db.createObjectStore("pendingSales", { keyPath: "localId" });
        store.createIndex("syncStatus", "syncStatus");
        store.createIndex("createdAt", "createdAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getAllPendingSales(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("pendingSales", "readonly");
    const store = tx.objectStore("pendingSales");
    const index = store.index("syncStatus");
    const request = index.getAll("PENDING");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function markSaleAsSynced(db, localId) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("pendingSales", "readwrite");
    const store = tx.objectStore("pendingSales");
    const getReq = store.get(localId);
    getReq.onsuccess = () => {
      const sale = getReq.result;
      if (sale) {
        sale.syncStatus = "SYNCED";
        store.put(sale);
      }
      resolve();
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

async function markSaleAsFailed(db, localId) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("pendingSales", "readwrite");
    const store = tx.objectStore("pendingSales");
    const getReq = store.get(localId);
    getReq.onsuccess = () => {
      const sale = getReq.result;
      if (sale) {
        sale.syncStatus = "FAILED";
        store.put(sale);
      }
      resolve();
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

async function syncPendingSales() {
  const db = await openOfflineDatabase();
  const pendingSales = await getAllPendingSales(db);

  for (const sale of pendingSales) {
    try {
      const response = await fetch("/api/sales", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": sale.localId,
        },
        body: JSON.stringify(sale.payload),
      });

      if (response.ok) {
        await markSaleAsSynced(db, sale.localId);
      } else if (response.status >= 400 && response.status < 500) {
        await markSaleAsFailed(db, sale.localId);
      }
    } catch {
      // Falha de rede — mantém PENDING
    }
  }
}
