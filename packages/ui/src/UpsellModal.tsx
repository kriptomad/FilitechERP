// src/UpsellModal.tsx — Cap. 2.6 / 9.1 (upsell contextual, nunca tela de erro)
import { ReactNode } from "react";

export interface UpsellPayload {
  moduleCode: string;
  label?: string;
  price?: number;
  checkoutUrl?: string;
}

interface UpsellModalProps {
  open: boolean;
  upsell: UpsellPayload | null;
  onClose: () => void;
  onActivate?: (moduleCode: string) => void;
}

export function UpsellModal({ open, upsell, onClose, onActivate }: UpsellModalProps) {
  if (!open || !upsell) return null;

  async function handleActivate() {
    if (!upsell.moduleCode) return;
    try {
      const res = await fetch(`/api/billing/modules/${upsell.moduleCode}/activate`, {
        method: "POST",
        credentials: "include",
      });
      const json = await res.json();
      if (json.success) {
        onActivate?.(upsell.moduleCode);
        onClose();
      }
    } catch (err) {
      console.error("activate module error", err);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-8 shadow-2xl">
        <span className="inline-block rounded-full bg-indigo-500/15 px-3 py-1 text-xs font-semibold text-indigo-400">
          MÓDULO DISPONÍVEL
        </span>
        <h3 className="mt-4 text-2xl font-bold text-zinc-100">
          {upsell.label ?? upsell.moduleCode}
        </h3>
        <p className="mt-2 text-sm text-zinc-400">
          Ative este módulo para liberar a funcionalidade que você está tentando acessar.
        </p>
        {typeof upsell.price === "number" && (
          <p className="mt-4 text-3xl font-bold text-zinc-100">
            R$ {upsell.price.toFixed(2).replace(".", ",")}
            <span className="text-sm font-normal text-zinc-500">/mês</span>
          </p>
        )}
        <div className="mt-6 flex gap-3">
          <button
            onClick={handleActivate}
            className="flex-1 rounded-xl bg-indigo-600 py-3 font-semibold hover:bg-indigo-500 transition-colors"
          >
            Ativar agora
          </button>
          <button
            onClick={onClose}
            className="rounded-xl border border-zinc-700 px-5 py-3 font-semibold text-zinc-300 hover:border-zinc-500 transition-colors"
          >
            Agora não
          </button>
        </div>
      </div>
    </div>
  );
}

/** Interceptor global do cliente HTTP: detecta MODULE_NOT_ACTIVE e abre o modal. */
export function extractUpsellFromResponse(status: number, body: unknown): UpsellPayload | null {
  if (status !== 402) return null;
  const env = body as { error?: { code?: string }; upsell?: UpsellPayload } | null;
  if (env?.error?.code === "MODULE_NOT_ACTIVE" && env.upsell) return env.upsell;
  return null;
}
