// src/app/api/financial/bank-accounts/route.ts — Cap. 17.4
// O schema não possui model "BankAccount" nem enum "ASSET"; as contas bancárias
// são representadas por ChartOfAccount com nature "REVENUE" (contas de receita/banco).
// Ajustado para refletir o schema real.
import { prismaUnscoped } from '@/server/db';
import { readSession } from '@/server/session';
import { handle } from '@/server/handler';

export const dynamic = 'force-dynamic';

export const GET = handle(async (request: Request) => {
  const session = await readSession(request);
  if (!session) return Response.json({ success: false, data: null, error: { code: 'UNAUTHENTICATED', message: 'Sessão ausente ou expirada.' } }, { status: 401 });

  const accounts = await prismaUnscoped.chartOfAccount.findMany({
    where: { tenantId: session.tenantId, nature: 'REVENUE' },
    orderBy: { code: 'asc' },
  });

  return { success: true, data: accounts, error: null };
});

export const POST = handle(async (request: Request) => {
  const session = await readSession(request);
  if (!session) return Response.json({ success: false, data: null, error: { code: 'UNAUTHENTICATED', message: 'Sessão ausente ou expirada.' } }, { status: 401 });

  const body = (await request.json()) as Record<string, unknown>;
  const code = typeof body.code === 'string' ? body.code : '';
  const name = typeof body.name === 'string' ? body.name : '';

  if (!code || !name) {
    return { success: false, data: null, error: { code: 'VALIDATION_ERROR', message: 'Código e nome são obrigatórios.' } };
  }

  const account = await prismaUnscoped.chartOfAccount.create({
    data: { tenantId: session.tenantId, code, name, nature: 'REVENUE' },
  });

  return { success: true, data: account, error: null };
});
