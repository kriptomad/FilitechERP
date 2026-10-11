// src/server/services/notifications.ts — Cap. 8.4.5
// Sistema centralizado de notificações (in-app, e-mail, push, WhatsApp)
import { prismaUnscoped } from '../db';
import { DomainError } from '../api-envelope';

export interface NotificationInput {
  recipientId: string; // tenantId ou userId
  category: string;
  title: string;
  body: string;
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  data?: Record<string, unknown>;
  actionUrl?: string;
  sourceType?: 'IN_APP' | 'EMAIL' | 'PUSH' | 'WHATSAPP' | 'SMS' | 'SYSTEM';
  sourceId?: string;
  expiresAt?: Date;
}

export interface NotificationPreferenceInput {
  userId: string;
  enabledChannels: ('IN_APP' | 'EMAIL' | 'PUSH' | 'WHATSAPP' | 'SMS')[];
  categoryPreferences: Record<string, { enabled: boolean; channels: string[] }>;
}

/**
 * Emite notificação multicanal — ponto único de emissão.
 * Reaproveita WhatsApp (Cap. 20.2), e-mail (Resend), push (FCM/APNs).
 */
export async function emitNotification(input: NotificationInput): Promise<string> {
  const { recipientId, category, title, body, priority = 'NORMAL', data, actionUrl, sourceType = 'SYSTEM', sourceId, expiresAt } = input;

  // 1. Cria notificação in-app (sempre)
  const notification = await prismaUnscoped.notification.create({
    data: {
      tenantId: recipientId,
      recipientId,
      category,
      title,
      body,
      priority,
      data: data as any,
      actionUrl,
      sourceType,
      sourceId,
      expiresAt,
    },
  });

  // 2. Verifica preferências do usuário para canais extras
  const prefs = await getUserPreferences(recipientId);
  const shouldSendEmail = prefs.enabledChannels.includes('EMAIL') && prefs.categoryPreferences[category]?.enabled !== false;
  const shouldSendWhatsApp = prefs.enabledChannels.includes('WHATSAPP') && prefs.categoryPreferences[category]?.enabled !== false;
  const shouldSendPush = prefs.enabledChannels.includes('PUSH') && prefs.categoryPreferences[category]?.enabled !== false;

  // 3. Envia canais assíncronos (não bloqueia)
  if (shouldSendEmail) {
    sendEmailNotification(recipientId, title, body, actionUrl).catch(console.error);
  }
  if (shouldSendWhatsApp) {
    sendWhatsAppNotification(recipientId, title, body).catch(console.error);
  }
  if (shouldSendPush) {
    sendPushNotification(recipientId, title, body, data).catch(console.error);
  }

  return notification.id;
}

async function getUserPreferences(userId: string): Promise<{
  enabledChannels: string[];
  categoryPreferences: Record<string, { enabled: boolean; channels: string[] }>;
}> {
  const pref = await prismaUnscoped.notificationPreference.findUnique({
    where: { userId },
  });

  if (!pref) {
    return {
      enabledChannels: ['IN_APP'],
      categoryPreferences: {},
    };
  }

  return {
    enabledChannels: pref.enabledChannels,
    categoryPreferences: pref.categoryPreferences as any,
  };
}

async function sendEmailNotification(recipientId: string, title: string, body: string, actionUrl?: string): Promise<void> {
  const { sendEmail } = await import('../email');
  const user = await prismaUnscoped.user.findFirst({ where: { id: recipientId }, select: { email: true, name: true } });
  if (!user?.email) return;

  await sendEmail({
    to: user.email,
    subject: `[Filitech] ${title}`,
    html: `
      <div style="font-family: system-ui; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #4F46E5;">${title}</h2>
        <p>${body}</p>
        ${actionUrl ? `<p><a href="${actionUrl}" style="background: #4F46E5; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block;">Ver no Filitech</a></p>` : ''}
        <hr style="margin: 24px 0; border-color: #E5E7EB;">
        <p style="font-size: 12px; color: #9CA3AF;">Você recebeu este e-mail porque tem notificações por e-mail ativadas para esta categoria.</p>
      </div>
    `,
  });
}

async function sendWhatsAppNotification(recipientId: string, title: string, body: string): Promise<void> {
  const { sendWhatsAppMessage } = await import('../whatsapp');
  const tenant = await prismaUnscoped.tenant.findUnique({ where: { id: recipientId }, select: { phone: true } });
  if (!tenant?.phone) return;

  await sendWhatsAppMessage({
    to: tenant.phone,
    message: `*${title}*\n${body}`,
  });
}

async function sendPushNotification(recipientId: string, title: string, body: string, data?: Record<string, unknown>): Promise<void> {
  // Integração com FCM/APNs
  // Busca tokens de dispositivo do usuário
  const devices = await prismaUnscoped.userDevice.findMany({
    where: { userId: recipientId, pushToken: { not: null } },
    select: { pushToken: true, platform: true },
  });

  for (const device of devices) {
    // Envia via Firebase Admin SDK ou similar
    console.log(`[push] Enviando para ${device.platform}: ${title}`);
  }
}

