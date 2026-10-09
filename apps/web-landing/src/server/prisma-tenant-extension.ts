// src/server/prisma-tenant-extension.ts — Cap. 7.2
// Extensão do Prisma que injeta `tenantId` em TODA operação de modelo
// tenant-scoped. Fail-closed por design: operação sem regra definida lança.
import { PrismaClient } from '@prisma/client';
import { getCurrentTenantId } from './tenant-context';

const TENANT_SCOPED_MODELS = new Set([
  // NOTA: "Tenant" e "BillingEvent" NÃO entram aqui — não possuem coluna
  // tenantId própria (endereçam-se via session/subscription, já escopados).
  // Listá-los injetaria um WHERE inexistente e quebraria o próprio onboarding.
  'TenantModule',
  'Subscription',
  'User',
  'RolePermission',
  'Client',
  'Supplier',
  'Product',
  'ProductBatch',
  'ProductSerial',
  'ProductVariantAxis',
  'ProductVariant',
  'Recipe',
  'RecipeItem',
  'ProductionBatch',
  'ReturnableContainerLedger',
  'PrescriptionRecord',
  'WorkOrder',
  'WorkOrderItem',
  'OsChecklist',
  'OsPhoto',
  'Sale',
  'SaleItem',
  'Payment',
  'CashRegister',
  'StockMovement',
  'AccountPayable',
  'AccountReceivable',
  'FiscalDocument',
  // Cap. 12 — expansão de nichos
  'Service',
  'Appointment',
  'ClientServicePackage',
  'RestaurantTable',
  'Comanda',
  'ComandaItem',
  'OpticalPrescription',
  'Pet',
  'VaccineRecord',
  'Vehicle',
  'VehicleListing',
]);

const READ_OPERATIONS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
]);

const WRITE_WHERE_OPERATIONS = new Set([
  'update',
  'updateMany',
  'delete',
  'deleteMany',
  'upsert',
]);

/**
 * Aplica o escopo de tenant nos args da operação (Cap. 7.2).
 * Exportada para teste do guard fail-closed (Cap. 7.3).
 */
export function applyTenantScopeToArgs(
  operation: string,
  args: Record<string, unknown>,
  tenantId: string,
): Record<string, unknown> {
  if (operation === 'create') {
    args.data = { ...(args.data as object), tenantId };
    return args;
  }

  if (operation === 'createMany' || operation === 'createManyAndReturn') {
    args.data = Array.isArray(args.data)
      ? args.data.map((item: Record<string, unknown>) => ({ ...item, tenantId }))
      : args.data;
    return args;
  }

  // P0: upsert precisa de tenantId em `where` E em `create` — apenas em `where`
  // a linha criada ficaria sem tenant e vazaria para outros tenants.
  if (operation === 'upsert') {
    args.where = { ...((args.where as object) ?? {}), tenantId };
    args.create = { ...(args.create as object), tenantId };
    return args;
  }

  if (READ_OPERATIONS.has(operation) || WRITE_WHERE_OPERATIONS.has(operation)) {
    args.where = { ...((args.where as object) ?? {}), tenantId };
    return args;
  }

  throw new Error(
    `Operação "${operation}" não possui regra de isolamento de tenant definida.`,
  );
}

export function createTenantScopedPrismaClient(basePrismaClient: PrismaClient) {
  return basePrismaClient.$extends({
    name: 'tenant-isolation-extension',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !TENANT_SCOPED_MODELS.has(model)) {
            return query(args);
          }

          const tenantId = getCurrentTenantId();
          const a = args as unknown as Record<string, unknown>;
          applyTenantScopeToArgs(operation, a, tenantId);
          return query(args);
        },
      },
    },
  });
}