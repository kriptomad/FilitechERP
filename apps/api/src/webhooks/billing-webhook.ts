// src/webhooks/billing-webhook.ts — Cap. 2.6/9.3 (eventos de pagamento Asaas/Stripe)
import { Router, Request, Response } from "express";
import { prismaUnscoped } from "../lib/prisma.js";
import { apiSuccess, apiError } from "../types/api-envelope.js";
import { logger } from "../lib/logger.js";
import { redis } from "../lib/redis.js";

export const billingWebhookRouter = Router();

/**
 * Webhook de billing (Cap. 2.6/9.3): recebe eventos de pagamento do gateway
 * (Asaas/Stripe) e atualiza o ciclo de vida da assinatura:
 *   - payment.succeeded → assinatura ACTIVE, tenant ACTIVE, invalida cache
 *   - payment.failed / subscription.past_due → assinatura PAST_DUE, tenant PAST_DUE
 *   - subscription.cancelled → assinatura CANCELLED, tenant CANCELLED
 *
 * Autenticação: header `x-webhook-token` validado contra BILLING_WEBHOOK_SECRET.
 */
billingWebhookRouter.post(
  "/webhooks/billing",
  async (req: Request, res: Response) => {
    const token = req.headers["x-webhook-token"];
    if (!process.env.BILLING_WEBHOOK_SECRET) {
      return res.status(500).json(apiError("BILLING_NOT_CONFIGURED", "Segredo do webhook não configurado."));
    }
    if (token !== process.env.BILLING_WEBHOOK_SECRET) {
      return res.status(401).json(apiError("INVALID_SIGNATURE", "Assinatura inválida."));
    }

    const event = req.body;
    const externalSubscriptionId: string | undefined = event?.subscription ?? event?.data?.subscription;
    const eventType: string | undefined = event?.event ?? event?.type;

    if (!externalSubscriptionId || !eventType) {
      return res.status(400).json(apiError("INVALID_PAYLOAD", "subscription e event são obrigatórios."));
    }

    // Idempotência: mesmo externalEventKey não processa duas vezes.
    const externalEventKey = `${eventType}_${externalSubscriptionId}_${event?.id ?? Date.now()}`;
    const existing = await prismaUnscoped.billingEvent.findUnique({
      where: { provider_externalEventKey: { provider: "asaas", externalEventKey } },
    });
    if (existing) {
      return res.json(apiSuccess({ processed: false, reason: "duplicate", eventId: existing.id }));
    }

    const subscription = await prismaUnscoped.subscription.findFirst({
      where: { externalSubscriptionId },
      include: { tenant: true },
    });
    if (!subscription) {
      // 200 para evitar reentrega infinita em subscription desconhecida.
      return res.json(apiSuccess({ processed: false, reason: "unknown_subscription" }));
    }

    try {
      switch (eventType) {
        case "payment.succeeded":
        case "PAYMENT_CONFIRMED": {
          await prismaUnscoped.$transaction(async (tx) => {
            await tx.subscription.update({
              where: { id: subscription.id },
              data: { status: "ACTIVE", pastDueSince: null },
            });
            await tx.tenant.update({
              where: { id: subscription.tenantId },
              data: { status: "ACTIVE" },
            });
            await tx.billingEvent.create({
              data: {
                subscriptionId: subscription.id,
                provider: "asaas",
                externalEventKey,
                type: "payment.succeeded",
                payload: event,
              },
            });
          });
          await redis.del(`tenant:${subscription.tenantId}:modules`);
          logger.info({ subscriptionId: subscription.id, tenantId: subscription.tenantId }, "billing_payment_succeeded");
          return res.json(apiSuccess({ processed: true, status: "ACTIVE" }));
        }

        case "payment.failed":
        case "subscription.past_due":
        case "PAST_DUE": {
          await prismaUnscoped.$transaction(async (tx) => {
            await tx.subscription.update({
              where: { id: subscription.id },
              data: { status: "PAST_DUE", pastDueSince: subscription.pastDueSince ?? new Date() },
            });
            await tx.tenant.update({
              where: { id: subscription.tenantId },
              data: { status: "PAST_DUE", gracePeriodEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
            });
            await tx.billingEvent.create({
              data: {
                subscriptionId: subscription.id,
                provider: "asaas",
                externalEventKey,
                type: "subscription.past_due",
                payload: event,
              },
            });
          });
          await redis.del(`tenant:${subscription.tenantId}:modules`);
          logger.info({ subscriptionId: subscription.id, tenantId: subscription.tenantId }, "billing_past_due");
          return res.json(apiSuccess({ processed: true, status: "PAST_DUE" }));
        }

        case "subscription.cancelled":
        case "CANCELLED": {
          await prismaUnscoped.$transaction(async (tx) => {
            await tx.subscription.update({
              where: { id: subscription.id },
              data: { status: "CANCELLED" },
            });
            await tx.tenant.update({
              where: { id: subscription.tenantId },
              data: { status: "CANCELLED" },
            });
            await tx.billingEvent.create({
              data: {
                subscriptionId: subscription.id,
                provider: "asaas",
                externalEventKey,
                type: "subscription.cancelled",
                payload: event,
              },
            });
          });
          await redis.del(`tenant:${subscription.tenantId}:modules`);
          logger.info({ subscriptionId: subscription.id, tenantId: subscription.tenantId }, "billing_cancelled");
          return res.json(apiSuccess({ processed: true, status: "CANCELLED" }));
        }

        default:
          return res.json(apiSuccess({ processed: false, reason: "unhandled_event", eventType }));
      }
    } catch (err) {
      logger.error({ err, externalEventKey }, "billing_webhook_error");
      return res.status(500).json(apiError("INTERNAL_ERROR", "Erro ao processar evento de billing."));
    }
  },
);
