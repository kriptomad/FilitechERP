// src/app/api/admin/services/[id]/route.ts — Cap. 11
//
// PATCH faz update real; DELETE é protegido: serviço já utilizado não pode
// sumir, porque OS/contrato perderiam a referência de preço e comissão.
import { DomainError, jsonError } from '@/server/api-envelope';
import { prismaUnscoped } from '@/server/db';
import { requireSession } from '@/server/session';
import { gatekeeper } from '@/server/gatekeeper';
import { readJson, requireNumber } from '@/server/request';
import { writeAuditLog, requestFingerprint } from '@/server/audit';
import {
  deleteService,
  updateService,
  type ServiceInput,
} from '@/server/services/admin-services';
import { handle } from '@/server/handler';

export const dynamic = 'force-dynamic';

interface PatchBody {
  name?: unknown;
  nicheTag?: unknown;
  basePrice?: unknown;
  estimatedDurationMinutes?: unknown;
  commissionPercentage?: unknown;
  active?: unknown;
}

export const PATCH = handle(
  async (request: Request, { params }: { params: { id: string } }) => {
    const session = await requireSession(request);
    await gatekeeper(session, { moduleCode: 'crm', requiredPermission: 'crm:write' });

    const body = await readJson<PatchBody>(request);

    const payload: Partial<ServiceInput> = {};
    if (body.name !== undefined) payload.name = String(body.name).trim();
    if (body.nicheTag !== undefined) payload.nicheTag = String(body.nicheTag);
    if (body.basePrice !== undefined) payload.basePrice = requireNumber(body.basePrice, 'preço');
    if (body.estimatedDurationMinutes !== undefined) {
      payload.estimatedDurationMinutes = requireNumber(
        body.estimatedDurationMinutes,
        'duração',
      );
    }
    if (body.commissionPercentage !== undefined) {
      payload.commissionPercentage = requireNumber(body.commissionPercentage, 'comissão');
    }
    if (body.active !== undefined) payload.active = body.active === true;

    const updated = await updateService(
      prismaUnscoped,
      session.tenantId,
      params.id,
      payload,
    );

    await writeAuditLog({
      tenantId: session.tenantId,
      userId: session.userId,
      action: 'SETTINGS_UPDATED',
      entityType: 'Service',
      entityId: params.id,
      after: { name: updated.name, active: updated.active },
      ...requestFingerprint(request),
    });

    return { success: true, data: updated, error: null };
  },
);

export const DELETE = handle(
  async (request: Request, { params }: { params: { id: string } }) => {
    const session = await requireSession(request);
    await gatekeeper(session, { moduleCode: 'crm', requiredPermission: 'crm:write' });

    try {
      const result = await deleteService(prismaUnscoped, session.tenantId, params.id);

      await writeAuditLog({
        tenantId: session.tenantId,
        userId: session.userId,
        action: 'SETTINGS_UPDATED',
        entityType: 'Service',
        entityId: params.id,
        ...requestFingerprint(request),
      });

      return { success: true, data: result, error: null };
    } catch (err) {
      if (err instanceof DomainError && err.code === 'SERVICE_IN_USE') {
        return jsonError(409, 'SERVICE_IN_USE', err.message, err.details);
      }
      throw err;
    }
  },
);
