// src/app/api/gateway/route.ts — Cap. 20.4 / 2.7
//
// Configuração do provedor de pagamento.
//
// A chave NÃO é persistida em IntegrationCredential aqui: credencial de PSP é
// dado sensível de infraestrutura e pertence ao ambiente da Vercel. O que este
// endpoint oferece é o que o painel realmente precisava — visibilidade do que
// está configurado e um botão "Testar conexão" que fala de verdade com o PSP.
//
// Se a chave viesse do cliente e fosse gravada aqui, qualquer usuário logado
// poderia apontar as cobranças para a própria conta — por isso a separação.
import { NextResponse } from 'next/server';
import { jsonError, jsonSuccess } from '@/server/api-envelope';
import { resolveGateway, gatewayDisplayName } from '@/server/payment/gateway';

export const dynamic = 'force-dynamic';

type GatewayStatus = {
  configured: boolean;
  provider: string | null;
  providerLabel: string | null;
  /** Campos de ambiente que o painel deve orientar a preencher. */
  requiredEnv: string[];
  message: string;
};

function currentStatus(): GatewayStatus {
  const configured = resolveGateway() !== null;
  const provider = (process.env.BILLING_GATEWAY ?? '').toLowerCase() || null;

  const requiredEnv =
    provider === 'mercadopago'
      ? ['BILLING_GATEWAY', 'MERCADO_PAGO_ACCESS_TOKEN', 'MERCADO_PAGO_WEBHOOK_SECRET']
      : provider === 'asaas'
        ? ['BILLING_GATEWAY', 'ASAAS_API_KEY', 'ASAAS_WEBHOOK_SECRET']
        : ['BILLING_GATEWAY', 'MERCADO_PAGO_ACCESS_TOKEN | ASAAS_API_KEY'];

  return {
    configured,
    provider,
    providerLabel: gatewayDisplayName(),
    requiredEnv,
    message: configured
      ? `Cobrança habilitada via ${gatewayDisplayName()}.`
      : 'Nenhum provedor de pagamento configurado. Defina as variáveis abaixo no painel da Vercel para habilitar a cobrança.',
  };
}

export async function GET() {
  return jsonSuccess(currentStatus());
}

/** Teste de conexão real: chama a API do provedor e devolve o resultado. */
export async function POST(request: Request) {
  const gateway = resolveGateway();

  if (!gateway) {
    return jsonError(
      503,
      'GATEWAY_NOT_CONFIGURED',
      'Nenhum provedor configurado. Preencha as variáveis de ambiente antes de testar.',
    );
  }

  const started = Date.now();
  const result = await gateway.testConnection();

  return NextResponse.json(
    jsonSuccess({
      provider: gateway.name,
      providerLabel: gatewayDisplayName(),
      ok: result.ok,
      message: result.message,
      latencyMs: result.latencyMs ?? Date.now() - started,
      testedAt: new Date().toISOString(),
    }),
    { status: result.ok ? 200 : 502 },
  );
}