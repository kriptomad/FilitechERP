// src/server/payment/gateway.ts — Cap. 2.7 / 20.4
//
// Abstração do PSP (provedor de pagamento). O sistema fala APENAS com esta
// interface; trocar Asaas por Mercado Pago, Stripe ou outro é implementar um
// adapter e nada mais.
//
// Gap crítico corrigido: o checkout anterior ativava o Tenant sem consultar
// nenhum provedor. Aqui a cobrança é criada no PSP e devolve um pagamento
// INSTRUMENTADO (PIX copia-e-cola / QR Code, ou link de checkout). A
// Subscription só é promovida para ACTIVE quando o webhook chega — o que
// significa que a assinatura é confirmada por prova de pagamento, não por
// confiança no clique do botão.
import { DomainError } from '../api-envelope';
import { env } from '../env';

export type PaymentMethodKind = 'PIX' | 'CREDIT_CARD' | 'BOLETO';

export interface CreateChargeInput {
  tenantId: string;
  customerEmail: string;
  customerName: string;
  customerDocument?: string;
  amount: number;
  method: PaymentMethodKind;
  description: string;
  externalReference: string;
  dueDate?: Date;
}

export interface ChargeResult {
  provider: string;
  providerChargeId: string;
  status: 'PENDING' | 'PAID';
  /** Payload EMV copia-e-cola do Pix. */
  pixQrCodePayload?: string;
  /** PNG do QR Code em base64 (evita round-trip ao exibir). */
  pixQrCodeBase64?: string;
  /** Linha digitável do boleto. */
  boletoDigitableLine?: string;
  /** Checkout hospedado (cartão). */
  hostedCheckoutUrl?: string;
  dueDate?: Date;
  expiresAt: Date;
}

export interface PaymentGateway {
  readonly name: string;
  createCharge(input: CreateChargeInput): Promise<ChargeResult>;
  /** Verifica credenciais chamando o endpoint de perfil/autorização do PSP. */
  testConnection(): Promise<{ ok: boolean; message: string; latencyMs: number }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// ADAPTER: Mercado Pago (PIX, cartão e boleto)
// ─────────────────────────────────────────────────────────────────────────────

const MP_BASE = 'https://api.mercadopago.com';

export class MercadoPagoGateway implements PaymentGateway {
  readonly name = 'mercadopago';

  constructor(private readonly accessToken: string) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${MP_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });

    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;

    if (!res.ok) {
      const message =
        (body?.message as string | undefined) ??
        (Array.isArray(body?.cause) && body.cause.length
          ? String((body.cause[0] as { description?: string })?.description ?? '')
          : '') ??
        `HTTP ${res.status}`;
      throw new DomainError('GATEWAY_ERROR', `Mercado Pago: ${message}`, 502);
    }

