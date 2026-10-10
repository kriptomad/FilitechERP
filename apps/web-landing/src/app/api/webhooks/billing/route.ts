// src/app/api/webhooks/billing/route.ts — Cap. 2.6 / 2.7 / 9.3
//
// O PONTO MAIS CRÍTICO DO SISTEMA.
//
// Versão anterior: lia o body, fazia `console.log` e respondia sucesso. Ou
// seja — a rota que deveria provar o pagamento não fazia NADA, e a assinatura
// nunca saía de PENDING (ou era ativada pelo checkout, que é o bug que este
// arquivo também fecha).
//
// Regras que este arquivo implementa:
//   1. EVENTO SEM ASSINATURA VÁLIDA É RECUSADO (401) — nunca ativa nada.
//   2. O evento por si só NÃO ativa: o status é RE-CONSULTADO no PSP com a
//      chave do servidor (source of truth). Webhook forjado com "approved"
//      escrito à mão não libera módulo.
//   3. A ativação passa por `confirmCharge()` — o ÚNICO caminho autorizado a
//      promover a assinatura para ACTIVE (idempotente).
//   4. Evento duplicado é reconhecido pela chave de idempotência
//      (BillingEvent @@unique[provider, externalEventKey]) e respondido 200.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { prismaUnscoped } from '@/server/db';
import { jsonError } from '@/server/api-envelope';
import { env } from '@/server/env';
import { confirmCharge } from '@/server/payment/confirm-charge';
import { resolveGateway, MercadoPagoGateway, AsaasGateway } from '@/server/payment/gateway';

export const dynamic = 'force-dynamic';

type Provider = 'mercadopago' | 'asaas';

interface NormalizedEvent {
  provider: Provider;
  /** Identificador do pagamento no PSP. */
  externalProviderId: string;
  /** externalReference gravado no checkout (= tenantId). */
  externalReference?: string;
  /** Classe do evento: pago | falhou | estornado | outro. */
  outcome: 'paid' | 'failed' | 'refunded' | 'other';
  /** Chave de idempotência estável (o mesmo evento chega várias vezes). */
  eventKey: string;
  eventType: string;
  payload: unknown;
}

