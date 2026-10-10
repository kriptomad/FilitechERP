// src/app/api/accounting-office/firm-profile/route.ts — Cap. 21.18.6
//
// Perfil do ESCRITÓRIO (o lado que é contratado). Cria/editar o perfil é o que
// transforma um tenant comum em `tenantType = ACCOUNTING_OFFICE` e o torna
// elegível ao marketplace — não existe um "botão vira-contador" separado.
//
// Observação deliberada: os campos de avaliação (`marketplaceRatingAverage`,
// `marketplaceRatingCount`) NÃO aceitam escrita aqui. Só o agregador do Cap.
// 21.18.9 os muda; um endpoint que aceitasse nota seria voto autopropagado.
import { prismaUnscoped } from '@/server/db';
import { DomainError, jsonError, jsonSuccess } from '@/server/api-envelope';
import { requireSession } from '@/server/session';
import { roleHasPermission } from '@/server/gatekeeper';
import { requestFingerprint, writeAuditLog } from '@/server/audit';
import { handle } from '@/server/handler';
import { optionalString, readJson, requireString } from '@/server/request';
import { ALL_SCOPES, type EngagementScope } from '@/server/services/accounting-office';

export const dynamic = 'force-dynamic';

const PROFILE_SELECT = {
  id: true,
  crcNumber: true,
  responsibleAccountantName: true,
  responsibleAccountantCrc: true,
  bio: true,
  servicesOffered: true,
  baseMonthlyFee: true,
  isListedInMarketplace: true,
  marketplaceRatingAverage: true,
  marketplaceRatingCount: true,
  createdAt: true,
} as const;

export const GET = handle(async (request: Request) => {
  const session = await requireSession(request);

  const profile = await prismaUnscoped.accountingFirmProfile.findUnique({
    where: { tenantId: session.tenantId },
    select: PROFILE_SELECT,
  });

  return jsonSuccess({
    profile: profile
      ? {
          ...profile,
          baseMonthlyFee: profile.baseMonthlyFee ? Number(profile.baseMonthlyFee) : null,
          marketplaceRatingAverage: Number(profile.marketplaceRatingAverage),
          createdAt: profile.createdAt.toISOString(),
          isFirm: true,
        }
      : null,
    availableScopes: ALL_SCOPES,
  });
});

interface ProfileBody {
  crcNumber?: unknown;
  responsibleAccountantName?: unknown;
  responsibleAccountantCrc?: unknown;
  bio?: unknown;
  servicesOffered?: unknown;
  baseMonthlyFee?: unknown;
  isListedInMarketplace?: unknown;
}

export const PATCH = handle(async (request: Request) => {
  const session = await requireSession(request);

  // Cadastro de escritório e listagem pública — decisão do dono, não de um
  // operador de caixa. 403 explícito: responder `allowed:false` com HTTP 200
  // faria a tela "salvar" sem nada ter sido gravado.
  if (!roleHasPermission(session.role, 'billing:manage')) {
    return jsonError(
      403,
      'FORBIDDEN',
      'Apenas o proprietário ou gerente pode cadastrar ou publicar um perfil de escritório.',
    );
  }

  const body = await readJson<ProfileBody>(request);
  const existing = await prismaUnscoped.accountingFirmProfile.findUnique({
    where: { tenantId: session.tenantId },
    select: { id: true, isListedInMarketplace: true },
  });

  const isCreate = !existing;

  const crcNumber = requireString(body.crcNumber, 'crcNumber', { min: 4, max: 40 });
  const responsibleAccountantName = requireString(body.responsibleAccountantName, 'responsibleAccountantName', {
    min: 3,
    max: 120,
  });
  const responsibleAccountantCrc = requireString(body.responsibleAccountantCrc, 'responsibleAccountantCrc', {
    min: 4,
    max: 40,
  });

  const servicesOffered = (Array.isArray(body.servicesOffered) ? body.servicesOffered : []).filter(
    (value): value is EngagementScope =>
      typeof value === 'string' && (ALL_SCOPES as string[]).includes(value),
  );

  if (servicesOffered.length === 0) {
    throw new DomainError('VALIDATION_ERROR', 'Informe ao menos um serviço oferecido.', 400, {
      field: 'servicesOffered',
      allowed: ALL_SCOPES,
    });
  }

  // Ser listado sem dizer o que faz é exatamente o anúncio que o Cap. 21.18.6
  // quer evitar: o escopo precisa estar declarado antes de virar oferta.
  const wantsListing =
    typeof body.isListedInMarketplace === 'boolean'
      ? body.isListedInMarketplace
      : existing?.isListedInMarketplace ?? false;

  const listed = wantsListing && servicesOffered.length > 0;

  const data = {
    crcNumber,
    responsibleAccountantName,
    responsibleAccountantCrc,
    bio: optionalString(body.bio, 'bio', 600),
    servicesOffered: servicesOffered as never,
    baseMonthlyFee:
      body.baseMonthlyFee === null || body.baseMonthlyFee === undefined
        ? null
        : Number(body.baseMonthlyFee),
    isListedInMarketplace: listed,
  };

  if (typeof data.baseMonthlyFee === 'number' && !Number.isFinite(data.baseMonthlyFee)) {
    throw new DomainError('VALIDATION_ERROR', 'Honorário inválido.', 400, {
      field: 'baseMonthlyFee',
    });
  }
  if (data.baseMonthlyFee !== null && (data.baseMonthlyFee < 0 || data.baseMonthlyFee > 99999)) {
    throw new DomainError('VALIDATION_ERROR', 'Honorário fora do intervalo aceito.', 400, {
      field: 'baseMonthlyFee',
      min: 0,
      max: 99999,
    });
  }

  // `bio` vazio limpa o campo, então o null explícito é intencional aqui.
  const profile = await prismaUnscoped.$transaction(async (tx) => {
    const saved = existing
      ? await tx.accountingFirmProfile.update({ where: { id: existing.id }, data })
      : await tx.accountingFirmProfile.create({ data: { ...data, tenantId: session.tenantId } });

    // Marca o tenant como escritório AQUI, junto com o perfil — os dois são a
    // mesma afirmação em fontes distintas (a lista do marketplace filtra por
    // `tenantType`, o perfil só cuida dos dados).
    await tx.tenant.update({
      where: { id: session.tenantId },
      data: { tenantType: 'ACCOUNTING_OFFICE' },
    });

    return saved;
  });

  await writeAuditLog({
    tenantId: session.tenantId,
    userId: session.userId,
    action: isCreate ? 'ACCOUNTING_ENGAGEMENT_CREATED' : 'SETTINGS_UPDATED',
    entityType: 'AccountingFirmProfile',
    entityId: profile.id,
    after: {
      crcNumber,
      isListedInMarketplace: listed,
      servicesOffered,
    },
    ...requestFingerprint(request),
  });

  return jsonSuccess(
    {
      profile: {
        ...profile,
        baseMonthlyFee: profile.baseMonthlyFee ? Number(profile.baseMonthlyFee) : null,
        marketplaceRatingAverage: Number(profile.marketplaceRatingAverage),
        createdAt: profile.createdAt.toISOString(),
      },
      listed,
      message: listed
        ? 'Perfil publicado no marketplace de contadores.'
        : 'Perfil salvo. Ele não aparece no marketplace enquanto a publicação estiver desligada.',
    },
    isCreate ? 201 : 200,
  );
});
