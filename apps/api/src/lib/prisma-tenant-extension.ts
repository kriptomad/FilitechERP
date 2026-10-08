// src/lib/prisma-tenant-extension.ts — Cap. 7.2
import { PrismaClient } from "@prisma/client";
import { getCurrentTenantId } from "./tenant-context.js";

const TENANT_SCOPED_MODELS = new Set([
  // NOTA: "Tenant" deliberadamente NÃO está aqui — o próprio registro de tenant
  // não tem campo tenantId; endereça-lo vem sempre do session/JWT (gatekeeper).
  // Listar quebraria findUnique(inject tenantId inexistente) e bloquearia
  // a criação de tenants no onboarding (fail-closed sem contexto).
  "TenantModule",
  "Subscription",
  // NOTA: "BillingEvent" deliberadamente NÃO está aqui — assim como "Tenant",
  // o modelo não tem coluna tenantId (endereça-se por subscriptionId, cuja
  // Subscription JÁ é escopada pelo contexto). Injetaria um WHERE inexistente.
  // Acesso sempre via prismaUnscoped após validar a posse da subscription.
  "User",
  "RolePermission",
  "Client",
  "Supplier",
  "Product",
  "ProductBatch",
  "ProductSerial",
  "ProductVariantAxis",
  "ProductVariant",
  "Recipe",
  "RecipeItem",
  "ProductionBatch",
  "ReturnableContainerLedger",
  "PrescriptionRecord",
  "WorkOrder",
  "WorkOrderItem",
  "OsChecklist",
  "OsPhoto",
  "Sale",
  "SaleItem",
  "Payment",
  "CashRegister",
  "StockMovement",
  "AccountPayable",
  "AccountReceivable",
  "FiscalDocument",
  // Cap. 12 — expansão de nichos
  "Service",
  "Appointment",
  "ClientServicePackage",
  "RestaurantTable",
  "Comanda",
  "ComandaItem",
  "OpticalPrescription",
  "Pet",
  "VaccineRecord",
  "Vehicle",
  "VehicleListing",
]);

const READ_OPERATIONS = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "findUnique",
  "findUniqueOrThrow",
  "count",
  "aggregate",
  "groupBy",
]);

const WRITE_WHERE_OPERATIONS = new Set([
  "update",
  "updateMany",
  "delete",
  "deleteMany",
  "upsert",
]);

/**
 * Aplica o escopo de tenant nos args da operação (Cap. 7.2).
 * Exportada para teste canário do guard fail-closed (Cap. 7.3).
 * Qualquer operação fora das classificadas lança — fail-closed por design:
 * o Prisma pode adicionar operações novas em updates e o isolamento
 * NUNCA pode ser contornado por operação desconhecida.
 */
export function applyTenantScopeToArgs(
  operation: string,
  args: Record<string, any>,
  tenantId: string,
): Record<string, any> {
  if (operation === "create") {
    args.data = { ...args.data, tenantId };
    return args;
  }

  if (operation === "createMany" || operation === "createManyAndReturn") {
    args.data = Array.isArray(args.data)
      ? args.data.map((item: Record<string, unknown>) => ({
          ...item,
          tenantId,
        }))
      : args.data;
    return args;
  }

  // P0 (Review R5): upsert precisa de tenantId em where E create.
  if (operation === "upsert") {
    args.where = { ...(args.where ?? {}), tenantId };
    args.create = { ...args.create, tenantId };
    return args;
  }

  if (READ_OPERATIONS.has(operation) || WRITE_WHERE_OPERATIONS.has(operation)) {
    args.where = { ...(args.where ?? {}), tenantId };
    return args;
  }

  throw new Error(
    `Operação "${operation}" não possui regra de isolamento de tenant definida.`,
  );
}

export function createTenantScopedPrismaClient(basePrismaClient: PrismaClient) {
  return basePrismaClient.$extends({
    name: "tenant-isolation-extension",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !TENANT_SCOPED_MODELS.has(model)) {
            return query(args);
          }

          const tenantId = getCurrentTenantId();
          // Args é uma união por operação (Prisma) — normalizamos para mutação segura.
          const a = args as unknown as Record<string, any>;
          applyTenantScopeToArgs(operation, a, tenantId);
          return query(args);
        },
      },
    },
  });
}
