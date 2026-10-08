// src/infra/queues/index.ts — Cap. 3.4 — filas BullMQ sobre Redis
import { Queue } from "bullmq";
import { redis } from "../../lib/redis.js";

const connection = redis;

/** Filas definidas no Cap. 3.4. */
export const whatsappQueue = new Queue("whatsapp-notifications", { connection });
export const fiscalQueue = new Queue("fiscal-emission", { connection });
export const nfeIngestionQueue = new Queue("nfe-xml-ingestion", { connection });
export const reportQueue = new Queue("report-generation", { connection });
export const billingQueue = new Queue("suspend-overdue-tenants", { connection });

export interface WhatsAppJobData {
  tenantId: string;
  to: string;
  template: "budget-approval" | "os-ready" | "vaccine-reminder" | "payment-reminder";
  payload: Record<string, unknown>;
}

export interface FiscalEmissionJobData {
  tenantId: string;
  saleId: string;
  /** Habilita tentativa de reenvio pós-contingência. */
  isContingencyRetry?: boolean;
}

export interface SuspendOverdueJobData {
  /** Vazio = varredura global (executada com prismaUnscoped). */
  scope?: "global";
}
