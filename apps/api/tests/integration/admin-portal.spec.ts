// tests/integration/admin-portal.spec.ts — sistema de administração do portal
// Clientes, serviços e cobranças (Cap. 5 / Cap. 12) + isolamento (Cap. 7.3)
// + RBAC de mutação (Cap. 5) + transições de fatura (Cap. 5).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { runWithTenantContext } from "../../src/lib/tenant-context";
import { prisma } from "../../src/lib/prisma";
import { roleHasPermission } from "../../src/auth/role-permissions";
import {
  AdminError,
  createClient,
  listClients,
  updateClient,
  deleteClient,
  createService,
  listServices,
  updateService,
  deleteService,
  createReceivable,
  listReceivables,
  payReceivable,
  cancelReceivable,
} from "../../src/services/admin/portal-admin.service";

const base = new PrismaClient();

let tenantA: { id: string };
let tenantB: { id: string };

const ctxA = () => ({ tenantId: tenantA.id, userId: "user-a", role: "OWNER" });
const ctxB = () => ({ tenantId: tenantB.id, userId: "user-b", role: "OWNER" });

const inA = <T>(fn: () => Promise<T>): Promise<T> => runWithTenantContext(ctxA(), fn);
const inB = <T>(fn: () => Promise<T>): Promise<T> => runWithTenantContext(ctxB(), fn);

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

const expectAdminError = async (
  promise: Promise<unknown>,
  status: number,
  code?: string,
): Promise<void> => {
  await expect(promise).rejects.toBeInstanceOf(AdminError);
  try {
    await promise;
    throw new Error("esperava rejeição");
  } catch (err) {
    expect(err).toMatchObject({ status, ...(code ? { code } : {}) });
  }
};

