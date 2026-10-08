// src/jobs/whatsapp-budget-approval.job.ts — Cap. 4.2 (aprovação via WhatsApp)
import { whatsappQueue, WhatsAppJobData } from "../infra/queues/index.js";
import { whatsappCircuitBreaker } from "../lib/circuit-breaker.js";
import { logger } from "../lib/logger.js";
import { prismaUnscoped } from "../lib/prisma.js";

/**
 * Envia o link de aprovação do orçamento por WhatsApp (Cap. 4.2):
 * link único assinado (JWT de uso único, expiração 72h) → página pública →
 * "Aprovar" dispara `POST /api/work-orders/approve` (Cap. 6.4).
 */
export async function sendBudgetApprovalMessage(data: {
  tenantId: string;
  workOrderId: string;
  clientPhone: string;
  approvalUrl: string;
  budgetValidUntil: Date;
}) {
  const job: WhatsAppJobData = {
    tenantId: data.tenantId,
    to: data.clientPhone,
    template: "budget-approval",
    payload: {
      approvalUrl: data.approvalUrl,
      validUntil: data.budgetValidUntil.toISOString(),
      workOrderId: data.workOrderId,
    },
  };

  // Circuit breaker (Cap. 10.2): rate-limiting da API não derruba a fila.
  try {
    await whatsappCircuitBreaker.execute(() => deliverWhatsApp(job));
    logger.info({ workOrderId: data.workOrderId }, "budget_approval_sent");
    return { sent: true as const };
  } catch (error) {
    // Enfileira para reenvio quando o circuito fechar.
    await whatsappQueue.add("budget-approval-retry", job, {
      delay: 65_000,
      attempts: 5,
      backoff: { type: "exponential", delay: 60_000 },
      removeOnComplete: 100,
    });
    logger.warn(
      { workOrderId: data.workOrderId, err: error },
      "budget_approval_queued",
    );
    return { sent: false as const, queued: true };
  }
}

async function deliverWhatsApp(job: WhatsAppJobData): Promise<void> {
  // Integração real: Meta WhatsApp Cloud API.
  const res = await fetch(
    `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: job.to,
        type: "template",
        template: {
          name: "budget_approval",
          language: { code: "pt_BR" },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: String(job.payload.approvalUrl) },
              ],
            },
          ],
        },
      }),
    },
  );

  if (!res.ok) {
    throw new Error(`WhatsApp API ${res.status}: ${await res.text()}`);
  }
}

/** Registra o worker dedicado da fila (Cap. 3.4 — isolado da API). */
export function registerWhatsAppWorker() {
  return {
    name: "whatsapp-notifications",
    handler: async (job?: { data: WhatsAppJobData }) => {
      if (!job?.data) return { skipped: true };
      await deliverWhatsApp(job.data);
      return { sent: true };
    },
  };
}

/** Lookup do telefone do cliente vinculado à O.S. */
export async function getClientPhoneForWorkOrder(workOrderId: string) {
  const wo = await prismaUnscoped.workOrder.findUnique({
    where: { id: workOrderId },
    include: { client: { select: { phone: true } } },
  });
  return wo?.client.phone ?? null;
}
