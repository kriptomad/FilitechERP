// src/modules/bakery/production/production-screen.tsx — Cap. 4.4/6.3 (produção/BOM)
import { useEffect, useState } from "react";
import { apiFetch } from "../../../shared/auth/session";

interface ProductionBatch {
  id: string;
  finishedProductId: string;
  quantityProduced: number;
  status: string;
  producedAt: string;
}

export default function ProductionScreen() {
  const [batches, setBatches] = useState<ProductionBatch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/production/batches")
      .then((r) => r.json())
      .then((json) => setBatches(json.data ?? []))
      .catch(() => setBatches([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-8">
      <h1 className="text-2xl font-bold mb-6">Produção — Ficha Técnica (BOM)</h1>
      {loading && <p className="text-zinc-500">Carregando…</p>}
      <div className="space-y-3">
        {batches.map((batch) => (
          <div
            key={batch.id}
            className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/60 px-5 py-4"
          >
            <div>
              <p className="font-medium">Fornada — {batch.quantityProduced} un.</p>
              <p className="text-xs text-zinc-500">
                {new Date(batch.producedAt).toLocaleDateString("pt-BR")}
              </p>
            </div>
            <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-400">
              {batch.status}
            </span>
          </div>
        ))}
        {!loading && batches.length === 0 && (
          <p className="text-zinc-500">Nenhuma fornada registrada.</p>
        )}
      </div>
    </div>
  );
}