describe("Administração do portal — clientes, serviços e cobranças", () => {
  beforeAll(async () => {
    tenantA = await createTestTenant(`admin-a-${Date.now()}`);
    tenantB = await createTestTenant(`admin-b-${Date.now()}`);
  });

  afterAll(async () => {
    await base.tenant.delete({ where: { id: tenantA.id } }).catch(() => undefined);
    await base.tenant.delete({ where: { id: tenantB.id } }).catch(() => undefined);
    await base.$disconnect();
  });

  // ── Clientes ───────────────────────────────────────────────────────────
  it("cria cliente e lista apenas do próprio tenant", async () => {
    const created = await inA(() =>
      createClient({
        name: "Cliente A",
        document: "111.222.333-44",
        phone: "(11) 98888-0001",
        email: "cliente.a@teste.local",
        creditLimit: 500,
      }),
    );
    expect(created.id).toBeTruthy();
    expect(created.creditLimit).toBe(500);
    expect(created.openBalance).toBe(0);

    const listA = await inA(() => listClients());
    expect(listA.some((c) => c.id === created.id)).toBe(true);

    const listB = await inB(() => listClients());
    expect(listB.some((c) => c.id === created.id)).toBe(false);

    const searchB = await inB(() => listClients("Cliente A"));
    expect(searchB).toHaveLength(0);
  });

  it("atualização/exclusão de cliente de outro tenant responde 404 (isolamento)", async () => {
    const client = await inA(() => createClient({ name: "Alvo Isolamento", document: "555.666.777-88" }));

    await expectAdminError(inB(() => updateClient(client.id, { name: "Invadido" })), 404, "NOT_FOUND");
    await expectAdminError(inB(() => deleteClient(client.id)), 404, "NOT_FOUND");

    const [stillThere] = await inA(() => listClients("Alvo Isolamento"));
    expect(stillThere?.name).toBe("Alvo Isolamento");
  });

  it("documento duplicado no mesmo tenant → 409; mesmo documento em outro tenant é permitido", async () => {
    const doc = "999.888.777-66";
    await inA(() => createClient({ name: "Doc Duplicado 1", document: doc }));
    await expectAdminError(
      inA(() => createClient({ name: "Doc Duplicado 2", document: doc })),
      409,
      "DOCUMENT_TAKEN",
    );
    // unique([tenantId, document]) — outro tenant pode ter o mesmo documento
    const inBClient = await inB(() => createClient({ name: "Doc Duplicado B", document: doc }));
    expect(inBClient.document).toBe(doc);
  });

  it("documento vazio é normalizado para null e permite múltiplos clientes sem CPF", async () => {
    const first = await inA(() => createClient({ name: "Sem CPF 1", document: "" }));
    const second = await inA(() => createClient({ name: "Sem CPF 2", document: "" }));
    expect(first.document).toBeNull();
    expect(second.document).toBeNull();
  });

  it("validação de entrada → 400 VALIDATION_ERROR com mensagem PT-BR", async () => {
    await expectAdminError(inA(() => createClient({ name: "X" })), 400, "VALIDATION_ERROR");
    await expectAdminError(
      inA(() =>
        createService({
          name: "Serviço Inválido",
          nicheTag: "NADA_CONSTA",
          basePrice: -1,
          estimatedDurationMinutes: 30,
        }),
      ),
      400,
      "VALIDATION_ERROR",
    );
    const client = await inA(() => createClient({ name: "Validação Cliente" }));
    await expectAdminError(
      inA(() =>
        createReceivable({ clientId: client.id, description: "Zero", amount: 0, dueDate: "2026-12-31" }),
      ),
      400,
      "VALIDATION_ERROR",
    );
  });

  it("exclusão de cliente com histórico vinculado → 409 CLIENT_IN_USE", async () => {
    const client = await inA(() => createClient({ name: "Cliente Com Faturas" }));
    await inA(() =>
      createReceivable({
        clientId: client.id,
        description: "Fatura que bloqueia exclusão",
        amount: 50,
        dueDate: "2026-12-31",
      }),
    );
    await expectAdminError(inA(() => deleteClient(client.id)), 409, "CLIENT_IN_USE");

    const clean = await inA(() => createClient({ name: "Cliente Limpo" }));
    const result = await inA(() => deleteClient(clean.id));
    expect(result.deleted).toBe(true);
    const after = await inA(() => listClients("Cliente Limpo"));
    expect(after.some((c) => c.id === clean.id)).toBe(false);
  });

  // ── Serviços ───────────────────────────────────────────────────────────
  it("serviço: criação, listagem, atualização e ativação/desativação", async () => {
    const service = await inA(() =>
      createService({
        name: "Troca de Tela (Smartphone)",
        nicheTag: "GERAL",
        basePrice: 180,
        estimatedDurationMinutes: 60,
        commissionPercentage: 10,
      }),
    );
    expect(service.basePrice).toBe(180);
    expect(service.active).toBe(true);
    expect(service.appointmentCount).toBe(0);

    const updated = await inA(() => updateService(service.id, { active: false, basePrice: 199.9 }));
    expect(updated.active).toBe(false);
    expect(updated.basePrice).toBe(199.9);

    const list = await inA(() => listServices());
    expect(list.some((s) => s.id === service.id)).toBe(true);
    const otherTenant = await inB(() => listServices());
    expect(otherTenant.some((s) => s.id === service.id)).toBe(false);

    const removed = await inA(() => deleteService(service.id));
    expect(removed.deleted).toBe(true);
  });

  it("serviço com agenda vinculada não é excluído → 409 SERVICE_IN_USE", async () => {
    const client = await inA(() => createClient({ name: "Cliente Agenda" }));
    const service = await inA(() =>
      createService({ name: "Banho e Tosa", nicheTag: "PETSHOP", basePrice: 70, estimatedDurationMinutes: 60 }),
    );
    const professional = await base.user.create({
      data: {
        tenantId: tenantA.id,
        name: "Técnico Teste",
        email: `tech-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@teste.local`,
        passwordHash: "sem-login",
        role: "TECHNICIAN",
      },
    });
    await inA(() =>
      prisma.appointment.create({
        data: {
          clientId: client.id,
          serviceId: service.id,
          professionalId: professional.id,
          scheduledAt: new Date("2030-01-15T10:00:00.000Z"),
          durationMinutes: 30,
        },
      }),
    );

    await expectAdminError(inA(() => deleteService(service.id)), 409, "SERVICE_IN_USE");

    // A alternativa recomendada (desativar) continua disponível.
    const deactivated = await inA(() => updateService(service.id, { active: false }));
    expect(deactivated.active).toBe(false);
  });

  // ── Cobranças (contas a receber) ───────────────────────────────────────
  it("limite de crédito: bloqueia cobrança acima do limite (409 CREDIT_LIMIT_EXCEEDED)", async () => {
    const client = await inA(() =>
      createClient({ name: "Cliente Crediário", creditLimit: 100 }),
    );

    const first = await inA(() =>
      createReceivable({ clientId: client.id, description: "Fatura 1", amount: 60, dueDate: "2026-12-10" }),
    );
    expect(first.amount).toBe(60);
    expect(first.clientName).toBe("Cliente Crediário");

    // 60 em aberto + 60 > 100 → estoura
    await expectAdminError(
      inA(() =>
        createReceivable({ clientId: client.id, description: "Fatura 2", amount: 60, dueDate: "2026-12-15" }),
      ),
      409,
      "CREDIT_LIMIT_EXCEEDED",
    );

    // 60 + 40 = 100 (exatamente no limite) → permitido
    const second = await inA(() =>
      createReceivable({ clientId: client.id, description: "Fatura 3", amount: 40, dueDate: "2026-12-20" }),
    );
    expect(second.amount).toBe(40);

    // Fatura paga não conta no limite — baixa as duas abertas primeiro
    await inA(() => payReceivable(second.id));
    await inA(() => payReceivable(first.id));
    const third = await inA(() =>
      createReceivable({ clientId: client.id, description: "Fatura 4", amount: 80, dueDate: "2026-12-25" }),
    );
    expect(third.amount).toBe(80);
  });

  it("transições de fatura: pagar duas vezes, cancelar paga e cancelar pago são bloqueados", async () => {
    const client = await inA(() => createClient({ name: "Cliente Transição" }));
    const receivable = await inA(() =>
      createReceivable({ clientId: client.id, description: "Transição", amount: 30, dueDate: "2026-12-05" }),
    );

    const paid = await inA(() => payReceivable(receivable.id));
    expect(paid.status).toBe("PAID");
    expect(paid.paidAt).not.toBeNull();

    await expectAdminError(inA(() => payReceivable(receivable.id)), 409, "INVALID_STATUS");
    await expectAdminError(inA(() => cancelReceivable(receivable.id)), 409, "INVALID_STATUS");

    const other = await inA(() =>
      createReceivable({ clientId: client.id, description: "Cancelar-me", amount: 20, dueDate: "2026-12-06" }),
    );
    const cancelled = await inA(() => cancelReceivable(other.id));
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.paidAt).toBeNull();
    await expectAdminError(inA(() => cancelReceivable(other.id)), 409, "INVALID_STATUS");
    await expectAdminError(inA(() => payReceivable(other.id)), 409, "INVALID_STATUS");
  });

  it("listagem: vencimento no passado é marcado isOverdue e entra no filtro OVERDUE", async () => {
    const client = await inA(() => createClient({ name: "Cliente Vencido" }));
    const overdue = await inA(() =>
      createReceivable({ clientId: client.id, description: "Vencida ontem", amount: 10, dueDate: "2020-01-01" }),
    );
    expect(overdue.isOverdue).toBe(true);

    const overdueList = await inA(() => listReceivables("OVERDUE"));
    expect(overdueList.some((r) => r.id === overdue.id)).toBe(true);

    const paidList = await inA(() => listReceivables("PAID"));
    expect(paidList.some((r) => r.id === overdue.id)).toBe(false);

    const byClient = await inA(() => listReceivables(undefined, client.id));
    expect(byClient.every((r) => r.clientId === client.id)).toBe(true);
    expect(byClient).toHaveLength(1);
  });

  it("cobrança de cliente de outro tenant responde 404 (isolamento)", async () => {
    const clientB = await inB(() => createClient({ name: "Cliente B Privado" }));
    await expectAdminError(
      inA(() =>
        createReceivable({ clientId: clientB.id, description: "Ataque", amount: 1, dueDate: "2026-12-31" }),
      ),
      404,
      "NOT_FOUND",
    );
  });

  // ── RBAC (matriz padrão por Role + overrides) ──────────────────────────
  it("RBAC: billing:manage é de OWNER/MANAGER e respeita override por usuário", () => {
    expect(roleHasPermission("OWNER", "billing:manage")).toBe(true);
    expect(roleHasPermission("MANAGER", "billing:manage")).toBe(true);
    expect(roleHasPermission("CASHIER", "billing:manage")).toBe(false);
    expect(roleHasPermission("TECHNICIAN", "billing:manage")).toBe(false);

    // Override explícito tem precedência sobre a matriz padrão.
    expect(
      roleHasPermission("CASHIER", "billing:manage", [
        { permission: "billing:manage", granted: true },
      ]),
    ).toBe(true);
    expect(
      roleHasPermission("OWNER", "billing:manage", [
        { permission: "billing:manage", granted: false },
      ]),
    ).toBe(false);
  });
});
