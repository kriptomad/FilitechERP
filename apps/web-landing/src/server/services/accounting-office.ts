// src/server/services/accounting-office.ts — Cap. 21.18
//
// Escritório de contabilidade virtual. Este módulo existe em DOIS caminhos
// (21.18.1) e nenhum deles é simulado:
//
//   Caminho A — o escritório é tenant da plataforma (`tenantType =
//   ACCOUNTING_OFFICE`), aparece no marketplace e recebe procuração eletrônica
//   no tenant do cliente. O acesso é sempre mediado por
//   `assertAccountingAccess()`, nunca por um booleano "contratado = true".
//
//   Caminho B — o lojista exporta os SPED/documentos oficiais em lote e entrega
//   ao contador de fora. Não depende de nenhum engagement.
//
// A autorização é fail-closed: sem um `AccountingEngagement` com status ACTIVE
// entre os dois lados, NADA é lido — e cada leitura concedida gera uma linha em
// `AccountingEngagementAuditEvent` com eventType `CROSS_TENANT_ACCESS`
// (21.18.3), que é o que torna o acesso auditável de verdade.
import { prismaUnscoped } from '../db';
import { DomainError } from '../api-envelope';

// ─────────────────────────────────────────────────────────────────────────────
// 21.18.3 — Procuração eletrônica interna
// ─────────────────────────────────────────────────────────────────────────────

export type EngagementScope =
  | 'FULL_BOOKKEEPING'
  | 'TAX_FILING'
  | 'PAYROLL_ESOCIAL'
  | 'PERSONAL_INCOME_TAX'
  | 'DOCUMENT_EXPORT_ONLY';

export const ALL_SCOPES: EngagementScope[] = [
  'FULL_BOOKKEEPING',
  'TAX_FILING',
  'PAYROLL_ESOCIAL',
  'PERSONAL_INCOME_TAX',
  'DOCUMENT_EXPORT_ONLY',
];

interface AccessCheck {
  firmTenantId: string;
  clientTenantId: string;
  actorUserId: string;
  /** Escopo exigido pela operação — o engagement precisa cobri-lo. */
  requiredScope?: EngagementScope;
  /** IP/UA da leitura, para a trilha. */
  ipAddress?: string;
  userAgent?: string;
}

/**
 * O ÚNICO caminho que permite um tenant ler dados de outro tenant.
 *
 * Contrato (21.18.3):
 *   1. precisa existir um engagement firm↔client com status ACTIVE;
 *   2. ele precisa cobrir o `requiredScope` pedido;
 *   3. a concessão é registrada em `AccountingEngagementAuditEvent`.
 *
 * Retorna o engagement para que o chamador use os `scopes` reais.
 */
export async function assertAccountingAccess(check: AccessCheck) {
  const { firmTenantId, clientTenantId, actorUserId, requiredScope } = check;

  if (!firmTenantId || !clientTenantId || firmTenantId === clientTenantId) {
    throw new DomainError('CROSS_TENANT_FORBIDDEN', 'Acesso entre tenants inválido.', 403);
  }

  const engagement = await prismaUnscoped.accountingEngagement.findFirst({
    where: {
      accountingFirmTenantId: firmTenantId,
      clientTenantId,
      status: 'ACTIVE',
    },
    orderBy: { grantedAt: 'desc' },
  });

  if (!engagement) {
    // Fail-closed: a mera existência de um engagement revogado/expirado não
    // concede nada, e o motivo é explícito para o operador do escritório.
    throw new DomainError(
      'ACCOUNTING_PROCURATION_MISSING',
      'Não há procuração ativa entre este escritório e este cliente.',
      403,
      { firmTenantId, clientTenantId },
    );
  }

  if (requiredScope && !engagement.scopes.includes(requiredScope)) {
    throw new DomainError(
      'ACCOUNTING_SCOPE_NOT_GRANTED',
      `A procuração ativa não cobre o escopo "${requiredScope}".`,
      403,
      { requiredScope, grantedScopes: engagement.scopes },
    );
  }

  // Linha por leitura real — é isto que permite responder "quem acessou o quê"
  // numa auditoria, em vez de confiar na ausência de logs.
  await prismaUnscoped.accountingEngagementAuditEvent.create({
    data: {
      engagementId: engagement.id,
      eventType: 'CROSS_TENANT_ACCESS',
      actorUserId,
      metadata: {
        requiredScope: requiredScope ?? null,
        ipAddress: check.ipAddress ?? null,
        userAgent: check.userAgent ?? null,
      },
    },
  });

  return engagement;
}

