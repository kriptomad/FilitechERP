// scripts/seed-demo-data.ts — dados operacionais para o demo/SMOKE.
// Produto simples (NONE), produto com lote (BATCH/FEFO) e caixa aberto.
import "../src/env.js";
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: "demo" } });
  if (!tenant) throw new Error("Rode antes: scripts/bootstrap-demo.ts");

  const owner = await prisma.user.findFirstOrThrow({
    where: { tenantId: tenant.id, role: "OWNER" },
  });

  // 1. Produto simples (trackingType NONE)
  const simpleData = {
    tenantId: tenant.id,
    sku: "DEMO-SIMPLES",
    name: "Café Torrado 500g",
    unitPrice: 24.9,
    stockQuantity: 50,
    trackingType: "NONE" as const,
  };
  const simple =
    (await prisma.product.findFirst({ where: { tenantId: tenant.id, sku: simpleData.sku } })) ??
    (await prisma.product.create({ data: simpleData }));

  // 2. Produto por lote (BATCH) com 2 lotes — FEFO deve consumir o mais próximo
  const batchData = {
    tenantId: tenant.id,
    sku: "DEMO-LOTE",
    name: "Leite UHT 1L",
    unitPrice: 6.5,
    stockQuantity: 30,
    trackingType: "BATCH" as const,
  };
  const batched =
    (await prisma.product.findFirst({ where: { tenantId: tenant.id, sku: batchData.sku } })) ??
    (await prisma.product.create({ data: batchData }));

  const existingBatches = await prisma.productBatch.count({
    where: { tenantId: tenant.id, productId: batched.id },
  });
  if (existingBatches === 0) {
    const soon = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000);
    const later = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000);
    await prisma.productBatch.createMany({
      data: [
        {
          tenantId: tenant.id,
          productId: batched.id,
          batchNumber: "LOTE-PROXIMO",
          expirationDate: soon,
          quantity: new Prisma.Decimal(10),
        },
        {
          tenantId: tenant.id,
          productId: batched.id,
          batchNumber: "LOTE-DISTANTE",
          expirationDate: later,
          quantity: new Prisma.Decimal(20),
        },
      ],
    });
  }

  // 3. Caixa aberto
  let register = await prisma.cashRegister.findFirst({
    where: { tenantId: tenant.id, status: "OPEN" },
  });
  if (!register) {
    register = await prisma.cashRegister.create({
      data: {
        tenantId: tenant.id,
        openedById: owner.id,
        openingAmount: 0,
        status: "OPEN",
      },
    });
  }

  console.log(
    JSON.stringify(
      {
        tenantId: tenant.id,
        simpleProductId: simple.id,
        batchedProductId: batched.id,
        cashRegisterId: register.id,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
