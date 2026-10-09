// src/app/api/cron/dunning/route.ts — Cap. 2.7.4
//
// Régua de recuperação de pagamento falho (dunning), em CRON.
//
// Por que Cron e não BullMQ: BullMQ exige worker de processo longo, que não
// existe em serverless. A Vercel Cron invoca esta rota por HTTP — o modelo
// certo para a plataforma de deploy escolhida.
//
// Sequência (Cap. 2.7.4): falhas em D+1, D+3, D+5, D+7; na 4ª o tenant é
// suspenso de fato.
//
// Segurança: a Vercel envia o header `Authorization: Bearer $CRON_SECRET`.
// Sem isso, qualquer pessoa poderia disparar a rotina e suspender clientes.

import { NextResponse } from 'next/server';
import { prismaUnscoped } from '@/server/db';
import { env } from '@/server/env';
import { invalidateModulesCache } from '@/server/cache';
import { writeAuditLog } from '@/server/audit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const RETRY_SCHEDULE_DAYS = [1, 3, 5, 7];

function authorize(request: Request): boolean {
  const secret = env.cronSecret;
  // Sem segredo configurado, a rota fica inerte em vez de aberta para todos.
  if (!secret) return false;

  const header = request.headers.get('authorization') ?? '';
  return header === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Cron não autorizado.' } },
      { status: 401 },
    );
  }

  const now = new Date();
  const summary = { retried: 0, suspended: 0, recovered: 0, errors: 0 };

  // ── 1. Cobranças pendentes whose tentativas de nova tentativa venceram ─────
  const dueCharges = await prismaUnscoped.paymentCharge.findMany({
    where: {
      status: 'PENDING',
      subscription: { nextRetryAt: { lte: now } },
    },
    select: {
      id: true,
      tenantId: true,
      subscriptionId: true,
      externalProviderId: true,
      provider: true,
    },
    take: 100,
  });

  for (const charge of dueCharges) {
    try {
      // O registro de cada tentativa é o que constrói a régua auditável.
      const attempt = (await prismaUnscoped.billingEvent.count({
        where: { paymentChargeId: charge.id, type: 'payment.failed' },
      })) + 1;

      const retryInDays =
        RETRY_SCHEDULE_DAYS[Math.min(attempt - 1, RETRY_SCHEDULE_DAYS.length - 1)];

      await prismaUnscoped.billingEvent.create({
        data: {
          subscriptionId: charge.subscriptionId,
          paymentChargeId: charge.id,
          provider: charge.provider,
          externalEventKey: `dunning_${charge.id}_${attempt}`,
          type: 'payment.failed',
          payload: { attempt, retryInDays, source: 'cron_dunning' },
        },
      });

      await prismaUnscoped.subscription.update({
        where: { id: charge.subscriptionId! },
        data: {
          failedPaymentAttempts: { increment: 1 },
          nextRetryAt: new Date(now.getTime() + retryInDays * 24 * 60 * 60 * 1000),
        },
      });

      summary.retried += 1;

      // Régua esgotada: suspensão definitiva.
      if (attempt >= RETRY_SCHEDULE_DAYS.length) {
        await prismaUnscoped.$transaction([
          prismaUnscoped.subscription.update({
            where: { id: charge.subscriptionId! },
            data: { status: 'SUSPENDED' },
          }),
          prismaUnscoped.tenant.update({
            where: { id: charge.tenantId },
            data: { status: 'SUSPENDED' },
          }),
        ]);

        await invalidateModulesCache(charge.tenantId);

        const owner = await prismaUnscoped.user.findFirst({
          where: { tenantId: charge.tenantId, role: 'OWNER' },
          select: { id: true },
        });
        if (owner) {
          await writeAuditLog({
            tenantId: charge.tenantId,
            userId: owner.id,
            action: 'PAYMENT_FAILED',
            entityType: 'Tenant',
            entityId: charge.tenantId,
            after: { status: 'SUSPENDED', attempt, source: 'cron_dunning' },
          });
        }

        summary.suspended += 1;
      }
    } catch (err) {
      summary.errors += 1;
      console.error('[cron:dunning] falha ao processar cobrança', charge.id, err);
    }
  }

  // ── 2. Tenants PAST_DUE sem tolerância → SUSPENDED ───────────────────────
  const toSuspend = await prismaUnscoped.tenant.findMany({
    where: {
      status: 'PAST_DUE',
      gracePeriodEndsAt: { lte: now },
    },
    select: { id: true },
    take: 100,
  });

  for (const tenant of toSuspend) {
    try {
      await prismaUnscoped.$transaction([
        prismaUnscoped.tenant.update({
          where: { id: tenant.id },
          data: { status: 'SUSPENDED' },
        }),
        prismaUnscoped.subscription.updateMany({
          where: { tenantId: tenant.id, status: 'PAST_DUE' },
          data: { status: 'SUSPENDED' },
        }),
      ]);

      await invalidateModulesCache(tenant.id);
      summary.suspended += 1;
    } catch (err) {
      summary.errors += 1;
      console.error('[cron:dunning] falha ao suspender tenant', tenant.id, err);
    }
  }

  // ── 3. Tenants em tolerância já paga → restaura ACTIVE ────────────────────
  const toRecover = await prismaUnscoped.tenant.findMany({
    where: {
      status: 'PAST_DUE',
      gracePeriodEndsAt: { gt: now },
      subscriptions: { some: { status: 'ACTIVE' } },
    },
    select: { id: true },
    take: 100,
  });

  for (const tenant of toRecover) {
    try {
      await prismaUnscoped.tenant.update({
        where: { id: tenant.id },
        data: { status: 'ACTIVE', gracePeriodEndsAt: null },
      });
      await invalidateModulesCache(tenant.id);
      summary.recovered += 1;
    } catch (err) {
      summary.errors += 1;
      console.error('[cron:dunning] falha ao recuperar tenant', tenant.id, err);
    }
  }

  return NextResponse.json({
    success: true,
    data: { ...summary, ranAt: now.toISOString() },
    error: null,
  });
}