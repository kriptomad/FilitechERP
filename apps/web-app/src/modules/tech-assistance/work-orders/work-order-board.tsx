// src/modules/tech-assistance/work-orders/work-order-board.tsx — Cap. 4.2 / 8.1
import { useEffect, useState } from "react";
import { useWorkOrderLiveStatus } from "../../../shared/hooks/use-work-order-live-status";
import { apiFetch } from "../../../shared/auth/session";

interface WorkOrder {
  id: string;
  protocolNumber?: string;
  equipmentDescription: string;
  status: string;
}

const STATUS_LABELS: Record<string, string> = {
  RECEIVED: "Recebido",
  DIAGNOSING: "Diagnóstico",
  AWAITING_APPROVAL: "Aguardando aprovação",
  IN_REPAIR: "Em reparo",
  READY: "Pronto",
  DELIVERED: "Entregue",
  CANCELLED: "Cancelado",
};

const STATUS_COLORS: Record<string, string> = {
  RECEIVED: "bg-zinc-500/15 text-zinc-300",
  DIAGNOSING: "bg-sky-500/15 text-sky-400",
  AWAITING_APPROVAL: "bg-amber-500/15 text-amber-400",
  IN_REPAIR: "bg-indigo-500/15 text-indigo-400",
  READY: "bg-emerald-500/15 text-emerald-400",
  DELIVERED: "bg-emerald-500/15 text-emerald-400",
  CANCELLED: "bg-red-500/15 text-red-400",
};

function LiveStatusBadge({ workOrderId, initial }: { workOrderId: string; initial: string }) {
  const live = useWorkOrderLiveStatus(workOrderId);
  const status = live ?? initial;
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_COLORS[status] ?? ""}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export default function WorkOrderBoard() {
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/work-orders")
      .then((r) => r.json())
      .then((json) => setOrders(json.data ?? []))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-8">
      <h1 className="text-2xl font-bold mb-6">Ordens de Serviço</h1>
      {loading && <p className="text-zinc-500">Carregando…</p>}
      <div className="space-y-3">
        {orders.map((wo) => (
          <div
            key={wo.id}
            className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/60 px-5 py-4"
          >
            <div>
              <p className="font-medium">{wo.equipmentDescription}</p>
              <p className="text-xs text-zinc-500 font-mono">{wo.protocolNumber ?? wo.id}</p>
            </div>
            <LiveStatusBadge workOrderId={wo.id} initial={wo.status} />
          </div>
        ))}
        {!loading && orders.length === 0 && (
          <p className="text-zinc-500">Nenhuma O.S. aberta.</p>
        )}
      </div>
    </div>
  );
}
