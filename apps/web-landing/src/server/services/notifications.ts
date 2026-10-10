// src/server/services/notifications.ts — Cap. 8.4.5 / 14.3
//
// Notificações multi-canal do tenant.
//
// Portado do `apps/api` (BullMQ + filas), com uma diferença de plataforma: na
// Vercel não há processo de worker para consumir fila. O canal IN_APP é
// gravado de forma síncrona (é a fonte de verdade da tela de sino), e os
// canais externos são disparados "fire-and-forget" com fetch — a falha de um
// provedor externo nunca derruba a ação do usuário.
//
// E-mail real: quando `RESEND_API_KEY` está presente, a mensagem é enviada de
// verdade. Sem a chave, o e-mail é registrado no log do servidor (estado
// explícito, não "fingimos que enviamos").
import { prismaUnscoped } from '../db';
import { env } from '../env';

export type NotificationPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type NotificationChannel = 'IN_APP' | 'EMAIL' | 'PUSH' | 'WHATSAPP' | 'SMS';

export interface NotificationInput {
  tenantId: string;
  /** userId dono da notificação. */
  recipientId: string;
  category: string;
  title: string;
  body: string;
  priority?: NotificationPriority;
  channels?: NotificationChannel[];
  data?: Record<string, unknown>;
  actionUrl?: string;
  expiresAt?: Date;
  /** Corpo do e-mail (HTML simples). Se ausente, usa `body`. */
  emailHtml?: string;
}

export interface EmitResult {
  notificationId: string;
  inApp: boolean;
  email: 'sent' | 'skipped' | 'failed';
}

/**
 * Cria a notificação in-app e dispara os canais externos.
 *
 * A gravação in-app é awaited porque é o que a UI lê; os canais externos não
 * são bloqueantes (provedor fora do ar não pode travar o fluxo do usuário).
 */
export async function emitNotification(input: NotificationInput): Promise<EmitResult> {
  const notification = await prismaUnscoped.notification.create({
    data: {
      tenantId: input.tenantId,
      recipientId: input.recipientId,
      category: input.category,
      title: input.title,
      body: input.body,
      priority: input.priority ?? 'NORMAL',
      data: (input.data ?? {}) as never,
      actionUrl: input.actionUrl ?? null,
      expiresAt: input.expiresAt ?? null,
    },
  });

  const channels = input.channels ?? ['IN_APP'];
  let email: EmitResult['email'] = 'skipped';

  if (channels.includes('EMAIL')) {
    email = await sendEmail(input).catch((err) => {
      console.error('[notifications] falha ao enviar e-mail:', err);
      return 'failed' as const;
    });
  }

  return { notificationId: notification.id, inApp: true, email };
}

/**
 * Envio de e-mail via Resend (HTTP, sem SDK — mantém a function enxuta).
 * Retorna o estado REAL: não há "enviado" sem resposta 2xx do provedor.
 */
async function sendEmail(input: NotificationInput): Promise<'sent' | 'skipped'> {
  if (!env.resendApiKey) {
    // Estado explícito: sem chave, nada é enviado. Log para o operador ver no
    // painel de logs da Vercel — diferente de "devolveu sucesso" sem entregar.
    console.warn(
      `[notifications] RESEND_API_KEY ausente — e-mail "${input.title}" NÃO enviado (tenant ${input.tenantId}).`,
    );
    return 'skipped';
  }

  const recipient = await prismaUnscoped.user.findUnique({
    where: { id: input.recipientId },
    select: { email: true, name: true },
  });
  if (!recipient) return 'skipped';

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? 'Filitech ERP <no-reply@filitecherp.com>',
      to: [recipient.email],
      subject: input.title,
      text: input.body,
      html:
        input.emailHtml ??
        `<div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.6">
           <h2 style="margin:0 0 12px">${escapeHtml(input.title)}</h2>
           <p style="margin:0 0 12px">${escapeHtml(input.body)}</p>
           ${input.actionUrl ? `<p><a href="${escapeHtml(input.actionUrl)}">${escapeHtml(input.actionUrl)}</a></p>` : ''}
         </div>`,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Resend HTTP ${res.status}: ${detail.slice(0, 300)}`);
  }

  return 'sent';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function markAsRead(notificationId: string, userId: string): Promise<boolean> {
  const result = await prismaUnscoped.notification.updateMany({
    where: { id: notificationId, recipientId: userId },
    data: { readAt: new Date() },
  });
  return result.count > 0;
}

export async function markAllAsRead(userId: string): Promise<number> {
  const result = await prismaUnscoped.notification.updateMany({
    where: { recipientId: userId, readAt: null },
    data: { readAt: new Date() },
  });
  return result.count;
}

export async function getUnreadCount(userId: string): Promise<number> {
  return prismaUnscoped.notification.count({ where: { recipientId: userId, readAt: null } });
}
