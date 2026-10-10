// src/app/api/cron/loyalty-expire/route.ts — Cap. 4.1.1
//
// Vencimento de pontos de fidelidade.
//
// Sem esta rotina, `LoyaltyTransaction.expiresAt` seria apenas um campo
// decorativo: o saldo nunca cairia sozinho e um programa com validade seria
// indistinguível de um sem validade.
//
// Vercel Cron 1×/dia (Hobby), autenticado por `Authorization: Bearer
// $CRON_SECRET`.
import { NextResponse } from 'next/server';
import { env } from '@/server/env';
import { expireLoyaltyPoints } from '@/server/services/loyalty';

export const dynamic = 'force-dynamic';

function authorize(request: Request): boolean {
  const secret = env.cronSecret;
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Cron não autorizado.' } },
      { status: 401 },
    );
  }

  try {
    const result = await expireLoyaltyPoints();
    return NextResponse.json({
      success: true,
      data: { ...result, ranAt: new Date().toISOString() },
      error: null,
    });
  } catch (err) {
    console.error('[cron:loyalty-expire] falha:', err);
    return NextResponse.json(
      { success: false, error: { code: 'CRON_FAILED', message: 'Falha ao expirar pontos.' } },
      { status: 500 },
    );
  }
}
