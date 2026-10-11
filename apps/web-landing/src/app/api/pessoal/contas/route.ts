// src/app/api/pessoal/contas/route.ts — Cap. 22
// CRUD de contas bancárias pessoais
import { NextResponse } from 'next/server';
import { prismaUnscoped } from '@/server/db';
import { jsonSuccess } from '@/server/api-envelope';
import { requireSession } from '@/server/session';
import { handle } from '@/server/handler';
import { readJson, requireString, optionalString } from '@/server/request';

export const dynamic = 'force-dynamic';

export const GET = handle(async (request: Request) => {
  const session = await requireSession(request);
  const tenantId = session.tenantId;

  const accounts = await prismaUnscoped.personalAccount.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      type: true,
      currentBalance: true,
      institutionName: true,
      openFinanceConsentId: true,
      createdAt: true,
    },
  });

  return jsonSuccess({ accounts });
});

interface CreateAccountBody {
  name?: unknown;
  type?: unknown;
  currentBalance?: unknown;
  institutionName?: unknown;
  color?: unknown;
}

export const POST = handle(async (request: Request) => {
  const session = await requireSession(request);
  const body = await readJson<CreateAccountBody>(request);

  const name = requireString(body.name, 'nome', { min: 1, max: 100 });
  const type = requireString(body.type, 'tipo', { min: 1, max: 30 });
  const currentBalance = typeof body.currentBalance === 'number' ? body.currentBalance : 0;
  const institutionName = optionalString(body.institutionName, 'instituição', 100);

  const validTypes = ['CHECKING', 'SAVINGS', 'CREDIT_CARD', 'INVESTMENT_BROKERAGE', 'CASH', 'WALLET_CASH'];
  if (!validTypes.includes(type)) {
    return NextResponse.json({ error: { code: 'INVALID_TYPE', message: 'Tipo de conta inválido.' } }, { status: 400 });
  }

  const account = await prismaUnscoped.personalAccount.create({
    data: {
      tenantId: session.tenantId,
      name,
      type: type as any,
      currentBalance,
      institutionName,
    },
  });

  return jsonSuccess({ account });
});