// ─────────────────────────────────────────────────────────────────────────────
// 21.18.2 — Ciclo de vida do engagement
// ─────────────────────────────────────────────────────────────────────────────

function logEvent(
  engagementId: string,
  eventType: string,
  actorUserId: string,
  metadata?: Record<string, unknown>,
) {
  return prismaUnscoped.accountingEngagementAuditEvent.create({
    data: { engagementId, eventType: eventType as never, actorUserId, metadata: metadata as never },
  });
}

export interface GrantInput {
  clientTenantId: string;
  grantedByUserId: string;
  firmTenantId: string;
  scopes: EngagementScope[];
  /** Prazo que o escritório tem para aceitar. Padrão: 7 dias. */
  acceptanceDays?: number;
}

/**
 * O LOJISTA concede a procuração (21.18.6 — ele é quem contrata no
 * marketplace). O estado nasce `PENDING_ACCOUNTANT_ACCEPTANCE`: conceder não é
 * conceder acesso, é abrir uma oferta que o outro lado precisa aceitar.
 */
export async function grantEngagement(input: GrantInput) {
  const scopes = input.scopes.filter((scope) => ALL_SCOPES.includes(scope));
  if (scopes.length === 0) {
    throw new DomainError('VALIDATION_ERROR', 'Selecione ao menos um escopo.', 400, {
      field: 'scopes',
      allowed: ALL_SCOPES,
    });
  }

  const firm = await prismaUnscoped.tenant.findFirst({
    where: { id: input.firmTenantId, status: { not: 'CANCELLED' } },
    select: { id: true, tradeName: true, tenantType: true },
  });
  if (!firm) throw new DomainError('FIRM_NOT_FOUND', 'Escritório de contabilidade não encontrado.', 404);

  // Um mesmo par só tem UM engagement vigente. Recontratar reutiliza o
  // registro (e apenda os scopes), senão a trilha de auditoria se partir em
  // duplicatas concorrentes.
  const existing = await prismaUnscoped.accountingEngagement.findFirst({
    where: { accountingFirmTenantId: input.firmTenantId, clientTenantId: input.clientTenantId },
    orderBy: { grantedAt: 'desc' },
  });

  const days = Math.min(Math.max(input.acceptanceDays ?? 7, 1), 30);
  const deadline = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  if (existing) {
    if (existing.status === 'ACTIVE') {
      const merged = Array.from(new Set([...existing.scopes, ...scopes]));
      const updated = await prismaUnscoped.accountingEngagement.update({
        where: { id: existing.id },
        data: { scopes: merged as never },
      });
      if (merged.length !== existing.scopes.length) {
        await logEvent(existing.id, 'SCOPE_CHANGED', input.grantedByUserId, {
          before: existing.scopes,
          after: merged,
        });
      }
      return updated;
    }

    // Reabre um engagement revogado/expirado em vez de criar um segundo.
    const reopened = await prismaUnscoped.accountingEngagement.update({
      where: { id: existing.id },
      data: {
        scopes: scopes as never,
        status: 'PENDING_ACCOUNTANT_ACCEPTANCE',
        grantedByUserId: input.grantedByUserId,
        grantedAt: new Date(),
        acceptanceDeadlineAt: deadline,
        acceptedByUserId: null,
        acceptedAt: null,
        revokedByUserId: null,
        revokedAt: null,
        revokedReason: null,
      },
    });
    await logEvent(existing.id, 'GRANTED', input.grantedByUserId, { scopes, reopened: true });
    return reopened;
  }

  const created = await prismaUnscoped.accountingEngagement.create({
    data: {
      accountingFirmTenantId: input.firmTenantId,
      clientTenantId: input.clientTenantId,
      scopes: scopes as never,
      status: 'PENDING_ACCOUNTANT_ACCEPTANCE',
      grantedByUserId: input.grantedByUserId,
      acceptanceDeadlineAt: deadline,
    },
  });

  await logEvent(created.id, 'GRANTED', input.grantedByUserId, { scopes, deadline });

  // O escritório é notificado: a procuração fica esperando a aceite dele.
  await notifyTenant(input.firmTenantId, {
    title: 'Nova procuração recebida',
    body: `Um cliente concedeu procuração para ${scopes.length} escopo(s). Responda antes de ${deadline.toLocaleDateString('pt-BR')}.`,
    kind: 'ACCOUNTING_PROCURATION',
    link: '/contabilidade',
  });

  return created;
}