/**
 * Marca notificação como lida
 */
export async function markAsRead(notificationId: string, userId: string): Promise<void> {
  await prismaUnscoped.notification.update({
    where: { id: notificationId, recipientId: userId },
    data: { readAt: new Date(), status: 'READ' },
  });
}

/**
 * Marca todas como lidas
 */
export async function markAllAsRead(userId: string): Promise<number> {
  const result = await prismaUnscoped.notification.updateMany({
    where: { recipientId: userId, readAt: null },
    data: { readAt: new Date(), status: 'READ' },
  });
  return result.count;
}

/**
 * Lista notificações do usuário
 */
export async function listNotifications(userId: string, options?: {
  unreadOnly?: boolean;
  category?: string;
  limit?: number;
  offset?: number;
}): Promise<{ notifications: any[]; total: number; unreadCount: number }> {
  const where: any = { recipientId: userId };
  if (options?.unreadOnly) where.readAt = null;
  if (options?.category) where.category = options.category;

  const [notifications, total, unreadCount] = await Promise.all([
    prismaUnscoped.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: options?.limit ?? 50,
      skip: options?.offset ?? 0,
    }),
    prismaUnscoped.notification.count({ where }),
    prismaUnscoped.notification.count({ where: { recipientId: userId, readAt: null } }),
  ]);

  return { notifications, total, unreadCount };
}

/**
 * Atualiza preferências de notificação
 */
export async function updatePreferences(input: NotificationPreferenceInput): Promise<void> {
  await prismaUnscoped.notificationPreference.upsert({
    where: { userId: input.userId },
    create: {
      userId: input.userId,
      enabledChannels: input.enabledChannels,
      categoryPreferences: input.categoryPreferences as any,
    },
    update: {
      enabledChannels: input.enabledChannels,
      categoryPreferences: input.categoryPreferences as any,
    },
  });
}

/**
 * Templates de notificação pré-definidos
 */
export const NOTIFICATION_TEMPLATES: Record<string, { title: string; body: string; priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT' }> = {
  personal_budget_exceeded: { title: 'Orçamento excedido', body: 'O orçamento da categoria "{{category}}" foi excedido em {{percentage}}%.', priority: 'HIGH' },
  personal_budget_warning_80: { title: 'Orçamento próximo do limite', body: 'O orçamento da categoria "{{category}}" atingiu {{percentage}}% do limite.', priority: 'NORMAL' },
  personal_bill_reminder: { title: 'Conta a vencer', body: '"{{description}}" vence em {{dueDate}} — R$ {{amount}}', priority: 'NORMAL' },
  personal_bill_overdue: { title: 'Conta vencida', body: '"{{description}}" venceu em {{dueDate}} — R$ {{amount}}', priority: 'HIGH' },
  carne_leao_due: { title: 'Carnê-Leão a pagar', body: 'Pagamento do Carnê-Leão vence em {{dueDate}}. Valor estimado: R$ {{amount}}', priority: 'HIGH' },
  work_order_approved: { title: 'Ordem de serviço aprovada', body: 'A OS #{{osNumber}} foi aprovada pelo cliente.', priority: 'NORMAL' },
  payment_failed: { title: 'Pagamento falhou', body: 'O pagamento de R$ {{amount}} não pôde ser processado. Verifique seu cartão.', priority: 'URGENT' },
  stock_low: { title: 'Estoque baixo', body: '{{productName}} abaixo do mínimo. Sugerido: {{suggestedQty}} {{unit}}.', priority: 'NORMAL' },
  cash_flow_alert: { title: 'Alerta de fluxo de caixa', body: 'Saldo projetado para {{date}} é negativo: R$ {{amount}}', priority: 'HIGH' },
  accounting_task_reminder: { title: 'Tarefa contábil pendente', body: '{{taskType}} para {{clientName}} vence em {{dueDate}}', priority: 'NORMAL' },
  fiscal_document_rejected: { title: 'Documento fiscal rejeitado', body: 'A {{documentType}} #{{number}} foi rejeitada: {{reason}}', priority: 'URGENT' },
  referral_converted: { title: 'Indicação convertida!', body: 'Sua indicação virou assinante! 1 mês de crédito aplicado.', priority: 'NORMAL' },
};

/**
 * Emite notificação a partir de template
 */
export async function emitFromTemplate(
  templateKey: string,
  recipientId: string,
  variables: Record<string, string>,
  extra?: Partial<NotificationInput>
): Promise<string> {
  const template = NOTIFICATION_TEMPLATES[templateKey];
  if (!template) throw new DomainError('TEMPLATE_NOT_FOUND', `Template "${templateKey}" não encontrado.`);

  let body = template.body;
  for (const [key, value] of Object.entries(variables)) {
    body = body.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }

  return emitNotification({
    recipientId,
    category: templateKey,
    title: template.title,
    body,
    priority: template.priority,
    ...extra,
  });
}