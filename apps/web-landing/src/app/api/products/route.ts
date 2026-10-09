// src/app/api/products/route.ts — Cap. 4.1 / 6.1
import { prismaUnscoped } from '@/server/db';
import { DomainError } from '@/server/api-envelope';
import { readSession } from '@/server/session';
import { readJson, requireString, optionalString, requireNumber } from '@/server/request';
import { writeAuditLog, requestFingerprint } from '@/server/audit';
import { handle } from '@/server/handler';

export const dynamic = 'force-dynamic';

export interface ProductRow {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  category: string | null;
  unitPrice: number;
  wholesalePrice: number | null;
  stockQuantity: number;
  minStockThreshold: number | null;
  isWeighted: boolean;
  isReturnableContainer: boolean;
  isReturnable: boolean;
  requiresPrescriptionRetention: boolean;
  isControlledSubstance: boolean;
  trackingType: string;
  active: boolean;
}

export const GET = handle(async (request: Request) => {
  const session = await readSession(request);
  if (!session) throw new DomainError('UNAUTHENTICATED', 'Sessão ausente ou expirada.', 401);

  const url = new URL(request.url);
  const search = url.searchParams.get('q') ?? undefined;
  const activeOnly = url.searchParams.get('all') !== '1';

  const products = await prismaUnscoped.product.findMany({
    where: {
      tenantId: session.tenantId,
      ...(activeOnly ? { active: true } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { sku: { contains: search, mode: 'insensitive' as const } },
              { barcode: { contains: search } },
            ],
          }
        : {}),
    },
    orderBy: { name: 'asc' },
    take: 500,
  });

  return {
    success: true,
    data: products.map(serialize),
    error: null,
  };
});

interface CreateBody {
  name?: unknown;
  sku?: unknown;
  barcode?: unknown;
  category?: unknown;
  unitPrice?: unknown;
  wholesalePrice?: unknown;
  stockQuantity?: unknown;
  minStockThreshold?: unknown;
  isWeighted?: unknown;
  isReturnableContainer?: unknown;
  isReturnable?: unknown;
  requiresPrescriptionRetention?: unknown;
  isControlledSubstance?: unknown;
  trackingType?: unknown;
}

export const POST = handle(async (request: Request) => {
  const session = await readSession(request);
  if (!session) throw new DomainError('UNAUTHENTICATED', 'Sessão ausente ou expirada.', 401);

  const body = await readJson<CreateBody>(request);

  const name = requireString(body.name, 'nome', { min: 2, max: 160 });
  const sku =
    optionalString(body.sku, 'sku', 60) ??
    `SKU-${name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)}`;

  const created = await prismaUnscoped.product.create({
    data: {
      tenantId: session.tenantId,
      name,
      sku,
      barcode: optionalString(body.barcode, 'código de barras', 60) ?? null,
      category: optionalString(body.category, 'categoria', 80) ?? null,
      unitPrice: requireNumber(body.unitPrice ?? 0, 'preço'),
      wholesalePrice:
        typeof body.wholesalePrice === 'number' ? body.wholesalePrice : null,
      stockQuantity: typeof body.stockQuantity === 'number' ? body.stockQuantity : 0,
      minStockThreshold:
        typeof body.minStockThreshold === 'number' ? body.minStockThreshold : null,
      isWeighted: body.isWeighted === true,
      isReturnableContainer: body.isReturnableContainer === true,
      isReturnable: body.isReturnable !== false,
      requiresPrescriptionRetention: body.requiresPrescriptionRetention === true,
      isControlledSubstance: body.isControlledSubstance === true,
      trackingType: (optionalString(body.trackingType, 'controle', 20) ?? 'NONE') as never,
    },
  });

  await writeAuditLog({
    tenantId: session.tenantId,
    userId: session.userId,
    action: 'SETTINGS_UPDATED',
    entityType: 'Product',
    entityId: created.id,
    after: { name: created.name, sku: created.sku },
    ...requestFingerprint(request),
  });

  return {
    success: true,
    data: serialize(created),
    error: null,
  };
});

function serialize(product: {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  category: string | null;
  unitPrice: { toNumber(): number } | number;
  wholesalePrice: { toNumber(): number } | number | null;
  stockQuantity: { toNumber(): number } | number;
  minStockThreshold: { toNumber(): number } | number | null;
  isWeighted: boolean;
  isReturnableContainer: boolean;
  isReturnable: boolean;
  requiresPrescriptionRetention: boolean;
  isControlledSubstance: boolean;
  trackingType: string;
  active: boolean;
}): ProductRow {
  const num = (v: { toNumber(): number } | number | null | undefined): number | null =>
    v === null || v === undefined ? null : typeof v === 'number' ? v : v.toNumber();

  return {
    id: product.id,
    sku: product.sku,
    barcode: product.barcode,
    name: product.name,
    category: product.category,
    unitPrice: num(product.unitPrice) ?? 0,
    wholesalePrice: num(product.wholesalePrice),
    stockQuantity: num(product.stockQuantity) ?? 0,
    minStockThreshold: num(product.minStockThreshold),
    isWeighted: product.isWeighted,
    isReturnableContainer: product.isReturnableContainer,
    isReturnable: product.isReturnable,
    requiresPrescriptionRetention: product.requiresPrescriptionRetention,
    isControlledSubstance: product.isControlledSubstance,
    trackingType: product.trackingType,
    active: product.active,
  };
}