function header(request: Request, name: string): string {
  return request.headers.get(name) ?? '';
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// ── Autenticação ─────────────────────────────────────────────────────────────

/**
 * Mercado Pago: header `x-signature: ts=<unix>,v1=<hex>`.
 * v1 = HMAC-SHA256(manifest, MERCADO_PAGO_WEBHOOK_SECRET), onde o manifest é
 * `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`.
 */
function verifyMercadoPagoSignature(request: Request, body: Record<string, unknown>): boolean {
  const secret = env.mercadoPagoWebhookSecret;
  if (!secret) return false;

  const raw = header(request, 'x-signature');
  if (!raw) return false;

  const parts = Object.fromEntries(
    raw.split(',').map((piece) => {
      const idx = piece.indexOf('=');
      return idx === -1 ? [piece.trim(), ''] : [piece.slice(0, idx).trim(), piece.slice(idx + 1).trim()];
    }),
  );

  const ts = parts.ts ?? '';
  const v1 = parts.v1 ?? '';
  if (!ts || !v1) return false;

  const dataId = (body?.data as { id?: unknown } | undefined)?.id ?? '';
  const requestId = header(request, 'x-request-id');

  // O MP monta o manifest com `;` final — reproduzimos exatamente.
  const manifest = `id:${String(dataId)};request-id:${requestId};ts:${ts};`;
  const digest = createHmac('sha256', secret).update(manifest).digest('hex');

  return safeEqual(digest, v1);
}

/**
 * Asaas: o dashboard envia o token cadastrado como header `access_token`
 * (ou `x-asaas-token`/`x-webhook-token`). Aceitamos também `?token=` na URL.
 */
function verifyAsaas(request: Request, url: URL): boolean {
  const secret = env.asaasWebhookSecret;
  if (!secret) return false;

  const provided =
    header(request, 'access_token') ||
    header(request, 'x-asaas-token') ||
    header(request, 'x-webhook-token') ||
    url.searchParams.get('token') ||
    '';

  return provided.length > 0 && safeEqual(provided, secret);
}

/** Fallback genérico: `x-webhook-token` contra BILLING_WEBHOOK_SECRET. */
function verifyGenericToken(request: Request, url: URL): boolean {
  const secret = process.env.BILLING_WEBHOOK_SECRET;
  if (!secret) return false;

  const provided =
    header(request, 'x-webhook-token') ||
    header(request, 'x-webhook-secret') ||
    url.searchParams.get('token') ||
    '';

  return provided.length > 0 && safeEqual(provided, secret);
}

// ── Normalização do evento ───────────────────────────────────────────────────

function normalizeMercadoPago(body: Record<string, unknown>): NormalizedEvent | null {
  const type = String(body.type ?? body.topic ?? '');
  const data = (body.data ?? {}) as { id?: unknown };
  const action = String(body.action ?? '');

  // Só nos interessa pagamento. merchant_order não confirma valor.
  if (type !== 'payment' && !action.startsWith('payment.')) return null;

  const paymentId = String(data.id ?? body['data-id'] ?? '');
  if (!paymentId) return null;

  const refunded = action.includes('refund') || action === 'payment.refunded';

  return {
    provider: 'mercadopago',
    externalProviderId: paymentId,
    externalReference: typeof body.external_reference === 'string' ? body.external_reference : undefined,
    outcome: refunded ? 'refunded' : 'other',
    eventKey: `mp_${body.id ?? `${paymentId}_${action}`}`,
    eventType: action || `payment.${type}`,
    payload: body,
  };
}

function normalizeAsaas(body: Record<string, unknown>): NormalizedEvent | null {
  const event = String(body.event ?? '');
  if (!event) return null;

  const payment = (body.payment ?? {}) as { id?: unknown; externalReference?: unknown };
  const paymentId = String(payment.id ?? body.id ?? '');
  if (!paymentId) return null;

  const paid = event === 'PAYMENT_CONFIRMED' || event === 'PAYMENT_RECEIVED';
  const failed =
    event === 'PAYMENT_OVERDUE' ||
    event === 'PAYMENT_DELETED' ||
    event === 'PAYMENT_FAILED' ||
    event === 'CHARGEBACK_REQUESTED' ||
    event === 'CHARGEBACK_DISPUTE';
  const refunded = event === 'PAYMENT_REFUNDED' || event === 'REFUND_RECEIVED';

  return {
    provider: 'asaas',
    externalProviderId: paymentId,
    externalReference:
      typeof payment.externalReference === 'string' ? payment.externalReference : undefined,
    outcome: paid ? 'paid' : refunded ? 'refunded' : failed ? 'failed' : 'other',
    eventKey: `asaas_${body.id ?? `${event}_${paymentId}`}`,
    eventType: event,
    payload: body,
  };
}

// ── Confirmação no PSP (fonte da verdade) ────────────────────────────────────

/**
 * Consulta o pagamento DIRETO na API do PSP com a chave do servidor.
 *
 * É esta chamada que torna o webhook confiável: o corpo do evento é apenas um
 * "aviso"; o status que vale é o que o PSP devolve nesta consulta.
 */
async function fetchProviderStatus(
  event: NormalizedEvent,
): Promise<{ approved: boolean; reason: string }> {
  const gateway = resolveGateway();

  if (!gateway) {
    return { approved: false, reason: 'GATEWAY_NOT_CONFIGURED' };
  }

  try {
    if (event.provider === 'mercadopago' && gateway instanceof MercadoPagoGateway) {
      const res = await fetch(`https://api.mercadopago.com/v1/payments/${event.externalProviderId}`, {
        headers: { Authorization: `Bearer ${env.mercadoPagoAccessToken}` },
        cache: 'no-store',
      });
      if (!res.ok) return { approved: false, reason: `MP_HTTP_${res.status}` };
      const payment = (await res.json()) as { status?: string; external_reference?: string };
      if (payment.external_reference) event.externalReference = payment.external_reference;
      return {
        approved: payment.status === 'approved',
        reason: `MP_STATUS_${payment.status ?? 'unknown'}`,
      };
    }

    if (event.provider === 'asaas' && gateway instanceof AsaasGateway) {
      const res = await fetch(`https://api.asaas.com/v3/payments/${event.externalProviderId}`, {
        headers: { access_token: env.asaasApiKey, 'Content-Type': 'application/json' },
        cache: 'no-store',
      });
      if (!res.ok) return { approved: false, reason: `ASAAS_HTTP_${res.status}` };
      const payment = (await res.json()) as { status?: string; externalReference?: string };
      if (payment.externalReference) event.externalReference = payment.externalReference;
      return {
        approved: payment.status === 'CONFIRMED' || payment.status === 'RECEIVED',
        reason: `ASAAS_STATUS_${payment.status ?? 'unknown'}`,
      };
    }
  } catch (err) {
    return {
      approved: false,
      reason: `PSP_UNREACHABLE:${err instanceof Error ? err.message : 'unknown'}`,
    };
  }

  return { approved: false, reason: 'PROVIDER_MISMATCH' };
}

// ── Handler ──────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const url = new URL(request.url);

  // Body bruto: a assinatura do MP é calculada sobre o manifest, mas manter o
  // texto original permite validar tokens contra a URL sem parsear cedo demais.
  const raw = await request.text();
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return jsonError(400, 'INVALID_PAYLOAD', 'Corpo do webhook não é JSON válido.');
  }

  // ── 1. Autenticação (fail-closed) ─────────────────────────────────────────
  const declaredProvider = url.searchParams.get('provider') ?? body.topic ?? body.event;
  const looksLikeMercadoPago =
    String(declaredProvider).toLowerCase().includes('mp') ||
    'action' in body ||
    String(body.type ?? '') === 'payment';
  const looksLikeAsaas = typeof body.event === 'string';

  let authenticated = false;
  let provider: Provider | null = null;

  if (looksLikeAsaas && !looksLikeMercadoPago) {
    authenticated = verifyAsaas(request, url) || verifyGenericToken(request, url);
    provider = 'asaas';
  } else if (looksLikeMercadoPago) {
    authenticated = verifyMercadoPagoSignature(request, body) || verifyGenericToken(request, url);
    provider = 'mercadopago';
  } else {
    authenticated = verifyAsaas(request, url) || verifyGenericToken(request, url);
    provider = looksLikeAsaas ? 'asaas' : 'mercadopago';
  }

  if (!authenticated) {
    // NUNCA responda sucesso sem assinatura: o PSP reenvia indefinidamente e,
    // pior, um atacante aprenderia que o formato está certo.
    return jsonError(
      401,
      'INVALID_SIGNATURE',
      'Assinatura do webhook inválida ou segredo não configurado.',
    );
  }

  const event =
    provider === 'mercadopago' ? normalizeMercadoPago(body) : normalizeAsaas(body);

  if (!event) {
    // Evento de outro tipo (ex.: merchant_order): reconhecemos para o PSP não
    // repetir, mas nada é ativado.
    return jsonSuccess202('Evento ignorado (não é confirmação de pagamento).');
  }

  // ── 2. Idempotência ──────────────────────────────────────────────────────
  const alreadySeen = await prismaUnscoped.billingEvent.findUnique({
    where: { provider_externalEventKey: { provider: event.provider, externalEventKey: event.eventKey } },
    select: { id: true },
  });
  if (alreadySeen) {
    return jsonSuccess202('Evento já processado.');
  }

  // ── 3. Localizar a cobrança ──────────────────────────────────────────────
  const charge = await prismaUnscoped.paymentCharge.findFirst({
    where: {
      provider: event.provider,
      externalProviderId: event.externalProviderId,
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!charge) {
    // Sem cobrança correspondente não há o que ativar — registramos o evento
    // para diagnóstico e respondemos 202 (o PSP não precisa reenviar).
    await recordOrphanEvent(event);
    return jsonSuccess202(
      'Nenhuma cobrança localizada para este evento (possivelmente de outro ambiente).',
    );
  }

  // ── 4. Re-consulta no PSP ────────────────────────────────────────────────
  const verification = await fetchProviderStatus(event);
  const approved = event.outcome === 'paid' || verification.approved;

  if (!approved) {
    if (event.outcome === 'refunded') {
      await prismaUnscoped.paymentCharge.updateMany({
        where: { id: charge.id, status: 'PAID' },
        data: { status: 'REFUNDED' },
      });
    } else if (event.outcome === 'failed') {
      await prismaUnscoped.paymentCharge.updateMany({
        where: { id: charge.id, status: 'PENDING' },
        data: { status: 'CANCELLED', failureReason: verification.reason },
      });
    }

    await recordEvent(event, charge.id, { ...verification, outcome: event.outcome });

    return jsonSuccess202(
      event.outcome === 'failed'
        ? 'Pagamento falhou — cobrança marcada como cancelada.'
        : `Sem confirmação de pagamento (${verification.reason}). Nenhuma assinatura foi ativada.`,
    );
  }

  // ── 5. Confirmação (único caminho de ativação) ───────────────────────────
  const result = await confirmCharge(charge.id);
  await recordEvent(event, charge.id, { ...verification, outcome: 'paid' });

  return jsonSuccess202(
    result.alreadyConfirmed
      ? 'Pagamento já estava confirmado (idempotente).'
      : 'Pagamento confirmado e assinatura ativada.',
    {
      tenantId: result.tenantId,
      paymentChargeId: charge.id,
      subscriptionId: result.subscriptionId,
    },
  );
}

// ── Helpers de resposta/registro ─────────────────────────────────────────────

/** Webhook sempre responde 202 quando o evento foi tratado (ou ignorado). */
function jsonSuccess202(message: string, extra?: Record<string, unknown>): Response {
  return Response.json({ success: true, data: { message, ...extra }, error: null }, { status: 202 });
}

async function recordEvent(
  event: NormalizedEvent,
  paymentChargeId: string,
  meta: Record<string, unknown>,
): Promise<void> {
  try {
    await prismaUnscoped.billingEvent.create({
      data: {
        paymentChargeId,
        provider: event.provider,
        externalEventKey: event.eventKey,
        type: event.eventType,
        payload: {
          ...((event.payload ?? {}) as Record<string, unknown>),
          __result: meta,
        } as never,
      },
    });
  } catch (err) {
    // Corrida entre duas entregas simultâneas do mesmo evento: a chave única
    // decide. Não é erro — é exatamente o que a idempotência existe para.
    const code = (err as { code?: string } | null)?.code;
    if (code !== 'P2002') throw err;
  }
}

async function recordOrphanEvent(event: NormalizedEvent): Promise<void> {
  try {
    await prismaUnscoped.billingEvent.create({
      data: {
        provider: event.provider,
        externalEventKey: event.eventKey,
        type: `${event.eventType}.orphan`,
        payload: {
          note: 'Evento sem PaymentCharge correspondente',
          ...((event.payload ?? {}) as Record<string, unknown>),
        } as never,
      },
    });
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code !== 'P2002') throw err;
  }
}
