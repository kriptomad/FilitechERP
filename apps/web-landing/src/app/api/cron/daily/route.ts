// apps/web-landing/src/app/api/cron/daily/route.ts
//
// Cron diário único (Hobby: 1x/dia às 03:00).
// Executa sequencialmente todas as tarefas de manutenção diária:
//  1. Dunning (régua de cobrança / suspensão por inadimplência)
//  2. Expiração de cobranças Pix/Boleto pendentes
//  3. Geração de tarefas contábeis (escritório virtual)
//  4. Expiração de pontos de fidelidade
//  5. Sincronização Pluggy (Open Finance)
//
// Cada passo é isolado: falha em um não impede os demais.
// Logs detalhados para auditoria e debugging.
import { NextResponse } from 'next/server';
import { env } from '@/server/env';

function authorize(request: Request): boolean {
  const secret = env.cronSecret;
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

async function runStep(name: string, fn: () => Promise<{ ok: boolean; message: string; details?: any }>) {
  const start = Date.now();
  try {
    const result = await fn();
    return { step: name, ok: result.ok, message: result.message, details: result.details, durationMs: Date.now() - start };
  } catch (err: any) {
    console.error(`[cron:daily] step ${name} failed:`, err);
    return { step: name, ok: false, message: err?.message ?? 'Erro desconhecido', durationMs: Date.now() - start };
  }
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 300; // 5 minutos

export async function GET(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Cron não autorizado.' } },
      { status: 401 }
    );
  }

  const results: Array<{ step: string; ok: boolean; message: string; details?: any; durationMs: number }> = [];

  // 1. Dunning (régua de cobrança / suspensão por inadimplência)
  results.push(await runStep('dunning', async () => {
    const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/cron/dunning`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      cache: 'no-store',
    });
    const json = await res.json();
    return { ok: res.ok && json.success, message: json.success ? 'Dunning executado' : json.error?.message ?? 'Falha no dunning', details: json };
  }));

  // 2. Expirar cobranças Pix/Boleto pendentes
  results.push(await runStep('expire-charges', async () => {
    const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/cron/expire-charges`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      cache: 'no-store',
    });
    const json = await res.json();
    return { ok: res.ok && json.success, message: json.success ? 'Cobranças expiradas processadas' : json.error?.message ?? 'Falha ao expirar cobranças', details: json };
  }));

  // 3. Geração de tarefas contábeis (escritório virtual)
  results.push(await runStep('accounting-tasks', async () => {
    const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/cron/accounting-tasks`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      cache: 'no-store',
    });
    const json = await res.json();
    return { ok: res.ok && json.success, message: json.success ? 'Tarefas contábeis geradas' : json.error?.message ?? 'Falha nas tarefas contábeis', details: json };
  }));

  // 4. Expiração de pontos de fidelidade
  results.push(await runStep('loyalty-expire', async () => {
    const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/cron/loyalty-expire`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      cache: 'no-store',
    });
    const json = await res.json();
    return { ok: res.ok && json.success, message: json.success ? 'Pontos de fidelidade expirados processados' : json.error?.message ?? 'Falha ao expirar pontos', details: json };
  }));

  // 5. Sincronização Pluggy (Open Finance)
  results.push(await runStep('pluggy-sync', async () => {
    const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/cron/pluggy-sync`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      cache: 'no-store',
    });
    const json = await res.json();
    return { ok: res.ok && json.success, message: json.success ? 'Sincronização Pluggy executada' : json.error?.message ?? 'Falha na sincronização Pluggy', details: json };
  }));

  // 6. Geração de transações recorrentes
  results.push(await runStep('recurrence-rules', async () => {
    const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/cron/recurrence-rules`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      cache: 'no-store',
    });
    const json = await res.json();
    return { ok: res.ok && json.success, message: json.success ? 'Transações recorrentes geradas' : json.error?.message ?? 'Falha nas recorrências', details: json };
  }));

  // 7. Alertas de orçamento pessoal
  results.push(await runStep('budget-alerts', async () => {
    const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/cron/budget-alerts`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      cache: 'no-store',
    });
    const json = await res.json();
    return { ok: res.ok && json.success, message: json.success ? 'Alertas de orçamento processados' : json.error?.message ?? 'Falha nos alertas de orçamento', details: json };
  }));

  // 8. Alertas de contas a pagar
  results.push(await runStep('bill-alerts', async () => {
    const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/cron/bill-alerts`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      cache: 'no-store',
    });
    const json = await res.json();
    return { ok: res.ok && json.success, message: json.success ? 'Alertas de contas processados' : json.error?.message ?? 'Falha nos alertas de contas', details: json };
  }));

  // 9. Snapshot de patrimônio líquido (só dia 1)
  results.push(await runStep('net-worth-snapshot', async () => {
    const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/cron/net-worth-snapshot`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      cache: 'no-store',
    });
    const json = await res.json();
    return { ok: res.ok && json.success, message: json.success ? 'Snapshot de patrimônio criado' : json.error?.message ?? 'Falha no snapshot', details: json };
  }));

  // 10. Sugestões de reposição de estoque
  results.push(await runStep('reorder-suggestions', async () => {
    const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/cron/reorder-suggestions`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      cache: 'no-store',
    });
    const json = await res.json();
    return { ok: res.ok && json.success, message: json.success ? 'Sugestões de compra geradas' : json.error?.message ?? 'Falha nas sugestões', details: json };
  }));

  // 11. Sincronização catálogo fiscal (semanal - executa dia 1)
  const isFirstDay = new Date().getDate() === 1;
  if (isFirstDay) {
    results.push(await runStep('fiscal-code-sync', async () => {
      const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/cron/fiscal-code-sync`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
        cache: 'no-store',
      });
      const json = await res.json();
      return { ok: res.ok && json.success, message: json.success ? 'Catálogo fiscal sincronizado' : json.error?.message ?? 'Falha no catálogo fiscal', details: json };
    }));
  }

  // 12. Backup criptografado
  results.push(await runStep('backup-encrypted', async () => {
    const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/cron/backup-encrypted`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      cache: 'no-store',
    });
    const json = await res.json();
    return { ok: res.ok && json.success, message: json.success ? 'Backup criptografado concluído' : json.error?.message ?? 'Falha no backup', details: json };
  }));

  const allOk = results.every(r => r.ok);
  const failed = results.filter(r => !r.ok).map(r => r.step);

  return NextResponse.json({
    success: allOk,
    data: {
      steps: results,
      failed,
      totalDurationMs: results.reduce((sum, r) => sum + r.durationMs, 0),
      ranAt: new Date().toISOString(),
    },
    error: allOk ? null : { code: 'PARTIAL_FAILURE', message: `Alguns passos falharam: ${failed.join(', ')}` },
  }, { status: allOk ? 200 : 207 });
}