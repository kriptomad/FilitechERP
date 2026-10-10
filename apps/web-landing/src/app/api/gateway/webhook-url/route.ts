// src/app/api/gateway/webhook-url/route.ts — Cap. 20.4
//
// URL de webhook para cadastrar no painel do provedor.
//
// O lojista não precisa caçar a URL no meio do código — o painel mostra a URL
// exata que ele deve colar no Mercado Pago/Asaas.
import { jsonSuccess } from '@/server/api-envelope';
import { absoluteUrl } from '@/server/env';
import { gatewayDisplayName } from '@/server/payment/gateway';

export const dynamic = 'force-dynamic';

export async function GET() {
  const provider = gatewayDisplayName();
  // Slug do provedor escolhido no ambiente — antes a URL saía sempre com
  // `?provider=mercadopago`, mesmo quando o cliente usava Asaas, e quem
  // cadastrava no painel do PSP apontava a rota errada.
  const providerSlug = (process.env.BILLING_GATEWAY ?? '').toLowerCase() || 'mercadopago';

  return jsonSuccess({
    provider,
    url: absoluteUrl(`/api/webhooks/billing?provider=${providerSlug}`),
    events: providerSlug === 'mercadopago'
      ? ['payment.approved', 'payment.updated', 'payment.refunded', 'subscription.authorized']
      : ['PAYMENT_CONFIRMED', 'PAYMENT_OVERDUE', 'PAYMENT_DELETED', 'SUBSCRIPTION_CANCELLED'],
    // Publicar chave de webhook aqui seria entregar o segredo do sistema.
    secretConfigured: Boolean(
      process.env.MERCADO_PAGO_WEBHOOK_SECRET || process.env.ASAAS_WEBHOOK_SECRET,
    ),
    instructions: providerSlug === 'mercadopago'
      ? [
          'No painel Mercado Pago, abra Configurações > Notificações > Webhooks.',
          'Adicione a URL acima e assine com o segredo que você configurou em MERCADO_PAGO_WEBHOOK_SECRET.',
          'Eventos mínimos: payment (approved, updated) e subscription.',
        ]
      : [
          'No painel Asaas, abra Integrações > Webhooks.',
          'Adicione a URL acima e informe o token que você configurou em ASAAS_WEBHOOK_SECRET.',
          'Eventos mínimos: PAYMENT_CONFIRMED, PAYMENT_OVERDUE e PAYMENT_DELETED.',
        ],
  });
}