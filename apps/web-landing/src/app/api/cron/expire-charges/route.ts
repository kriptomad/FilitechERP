// src/app/api/cron/expire-charges/route.ts — Cap. 2.7.4
//
// Expira cobranças Pix/boleto cujo prazo venceu.
//
// Sem isso, um Pix não pago continua "PENDING" no painel para sempre e a
// assinatura fica presa em PAST_DUE sem que o usuário saiba que o prazo
// acabou. Roda a cada hora.

import { NextResponse } from 'next/server';
import { prismaUnscoped } from '@/server/db';
import { env } from '@/server/env';
import { invalidateModulesCache } from '@/server/cache';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = env.cronSecret;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Cron não autorizado.' } },
      { status: 401 },
    );
  }

  const now = new Date();

  const expired = await prismaUnscoped.paymentCharge.findMany({
    where: { status: 'PENDING', expiresAt: { lt: now } },
    select: { id: true, tenantId: true, subscriptionId: true },
    take: 200,
  });

  if (expired.length === 0) {
    return NextResponse.json({
      success: true,
      data: { expired: 0, ranAt: now.toISOString() },
      error: null,
    });
  }

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
                externalEventKey: `expired_${charge.id}`,
                type: 'payment.expired',
                payload: { source: 'cron_expire_charges' },
              },
            }),
          ]
        : []),
    ]),
  );

  // Invalidação após a transação: o gatekeeper não deve ler cache velho.
  const tenants = [...new Set(expired.map((c) => c.tenantId))];
  await Promise.all(tenants.map((tenantId) => invalidateModulesCache(tenantId)));

  return NextResponse.json({
    success: true,
    data: { expired: expired.length, tenants: tenants.length, ranAt: now.toISOString() },
    error: null,
  });
}