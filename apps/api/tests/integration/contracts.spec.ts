// tests/integration/contracts.spec.ts — contrato de serviço + webhook de billing
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma, prismaUnscoped } from "../../src/lib/prisma.js";
import { runWithTenantContext } from "../../src/lib/tenant-context.js";
import {
  createContract,
  signContract,
  cancelContract,
  listContracts,
  ContractError,
} from "../../src/services/contracts/service-contract.service.js";

describe("Contrato de serviço", () => {
  let tenantId: string;
  let clientId: string;
  let serviceId: string;

  beforeAll(async () => {
    const tenant = await prismaUnscoped.tenant.create({
      data: {
        slug: `test-contracts-${Date.now()}`,
        legalName: "Test Contracts LTDA",
        tradeName: "Test Contracts",
        cnpj: `TEST-${Date.now()}`,
        status: "ACTIVE",
      },
    });
    tenantId = tenant.id;

    const client = await prismaUnscoped.client.create({
      data: { tenantId, name: "Cliente Contrato", document: "CLI-CONTRATO-001" },
    });
    clientId = client.id;

    const service = await prismaUnscoped.service.create({
      data: {
        tenantId,
        name: "Serviço de Teste",
        nicheTag: "GERAL",
        basePrice: 100,
        estimatedDurationMinutes: 60,
      },
    });
    serviceId = service.id;
  });

  afterAll(async () => {
    await prismaUnscoped.serviceContract.deleteMany({ where: { tenantId } });
    await prismaUnscoped.service.deleteMany({ where: { tenantId } });
    await prismaUnscoped.client.deleteMany({ where: { tenantId } });
    await prismaUnscoped.tenant.delete({ where: { id: tenantId } });
  });

  it("cria contrato com itens e calcula total", async () => {
    const contract = await runWithTenantContext(
      { tenantId, userId: "test", role: "OWNER" },
      () =>
        createContract({
          clientId,
          title: "Contrato de Manutenção",
          description: "Contrato mensal",
          startDate: new Date().toISOString(),
          items: [
            { serviceId, description: "Manutenção preventiva", quantity: 2, unitPrice: 150 },
            { description: "Peça de reposição", quantity: 1, unitPrice: 50 },
          ],
        }),
    );

    expect(contract.status).toBe("DRAFT");
    expect(contract.totalAmount).toBe(350);
    expect(contract.itemCount).toBe(2);
    expect(contract.contractNumber).toMatch(/^CTR-\d{4}-\d{6}$/);
  });

  it("assina contrato e muda status para ACTIVE", async () => {
    const contracts = await runWithTenantContext(
      { tenantId, userId: "test", role: "OWNER" },
      () => listContracts(),
    );
    const draft = contracts.find((c) => c.status === "DRAFT");
    expect(draft).toBeDefined();

    const signed = await runWithTenantContext(
      { tenantId, userId: "test", role: "OWNER" },
      () => signContract(draft!.id),
    );
    expect(signed.status).toBe("ACTIVE");
    expect(signed.signedAt).not.toBeNull();
  });

  it("não permite assinar contrato já assinado", async () => {
    const contracts = await runWithTenantContext(
      { tenantId, userId: "test", role: "OWNER" },
      () => listContracts(),
    );
    const active = contracts.find((c) => c.status === "ACTIVE");
    expect(active).toBeDefined();

    await expect(
      runWithTenantContext({ tenantId, userId: "test", role: "OWNER" }, () =>
        signContract(active!.id),
      ),
    ).rejects.toThrow(ContractError);
  });

  it("cancela contrato ativo", async () => {
    const contracts = await runWithTenantContext(
      { tenantId, userId: "test", role: "OWNER" },
      () => listContracts(),
    );
    const active = contracts.find((c) => c.status === "ACTIVE");

    const cancelled = await runWithTenantContext(
      { tenantId, userId: "test", role: "OWNER" },
      () => cancelContract(active!.id),
    );
    expect(cancelled.status).toBe("CANCELLED");
  });

  it("não permite criar contrato sem itens", async () => {
    await expect(
      runWithTenantContext({ tenantId, userId: "test", role: "OWNER" }, () =>
        createContract({
          clientId,
          title: "Contrato Vazio",
          startDate: new Date().toISOString(),
          items: [],
        }),
      ),
    ).rejects.toThrow(ContractError);
  });

  it("não permite criar contrato com cliente inexistente", async () => {
    await expect(
      runWithTenantContext({ tenantId, userId: "test", role: "OWNER" }, () =>
        createContract({
          clientId: "non-existent-id",
          title: "Contrato Inválido",
          startDate: new Date().toISOString(),
          items: [{ description: "Item", quantity: 1, unitPrice: 100 }],
        }),
      ),
    ).rejects.toThrow(ContractError);
  });
});
