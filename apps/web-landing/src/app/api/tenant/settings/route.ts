// src/app/api/tenant/settings/route.ts — Cap. 5 / 21.1
//
// Ajustes fiscais do tenant.
//
// Gap que este arquivo fecha: o regime tributário era LIDO em vários lugares
// (`tenant/me`, session-context, emissão fiscal), mas NÃO podia ser alterado em
// lugar nenhum. O spec (Cap. 21.1) exige regime real — não alíquota fixa
// hardcoded — e um tenant que não consegue corrigir o próprio regime continuaria
// emitindo com o valor errado para sempre.
//
// CNPJ e razão social NÃO entram aqui: mudar identificação fiscal por este
// endpoint tornaria a escrituração inconsistente. Eles são alterados apenas no
// cadastro, com revalidação.
import { prismaUnscoped } from '@/server/db';
import { DomainError, jsonError, jsonSuccess } from '@/server/api-envelope';
import { requireSession } from '@/server/session';
import { roleHasPermission } from '@/server/gatekeeper';
import { writeAuditLog, requestFingerprint } from '@/server/audit';
import { optionalString, readJson, requireString } from '@/server/request';
import { handle } from '@/server/handler';
import type { TaxRegime } from '@prisma/client';

export const dynamic = 'force-dynamic';

const TAX_REGIMES: TaxRegime[] = ['MEI', 'SIMPLES_NACIONAL', 'LUCRO_PRESUMIDO', 'LUCRO_REAL'];

/** Unidades federativas brasileiras — valida antes de gravar (nada de "XX"). */
const UFS = new Set([
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS',
  'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC',
  'SE', 'SP', 'TO',
]);

interface SettingsBody {
  taxRegime?: unknown;
  simplesNacionalAnexo?: unknown;
  inscricaoEstadual?: unknown;
  uf?: unknown;
}

export const PATCH = handle(async (request: Request) => {
  const session = await requireSession(request);

  // Configuração fiscal mexe em como o sistema calcula imposto para TODO o
  // tenant — não é tarefa de caixa/técnico.
  if (!roleHasPermission(session.role, 'billing:manage')) {
    return jsonError(403, 'FORBIDDEN', 'Apenas o proprietário ou gerente pode alterar dados fiscais.');
  }

  const body = await readJson<SettingsBody>(request);

  const taxRegimeInput = body.taxRegime === undefined ? undefined : String(body.taxRegime);
  if (taxRegimeInput !== undefined && !TAX_REGIMES.includes(taxRegimeInput as TaxRegime)) {
    throw new DomainError('VALIDATION_ERROR', 'Regime tributário inválido.', 400, {
      field: 'taxRegime',
      allowed: TAX_REGIMES,
    });
  }

  const data: Record<string, unknown> = {};

  // `''`/`null` LIMPA o campo — `optionalString` devolve `undefined` para
  // string vazia, e sem este tratamento seria impossível zerar um anexo
  // preenchido (o form mandaria `''` e o registro ficaria preso pra sempre).
  if (body.simplesNacionalAnexo !== undefined) {
    const anexo = body.simplesNacionalAnexo === null
      ? null
      : optionalString(body.simplesNacionalAnexo, 'anexo', 10) ?? null;

    if (anexo && !/^[IVX]+$/.test(anexo.toUpperCase())) {
      throw new DomainError('VALIDATION_ERROR', 'Anexo inválido (ex.: I, II, III, IV, V).', 400, {
        field: 'simplesNacionalAnexo',
      });
    }

    data.simplesNacionalAnexo = anexo ? anexo.toUpperCase() : null;
  }

  if (body.uf !== undefined) {
    // `uf` é anulável no schema — o mesmo tratamento do anexo.
    if (body.uf === null || body.uf === '') {
      data.uf = null;
    } else {
      const uf = requireString(body.uf, 'UF', { min: 2, max: 2 }).toUpperCase();
      if (!UFS.has(uf)) {
        throw new DomainError('VALIDATION_ERROR', 'UF inválida.', 400, { field: 'uf' });
      }
      data.uf = uf;
    }
  }

  if (body.inscricaoEstadual !== undefined) {
    const ie = body.inscricaoEstadual === null
      ? null
      : optionalString(body.inscricaoEstadual, 'inscrição estadual', 30) ?? null;
    data.inscricaoEstadual = ie;
  }

  if (taxRegimeInput !== undefined) data.taxRegime = taxRegimeInput;

  if (Object.keys(data).length === 0) {
    throw new DomainError('VALIDATION_ERROR', 'Nenhum campo para atualizar.', 400);
  }

  const before = await prismaUnscoped.tenant.findUnique({
    where: { id: session.tenantId },
    select: { taxRegime: true, simplesNacionalAnexo: true, inscricaoEstadual: true, uf: true },
  });
  if (!before) throw new DomainError('TENANT_NOT_FOUND', 'Conta não encontrada.', 404);

  const tenant = await prismaUnscoped.tenant.update({
    where: { id: session.tenantId },
    data,
    select: {
      id: true,
      taxRegime: true,
      simplesNacionalAnexo: true,
      inscricaoEstadual: true,
      uf: true,
    },
  });

  await writeAuditLog({
    tenantId: session.tenantId,
    userId: session.userId,
    action: 'SETTINGS_UPDATED',
    entityType: 'Tenant',
    entityId: tenant.id,
    before: before as unknown as Record<string, unknown>,
    after: data,
    ...requestFingerprint(request),
  });

  return jsonSuccess({ tenant });
});
