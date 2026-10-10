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
import { apiSuccess, jsonError } from '@/server/api-envelope';
import { requireSession } from '@/server/session';
import { roleHasPermission } from '@/server/gatekeeper';
import { requestFingerprint, writeAuditLog } from '@/server/audit';
import { handle } from '@/server/handler';
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

// Sem sessão, qualquer pessoa anônima descobriria o nome do PSP em uso. Sem
// `billing:manage`, um operador de caixa estaria vendo (e testando) a
// infraestrutura de cobrança da empresa.
export const GET = handle(async (request: Request) => {
  await requireSession(request);
  return apiSuccess(currentStatus());
});

export const POST = handle(async (request: Request) => {
  const session = await requireSession(request);

  if (!roleHasPermission(session.role, 'billing:manage')) {
    return jsonError(403, 'FORBIDDEN', 'Apenas o proprietário ou gerente pode testar o PSP.');
  }

  const gateway = resolveGateway();

  if (!gateway) {
    return jsonError(
      503,
      'GATEWAY_NOT_CONFIGURED',
      'Nenhum provedor configurado. Preencha as variáveis de ambiente antes de testar.',
    );
  }

  const started = Date.now();

  // A chamada ao PSP pode falhar por rede/HTTP — isso NÃO é um erro interno do
  // servidor, é um resultado negativo do teste. Devolver 500 confundiria o
  // operador; devolver `ok:false` com 502 diz exatamente o que aconteceu.
  let result: { ok: boolean; message: string; latencyMs?: number };
  try {
    result = await gateway.testConnection();
  } catch (err) {
    result = {
      ok: false,
      message:
        err instanceof Error
          ? `Falha ao contatar o ${gatewayDisplayName()}: ${err.message}`
          : `Falha ao contatar o ${gatewayDisplayName()}.`,
      latencyMs: Date.now() - started,
    };
  }

  await writeAuditLog({
    tenantId: session.tenantId,
    userId: session.userId,
    action: 'GATEWAY_TESTED',
    entityType: 'PaymentGateway',
    entityId: gateway.name,
    after: { ok: result.ok, latencyMs: result.latencyMs ?? Date.now() - started },
    ...requestFingerprint(request),
  });

  // `api()` do frontend lança quando `success` é falso OU o status não é 2xx —
  // e nesse caso lê `error.message`. Devolver `success:true` com `ok:false` em
  // 502 faria a tela mostrar "Bad Gateway" no lugar do motivo real (token
  // inválido, 401 do PSP, rede). O envelope de erro é o que leva a mensagem.
  if (!result.ok) {
    return NextResponse.json(
      {
        ...apiSuccess(null),
        success: false,
        error: { code: 'GATEWAY_UNREACHABLE', message: result.message },
      },
      { status: 502 },
    );
  }

  return NextResponse.json(
    apiSuccess({
      provider: gateway.name,
      providerLabel: gatewayDisplayName(),
      ok: true,
      message: result.message,
      latencyMs: result.latencyMs ?? Date.now() - started,
      testedAt: new Date().toISOString(),
    }),
    { status: 200 },
  );
});
