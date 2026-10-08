// scripts/seed-smoke-extras.ts — cliente para O.S. + usuário CASHIER p/ teste RBAC.
import "../src/env.js";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/auth/password.service.js";

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: "demo" } });
  if (!tenant) throw new Error("Rode antes: scripts/bootstrap-demo.ts");

  const client =
    (await prisma.client.findFirst({
      where: { tenantId: tenant.id, name: "Cliente Smoke" },
    })) ??
    (await prisma.client.create({
      data: { tenantId: tenant.id, name: "Cliente Smoke", document: "12345678901" },
    }));

  const cashierEmail = "caixa@filitech.dev";
  const existing = await prisma.user.findUnique({
    where: { tenantId_email: { tenantId: tenant.id, email: cashierEmail } },
  });
  if (!existing) {
    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        name: "Caixa Smoke",
        email: cashierEmail,
        passwordHash: await hashPassword("Caixa@123"),
        role: "CASHIER",
      },
    });
  }

  console.log(
    JSON.stringify({ clientId: client.id, cashierLogin: `${cashierEmail} / Caixa@123` }, null, 2),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
