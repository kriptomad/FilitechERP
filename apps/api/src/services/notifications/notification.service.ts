// src/services/notifications/notification.service.ts — Sistema central de notificações multi-canal
import { prisma, prismaUnscoped } from "../../lib/prisma.js";
import { whatsappQueue } from "../../infra/queues/index.js";
import { logger } from "../../lib/logger.js";

export interface NotificationInput {
  tenantId: string;
  recipientId: string; // userId ou tenantId
  category: string;
  title: string;
  body: string;
  priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  channels?: ("IN_APP" | "EMAIL" | "PUSH" | "WHATSAPP" | "SMS")[];
  data?: Record<string, unknown>;
  actionUrl?: string;
  expiresAt?: Date;
}

export interface SendNotificationResult {
  inApp?: boolean;
  email?: boolean;
  push?: boolean;
  whatsapp?: boolean;
  sms?: boolean;
}

export async function emitNotification(input: NotificationInput): Promise<SendNotificationResult> {
  const result: SendNotificationResult = {};

  // 1. Sempre cria notificação in-app
  const notification = await prismaUnscoped.notification.create({
    data: {
      tenantId: input.tenantId,
      recipientId: input.recipientId,
      category: input.category,
      title: input.title,
      body: input.body,
      priority: input.priority ?? "NORMAL",
      data: input.data as any,
      actionUrl: input.actionUrl,
      expiresAt: input.expiresAt,
    },
  });
  result.inApp = true;

  // 2. Resolve preferências do destinatário
  const prefs = await getNotificationPreferences(input.recipientId);
  const channels = input.channels ?? prefs.enabledChannels ?? ["IN_APP"];

  // 3. Dispara canais assíncronos via filas
  if (channels.includes("WHATSAPP") && prefs.whatsappOptIn) {
    await enqueueWhatsApp(input, notification.id);
    result.whatsapp = true;
  }
  if (channels.includes("EMAIL") && prefs.emailOptIn) {
    await enqueueEmail(input, notification.id);
    result.email = true;
  }
  if (channels.includes("PUSH") && prefs.pushTokens.length > 0) {
    await enqueuePush(input, notification.id, prefs.pushTokens);
    result.push = true;
  }
  if (channels.includes("SMS") && prefs.smsOptIn) {
    await enqueueSms(input, notification.id);
    result.sms = true;
  }

  return result;
}

async function getNotificationPreferences(recipientId: string) {
  const prefs = await prismaUnscoped.notificationPreference.findUnique({ where: { userId: recipientId } });
  const pushTokens = await prismaUnscoped.pushDeviceToken.findMany({ where: { userId: recipientId, active: true } });
  return {
    enabledChannels: prefs?.enabledChannels ?? ["IN_APP"],
    whatsappOptIn: prefs?.whatsappOptIn ?? false,
    emailOptIn: prefs?.emailOptIn ?? true,
    pushTokens: pushTokens.map((t) => t.token),
    smsOptIn: prefs?.smsOptIn ?? false,
  };
}

async function enqueueWhatsApp(input: NotificationInput, notificationId: string) {
  const user = await prismaUnscoped.user.findUnique({ where: { id: input.recipientId }, select: { phone: true } });
  if (!user?.phone) return;

  await whatsappQueue.add(
    "notification",
    {
      tenantId: input.tenantId,
      to: user.phone,
      template: "notification",
      payload: { title: input.title, body: input.body, notificationId },
    },
    { removeOnComplete: 100 },
  );
}

async function enqueueEmail(input: NotificationInput, notificationId: string) {
  // Implementar integração com Resend/SES
  logger.debug({ notificationId }, "email_queued");
}

async function enqueuePush(input: NotificationInput, notificationId: string, tokens: string[]) {
  // Implementar integração com Expo/FCM
  logger.debug({ notificationId, tokens: tokens.length }, "push_queued");
}

async function enqueueSms(input: NotificationInput, notificationId: string) {
  // Implementar integração com provedor SMS
  logger.debug({ notificationId }, "sms_queued");
}

export async function markAsRead(notificationId: string, userId: string) {
  await prismaUnscoped.notification.update({
    where: { id: notificationId, recipientId: userId },
    data: { readAt: new Date() },
  });
}

export async function markAllAsRead(userId: string) {
  await prismaUnscoped.notification.updateMany({
    where: { recipientId: userId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function getUnreadCount(userId: string): Promise<number> {
  return prismaUnscoped.notification.count({ where: { recipientId: userId, readAt: null } });
}