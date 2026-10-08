// src/shared/hooks/use-work-order-live-status.ts — Cap. 8.2 (SSE sem leaks)
import { useEffect, useRef, useState } from "react";
import { getToken } from "../auth/session";

export function useWorkOrderLiveStatus(workOrderId: string) {
  const [status, setStatus] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // EventSource não envia header Authorization — token vai na query string
    // (a API lê ?token= no sessionMiddleware; Cap. 8.2).
    const token = getToken();
    const qs = token ? `?token=${encodeURIComponent(token)}` : "";
    const eventSource = new EventSource(
      `/api/work-orders/${workOrderId}/events${qs}`,
      { withCredentials: true },
    );
    eventSourceRef.current = eventSource;

    eventSource.addEventListener("status-changed", (event: MessageEvent) => {
      const payload = JSON.parse(event.data);
      setStatus(payload.status);
    });

    eventSource.onerror = () => {
      // EventSource reconecta automaticamente — apenas logamos, sem recriar.
      console.warn(
        `SSE desconectado para O.S. ${workOrderId}, reconexão automática em andamento.`,
      );
    };

    return () => {
      // Cleanup obrigatório: navegar entre O.S.s não acumula conexões abertas.
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, [workOrderId]);

  return status;
}
