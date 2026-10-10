// src/app/api/cron/accounting-tasks/route.ts — Cap. 21.18.4
//
// Motor de tarefas recorrentes do escritório de contabilidade.
//
// É o equivalente ao "Domínio Processos/ONVIO Processos": as obrigações nascem
// sozinhas a partir do `taxRegime` e dos `scopes` de cada engagement ativo —
// nada de cadastrar tarefa manualmente por cliente.
//
// Cron da Vercel (Hobby: 1×/dia), autenticado por `Authorization: Bearer
// $CRON_SECRET`. Sem segredo configurado a rota fica inerte, não aberta.
import { NextResponse } from 'next/server';
import { env } from '@/server/env';
import {
  generateTasksForCompetencia,
  markLateTasks,
} from '@/server/services/accounting-office';

export const dynamic = 'force-dynamic';

function authorize(request: Request): boolean {
  const secret = env.cronSecret;
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

/**
 * A competência gerada hoje é o MÊS ANTERIOR — é ele que está sendo fechado.
 * No dia 1º a rotina cria as obrigações de janeiro; no dia 30, as de janeiro já
 * existem e ela só cria as de fevereiro se ainda faltar.
 */
function previousMonthCompetencia(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
}

export async function GET(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Cron não autorizado.' } },
      { status: 401 },
    );
  }

  const now = new Date();

  try {
    const generated = await generateTasksForCompetencia(previousMonthCompetencia(now));
    const alsoCurrent = await generateTasksForCompetencia(
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    );
    const late = await markLateTasks();

    return NextResponse.json({
      success: true,
      data: {
        previousMonth: generated,
        currentMonth: alsoCurrent,
        markedLate: late,
        ranAt: now.toISOString(),
      },
      error: null,
    });
  } catch (err) {
    console.error('[cron:accounting-tasks] falha:', err);
    return NextResponse.json(
      { success: false, error: { code: 'CRON_FAILED', message: 'Falha ao gerar tarefas.' } },
      { status: 500 },
    );
  }
}
