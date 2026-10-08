// src/types/api-envelope.ts — Cap. 9.1
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

// Standard response helpers
export function apiSuccess<T>(data: T): ApiEnvelope<T> {
  return { success: true, data, error: null };
}

export function apiError(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): ApiEnvelope<null> {
  return { success: false, data: null, error: { code, message, details } };
}

export function apiUpsell(
  code: string,
  message: string,
  upsell: NonNullable<ApiEnvelope<null>["upsell"]>,
): ApiEnvelope<null> {
  return { success: false, data: null, error: { code, message }, upsell };
}
