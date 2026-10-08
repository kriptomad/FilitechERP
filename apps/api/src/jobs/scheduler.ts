// src/jobs/scheduler.ts — Cap. 3.4/10.3 (agendador de jobs isolado da API)
import { logger } from "../lib/logger.js";
import { registerSuspendOverdueWorker } from "./suspend-overdue-tenants.job.js";
import { registerChargeSubscriptionsWorker } from "./charge-subscriptions.job.js";
import { registerVaccineReminderWorker } from "./vaccine-reminder.job.js";
import { registerWhatsAppWorker } from "./whatsapp-budget-approval.job.js";
import { registerPortalPublishWorker } from "./portal-publish.job.js";

interface ScheduledJob {
  name: string;
  handler: (...args: any[]) => Promise<any>;
  schedule: string;
  lastRun?: Date;
}

/**
 * Agendador de jobs (Cap. 3.4/10.3): executa jobs em intervalos regulares
 * usando setTimeout recursivo. Em produção, usar BullMQ Worker com repeat.
 *
 * Isolado da API principal — uma falha de job nunca impacta a disponibilidade
 * do PDV ou das rotas transacionais.
 */
export class JobScheduler {
  private jobs: ScheduledJob[] = [];
  private timers: NodeJS.Timeout[] = [];
  private running = false;

  register(job: ScheduledJob): void {
    this.jobs.push(job);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    logger.info({ jobs: this.jobs.map((j) => j.name) }, "scheduler_started");

    for (const job of this.jobs) {
      const intervalMs = parseCronToMs(job.schedule);
      const timer = setInterval(() => {
        this.runJob(job);
      }, intervalMs);
      this.timers.push(timer);
    }
  }

  stop(): void {
    this.running = false;
    for (const timer of this.timers) {
      clearInterval(timer);
    }
    this.timers = [];
  }

  private async runJob(job: ScheduledJob): Promise<void> {
    if (job.lastRun && Date.now() - job.lastRun.getTime() < 60_000) return; // evita overlap
    job.lastRun = new Date();
    try {
      const result = await job.handler({ data: {} });
      logger.info({ job: job.name, result }, "job_completed");
    } catch (err) {
      logger.error({ err, job: job.name }, "job_failed");
    }
  }
}

/**
 * Converte expressão cron simplificada (minuto hora dia mês dia-semana)
 * para intervalo em ms. Suporta apenas horário fixo diário (ex: "0 6 * * *").
 */
function parseCronToMs(cron: string): number {
  const parts = cron.split(" ");
  if (parts.length !== 5) return 24 * 60 * 60 * 1000; // default: diário

  const [minute, hour] = parts.map(Number);
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

/** Registra todos os jobs do sistema e retorna o scheduler configurado. */
export function createScheduler(): JobScheduler {
  const scheduler = new JobScheduler();
  scheduler.register({ ...registerSuspendOverdueWorker(), schedule: "0 3 * * *" });
  scheduler.register({ ...registerChargeSubscriptionsWorker(), schedule: "0 6 * * *" });
  scheduler.register({ ...registerVaccineReminderWorker(), schedule: "0 9 * * *" });
  scheduler.register({ ...registerWhatsAppWorker(), schedule: "*/30 * * * *" });
  scheduler.register({ ...registerPortalPublishWorker(), schedule: "0 */6 * * *" });
  return scheduler;
}
