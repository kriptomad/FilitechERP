// src/app/api/billing/invoices/route.ts — Cap. 2.7.5 / 8.4.4
//
// Antes devolvia `{ invoices: [] }` — a aba "Faturas" ficava sempre vazia,
// mesmo com cobranças reais no banco.
//
// "Fatura" é o que foi COBRADO: `PaymentCharge` (valor, status, PIX, vencimento).
// `BillingEvent` é log técnico e não entra aqui (Cap. 2.7.5).
import { prismaUnscoped } from '@/server/db';
import { requireSession } from '@/server/session';
import { handle } from '@/server/handler';

export const dynamic = 'force-dynamic';

export const GET = handle(async (request: Request) => {
  const session = await requireSession(request);

  const url = new URL(request.url);
  const take = Math.min(Number(url.searchParams.get('limit') ?? 60), 200);

  const charges = await prismaUnscoped.paymentCharge.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { createdAt: 'desc' },
    take,
    select: {
      id: true,
      type: true,
      status: true,
      provider: true,
      amount: true,
      planCode: true,
      moduleCodes: true,
      dueDate: true,
      paidAt: true,
      createdAt: true,
      hostedCheckoutUrl: true,
      pixQrCodePayload: true,
      boletoDigitableLine: true,
      failureReason: true,
      expiresAt: true,
    },
  });

  const invoices = charges.map((charge) => ({
    id: charge.id,
    type: charge.type,
    status: charge.status,
    provider: charge.provider,
    method: charge.type,
    amount: Number(charge.amount),
    planCode: charge.planCode,
    moduleCodes: charge.moduleCodes,
    dueDate: charge.dueDate?.toISOString() ?? null,
    paidAt: charge.paidAt?.toISOString() ?? null,
    createdAt: charge.createdAt.toISOString(),
    // Descrição derivada do snapshot gravado na cobrança — não de catálogo
    // atual (o plano pode ter mudado depois; a fatura retrata o que foi cobrado).
    description: describeCharge(charge.type, charge.planCode, charge.moduleCodes),
    invoiceUrl: charge.hostedCheckoutUrl,
    pixQrCodePayload: charge.pixQrCodePayload ?? charge.boletoDigitableLine ?? null,
    failureReason: charge.failureReason,
    expiresAt: charge.expiresAt.toISOString(),
  }));

  const paidTotal = invoices
    .filter((invoice) => invoice.status === 'PAID')
    .reduce((sum, invoice) => sum + invoice.amount, 0);

  return {
    success: true,
    data: {
      invoices,
      summary: {
        total: invoices.length,
        paid: invoices.filter((invoice) => invoice.status === 'PAID').length,
        pending: invoices.filter((invoice) => invoice.status === 'PENDING').length,
        paidTotal: Math.round(paidTotal * 100) / 100,
      },
    },
    error: null,
  };
});

function describeCharge(type: string, planCode: string | null, moduleCodes: string[]): string {
  if (type === 'SUBSCRIPTION') {
    const extras = moduleCodes.length > 0 ? ` + ${moduleCodes.join(', ')}` : '';
    return `Assinatura ${planCode ?? ''}${extras}`.trim();
  }
  if (type === 'BOLETO') return 'Boleto de cobrança';
  if (type === 'PIX') return 'Cobrança Pix';
  if (type === 'CREDIT_CARD') return 'Cobrança cartão de crédito';
  return 'Cobrança';
}
