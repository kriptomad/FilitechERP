// apps/web-landing/src/server/jobs/pluggy-sync.queue.ts
import { Queue, Worker } from 'bullmq';
import { redisConnection } from '../lib/redis';
import { syncPluggyItem, syncPluggyTransactions, syncPluggyInvestments } from '../services/pluggy.service';

export const pluggySyncQueue = new Queue('pluggy-sync', { connection: redisConnection });

// Job para sincronizar item (contas + transações + investimentos)
new Worker(
  'pluggy-sync',
  async (job) => {
    const { itemId, type } = job.data;

    switch (type) {
      case 'sync-item':
        await syncPluggyItem(itemId);
        break;
      case 'sync-transactions':
        await syncPluggyTransactions(itemId);
        break;
      case 'sync-investments':
        await syncPluggyInvestments(itemId);
        break;
    }
  },
  { connection: redisConnection, concurrency: 3 }
);

// Agenda: roda a cada 6h para sincronizar todos os itens ativos
export async function schedulePluggyFullSync() {
  // Evita duplicar o job
  const existing = await pluggySyncQueue.getJobs(['waiting', 'active'], 0, 1);
  const hasSchedule = existing.some(j => j.name === 'full-sync');
  if (hasSchedule) return;

  await pluggySyncQueue.add('full-sync', {}, {
    jobId: 'pluggy-full-sync',
  });
}