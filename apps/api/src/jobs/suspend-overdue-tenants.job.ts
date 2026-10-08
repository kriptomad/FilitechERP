// src/jobs/suspend-overdue-tenants.job.ts — Cap. 3.4 (fila suspend-overdue-tenants)
import { prismaUnscoped } from "../lib/prisma.js";
import { redis } from "../lib/redis.js";
import { logger } from "../lib/logger.js";

/**
 * Job agendado (cron diário): suspende tenants PAST_DUE além da carência
 * e aplica o Tenant Lockout — o gatekeeper (Cap. 6.1) passa a responder 402
 * para qualquer requisição destes tenants.
 */
export async function suspendOverdueTenants() {
  const now = new Date();

  const overdue = await prismaUnscoped.tenant.findMany({
    where: {
      status: "PAST_DUE",
      gracePeriodEndsAt: { lt: now },
    },
    select: { id: true, slug: true },
  });

  let suspended = 0;
  for (const tenant of overdue) {
    await prismaUnscoped.tenant.update({
      where: { id: tenant.id },
      data: { status: "SUSPENDED" },
    });

    // Invalida cache de módulos — liberação/bloqueio imediato (Cap. 6.1).
    await redis.del(`tenant:${tenant.id}:modules`);
    suspended++;
  }

  // Também reativa tenants que regularizaram (PAST_DUE → ACTIVE via webhook já ocorre,
  // mas garantimos consistência caso o pagamento tenha sido confirmado fora do fluxo).
  const restored = await prismaUnscoped.tenant.updateMany({
    where: { status: "PAST_DUE", gracePeriodEndsAt: null },
    data: { status: "ACTIVE" },
  });

  logger.info(
    { job: "suspend-overdue-tenants", suspended, restored: restored.count },
    "suspend_overdue_completed",
  );

  return { suspended, restored: restored.count };
}

/** Registro da fila (BullMQ worker). */
export function registerSuspendOverdueWorker() {
  // Em produção: new Worker("suspend-overdue-tenants", job => suspendOverdueTenants(), { connection })
  // Agendamento: repeat { pattern: "0 3 * * *" } (Cap. 10.3 — workers isolados da API).
  return { name: "suspend-overdue-tenants", handler: suspendOverdueTenants };
}
