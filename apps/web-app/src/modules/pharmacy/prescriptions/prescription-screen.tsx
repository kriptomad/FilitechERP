// src/modules/pharmacy/prescriptions/prescription-screen.tsx — Cap. 4.5 (SNGPC/SNCR)
import { useEffect, useState } from "react";
import { apiFetch } from "../../../shared/auth/session";

interface Prescription {
  id: string;
  prescriptionType: string;
  electronicPrescriptionNumber: string | null;
  createdAt: string;
}

export default function PrescriptionScreen() {
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/pharmacy/prescriptions")
      .then((r) => r.json())
      .then((json) => setPrescriptions(json.data ?? []))
      .catch(() => setPrescriptions([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-8">
      <h1 className="text-2xl font-bold mb-6">Receitas Retidas — SNGPC/SNCR</h1>
      {loading && <p className="text-zinc-500">Carregando…</p>}
      <div className="space-y-3">
        {prescriptions.map((rx) => (
          <div
            key={rx.id}
            className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/60 px-5 py-4"
          >
            <div>
              <p className="font-medium">{rx.prescriptionType}</p>
              <p className="text-xs text-zinc-500">
                {rx.electronicPrescriptionNumber ?? "Sem numeração eletrônica"} •{" "}
                {new Date(rx.createdAt).toLocaleDateString("pt-BR")}
              </p>
            </div>
            <span className="rounded-full bg-sky-500/15 px-2.5 py-1 text-xs font-semibold text-sky-400">
              RETIDA
            </span>
          </div>
        ))}
        {!loading && prescriptions.length === 0 && (
          <p className="text-zinc-500">Nenhuma receita retida.</p>
        )}
      </div>
    </div>
  );
}