/** O ESCRITÓRIO aceita ou recusa (21.18.3 — só a partir daí há acesso). */
export async function respondEngagement(input: {
  engagementId: string;
  firmTenantId: string;
  userId: string;
  accept: boolean;
  reason?: string;
}) {
  const engagement = await prismaUnscoped.accountingEngagement.findUnique({
    where: { id: input.engagementId },
  });

  if (!engagement || engagement.accountingFirmTenantId !== input.firmTenantId) {
    throw new DomainError('ENGAGEMENT_NOT_FOUND', 'Procuração não encontrada.', 404);
  }

  if (engagement.status !== 'PENDING_ACCOUNTANT_ACCEPTANCE') {
    throw new DomainError(
      'ENGAGEMENT_NOT_PENDING',
      `Procuração já está em "${engagement.status}" e não pode ser respondida.`,
      409,
    );
  }

  if (new Date() > engagement.acceptanceDeadlineAt) {
    // O prazo venceu entre a tela e o clique — não é mais uma aceite válida.
    await prismaUnscoped.accountingEngagement.update({
      where: { id: engagement.id },
      data: { status: 'EXPIRED' },
    });
    await logEvent(engagement.id, 'EXPIRED', input.userId, { at: 'respond' });
    throw new DomainError('ENGAGEMENT_EXPIRED', 'O prazo de aceite expirou.', 410);
  }

  const status = input.accept ? 'ACTIVE' : 'REVOKED_BY_ACCOUNTANT';

  const updated = await prismaUnscoped.accountingEngagement.update({
    where: { id: engagement.id },
    data: {
      status: status as never,
      acceptedByUserId: input.accept ? input.userId : null,
      acceptedAt: input.accept ? new Date() : null,
      revokedByUserId: input.accept ? null : input.userId,
      revokedAt: input.accept ? null : new Date(),
      revokedReason: input.accept ? null : input.reason ?? null,
    },
  });

  await logEvent(
    engagement.id,
    input.accept ? 'ACCEPTED' : 'REVOKED_BY_ACCOUNTANT',
    input.userId,
    { reason: input.reason ?? null },
  );

  await notifyTenant(engagement.clientTenantId, {
    title: input.accept ? 'Escritório ativado' : 'Procuração recusada',
    body: input.accept
      ? 'A procuração foi aceita: o escritório já pode gerar seus documentos fiscais.'
      : `O escritório recusou a procuração${input.reason ? `: ${input.reason}` : '.'}`,
    kind: 'ACCOUNTING_PROCURATION',
    link: '/contabilidade',
  });

  return updated;
}

