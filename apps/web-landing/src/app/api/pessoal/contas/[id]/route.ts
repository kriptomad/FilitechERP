// src/app/api/pessoal/contas/[id]/route.ts — Cap. 22
// Atualiza/Exclui conta bancária pessoal
import { prismaUnscoped } from '@/server/db';
import { jsonSuccess, jsonError } from '@/server/api-envelope';
import { requireSession } from '@/server/session';
import { handle } from '@/server/handler';
import { readJson, optionalString, requireString } from '@/server/request';

export const dynamic = 'force-dynamic';

interface UpdateAccountBody {
  name?: unknown;
  type?: unknown;
  currentBalance?: unknown;
  institutionName?: unknown;
  color?: unknown;
  isActive?: unknown;
}

export const PATCH = handle(async (request: Request, { params }: { params: { id: string } }) => {
  const session = await requireSession(request);
  const body = await readJson<UpdateAccountBody>(request);

  const account = await prismaUnscoped.personalAccount.findFirst({
    where: { id: params.id, tenantId: session.tenantId },
  });

  if (!account) {
    return jsonError(404, 'NOT_FOUND', 'Conta não encontrada.');
  }

  const updateData: any = {};
  if (body.name !== undefined) updateData.name = requireString(body.name, 'nome', { min: 1, max: 100 });
  if (body.type !== undefined) {
    const type = requireString(body.type, 'tipo');
    const validTypes = ['CHECKING', 'SAVINGS', 'CREDIT_CARD', 'INVESTMENT_BROKERAGE', 'CASH', 'WALLET_CASH'];
    if (!validTypes.includes(type)) {
      return jsonError(400, 'INVALID_TYPE', 'Tipo de conta inválido.');
    }
    updateData.type = type;
  }
  if (body.currentBalance !== undefined) updateData.currentBalance = typeof body.currentBalance === 'number' ? body.currentBalance : 0;
  if (body.institutionName !== undefined) updateData.institutionName = optionalString(body.institutionName, 'instituição', 100);
  if (body.isActive !== undefined) updateData.isActive = Boolean(body.isActive);

  const updated = await prismaUnscoped.personalAccount.update({
    where: { id: params.id },
    data: updateData,
  });

  return jsonSuccess({ account: updated });
});

export const DELETE = handle(async (request: Request, { params }: { params: { id: string } }) => {
  const session = await requireSession(request);

  const account = await prismaUnscoped.personalAccount.findFirst({
    where: { id: params.id, tenantId: session.tenantId },
  });

  if (!account) {
    return jsonError(404, 'NOT_FOUND', 'Conta não encontrada.');
  }

  // Verifica se há transações vinculadas
  const transactions = await prismaUnscoped.personalTransaction.count({
    where: { accountId: params.id },
  });

  if (transactions > 0) {
    return jsonError(400, 'HAS_TRANSACTIONS', 'Não é possível excluir conta com transações vinculadas. Desative a conta.');
  }

  await prismaUnscoped.personalAccount.delete({ where: { id: params.id } });

  return jsonSuccess({ message: 'Conta excluída com sucesso.' });
});