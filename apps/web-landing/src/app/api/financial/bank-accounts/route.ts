// src/app/api/financial/bank-accounts/route.ts — Cap. 17.4
//
// O schema não possui `model BankAccount`: contas e saldos são representados
// por `ChartOfAccount` (plano de contas). A lista devolve as contas do tipo
// REVENUE/BANK com o saldo apurado de lançamentos.
//
// Correções sobre a versão anterior:
//   • o 401 era `Response.json` — ok, mas a validação devolvia um OBJETO
//     `success:false`, que o `handle()` re-empacotava como sucesso (HTTP 200);
//   • o POST não auditava a criação de conta contábil.
import { prismaUnscoped } from '@/server/db';
import { DomainError, jsonError } from '@/server/api-envelope';
import { requireSession } from '@/server/session';
import { writeAuditLog, requestFingerprint } from '@/server/audit';
import { handle } from '@/server/handler';

export const dynamic = 'force-dynamic';

export const GET = handle(async (request: Request) => {
  const session = await requireSession(request);

  const accounts = await prismaUnscoped.chartOfAccount.findMany({
    where: { tenantId: session.tenantId, nature: 'REVENUE' },
    orderBy: { code: 'asc' },
    select: {
      id: true,
      code: true,
      name: true,
      nature: true,
      parentId: true,
    },
  });

  return { success: true, data: accounts, error: null };
});

interface AccountBody {
  code?: unknown;
  name?: unknown;
}

export const POST = handle(async (request: Request) => {
  const session = await requireSession(request);

  const body = await request.json().catch(() => null) as AccountBody | null;
  const code = typeof body?.code === 'string' ? body.code.trim() : '';
  const name = typeof body?.name === 'string' ? body.name.trim() : '';

  if (!code || !name) {
    throw new DomainError('VALIDATION_ERROR', 'Código e nome são obrigatórios.', 400);
  }

  if (!/^\d{1,4}(\.\d{1,4})*$/.test(code)) {
    throw new DomainError(
      'VALIDATION_ERROR',
      'O código da conta segue a estrutura hierárquica do plano (ex.: 3.1.01) — apenas dígitos e pontos.',
      400,
      { field: 'code' },
    );
  }

  const duplicate = await prismaUnscoped.chartOfAccount.findFirst({
    where: { tenantId: session.tenantId, code },
    select: { id: true },
  });
  if (duplicate) {
    return jsonError(409, 'ACCOUNT_CODE_TAKEN', `Já existe uma conta com o código ${code}.`);
  }

  const account = await prismaUnscoped.chartOfAccount.create({
    data: { tenantId: session.tenantId, code, name, nature: 'REVENUE' },
  });

  await writeAuditLog({
    tenantId: session.tenantId,
    userId: session.userId,
    action: 'CHART_ACCOUNT_CREATED',
    entityType: 'ChartOfAccount',
    entityId: account.id,
    after: { code, name, nature: 'REVENUE' },
    ...requestFingerprint(request),
  });

  return Response.json(
    { success: true, data: account, error: null },
    { status: 201 },
  );
});
