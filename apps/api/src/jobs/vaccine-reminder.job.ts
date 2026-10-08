// src/jobs/vaccine-reminder.job.ts — Cap. 11.3 (revacinação Petshop)
import { prismaUnscoped } from "../lib/prisma.js";
import { whatsappQueue } from "../infra/queues/index.js";
import { logger } from "../lib/logger.js";

/**
 * Lembrete automático de revacinação (Cap. 11.3): varre `VaccineRecord`
 * com `nextDoseDueAt` nos próximos N dias e enfileira lembrete por WhatsApp/SMS.
 * Diferencial competitivo citado (VetSoft, ZettaPet, Vet Control).
 */
export async function sendVaccineReminders(daysAhead = 7) {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

  const dueRecords = await prismaUnscoped.vaccineRecord.findMany({
    where: {
      nextDoseDueAt: { gte: now, lte: windowEnd },
    },
    include: {
      pet: {
        include: {
          owner: { select: { id: true, name: true, phone: true } },
        },
      },
    },
  });

  let queued = 0;
  for (const record of dueRecords) {
    const phone = record.pet.owner.phone;
    if (!phone) continue;

    await whatsappQueue.add(
      "vaccine-reminder",
      {
        tenantId: record.tenantId,
        to: phone,
        template: "vaccine-reminder",
        payload: {
          petName: record.pet.name,
          vaccine: record.vaccineName,
          dueDate: record.nextDoseDueAt!.toISOString(),
          tutorName: record.pet.owner.name,
        },
      },
      {
        // Deduplicação: um lembrete por registro por dia.
        jobId: `vaccine-${record.id}-${now.toISOString().slice(0, 10)}`,
        removeOnComplete: true,
      },
    );
    queued++;
  }

  logger.info(
    { job: "vaccine-reminder", evaluated: dueRecords.length, queued },
    "vaccine_reminders_queued",
  );

  return { evaluated: dueRecords.length, queued };
}

export function registerVaccineReminderWorker() {
  return {
    name: "vaccine-reminder",
    handler: () => sendVaccineReminders(7),
    schedule: "0 9 * * *", // diário às 9h
  };
}