    return body as T;
  }

  async createCharge(input: CreateChargeInput): Promise<ChargeResult> {
    const paymentMethodId = await this.ensurePaymentMethod(input);

    const charge = await this.request<{
      id: number;
      status: string;
      date_of_expiration?: string;
      external_reference?: string;
    }>('/v1/payments', {
      method: 'POST',
      body: JSON.stringify({
        transaction_amount: Number(input.amount.toFixed(2)),
        payment_method_id: paymentMethodId,
        description: input.description.slice(0, 120),
        external_reference: input.externalReference,
        payer: {
          email: input.customerEmail,
          first_name: input.customerName.slice(0, 40),
        },
      }),
    });

    const approved = charge.status === 'approved';

    // Para Pix o gateway responde no detalhe do pagamento. Quando a cobrança é
    // criada ainda como "pending" (regra padrão do MP), os dados do QR Code
    // precisam ser lidos do recurso de payment methods.
    const pix = await this.fetchPixData(charge.id);

    return {
      provider: this.name,
      providerChargeId: String(charge.id),
      status: approved ? 'PAID' : 'PENDING',
      pixQrCodePayload: pix?.qrCode,
      pixQrCodeBase64: pix?.qrCodeBase64,
      hostedCheckoutUrl: pix?.checkoutUrl,
      expiresAt: charge.date_of_expiration
        ? new Date(charge.date_of_expiration)
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    };
  }

  /**
   * O MP exige que o Payment Method exista. Para Pix, criamos um método
   * descartável do tipo `pix` e o associamos a um Paymentintent; é o fluxo
   * oficial para gerar QR Code dinâmico com valor definido pelo seller.
   */
  private async ensurePaymentMethod(input: CreateChargeInput): Promise<string> {
    if (input.method === 'BOLETO') return 'bolbradesk_payment';

    const paymentMethod = await this.request<{ id: number }>('/v1/payment_methods', {
      method: 'POST',
      body: JSON.stringify({
        type: 'pix',
        installments: 1,
        statement_descriptor: 'FILITECH ERP',
        payer: {
          type: 'customer',
          email: input.customerEmail,
          first_name: input.customerName.slice(0, 40),
        },
      }),
    });

    return String(paymentMethod.id);
  }

  private async fetchPixData(paymentId: number): Promise<{
    qrCode?: string;
    qrCodeBase64?: string;
    checkoutUrl?: string;
  } | null> {
    const detail = await this.request<{
      transaction_details?: { external_reference_url?: string };
      point_of_interaction?: { transaction_data?: { qr_code?: string; qr_code_base64?: string } };
    }>(`/v1/payments/${paymentId}`).catch(() => null);

    const txs = detail?.transaction_details;
    const poi = detail?.point_of_interaction?.transaction_data;

    return {
      qrCode: poi?.qr_code,
      qrCodeBase64: poi?.qr_code_base64,
      checkoutUrl: txs?.external_reference_url,
    };
  }

  async testConnection() {
    const started = Date.now();
    try {
      const me = await this.request<{ id: number; nickname?: string }>('/users/me');
      return {
        ok: true,
        message: `Autenticado como ${me.nickname ?? me.id}`,
        latencyMs: Date.now() - started,
      };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : 'Falha desconhecida',
        latencyMs: Date.now() - started,
      };
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ADAPTER: Asaas (PIX, cartão e boleto)
// ─────────────────────────────────────────────────────────────────────────────

const ASAAS_BASE = 'https://api.asaas.com/v3';

export class AsaasGateway implements PaymentGateway {
  readonly name = 'asaas';

  constructor(private readonly accessToken: string) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${ASAAS_BASE}${path}`, {
      ...init,
      headers: {
        'access_token': this.accessToken,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });

    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;

    if (!res.ok) {
      throw new DomainError(
        'GATEWAY_ERROR',
        `Asaas: ${(body?.message as string | undefined) ?? `HTTP ${res.status}`}`,
        502,
      );
    }

    return body as T;
  }

  async createCharge(input: CreateChargeInput): Promise<ChargeResult> {
    const billingType =
      input.method === 'PIX' ? 'PIX' : input.method === 'BOLETO' ? 'BOLETO' : 'CREDIT_CARD';

    const charge = await this.request<{
      id: string;
      status: string;
      dueDate?: string;
      paymentUrl?: string;
      billingType?: string;
      externalReference?: string;
    }>('/payments', {
      method: 'POST',
      body: JSON.stringify({
        customer: input.customerDocument ?? input.customerEmail,
        billingType,
        value: Number(input.amount.toFixed(2)),
        dueDate: (input.dueDate ?? new Date()).toISOString().slice(0, 10),
        description: input.description.slice(0, 120),
        externalReference: input.externalReference,
      }),
    });

    const paid = charge.status === 'CONFIRMED' || charge.status === 'RECEIVED';

    // O QR Code Pix do Asaas só existe depois de instanciar a cobrança.
    let pixPayload: string | undefined;
    let pixBase64: string | undefined;
    if (billingType === 'PIX') {
      const pix = await this.request<{ encodedImage?: string; payload?: string }>(
        `/payments/${charge.id}/pixQrCode`,
      ).catch(() => null);
      pixPayload = pix?.payload;
      pixBase64 = pix?.encodedImage;
    }

    return {
      provider: this.name,
      providerChargeId: charge.id,
      status: paid ? 'PAID' : 'PENDING',
      pixQrCodePayload: pixPayload,
      pixQrCodeBase64: pixBase64,
      hostedCheckoutUrl: charge.paymentUrl,
      dueDate: charge.dueDate ? new Date(charge.dueDate) : undefined,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    };
  }

  async testConnection() {
    const started = Date.now();
    try {
      const me = await this.request<{ id: string; email?: string }>('/myAccount');
      return {
        ok: true,
        message: `Conta ${me.email ?? me.id} autenticada`,
        latencyMs: Date.now() - started,
      };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : 'Falha desconhecida',
        latencyMs: Date.now() - started,
      };
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RESOLUÇÃO DO GATEWAY
// ─────────────────────────────────────────────────────────────────────────────

export type GatewayKind = 'mercadopago' | 'asaas';

/**
 * Retorna o gateway configurado, ou `null` quando não há credencial.
 *
 * `null` é um estado legítimo e explícito: o checkout responde 503 com
 * orientação em vez de fingir que o pagamento foi aceito.
 */
export function resolveGateway(): PaymentGateway | null {
  const provider = (process.env.BILLING_GATEWAY ?? '').toLowerCase();

  if (provider === 'mercadopago' && env.mercadoPagoAccessToken) {
    return new MercadoPagoGateway(env.mercadoPagoAccessToken);
  }

  if (provider === 'asaas' && env.asaasApiKey) {
    return new AsaasGateway(env.asaasApiKey);
  }

  return null;
}

export function gatewayDisplayName(): string | null {
  const provider = (process.env.BILLING_GATEWAY ?? '').toLowerCase();
  if (provider === 'mercadopago') return 'Mercado Pago';
  if (provider === 'asaas') return 'Asaas';
  return null;
}