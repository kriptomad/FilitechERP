// src/app/api/accounting-office/sped/route.ts — Cap. 21.18.5 / 21.18.1 (Caminho B)
//
//   GET  — documentos oficiais gerados para o tenant.
//   POST — gera um arquivo real a partir do plano de contas/vendas do próprio
//          tenant e o grava como OfficialTaxDocument (status GENERATED).
//
// O que este endpoint NÃO faz: fingir que transmitiu. Sem assinatura digital
// fora da plataforma não há protocolo — a resposta diz explicitamente.
import { prismaUnscoped } from '@/server/db';
import { DomainError, jsonSuccess } from '@/server/api-envelope';
import { requireSession } from '@/server/session';
import { requestFingerprint, writeAuditLog } from '@/server/audit';
import { handle } from '@/server/handler';
import { readJson, requireString } from '@/server/request';
import { generateExport, type ExportInput } from '@/server/services/sped-export';

export const dynamic = 'force-dynamic';

const DOCUMENT_TYPES = ['ECD', 'ECF', 'DEFIS'] as const;

/** DocumentType oficial → tarefa do motor recorrente (21.18.4). */
const TYPE_TO_TASK = {
  ECD: 'ECD_GERACAO',
  ECF: 'ECF_GERACAO',
  DEFIS: 'DEFIS_ENVIO',
} as const;

function serialize(row: {
  id: string;
  documentType: string;
  layoutVersion: string;
  competenciaInicio: Date;
  competenciaFim: Date;
  status: string;
  transmissionProtocol: string | null;
  rejectionReason: string | null;
  generatedAt: Date;
  generatedByAccountingFirmTenantId: string | null;
}) {
  return {
    id: row.id,
    documentType: row.documentType,
    layoutVersion: row.layoutVersion,
    competenciaInicio: row.competenciaInicio.toISOString(),
    competenciaFim: row.competenciaFim.toISOString(),
    status: row.status,
    transmissionProtocol: row.transmissionProtocol,
    rejectionReason: row.rejectionReason,
    generatedAt: row.generatedAt.toISOString(),
    generatedByFirm: Boolean(row.generatedByAccountingFirmTenantId),
    downloadUrl: `/api/accounting-office/sped/${row.id}/file`,
  };
}

export const GET = handle(async (request: Request) => {
  const session = await requireSession(request);

  const documents = await prismaUnscoped.officialTaxDocument.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { generatedAt: 'desc' },
    take: 200,
  });

  return jsonSuccess({ documents: documents.map(serialize) });
});

interface GenerateBody {
  documentType?: unknown;
  competenciaInicio?: unknown;
  competenciaFim?: unknown;
}

export const POST = handle(async (request: Request) => {
  const session = await requireSession(request);
  const body = await readJson<GenerateBody>(request);

  const documentType = requireString(body.documentType, 'documentType', {
    min: 3,
    max: 20,
  }).toUpperCase() as ExportInput['documentType'];

  if (!DOCUMENT_TYPES.includes(documentType as (typeof DOCUMENT_TYPES)[number])) {
    throw new DomainError('VALIDATION_ERROR', 'Tipo de documento não suportado.', 400, {
      field: 'documentType',
      allowed: DOCUMENT_TYPES,
    });
  }

  const inicio = body.competenciaInicio ? new Date(String(body.competenciaInicio)) : null;
  const fim = body.competenciaFim ? new Date(String(body.competenciaFim)) : null;

  if (!inicio || Number.isNaN(inicio.getTime())) {
    throw new DomainError('VALIDATION_ERROR', 'competenciaInicio inválida.', 400, {
      field: 'competenciaInicio',
    });
  }
  if (!fim || Number.isNaN(fim.getTime())) {
    throw new DomainError('VALIDATION_ERROR', 'competenciaFim inválida.', 400, {
      field: 'competenciaFim',
    });
  }

  const result = await generateExport({
    tenantId: session.tenantId,
    documentType,
    competenciaInicio: inicio,
    competenciaFim: fim,
  });

  const document = await prismaUnscoped.officialTaxDocument.create({
    data: {
      tenantId: session.tenantId,
      documentType: documentType as never,
      layoutVersion: result.layoutVersion,
      competenciaInicio: inicio,
      competenciaFim: fim,
      fileUrl: result.dataUrl,
      status: 'GENERATED',
      // Sem protocolo e sem rejeição: o arquivo existe, a transmissão não
      // aconteceu — e o sistema diz isto em vez de omitir o campo.
      transmissionProtocol: null,
      rejectionReason: null,
    },
  });

  // Fecha a tarefa recorrente correspondente: gerar é o que ela pedia.
  const taskType = TYPE_TO_TASK[documentType];
  const closedTask = await prismaUnscoped.accountingTask.updateMany({
    where: {
      clientTenantId: session.tenantId,
      taskType: taskType as never,
      status: { not: 'DONE' },
      competencia: {
        gte: inicio.toISOString().slice(0, 7),
        lte: fim.toISOString().slice(0, 7),
      },
    },
    data: { status: 'DONE', completedAt: new Date(), resultingDocumentId: document.id },
  });

  await writeAuditLog({
    tenantId: session.tenantId,
    userId: session.userId,
    action: closedTask.count > 0 ? 'ACCOUNTING_TASK_COMPLETED' : 'SETTINGS_UPDATED',
    entityType: 'OfficialTaxDocument',
    entityId: document.id,
    after: {
      documentType,
      layoutVersion: result.layoutVersion,
      bytes: result.bytes,
      status: 'GENERATED',
    },
    ...requestFingerprint(request),
  });

  return jsonSuccess(
    {
      document: serialize(document),
      bytes: result.bytes,
      sourceDescription: result.sourceDescription,
      tasksClosed: closedTask.count,
      // O consumidor (frontend/contador) precisa saber que isto é Caminho B.
      note:
        'Arquivo gerado para entrega ao contador. A transmissão eletrônica à Receita exige assinatura digital fora da plataforma.',
    },
    201,
  );
});
