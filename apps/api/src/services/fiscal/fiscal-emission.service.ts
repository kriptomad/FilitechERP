// src/services/fiscal/fiscal-emission.service.ts — Cap. 10.2 (contingência NFC-e)
import { prisma } from "../../lib/prisma.js";
import { sefazCircuitBreaker, CircuitOpenError } from "../../lib/circuit-breaker.js";
import { logger } from "../../lib/logger.js";
import { fiscalQueue } from "../../infra/queues/index.js";
import type { FiscalEmissionJobData } from "../../infra/queues/index.js";

export class FiscalEmissionError extends Error {}

interface EmitNfceInput {
  tenantId: string;
  saleId: string;
  /** Número reservado localmente para modo contingência. */
  contingencyNumber?: number;
}

/**
 * Emissão de NFC-e com circuit breaker (Cap. 10.2):
 * - SEFAZ disponível → autoriza online.
 * - Circuito ABERTO → modo de contingência OFFLINE: cupom emitido localmente
 *   com numeração reservada e enfileirado para reenvio quando o circuito fechar.
 * O PDV nunca trava por indisponibilidade externa (mesma filosofia do Cap. 8).
 */
export async function emitNfce(input: EmitNfceInput) {
  try {
    const authorization = await sefazCircuitBreaker.execute(() =>
      callSefaz(input),
    );

    await prisma.fiscalDocument.create({
      data: {
        tenantId: input.tenantId,
        saleId: input.saleId,
        type: "NFCE",
        status: "AUTHORIZED",
        accessKey: authorization.accessKey,
      },
    });

    return { mode: "ONLINE" as const, accessKey: authorization.accessKey };
  } catch (error) {
    if (error instanceof CircuitOpenError) {
      return emitContingencyOffline(input);
    }
    logger.error({ err: error, saleId: input.saleId }, "sefaz_error");
    throw error;
  }
}

async function emitContingencyOffline(input: EmitNfceInput) {
  const contingencyNumber =
    input.contingencyNumber ?? Date.now() % 1_000_000_000;

  // Documento criado como PENDING com numeração reservada — reenviado depois.
  const doc = await prisma.fiscalDocument.create({
    data: {
      tenantId: input.tenantId,
      saleId: input.saleId,
      type: "NFCE",
      status: "PENDING",
      rejectionReason: null,
    },
  });

  // Fila de reprocessamento: tenta novamente quando o circuito fechar.
  const jobData: FiscalEmissionJobData = {
    tenantId: input.tenantId,
    saleId: input.saleId,
    isContingencyRetry: true,
  };
  await fiscalQueue.add("retry-contingency", jobData, {
    delay: 35_000, // > openStateDurationMs do breaker (30s)
    attempts: 5,
    backoff: { type: "exponential", delay: 30_000 },
    removeOnComplete: 100,
  });

  logger.warn(
    { saleId: input.saleId, contingencyNumber, fiscalDocumentId: doc.id },
    "nfc-e_contingency_offline",
  );

  return { mode: "CONTINGENCY_OFFLINE" as const, contingencyNumber };
}

/** Stub da chamada real à SEFAZ (SOAP/REST autorizado). */
async function callSefaz(input: EmitNfceInput): Promise<{ accessKey: string }> {
  // Integração real: certificate A1 + autorização NF-e 4.0.
  // Lança em caso de timeout/rejeição para acionar o breaker.
  void input;
  const randomKey = Array.from({ length: 44 }, () =>
    Math.floor(Math.random() * 10),
  ).join("");
  return { accessKey: randomKey };
}
