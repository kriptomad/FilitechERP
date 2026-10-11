// src/app/api/users/route.ts — Cap. 5 / 8.4.5
//
// Antes devolvia DEMO_USERS (Demo Owner e Caixa User) e o POST criava
// `user-${Date.now()}` apenas na resposta — o painel mostrava equipe que não
// existia e "convidar membro" não gravava nada.
//
// Agora: lista a equipe real do tenant (escopo automático por tenantId) e o
// convite cria um usuário de verdade com senha temporária de um uso só,
// enviada por e-mail quando o provedor está configurado.
import type { UserRole } from '@prisma/client';
import { prismaUnscoped } from '@/server/db';
import { DomainError, jsonError } from '@/server/api-envelope';
import { requireSession } from '@/server/session';
import { roleHasPermission } from '@/server/gatekeeper';
import { readJson, requireString, optionalString, requireEmail } from '@/server/request';
import { generateTemporaryPassword, hashPassword } from '@/server/password';
import { writeAuditLog, requestFingerprint } from '@/server/audit';
import { emitNotification } from '@/server/services/notifications';
import { absoluteUrl } from '@/server/env';
import { FREE_LIMITS } from '@/server/billing-catalog';
import { withTenant } from '@/server/tenant-context';
import { handle } from '@/server/handler';

export const dynamic = 'force-dynamic';

/** Apelido da UI ("TECH") → enum do domínio (Cap. 5 — UserRole). */
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
  const session = await requireSession(request);
  if (!roleHasPermission(session.role, 'billing:manage')) {
    throw new DomainError('FORBIDDEN', 'Seu nível de acesso não permite gerenciar a equipe.', 403);
  }
  return session;
}

export const GET = handle(async (request: Request) => {
  const session = await authorize(request);

  const users = await withTenant(
    { tenantId: session.tenantId, userId: session.userId, role: session.role },
    () =>
      prismaUnscoped.user.findMany({
        select: TEAM_SELECT,
        orderBy: { name: 'asc' },
      }),
  );

  return { success: true, data: users, error: null };
});

interface InviteBody {
  name?: unknown;
  email?: unknown;
  role?: unknown;
  password?: unknown;
}

export const POST = handle(async (request: Request) => {
  const session = await authorize(request);

  const body = await readJson<InviteBody>(request);
  const name = requireString(body.name, 'nome', { min: 2, max: 160 });
  const email = requireEmail(body.email);

  const mappedRole = ROLE_ALIAS[optionalString(body.role, 'papel', 20) ?? 'CASHIER'] ?? 'CASHIER';
  if (body.role !== undefined && !ROLE_ALIAS[optionalString(body.role, 'papel', 20) ?? '']) {
    throw new DomainError('INVALID_ROLE', 'Papel inválido.', 400);
  }

  // Só OWNER pode criar outro OWNER — hierarquia preservada (Cap. 5).
  if (mappedRole === 'OWNER' && session.role !== 'OWNER') {
    throw new DomainError('FORBIDDEN', 'Apenas o proprietário pode adicionar outro proprietário.', 403);
  }

  // Trava do Tier Free (Cap. 2.4): 1 usuário no plano gratuito.
  const userCount = await prismaUnscoped.user.count({ where: { tenantId: session.tenantId } });
  const subscription = await prismaUnscoped.subscription.findFirst({
    where: { tenantId: session.tenantId },
    include: { plan: { select: { code: true } } },
  });
  const isFree = !subscription || subscription.plan.code === 'FREE';

  if (isFree) {
    const userLimit = FREE_LIMITS.find((limit) => limit.key === 'users')?.limit ?? 1;
    if (userCount >= userLimit) {
      throw new DomainError(
        'FREE_LIMIT_REACHED',
        `O plano Free permite ${userLimit} usuário(s). Contrate um plano pago para ampliar a equipe.`,
        402,
        { limit: userLimit, current: userCount, moduleCode: 'usuarios' },
      );
    }
  }

  const emailTaken = await prismaUnscoped.user.findFirst({ where: { email } });
  if (emailTaken) {
    return jsonError(409, 'EMAIL_TAKEN', 'E-mail já cadastrado.');
  }

  // Senha provisória: fornecida pelo operador OU gerada com entropia real
  // (crypto), nunca com Math.random().
  const tempPassword =
    typeof body.password === 'string' && body.password.length >= 8
      ? body.password
      : generateTemporaryPassword();

  const passwordHash = await hashPassword(tempPassword);

  const created = await withTenant(
    { tenantId: session.tenantId, userId: session.userId, role: session.role },
    () =>
      prismaUnscoped.user.create({
        data: {
          tenantId: session.tenantId,
          name,
          email,
          passwordHash,
          role: mappedRole,
          active: true,
        },
        select: TEAM_SELECT,
      }),
  );

  const inviteUrl = absoluteUrl('/entrar');

  await emitNotification({
    recipientId: created.id,
    category: 'USER_INVITED',
    title: 'Você foi convidado para o Filitech ERP',
    body:
      `Um membro da equipe adicionou você com o papel ${mappedRole}. Acesse ${inviteUrl} ` +
      `e use as credenciais abaixo para entrar.\n\n` +
      `E-mail: ${email}\nSenha provisória: ${tempPassword}\n\n` +
      'Troque a senha após o primeiro acesso.',
    sourceType: 'EMAIL',
    actionUrl: inviteUrl,
    priority: 'HIGH',
    data: { role: mappedRole },
  });

  await writeAuditLog({
    tenantId: session.tenantId,
    userId: session.userId,
    action: 'USER_INVITED',
    entityType: 'User',
    entityId: created.id,
    after: { email: created.email, role: created.role },
    ...requestFingerprint(request),
  });

  return Response.json(
    {
      success: true,
      data: {
        user: created,
        // A senha provisória volta UMA vez para o convide exibir na tela.
        invitePassword: tempPassword,
        inviteUrl,
        message: 'Membro adicionado. Copie a senha provisória — ela não será exibida de novo.',
      },
      error: null,
    },
    { status: 201 },
  );
});
