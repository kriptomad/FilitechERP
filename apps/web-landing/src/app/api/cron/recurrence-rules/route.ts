// src/app/api/cron/recurrence-rules/route.ts
// Geração de transações recorrentes (Cap. 17 / 22)
import { NextResponse } from 'next/server';
import { prismaUnscoped } from '@/server/db';
import { env } from '@/server/env';

export const dynamic = 'force-dynamic';

function authorize(request: Request): boolean {
  const secret = env.cronSecret;
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Não autorizado.' } }, { status: 401 });
  }

  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Busca regras de recorrência ativas que devem gerar transação hoje
    const rules = await prismaUnscoped.personalRecurrenceRule.findMany({
      where: {
        active: true,
        nextOccurrenceAt: { lte: today },
        tenant: { tenantType: 'PERSONAL' },
      },
      include: { tenant: true },
    });

    let created = 0;
    const errors: string[] = [];

    for (const rule of rules) {
      try {
        // Busca o usuário OWNER do tenant para usar como createdByUserId
        const owner = await prismaUnscoped.user.findFirst({
          where: { tenantId: rule.tenantId, role: 'OWNER' },
          select: { id: true },
        });

        if (!owner) {
          errors.push(`Rule ${rule.id}: Nenhum usuário OWNER encontrado para o tenant ${rule.tenantId}`);
          continue;
        }

        await prismaUnscoped.$transaction(async (tx) => {
          // Cria a transação
          await tx.personalTransaction.create({
            data: {
              tenantId: rule.tenantId,
              accountId: rule.templateAccountId,
              createdByUserId: owner.id,
              type: rule.templateType,
              amount: rule.templateAmount,
              transactionDate: rule.nextOccurrenceAt,
              description: rule.templateDescription,
              categoryId: rule.templateCategoryId,
              recurrenceRuleId: rule.id,
              isRecurring: true,
            },
          });

          // Calcula próxima ocorrência
          const next = calculateNextOccurrence(rule.nextOccurrenceAt, rule.frequency, rule.interval);
          
          // Verifica se excede data fim
          if (rule.endDate && next > rule.endDate) {
            await tx.personalRecurrenceRule.update({
              where: { id: rule.id },
              data: { active: false, nextOccurrenceAt: next },
            });
          } else {
            await tx.personalRecurrenceRule.update({
              where: { id: rule.id },
              data: { nextOccurrenceAt: next },
            });
          }
        });
        created++;
      } catch (e) {
        errors.push(`Rule ${rule.id}: ${e instanceof Error ? e.message : 'erro'}`);
      }
    }

    return NextResponse.json({
      success: true,
      data: { rulesProcessed: rules.length, transactionsCreated: created, errors },
    });
  } catch (err) {
    console.error('[cron:recurrence-rules] erro:', err);
    return NextResponse.json({ success: false, error: { code: 'CRON_FAILED', message: 'Falha no cron de recorrência.' } }, { status: 500 });
  }
}

function calculateNextOccurrence(current: Date, frequency: string, interval: number): Date {
  const next = new Date(current);
  switch (frequency) {
    case 'DAILY': next.setDate(next.getDate() + interval); break;
    case 'WEEKLY': next.setDate(next.getDate() + 7 * interval); break;
    case 'MONTHLY': next.setMonth(next.getMonth() + interval); break;
    case 'YEARLY': next.setFullYear(next.getFullYear() + interval); break;
  }
  return next;
}