/** Revogação pelos DOIS lados — o lojista pode cortar o acesso a qualquer hora. */
export async function revokeEngagement(input: {
  engagementId: string;
  userId: string;
  /** Lado que revoga — cada um grava seu próprio `revokedByUserId`. */
  side: 'client' | 'firm';
  tenantId: string;
  reason?: string;
}) {
  const engagement = await prismaUnscoped.accountingEngagement.findUnique({
    where: { id: input.engagementId },
  });

  const ownsIt =
    engagement &&
    (input.side === 'client'
      ? engagement.clientTenantId === input.tenantId
      : engagement.accountingFirmTenantId === input.tenantId);

  if (!engagement || !ownsIt) {
    throw new DomainError('ENGAGEMENT_NOT_FOUND', 'Procuração não encontrada.', 404);
  }

  if (engagement.status !== 'ACTIVE' && engagement.status !== 'PENDING_ACCOUNTANT_ACCEPTANCE') {
    throw new DomainError('ENGAGEMENT_CLOSED', `Procuração já está em "${engagement.status}".`, 409);
  }

  const eventType = input.side === 'client' ? 'REVOKED_BY_CLIENT' : 'REVOKED_BY_ACCOUNTANT';

  const updated = await prismaUnscoped.accountingEngagement.update({
    where: { id: engagement.id },
    data: {
      status: eventType as never,
      revokedByUserId: input.userId,
      revokedAt: new Date(),
      revokedReason: input.reason ?? null,
    },
  });

  await logEvent(engagement.id, eventType, input.userId, { reason: input.reason ?? null });

  return updated;
}

// ─────────────────────────────────────────────────────────────────────────────
// 21.18.6 — Marketplace de contadores
// ─────────────────────────────────────────────────────────────────────────────

export interface MarketplaceFirm {
  tenantId: string;
  tradeName: string;
  uf: string | null;
  crcNumber: string;
  responsibleAccountantName: string;
  responsibleAccountantCrc: string;
  bio: string | null;
  servicesOffered: string[];
  baseMonthlyFee: number | null;
  marketplaceRatingAverage: number;
  marketplaceRatingCount: number;
}

