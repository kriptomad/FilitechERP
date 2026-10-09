// src/app/api/billing/charge/[id]/route.ts — Cap. 2.7
//
// Consulta de uma cobrança. É o que a tela de checkout faz para saber se o
// Pix foi pago (o webhook normalmente resolve antes, mas a tela precisa de um
// fallback para o caso de o webhook atrasar).
import { prismaUnscoped } from '@/server/db';
import { DomainError, jsonError, jsonSuccess } from '@/server/api-envelope';
import { readSession } from '@/server/session';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await readSession(request);
  if (!session) return jsonError(401, 'UNAUTHENTICATED', 'Sessão ausente ou expirada.');

  const charge = await prismaUnscoped.paymentCharge.findFirst({
    where: { id: params.id, tenantId: session.tenantId },
    select: {
      id: true,
      status: true,
      type: true,
      amount: true,
      provider: true,
      planCode: true,
      moduleCodes: true,
      pixQrCodePayload: true,
      pixQrCodeBase64: true,
      hostedCheckoutUrl: true,
      dueDate: true,
      expiresAt: true,
      paidAt: true,
      failureReason: true,
      createdAt: true,
    },
  });

  if (!charge) return jsonError(404, 'CHARGE_NOT_FOUND', 'Cobrança não encontrada.');

  return jsonSuccess({
    ...charge,
    amount: Number(charge.amount),
    dueDate: charge.dueDate?.toISOString() ?? null,
    expiresAt: charge.expiresAt.toISOString(),
    paidAt: charge.paidAt?.toISOString() ?? null,
    createdAt: charge.createdAt.toISOString(),
    message:
      charge.status === 'PAID'
        ? 'Pagamento confirmado. Sua assinatura está ativa.'
        : charge.status === 'PENDING'
          ? 'Aguardando confirmação do pagamento.'
          : `Cobrança ${charge.status.toLowerCase()}.`,
  });
}