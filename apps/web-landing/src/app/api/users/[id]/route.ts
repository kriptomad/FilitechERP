// src/app/api/users/[id]/route.ts — Cap. 5
import { prismaUnscoped } from '@/server/db';
import { DomainError, jsonError } from '@/server/api-envelope';
import { readSession } from '@/server/session';
import { withTenant } from '@/server/tenant-context';
import { readJson, optionalString } from '@/server/request';
import { roleHasPermission } from '@/server/gatekeeper';
import { writeAuditLog, requestFingerprint } from '@/server/audit';
import type { UserRole } from '@prisma/client';
import { handle } from '@/server/handler';

export const dynamic = 'force-dynamic';

const ROLE_ALIAS: Record<string, UserRole | undefined> = {
  OWNER: 'OWNER',
  MANAGER: 'MANAGER',
  CASHIER: 'CASHIER',
  TECH: 'TECHNICIAN',
  TECHNICIAN: 'TECHNICIAN',
  ACCOUNTANT: 'ACCOUNTANT',
};

const TEAM_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  phone: true,
  createdAt: true,
} as const;

async function authorize(request: Request) {
  const session = await readSession(request);
  if (!session) throw new DomainError('UNAUTHENTICATED', 'Sessão ausente ou expirada.', 401);
  if (!roleHasPermission(session.role, 'billing:manage')) {
    throw new DomainError('FORBIDDEN', 'Seu nível de acesso não permite esta ação.', 403);
  }
  return session;
}

export const PATCH = handle(async (request: Request, { params }: { params: { id: string } }) => {
  const session = await authorize(request);
  const { id } = params;
  const body = await readJson<Record<string, unknown>>(request);

  const data: { name?: string; role?: UserRole; active?: boolean; phone?: string | null } = {};

  if (body.name !== undefined) {
    data.name = requireName(body.name);
  }
  if (body.role !== undefined) {
    const mapped = ROLE_ALIAS[optionalString(body.role, 'papel', 20) ?? ''];
    if (!mapped) throw new DomainError('INVALID_ROLE', 'Papel inválido.');
    data.role = mapped;
  }
  if (body.active !== undefined) {
    if (typeof body.active !== 'boolean') {
      throw new DomainError('VALIDATION_ERROR', 'active deve ser boolean.');
    }
    if (body.active === false && id === session.userId) {
      throw new DomainError('CANNOT_DISABLE_SELF', 'Você não pode desativar a própria conta.', 409);
    }
    data.active = body.active;
  }
  if (body.phone !== undefined) {
    data.phone = optionalString(body.phone, 'telefone', 40) ?? null;
  }

  if (Object.keys(data).length === 0) {
    throw new DomainError('VALIDATION_ERROR', 'Nenhum dado enviado.');
  }

  const before = await prismaUnscoped.user.findUnique({
    where: { id },
    select: { ...TEAM_SELECT, tenantId: true },
  });
  if (!before) return jsonError(404, 'NOT_FOUND', 'Usuário não encontrado.');

  const losesOwnership =
    before.role === 'OWNER' && ((data.role && data.role !== 'OWNER') || data.active === false);
  if (losesOwnership) {
    await assertNotLastOwner(before.tenantId, id);
  }

  const updated = await withTenant(
    { tenantId: session.tenantId, userId: session.userId, role: session.role },
    () => prismaUnscoped.user.update({ where: { id }, data, select: TEAM_SELECT }),
  );

  await writeAuditLog({
    tenantId: session.tenantId,
    userId: session.userId,
    action: 'USER_UPDATED',
    entityType: 'User',
    entityId: id,
    before,
    after: updated,
    ...requestFingerprint(request),
  });

  return { success: true, data: updated, error: null };
});

export const DELETE = handle(async (request: Request, { params }: { params: { id: string } }) => {
  const session = await authorize(request);
  const { id } = params;

  if (id === session.userId) {
    throw new DomainError('CANNOT_DELETE_SELF', 'Você não pode excluir a própria conta.', 409);
  }

  const user = await prismaUnscoped.user.findUnique({ where: { id }, select: TEAM_SELECT });
  if (!user) return jsonError(404, 'NOT_FOUND', 'Usuário não encontrado.');

  if (user.role === 'OWNER') {
    await assertNotLastOwner(session.tenantId, id);
  }

  await withTenant(
    { tenantId: session.tenantId, userId: session.userId, role: session.role },
    () => prismaUnscoped.user.delete({ where: { id } }),
  );

  await writeAuditLog({
    tenantId: session.tenantId,
    userId: session.userId,
    action: 'USER_DELETED',
    entityType: 'User',
    entityId: id,
    before: user,
    ...requestFingerprint(request),
  });

  return { success: true, data: { id, deleted: true }, error: null };
});

function requireName(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length < 2) {
    throw new DomainError('VALIDATION_ERROR', 'Nome inválido.');
  }
  return value.trim();
}

async function assertNotLastOwner(tenantId: string, excludingUserId: string): Promise<void> {
  const otherOwners = await prismaUnscoped.user.count({
    where: { tenantId, role: 'OWNER', active: true, id: { not: excludingUserId } },
  });
  if (otherOwners === 0) {
    throw new DomainError(
      'LAST_OWNER',
      'Não é possível remover ou rebaixar o último proprietário ativo.',
      409,
    );
  }
}
