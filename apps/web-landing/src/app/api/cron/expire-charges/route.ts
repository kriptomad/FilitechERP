// src/app/api/cron/expire-charges/route.ts — Cap. 2.7.4
//
// Expira cobranças Pix/boleto cujo prazo venceu.
//
// Sem isso, um Pix não pago continua "PENDING" no painel para sempre e a
// assinatura fica presa em PAST_DUE sem que o usuário saiba que o prazo
// acabou. A Vercel Cron dispara uma vez ao dia (Hobby: limite de 1×/dia).

import { NextResponse } from 'next/server';
import { prismaUnscoped } from '@/server/db';
import { env } from '@/server/env';
import { invalidateModulesCache } from '@/server/cache';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Lotes de 200, no máximo 5 por execução — cobre 1.000/dia dentro do minuto. */
const BATCH_SIZE = 200;
const MAX_BATCHES = 5;

export async function GET(request: Request) {
  const secret = env.cronSecret;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Cron não autorizado.' } },
      { status: 401 },
    );
  }

  const now = new Date();
  const processedIds = new Set<string>();
  const tenantIds = new Set<string>();
  let batch = 0;

  for (; batch < MAX_BATCHES; batch += 1) {
    const expired = await prismaUnscoped.paymentCharge.findMany({
      where: { status: 'PENDING', expiresAt: { lt: now } },
      select: { id: true, tenantId: true, subscriptionId: true },
      take: BATCH_SIZE,
    });

    if (expired.length === 0) break;

    await prismaUnscoped.$transaction(
      expired.flatMap((charge) => [
        prismaUnscoped.paymentCharge.update({
          where: { id: charge.id },
          data: { status: 'EXPIRED', failureReason: 'Prazo de pagamento vencido' },
        }),
        ...(charge.subscriptionId
          ? [
              prismaUnscoped.billingEvent.create({
                data: {
                  subscriptionId: charge.subscriptionId,
                  paymentChargeId: charge.id,
                  provider: 'system',
                  // Chave única por cobrança: um segundo disparo não duplica
                  // evento (constraint @@unique[provider, externalEventKey]).
                  externalEventKey: `expired_${charge.id}`,
                  type: 'payment.expired',
                  payload: { source: 'cron_expire_charges' },
                },
              }),
            ]
          : []),
      ]),
    );

    for (const charge of expired) {
      processedIds.add(charge.id);
      tenantIds.add(charge.tenantId);
    }

    // Lote cheio significa que ainda pode haver mais: próxima volta.
    if (expired.length < BATCH_SIZE) break;
  }

  // Invalidação após a transação: o gatekeeper não deve ler cache velho.
  await Promise.all([...tenantIds].map((tenantId) => invalidateModulesCache(tenantId)));

  return NextResponse.json({
    success: true,
    data: {
      expired: processedIds.size,
      tenants: tenantIds.size,
      batches: processedIds.size > 0 ? batch + 1 : 0,
      ranAt: now.toISOString(),
    },
    error: null,
  });
}