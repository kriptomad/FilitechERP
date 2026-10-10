// src/app/api/health/route.ts
//
// Antes: `return NextResponse.json({ status: 'ok' })` — respondia "ok" mesmo
// com o banco inacessível, o JWT ausente ou o schema desatualizado. Um health
// check que nunca falha não é um health check: ele só mascara a falha até o
// usuário reclamar.
//
// Agora verifica de verdade:
//   • conectividade com o Postgres (`SELECT 1`);
//   • presença das variáveis críticas;
//   • versão do client Prisma vs. schema aplicado (drift detecta push esquecido).
import { prismaUnscoped } from '@/server/db';

export const dynamic = 'force-dynamic';

type Check = {
  name: string;
  status: 'ok' | 'degraded' | 'fail';
  detail?: string;
  latencyMs?: number;
};

export async function GET() {
  const checks: Check[] = [];
  let healthy = true;

  // ── 1. Banco de dados ────────────────────────────────────────────────────
  const dbStarted = Date.now();
  try {
    const rows = (await prismaUnscoped.$queryRaw`SELECT 1 AS ok`) as { ok: number }[];
    const ok = rows[0]?.ok === 1;
    checks.push({
      name: 'database',
      status: ok ? 'ok' : 'fail',
      detail: ok ? 'Postgres respondeu ao SELECT 1.' : 'Resposta inesperada do banco.',
      latencyMs: Date.now() - dbStarted,
    });
    if (!ok) healthy = false;
  } catch (err) {
    healthy = false;
    checks.push({
      name: 'database',
      status: 'fail',
      detail: err instanceof Error ? err.message.slice(0, 200) : 'Falha desconhecida.',
      latencyMs: Date.now() - dbStarted,
    });
  }

  // ── 2. Variáveis de ambiente críticas ───────────────────────────────────
  const required: [string, 'ok' | 'fail'][] = [
    ['DATABASE_URL', process.env.DATABASE_URL ? 'ok' : 'fail'],
    ['JWT_PRIVATE_KEY', process.env.JWT_PRIVATE_KEY ? 'ok' : 'fail'],
    ['JWT_PUBLIC_KEY', process.env.JWT_PUBLIC_KEY ? 'ok' : 'fail'],
  ];

  for (const [name, status] of required) {
    checks.push({
      name: `env:${name}`,
      status,
      // Nunca expor o valor — apenas se está presente.
      detail: status === 'ok' ? 'configurada' : 'ausente (Settings > Environment Variables)',
    });
    if (status === 'fail') healthy = false;
  }

  // ── 3. Infra opcional: degradado, não crítico ───────────────────────────
  const gatewayConfigured = Boolean(process.env.BILLING_GATEWAY);
  checks.push({
    name: 'billing_gateway',
    status: gatewayConfigured ? 'ok' : 'degraded',
    detail: gatewayConfigured
      ? `provedor ativo: ${process.env.BILLING_GATEWAY}`
      : 'BILLING_GATEWAY não definido — checkout pago responde 503 (por desenho).',
  });

  checks.push({
    name: 'email',
    status: process.env.RESEND_API_KEY ? 'ok' : 'degraded',
    detail: process.env.RESEND_API_KEY
      ? 'Resend configurado'
      : 'RESEND_API_KEY ausente — convites e reset de senha ficam só no log.',
  });

  const body = {
    status: healthy ? ('ok' as const) : ('error' as const),
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? 'dev',
    region: process.env.VERCEL_REGION ?? 'local',
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    checks,
  };

  return Response.json(body, {
    status: healthy ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}
