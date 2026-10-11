// src/server/whatsapp.ts — Cap. 20.2
// Integração WhatsApp Business API (Meta Cloud API)
import { createHmac } from 'node:crypto';
import { env } from './env';

const META_BASE = 'https://graph.facebook.com/v19.0';
const PHONE_NUMBER_ID = env.metaPhoneNumberId;
const ACCESS_TOKEN = env.metaAccessToken;

export interface WhatsAppMessageInput {
  to: string; // Número no formato 5511999999999
  type: 'text' | 'template' | 'image' | 'document';
  text?: { body: string };
  template?: { name: string; language: { code: string }; components?: any[] };
  image?: { link: string; caption?: string };
  document?: { link: string; filename: string };
}

export interface WhatsAppWebhookEvent {
  object: 'whatsapp_business_account';
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: 'whatsapp';
        metadata: { display_phone_number: string; phone_number_id: string };
        contacts?: Array<{ profile: { name: string }; wa_id: string }>;
        messages?: Array<{
          id: string;
          from: string;
          timestamp: string;
          type: 'text' | 'image' | 'document' | 'button' | 'interactive';
          text?: { body: string };
          image?: { id: string; mime_type: string; sha256: string; caption?: string };
          document?: { id: string; mime_type: string; sha256: string; filename: string };
          button?: { payload: string; text: string };
          interactive?: { type: 'button_reply' | 'list_reply'; button_reply?: { id: string; title: string }; list_reply?: { id: string; title: string; description: string } };
        }>;
        statuses?: Array<{
          id: string;
          status: 'sent' | 'delivered' | 'read' | 'failed';
          timestamp: string;
          recipient_id: string;
          conversation?: { id: string; expiration_timestamp: string; origin: { type: string } };
          pricing?: { billable: boolean; pricing_model: string; category: string };
          errors?: Array<{ code: string; title: string; details: string }>;
        }>;
      };
      field: 'messages';
    }>;
  }>;
}

/**
 * Envia mensagem WhatsApp via Meta Cloud API
 */
export async function sendWhatsAppMessage(input: WhatsAppMessageInput): Promise<{ id: string }> {
  if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) {
    throw new Error('WhatsApp não configurado: META_PHONE_NUMBER_ID e META_ACCESS_TOKEN obrigatórios');
  }

  const payload = {
    messaging_product: 'whatsapp',
    to: input.to,
    type: input.type,
    ...(input.type === 'text' && { text: input.text }),
    ...(input.type === 'template' && { template: input.template }),
    ...(input.type === 'image' && { image: input.image }),
    ...(input.type === 'document' && { document: input.document }),
  };

  const res = await fetch(`${META_BASE}/${PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`WhatsApp API error: ${data.error?.message ?? JSON.stringify(data)}`);
  }

  return { id: data.messages?.[0]?.id ?? data.id };
}

/**
 * Envia mensagem de texto simples
 */
export async function sendTextMessage(to: string, body: string): Promise<{ id: string }> {
  return sendWhatsAppMessage({ to, type: 'text', text: { body } });
}

/**
 * Envia template aprovado (para notificações transacionais)
 */
export async function sendTemplateMessage(to: string, templateName: string, languageCode: string, components?: any[]): Promise<{ id: string }> {
  return sendWhatsAppMessage({ to, type: 'template', template: { name: templateName, language: { code: languageCode }, components } });
}

/**
 * Verifica assinatura do webhook (Meta usa HMAC-SHA256)
 */
export function verifyWhatsAppSignature(payload: string, signature: string): boolean {
  const secret = env.metaWebhookSecret;
  if (!secret) return false;

  const expected = createHmac('sha256', secret).update(payload).digest('hex');
  const provided = signature.replace('sha256=', '');

  if (expected.length !== provided.length) return false;
  return require('node:crypto').timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

/**
 * Processa webhook de mensagens/status
 */
export async function processWhatsAppWebhook(event: WhatsAppWebhookEvent): Promise<void> {
  for (const entry of event.entry) {
    for (const change of entry.changes) {
      const value = change.value;

      // Mensagens recebidas
      if (value.messages) {
        for (const message of value.messages) {
          await handleIncomingMessage(message, value.metadata.phone_number_id);
        }
      }

      // Atualizações de status (sent/delivered/read/failed)
      if (value.statuses) {
        for (const status of value.statuses) {
          await handleStatusUpdate(status);
        }
      }
    }
  }
}

async function handleIncomingMessage(message: any, phoneNumberId: string): Promise<void> {
  const from = message.from; // número do remetente
  const text = message.text?.body?.toUpperCase().trim();

  // Opt-out (LGPD)
  if (['SAIR', 'PARAR', 'STOP', 'UNSUBSCRIBE', 'CANCELAR'].includes(text ?? '')) {
    await handleOptOut(from);
    return;
  }

  // Opt-in
  if (['SIM', 'YES', 'OK', 'CONFIRMO', 'AUTORIZO'].includes(text ?? '')) {
    await handleOptIn(from);
    return;
  }

  // Comandos de ajuda
  if (['AJUDA', 'HELP', 'MENU'].includes(text ?? '')) {
    await sendTextMessage(from, `*Filitech ERP*\n\nComandos disponíveis:\n• SAIR — para parar de receber mensagens\n• AJUDA — mostra este menu\n• SALDO — consulta saldo devedor\n• FATURA — envia fatura atual\n\nPara falar com suporte, responda "SUPORTE".`);
    return;
  }

  // Log para auditoria
  console.log(`[whatsapp] Mensagem de ${from}: ${message.text?.body}`);
}

async function handleStatusUpdate(status: any): Promise<void> {
  // Atualiza status de entrega no banco se houver mensagem correspondente
  console.log(`[whatsapp] Status update: ${status.id} -> ${status.status} para ${status.recipient_id}`);
}

async function handleOptOut(from: string): Promise<void> {
  const { prismaUnscoped } = await import('./db');
  
  await prismaUnscoped.client.updateMany({
    where: { phone: from },
    data: { whatsappOptOutAt: new Date() },
  });

  await sendTextMessage(from, 'Você foi descadastrado das notificações WhatsApp do Filitech ERP. Para reativar, responda "SIM".');
}

async function handleOptIn(from: string): Promise<void> {
  const { prismaUnscoped } = await import('./db');
  
  await prismaUnscoped.client.updateMany({
    where: { phone: from },
    data: { whatsappOptInAt: new Date(), whatsappOptOutAt: null },
  });

  await sendTextMessage(from, 'Você foi recadastrado nas notificações WhatsApp do Filitech ERP. Bem-vindo de volta!');
}

/**
 * Templates pré-aprovados para notificações transacionais
 */
export const WHATSAPP_TEMPLATES = {
  // Templates devem ser aprovados no Meta Business Manager
  payment_failed: 'payment_failed_template',
  invoice_ready: 'invoice_ready_template',
  appointment_reminder: 'appointment_reminder_template',
  work_order_approved: 'work_order_approved_template',
  stock_alert: 'stock_alert_template',
};

/**
 * Envia notificação transacional via template aprovado
 */
export async function sendTransactionalWhatsApp(
  to: string,
  templateKey: keyof typeof WHATSAPP_TEMPLATES,
  variables: Record<string, string>
): Promise<{ id: string }> {
  const templateName = WHATSAPP_TEMPLATES[templateKey];
  const components = Object.entries(variables).map(([key, value], index) => ({
    type: 'body',
    parameters: [{ type: 'text', text: value }],
  }));

  return sendTemplateMessage(to, templateName, 'pt_BR', components);
}