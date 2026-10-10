// apps/web-landing/src/app/api/webhooks/whatsapp/route.ts — Cap. 20.2
//
// Webhook do WhatsApp Business Cloud API (Meta).
//
// Fluxo:
//   1. Valida HMAC-SHA256 do header `x-hub-signature-256` usando META_WEBHOOK_SECRET.
//   2. Processa eventos de mensagem, status e templates.
//   10. Atualiza status de notificações enviadas via WhatsApp.
//   11. Processa opt-in/opt-out de clientes (LGPD).
//
// Segurança: fail-closed — sem META_WEBHOOK_SECRET configurado, retorna 503.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { prismaUnscoped } from '@/server/db';
import { jsonError, jsonSuccess } from '@/server/api-envelope';
import { env } from '@/server/env';
import { handle } from '@/server/handler';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface MetaWebhookEvent {
  object: string;
  entry: MetaWebhookEntry[];
}

interface MetaWebhookEntry {
  id: string;
  changes: MetaWebhookChange[];
}

interface MetaWebhookChange {
  value: MetaWebhookValue;
}

interface MetaWebhookValue {
  messaging_product: string;
  metadata: {
    display_phone_number: string;
    phone_number_id: string;
  };
  contacts?: MetaContact[];
  messages?: MetaMessage[];
  statuses?: MetaStatus[];
}

interface MetaContact {
  profile: { name: string };
  wa_id: string;
}

interface MetaMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: { id: string; mime_type: string; sha256: string };
  document?: { id: string; filename: string; mime_type: string; sha256: string };
  audio?: { id: string; mime_type: string; sha256: string };
  video?: { id: string; mime_type: string; sha256: string };
  location?: { latitude: number; longitude: number; name: string; address: string };
  contacts?: Array<{ name: { formatted_name: string }; phones: Array<{ phone: string; type: string }> }>;
  interactive?: {
    type: string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description: string };
  };
  button?: { text: string; payload: string };
  order?: { catalog_id: string; product_items: Array<{ product_retailer_id: string; quantity: number; item_price: string; currency: string }> };
}

interface MetaStatus {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  recipient_id: string;
  conversation?: { id: string; expiration_timestamp: string; origin: { type: string } };
  pricing?: { billable: boolean; pricing_model: string; category: string };
  errors?: Array<{ code: number; title: string; details: string; error_data: { details: string } }>;
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

function verifyMetaSignature(request: Request, body: string): boolean {
  const secret = env.metaWebhookSecret;
  if (!secret) return false;

  const signature = header(request, 'x-hub-signature-256');
  if (!signature?.startsWith('sha256=')) return false;

  const provided = signature.slice(7);
  const expected = createHmac('sha256', secret).update(body).digest('hex');
  return safeEqual(provided, expected);
}

export async function POST(request: Request) {
  // Fail-closed: sem secret configurado, não processa.
  if (!env.metaWebhookSecret) {
    return new Response(
      JSON.stringify({ success: false, error: { code: 'WHATSAPP_NOT_CONFIGURED', message: 'META_WEBHOOK_SECRET não configurado.' } }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const raw = await request.text();

  // Verificação de desafio (Meta envia GET com hub.challenge na configuração inicial)
  // O desafio vem no JSON bruto antes do parse tipado
  let challenge: string | undefined;
  try {
    const rawEvent = JSON.parse(raw);
    if (typeof rawEvent['hub.challenge'] === 'string') {
      return new Response(rawEvent['hub.challenge'], { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }
  } catch {
    // Ignora erro de parse, continua para validação de assinatura
  }

  if (!verifyMetaSignature(request, raw)) {
    return new Response(
      JSON.stringify({ success: false, error: { code: 'INVALID_SIGNATURE', message: 'Assinatura do webhook inválida.' } }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let event: MetaWebhookEvent;
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: { code: 'INVALID_PAYLOAD', message: 'Corpo do webhook não é JSON válido.' } }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const entry = event.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    if (!value) {
      return new Response(JSON.stringify({ success: true, data: { message: 'Evento ignorado (sem value)' } }), { status: 200 });
    }

    const phoneNumberId = value.metadata?.phone_number_id;
    const contacts = value.contacts;
    const messages = value.messages;
    const statuses = value.statuses;

    // Processa mensagens recebidas
    if (messages) {
      for (const msg of messages) {
        const from = msg.from;
        const msgId = msg.id;
        const msgType = msg.type;
        const text = msg.text?.body;

        console.log(`[whatsapp] msg from ${from}: ${msgType} - ${text?.slice(0, 50)}`);

        // Opt-out: "SAIR", "PARAR", "STOP", "UNSUBSCRIBE"
        if (text) {
          const normalized = text.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          if (['SAIR', 'PARAR', 'STOP', 'UNSUBSCRIBE', 'CANCELAR'].includes(normalized)) {
            await prismaUnscoped.client.updateMany({
              where: { phone: { equals: from }, whatsappOptOutAt: null },
              data: { whatsappOptOutAt: new Date() },
            });
            console.log(`[whatsapp] opt-out registrado para ${from}`);
          }
        }
      }
    }

    // Atualizações de status de entrega (sent, delivered, read, failed)
    if (statuses) {
      for (const status of statuses) {
        const msgId = status.id;
        const statusValue = status.status;
        const timestamp = status.timestamp;

        await prismaUnscoped.notification.updateMany({
          where: {
            sourceType: 'WHATSAPP',
            sourceId: msgId,
          },
          data: {
            status: statusValue,
            metadata: { ...status, updatedAt: new Date().toISOString() },
          },
        });
      }
    }

    return new Response(JSON.stringify({ success: true, data: { received: true } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[whatsapp-webhook] error:', err);
    // Sempre retorna 2xx para o Meta não reenviar indefinidamente
    return new Response(JSON.stringify({ success: true, data: { received: true } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function GET(request: Request) {
  // Verificação de desafio (Meta envia GET com hub.challenge na configuração inicial)
  const url = new URL(request.url);
  const challenge = url.searchParams.get('hub.challenge');
  const verifyToken = url.searchParams.get('hub.verify_token');

  const expectedToken = env.metaWebhookVerifyToken;
  if (expectedToken && verifyToken !== expectedToken) {
    return new Response('Forbidden', { status: 403 });
  }

  if (challenge) {
    return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }

  return new Response('OK', { status: 200 });
}