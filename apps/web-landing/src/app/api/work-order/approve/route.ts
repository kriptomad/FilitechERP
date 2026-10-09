// src/app/api/work-order/approve/route.ts â€” Cap. 6.4 (aprovaÃ§Ã£o pÃºblica)
//
// AprovaÃ§Ã£o do orÃ§amento pelo link enviado ao cliente. Rota PÃšBLICA: o cliente
// nÃ£o tem conta no sistema, entÃ£o a autorizaÃ§Ã£o vem do token de uso Ãºnico.
import { prismaUnscoped } from '@/server/db';
import { DomainError } from '@/server/api-envelope';
import { approveBudgetByToken } from '@/server/services/work-orders';
import { writeAuditLog } from '@/server/audit';
import { handle } from '@/server/handler';

export const dynamic = 'force-dynamic';

interface ApproveBody {
  token?: unknown;
}

export const POST = handle(async (request: Request) => {
  const body = (await request.json()) as ApproveBody;
  const token = typeof body.token === 'string' ? body.token : '';

  if (!token) {
    throw new DomainError('TOKEN_REQUIRED', 'Token de aprovaÃ§Ã£o obrigatÃ³rio.');
  }

  const result = await approveBudgetByToken(prismaUnscoped, token);

  // A OS continua sem tenant_id no registro de log porque a aprovaÃ§Ã£o vem de
  // fora; buscamos o tenant pela prÃ³pria OS.
  const order = await prismaUnscoped.workOrder.findUnique({
    where: { id: result.workOrderId },
    select: { tenantId: true },
  });

  if (order) {
    const owner = await prismaUnscoped.user.findFirst({
      where: { tenantId: order.tenantId, role: 'OWNER' },
      select: { id: true },
    });
    if (owner) {
      await writeAuditLog({
        tenantId: order.tenantId,
        userId: owner.id,
        action: 'WORK_ORDER_APPROVED',
        entityType: 'WorkOrder',
        entityId: result.workOrderId,
        after: { approvedAt: result.approvedAt, source: 'link_publico' },
      });
    }
  }

  return Response.json({
    success: true,
    data: { ...result, message: 'OrÃ§amento aprovado. A assistÃªncia jÃ¡ foi notificada.' },
    error: null,
  });
});
