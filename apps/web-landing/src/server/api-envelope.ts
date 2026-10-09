// src/server/api-envelope.ts — Cap. 9.1
// Envelope único para toda resposta da API (sucesso, erro de negócio ou
// validação). O frontend nunca precisa adivinhar o formato da resposta.
import { NextResponse } from 'next/server';

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

/** Erro com payload de upsell — Cap. 2.6 (frontend abre modal, nunca tela genérica). */
export function apiUpsell(
  moduleCode: string,
  label: string,
  price: number,
  message: string,
  checkoutUrl: string,
): ApiEnvelope<null> {
  return {
    success: false,
    data: null,
    error: { code: 'MODULE_NOT_ACTIVE', message },
    upsell: { moduleCode, label, price, checkoutUrl },
  };
}

export function jsonSuccess<T>(data: T, status = 200): NextResponse<ApiEnvelope<T>> {
  return NextResponse.json(apiSuccess(data), { status });
}

export function jsonError(
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): NextResponse<ApiEnvelope<null>> {
  return NextResponse.json(apiError(code, message, details), { status });
}

export function jsonUpsell(
  status: number,
  upsell: NonNullable<ApiEnvelope<null>['upsell']>,
  message: string,
): NextResponse<ApiEnvelope<null>> {
  return NextResponse.json(apiUpsell(upsell.moduleCode, upsell.label, upsell.price, message, upsell.checkoutUrl), {
    status,
  });
}

/** Erro de domínio com status HTTP — permite `throw new DomainError(...)`. */
export class DomainError extends Error {
  status: number;
  code: string;
  details?: Record<string, unknown>;
  /** Presente quando o erro é de feature gating — o frontend abre o modal de upsell. */
  upsell?: NonNullable<ApiEnvelope<null>['upsell']>;

  constructor(
    code: string,
    message: string,
    status = 400,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.status = status;
    this.details = details;
  }

  withUpsell(upsell: NonNullable<ApiEnvelope<null>['upsell']>): this {
    this.upsell = upsell;
    return this;
  }
}