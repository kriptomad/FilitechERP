// src/app/api/accounting-office/dashboard/route.ts — Cap. 21.18.4 / 21.18.6
//
// Painel do módulo, servindo os DOIS lados com a mesma rota:
//   • lojista — seu vínculo, seus documentos, o que o contador precisa entregar;
//   • escritório — todos os clientes do vínculo, agrupados por status/tarefa.
//
// Os dois lados saem do mesmo `engagements` (21.18.2), então o que o lojista
// vê e o que o contador vê sempre coincide — não há tela paralela para manter.
import { prismaUnscoped } from '@/server/db';
import { jsonSuccess } from '@/server/api-envelope';
import { requireSession } from '@/server/session';
import { handle } from '@/server/handler';
import { listMarketplace } from '@/server/services/accounting-office';

export const dynamic = 'force-dynamic';

export const GET = handle(async (request: Request) => {
  const session = await requireSession(request);
  const tenantId = session.tenantId;

  const isFirm = await prismaUnscoped.accountingFirmProfile.findUnique({
    where: { tenantId },
    select: { id: true, isListedInMarketplace: true, servicesOffered: true, crcNumber: true },
  });

  const [engagements, tasks, documents, marketplace] = await Promise.all([
    prismaUnscoped.accountingEngagement.findMany({
      where: {
        OR: [{ clientTenantId: tenantId }, { accountingFirmTenantId: tenantId }],
      },
      orderBy: { grantedAt: 'desc' },
      include: {
        firmTenant: { select: { id: true, tradeName: true } },
        clientTenant: { select: { id: true, tradeName: true, cnpj: true } },
        _count: { select: { tasks: true, fees: true } },
      },
    }),
    prismaUnscoped.accountingTask.findMany({
      where: isFirm ? { accountingFirmTenantId: tenantId } : { clientTenantId: tenantId },
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
      take: 100,
      include: {
        clientTenant: { select: { tradeName: true } },
        firmTenant: { select: { tradeName: true } },
      },
    }),
    prismaUnscoped.officialTaxDocument.findMany({
      where: { tenantId },
      orderBy: { generatedAt: 'desc' },
      take: 50,
    }),
    isFirm ? Promise.resolve([]) : listMarketplace(),
  ]);

  const taskCounts: Record<string, number> = {};
  for (const task of tasks) {
    taskCounts[task.status] = (taskCounts[task.status] ?? 0) + 1;
  }

  const now = Date.now();
  const lateOrUpcoming = tasks.filter(
    (task: { status: string; dueDate: Date }) =>
      (task.status === 'PENDING' || task.status === 'LATE') &&
      task.dueDate.getTime() <= now + 7 * 24 * 60 * 60 * 1000,
  ).length;

  return jsonSuccess({
    role: isFirm ? 'firm' : 'client',
    firmProfile: isFirm
      ? {
          crcNumber: isFirm.crcNumber,
          listed: isFirm.isListedInMarketplace,
          servicesOffered: isFirm.servicesOffered,
        }
      : null,
    engagements: engagements.map((row) => ({
      id: row.id,
      status: row.status,
      scopes: row.scopes,
      firm: row.firmTenant,
      client: row.clientTenant,
      mine: row.clientTenantId === tenantId ? 'client' : 'firm',
      acceptanceDeadlineAt: row.acceptanceDeadlineAt.toISOString(),
      acceptedAt: row.acceptedAt?.toISOString() ?? null,
      revokedAt: row.revokedAt?.toISOString() ?? null,
      revokedReason: row.revokedReason,
      taskCount: row._count.tasks,
      feeCount: row._count.fees,
    })),
    tasks: tasks.map((task) => ({
      id: task.id,
      taskType: task.taskType,
      competencia: task.competencia,
      dueDate: task.dueDate.toISOString(),
      status: task.status,
      completedAt: task.completedAt?.toISOString() ?? null,
      resultingDocumentId: task.resultingDocumentId,
      client: task.clientTenant.tradeName,
      firm: task.firmTenant.tradeName,
    })),
    taskCounts,
    tasksDueSoon: lateOrUpcoming,
    documents: documents.map((doc) => ({
      id: doc.id,
      documentType: doc.documentType,
      status: doc.status,
      layoutVersion: doc.layoutVersion,
      competenciaInicio: doc.competenciaInicio.toISOString(),
      competenciaFim: doc.competenciaFim.toISOString(),
      generatedAt: doc.generatedAt.toISOString(),
      hasProtocol: Boolean(doc.transmissionProtocol),
      downloadUrl: `/api/accounting-office/sped/${doc.id}/file`,
    })),
    marketplace: (marketplace as { tenantId: string; tradeName: string }[]).map((firm) => ({
      tenantId: firm.tenantId,
      tradeName: firm.tradeName,
    })),
  });
});
