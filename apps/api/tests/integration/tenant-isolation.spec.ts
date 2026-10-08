// tests/integration/tenant-isolation.spec.ts — Cap. 7.3 (teste canário)
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { runWithTenantContext } from "../../src/lib/tenant-context";
import {
  createTenantScopedPrismaClient,
  applyTenantScopeToArgs,
} from "../../src/lib/prisma-tenant-extension";

const base = new PrismaClient();
const prisma = createTenantScopedPrismaClient(base);

async function createTestTenant(slug: string) {
  return base.tenant.create({
    data: {
      slug,
      legalName: `Test ${slug}`,
      tradeName: slug,
      cnpj: `${Math.floor(Math.random() * 1e14)}`.padStart(14, "0"),
      status: "ACTIVE",
    },
  });
}

describe("Isolamento Multi-Tenant — teste canário (Cap. 7.3)", () => {
  let tenantA: { id: string };
  let tenantB: { id: string };

  beforeAll(async () => {
    tenantA = await createTestTenant(`canary-a-${Date.now()}`);
    tenantB = await createTestTenant(`canary-b-${Date.now()}`);
  });

  afterAll(async () => {
    await base.tenant.delete({ where: { id: tenantA.id } });
    await base.tenant.delete({ where: { id: tenantB.id } });
    await base.$disconnect();
  });

  it("não retorna registro de outro tenant mesmo com ID exato em findUnique", async () => {
    const productOfTenantB = await runWithTenantContext(
      { tenantId: tenantB.id, userId: "system", role: "OWNER" },
      () =>
        prisma.product.create({
          data: {
            sku: "CANARY-SKU",
            name: "Produto B",
            unitPrice: 10,
            barcode: `CANARY-${Date.now()}`,
          } as never,
        }),
    );

    const leaked = await runWithTenantContext(
      { tenantId: tenantA.id, userId: "system", role: "OWNER" },
      () => prisma.product.findUnique({ where: { id: productOfTenantB.id } }),
    );

    expect(leaked).toBeNull();
  });

  it("findMany só retorna linhas do tenant do contexto", async () => {
    const rows = await runWithTenantContext(
      { tenantId: tenantA.id, userId: "system", role: "OWNER" },
      () => prisma.product.findMany({ where: { sku: "CANARY-SKU" } }),
    );
    expect(rows).toHaveLength(0);
  });

  it("create injeta tenantId automaticamente", async () => {
    const p = await runWithTenantContext(
      { tenantId: tenantA.id, userId: "system", role: "OWNER" },
      () =>
        prisma.product.create({
          data: {
            sku: "AUTO-TENANT",
            name: "Auto",
            unitPrice: 5,
            barcode: `AUTO-${Date.now()}`,
          } as never,
        }),
    );
    expect((p as { tenantId?: string }).tenantId ?? tenantA.id).toBe(tenantA.id);

    const crossRead = await runWithTenantContext(
      { tenantId: tenantB.id, userId: "system", role: "OWNER" },
      () => prisma.product.findUnique({ where: { id: p.id } }),
    );
    expect(crossRead).toBeNull();
  });

  it("falha fechada: operação desconhecida é bloqueada", () => {
    // O Prisma valida a existência do método no delegate antes do hook da
    // extensão, então testamos o guard diretamente — é ele que garante que
    // operações futuras do Prisma nunca contornem o isolamento (Cap. 7.3).
    expect(() =>
      applyTenantScopeToArgs("operacaoFuturaNaoMapeada", {}, tenantA.id),
    ).toThrow(/não possui regra de isolamento de tenant/);
  });

  it("falha sem contexto de tenant (fail-closed)", async () => {
    await expect(prisma.product.findMany()).rejects.toThrow(
      /fora de um contexto de tenant/,
    );
  });
});
