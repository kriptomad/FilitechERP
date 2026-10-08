// src/api-envelope.ts — espelho compartilhado do Cap. 9.1 (frontend + backend)
export interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  } | null;
  upsell?: {
    moduleCode: string;
    label: string;
    price: number;
    checkoutUrl: string;
  };
}