export async function listMarketplace(): Promise<MarketplaceFirm[]> {
  const firms = await prismaUnscoped.accountingFirmProfile.findMany({
    where: {
      isListedInMarketplace: true,
      // TRIAL entra de propósito: um escritório que acabou de se cadastrar está
      // num trial legítimo e o produto não pode deixá-lo invisível só por isso.
      // SUSPENDED/CANCELLED ficam de fora — ninguém contrata quem está bloqueado.
      tenant: { status: { in: ['ACTIVE', 'TRIAL'] }, tenantType: 'ACCOUNTING_OFFICE' },
    },
    include: { tenant: { select: { tradeName: true, uf: true } } },
    orderBy: [{ marketplaceRatingAverage: 'desc' }, { baseMonthlyFee: 'asc' }],
  });

  return firms.map((profile) => ({
    tenantId: profile.tenantId,
    tradeName: profile.tenant.tradeName,
    uf: profile.tenant.uf,
    crcNumber: profile.crcNumber,
    responsibleAccountantName: profile.responsibleAccountantName,
    responsibleAccountantCrc: profile.responsibleAccountantCrc,
    bio: profile.bio,
    servicesOffered: profile.servicesOffered,
    baseMonthlyFee: profile.baseMonthlyFee ? Number(profile.baseMonthlyFee) : null,
    marketplaceRatingAverage: Number(profile.marketplaceRatingAverage),
    marketplaceRatingCount: profile.marketplaceRatingCount,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// 21.18.4 — Motor de tarefas recorrentes
// ─────────────────────────────────────────────────────────────────────────────

/** Escopo → tarefas que ele realmente implica. */
const SCOPE_TASKS: Record<string, string[]> = {
  FULL_BOOKKEEPING: ['DAS_GERACAO', 'DARF_GERACAO', 'ECD_GERACAO', 'ECF_GERACAO'],
  TAX_FILING: ['DAS_GERACAO', 'DARF_GERACAO'],
  PAYROLL_ESOCIAL: ['FOLHA_FECHAMENTO'],
  PERSONAL_INCOME_TAX: ['IRPF_DECLARACAO'],
  DOCUMENT_EXPORT_ONLY: [],
};

const DUE_DAY: Record<string, number> = {
  DAS_GERACAO: 20,
  DARF_GERACAO: 15,
  FOLHA_FECHAMENTO: 10,
  EFD_REINF_ENVIO: 15,
  DCTFWEB_GERACAO: 15,
};

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Gera as tarefas de uma competência para TODOS os engagements ativos.
 *
 * Idempotente por natureza (unique lógico engagement+tarefa+competência):
 * rodar duas vezes não duplica. É a função que a Vercel Cron chama — e não um
 * botão que um humano precisa lembrar de apertar.
 */
export async function generateTasksForCompetencia(competencia: Date) {
  const key = monthKey(competencia);
  const engagements = await prismaUnscoped.accountingEngagement.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      accountingFirmTenantId: true,
      clientTenantId: true,
      scopes: true,
      clientTenant: { select: { taxRegime: true } },
    },
  });

  let created = 0;

  for (const engagement of engagements) {
    const types = new Set<string>();
    for (const scope of engagement.scopes) {
      for (const type of SCOPE_TASKS[scope] ?? []) types.add(type);
    }

    // MEI não tem ECD/ECF no mesmo formato — a tarefa não nasce para não virar
    // ruído permanente na agenda do contador.
    if (engagement.clientTenant.taxRegime === 'MEI') {
      types.delete('ECD_GERACAO');
      types.delete('ECF_GERACAO');
    }

    const existing = await prismaUnscoped.accountingTask.findMany({
      where: { engagementId: engagement.id, competencia: key },
      select: { taskType: true },
    });
    const already = new Set(existing.map((row) => row.taskType));

    for (const taskType of types) {
      if (already.has(taskType as never)) continue;

      // Vencimento calculado sobre o MÊS SEGUINTE ao da competência — é o
      // prazo real de entrega, não "hoje + 7 dias".
      const nextMonth = new Date(
        Date.UTC(competencia.getUTCFullYear(), competencia.getUTCMonth() + 1, 1),
      );
      const day = DUE_DAY[taskType] ?? 15;
      const dueDate = new Date(Date.UTC(
        nextMonth.getUTCFullYear(),
        nextMonth.getUTCMonth(),
        day,
      ));

      await prismaUnscoped.accountingTask.create({
        data: {
          accountingFirmTenantId: engagement.accountingFirmTenantId,
          clientTenantId: engagement.clientTenantId,
          engagementId: engagement.id,
          taskType: taskType as never,
          competencia: key,
          dueDate,
          status: 'PENDING',
        },
      });
      created += 1;
    }
  }

  return { competencia: key, engagements: engagements.length, created };
}

/** Marca como atrasada toda tarefa vencida ainda em aberto. */
export async function markLateTasks() {
  const late = await prismaUnscoped.accountingTask.updateMany({
    where: {
      status: { in: ['PENDING', 'IN_PROGRESS'] },
      dueDate: { lt: new Date() },
    },
    data: { status: 'LATE' },
  });
  return late.count;
}

// ─────────────────────────────────────────────────────────────────────────────
// Notificações — sempre gravam no banco (Cap. 8.4), nunca só console.log.
// ─────────────────────────────────────────────────────────────────────────────

interface NotifyPayload {
  title: string;
  body: string;
  kind: string;
  link: string;
}

/**
 * Notificação real (Cap. 8.4): grava com `tenantId` + `recipientId`, que é o
 * que o badge do header consulta. Um destinatário é requisito do schema —
 * sem usuário ativo a notificação é registrada no log e o fluxo segue.
 */
async function notifyTenant(tenantId: string, payload: NotifyPayload) {
  try {
    const recipient = await prismaUnscoped.user.findFirst({
      where: { tenantId, active: true, role: { in: ['OWNER', 'MANAGER'] } },
      select: { id: true },
    });
    if (!recipient) {
      console.warn('[accounting-office] sem OWNER/MANAGER ativo para notificar:', tenantId);
      return;
    }

    await prismaUnscoped.notification.create({
      data: {
        tenantId,
        recipientId: recipient.id,
        category: payload.kind,
        title: payload.title,
        body: payload.body,
        actionUrl: payload.link,
        data: { source: 'accounting-office' },
      },
    });
  } catch (err) {
    // Notificação não pode derrubar o fluxo de negócio — mas o log fica.
    console.error('[accounting-office] falha ao notificar:', err);
  }
}
