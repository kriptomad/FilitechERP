// src/app/api/admin/clients/[id]/route.ts — Cap. 4.6
//
// Antes devolvia `{ id: params.id, ...body }` (eco puro) e o DELETE respondia
// "excluído com sucesso" sem tocar no banco — inclusive para clientes com
// histórico vinculado, o que quebraria a trilha financeira e fiscal.
import { prismaUnscoped } from '@/server/db';
import { DomainError, jsonError } from '@/server/api-envelope';
import { requireSession } from '@/server/session';
import { gatekeeper } from '@/server/gatekeeper';
import { readJson, optionalString, requireNumber } from '@/server/request';
import { writeAuditLog, requestFingerprint } from '@/server/audit';
import { deleteClient, updateClient } from '@/server/services/admin-clients';
import { handle } from '@/server/handler';

export const dynamic = 'force-dynamic';

interface PatchBody {
  name?: unknown;
  document?: unknown;
  phone?: unknown;
  email?: unknown;
  creditLimit?: unknown;
  isBusinessAccount?: unknown;
}

export const PATCH = handle(
  async (request: Request, { params }: { params: { id: string } }) => {
    const session = await requireSession(request);
    await gatekeeper(session, { moduleCode: 'crm', requiredPermission: 'crm:write' });

    const body = await readJson<PatchBody>(request);

    try {
      const updated = await updateClient(prismaUnscoped, session.tenantId, params.id, {
        name: body.name !== undefined ? String(body.name).trim() : undefined,
        document: body.document === null ? null : optionalString(body.document, 'documento', 30),
        phone: body.phone === null ? null : optionalString(body.phone, 'telefone', 40),
        email: body.email === null ? null : optionalString(body.email, 'e-mail', 180),
        creditLimit:
          typeof body.creditLimit === 'number'
            ? requireNumber(body.creditLimit, 'limite')
            : undefined,
        isBusinessAccount:
          typeof body.isBusinessAccount === 'boolean' ? body.isBusinessAccount : undefined,
      });

      await writeAuditLog({
        tenantId: session.tenantId,
        userId: session.userId,
        action: 'CLIENT_UPDATED',
        entityType: 'Client',
        entityId: params.id,
        after: { name: updated.name, creditLimit: updated.creditLimit },
        ...requestFingerprint(request),
      });

      return { success: true, data: updated, error: null };
    } catch (err) {
      if (err instanceof DomainError && err.code === 'CREDIT_LIMIT_BELOW_BALANCE') {
        return jsonError(409, 'CREDIT_LIMIT_BELOW_BALANCE', err.message);
      }
      throw err;
    }
  },
);

export const DELETE = handle(
  async (request: Request, { params }: { params: { id: string } }) => {
    const session = await requireSession(request);
    await gatekeeper(session, { moduleCode: 'crm', requiredPermission: 'crm:write' });

    try {
      const result = await deleteClient(prismaUnscoped, session.tenantId, params.id);

      await writeAuditLog({
        tenantId: session.tenantId,
        userId: session.userId,
        action: 'CLIENT_DELETED',
        entityType: 'Client',
        entityId: params.id,
        ...requestFingerprint(request),
      });

      return { success: true, data: result, error: null };
    } catch (err) {
      // Cliente com histórico é DESATIVADO, não apagado (Cap. 4.6) — o 409
      // carrega o detalhe do que impede a exclusão para a UI mostrar.
      if (err instanceof DomainError && err.code === 'CLIENT_IN_USE') {
        return jsonError(409, 'CLIENT_IN_USE', err.message, err.details);
      }
      throw err;
    }
  },
);
