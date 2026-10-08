// scripts/bootstrap-demo.ts — cria tenant demo + OWNER + módulos ativos.
// Uso: pnpm --filter @filitech/api exec tsx ../../scripts/bootstrap-demo.ts
import "../src/env.js";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/auth/password.service.js";

const prisma = new PrismaClient();

async function main() {
  const slug = "demo";
  const email = "demo@filitech.dev";
  const password = "Demo@123";

  const tenant = await prisma.tenant.upsert({
    where: { slug },
    update: {},
    create: {
      slug,
      legalName: "Filitech Demo LTDA",
      tradeName: "Demo Filitech",
      cnpj: "00000000000000",
      status: "ACTIVE",
    },
  });

  const existing = await prisma.user.findUnique({
    where: { tenantId_email: { tenantId: tenant.id, email } },
  });

  if (!existing) {
    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        name: "Dono Demo",
        email,
        passwordHash: await hashPassword(password),
        role: "OWNER",
      },
    });
  }

  // Ativa os módulos inclusos + add-ons para o smoke test completo.
  const modules = await prisma.module.findMany({
    where: { code: { in: ["pdv", "estoque", "financeiro", "crm", "work-order", "fiscal", "liquor-ledger"] } },
    select: { code: true },
  });

  for (const mod of modules) {
    await prisma.tenantModule.upsert({
      where: { tenantId_moduleCode: { tenantId: tenant.id, moduleCode: mod.code } },
      update: { active: true },
      create: { tenantId: tenant.id, moduleCode: mod.code, active: true },
    });
  }

  // Assinatura PRO + eventos de cobrança — alimenta o painel de administração
  // da demonstração (breakdown, faturas e uso) com dados realistas.
  const plan = await prisma.plan.findUnique({ where: { code: "PRO" } });
  if (plan) {
    let sub = await prisma.subscription.findFirst({ where: { tenantId: tenant.id } });
    if (!sub) {
      sub = await prisma.subscription.create({
        data: {
          tenantId: tenant.id,
          planId: plan.id,
          provider: "asaas",
          externalSubscriptionId: `sub_demo_${tenant.id.slice(0, 8)}`,
          status: "ACTIVE",
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });
    }

    const eventCount = await prisma.billingEvent.count({
      where: { subscriptionId: sub.id },
    });
    if (eventCount === 0) {
      await prisma.billingEvent.createMany({
        data: [
          {
            subscriptionId: sub.id,
            provider: "asaas",
            externalEventKey: "demo_signup",
            type: "signup",
            payload: { planCode: "FREE", isFree: true, computedMrr: 0 },
          },
          {
            subscriptionId: sub.id,
            provider: "asaas",
            externalEventKey: "demo_checkout_pro",
            type: "checkout.completed",
            payload: { planCode: "PRO", billingCycle: "MONTHLY", computedMrr: 169.9 },
          },
          {
            subscriptionId: sub.id,
            provider: "asaas",
            externalEventKey: "demo_mod_fiscal",
            type: "module.activated",
            payload: { moduleCode: "fiscal", amount: 49.9 },
          },
        ],
      });
    }
  }

  // ── Base do painel de administração: clientes, serviços e cobranças ────
  // Alimenta as abas Cobrança/Clientes/Serviços do /painel com dados
  // realistas (crediário, agenda multinicho, faturas pagas/vencidas).
  // Checagem por registro (não por contagem) — idempotente mesmo com dados
  // parciais já existentes (ex.: um cliente criado por smoke test).
  const demoClientData = [
    { name: "Mariana Souza", document: "529.982.247-25", phone: "(11) 98888-1001", email: "mariana.souza@email.com", creditLimit: 500, isBusinessAccount: false },
    { name: "Rafael Lima", document: "345.678.901-25", phone: "(11) 97777-2002", email: "rafael.lima@email.com", creditLimit: 300, isBusinessAccount: false },
    { name: "João Pereira", document: null, phone: "(11) 96666-3003", email: null, creditLimit: 0, isBusinessAccount: false },
    { name: "Padaria Pão de Ouro", document: "11.222.333/0001-81", phone: "(11) 3333-4004", email: "contato@paodeouro.com.br", creditLimit: 1500, isBusinessAccount: true },
    { name: "Clínica Vet Bicho Feliz", document: "44.555.666/0001-12", phone: "(11) 3555-6005", email: "financeiro@bichofeliz.com.br", creditLimit: 2000, isBusinessAccount: true },
    { name: "Ana Beatriz Castro", document: "987.654.321-00", phone: "(11) 95555-7006", email: "ana.castro@email.com", creditLimit: 800, isBusinessAccount: false },
  ];
  for (const client of demoClientData) {
    const exists = await prisma.client.findFirst({
      where: { tenantId: tenant.id, name: client.name },
      select: { id: true },
    });
    if (!exists) {
      await prisma.client.create({ data: { tenantId: tenant.id, ...client } });
    }
  }

  const serviceCount = await prisma.service.count({ where: { tenantId: tenant.id } });
  if (serviceCount === 0) {
    await prisma.service.createMany({
      data: [
        { tenantId: tenant.id, name: "Troca de Tela (Smartphone)", nicheTag: "GERAL", basePrice: 180, estimatedDurationMinutes: 60, commissionPercentage: 10 },
        { tenantId: tenant.id, name: "Diagnóstico de Defeito", nicheTag: "GERAL", basePrice: 80, estimatedDurationMinutes: 30, commissionPercentage: 0 },
        { tenantId: tenant.id, name: "Formatação e Limpeza", nicheTag: "GERAL", basePrice: 120, estimatedDurationMinutes: 90, commissionPercentage: 10 },
        { tenantId: tenant.id, name: "Instalação de Película", nicheTag: "GERAL", basePrice: 90, estimatedDurationMinutes: 45, commissionPercentage: 5, active: false },
        { tenantId: tenant.id, name: "Banho e Tosa", nicheTag: "PETSHOP", basePrice: 70, estimatedDurationMinutes: 60, commissionPercentage: 15 },
        { tenantId: tenant.id, name: "Sessão de Toxina Capilar", nicheTag: "BEAUTY_SALON", basePrice: 250, estimatedDurationMinutes: 90, commissionPercentage: 20 },
        { tenantId: tenant.id, name: "Lavagem e Enceramento", nicheTag: "CAR_DETAILING", basePrice: 150, estimatedDurationMinutes: 120, commissionPercentage: 15 },
        { tenantId: tenant.id, name: "Alinhamento e Balanceamento", nicheTag: "AUTOMOTIVE_WORKSHOP", basePrice: 180, estimatedDurationMinutes: 60, commissionPercentage: 12 },
      ],
    });
  }

  const receivableCount = await prisma.accountReceivable.count({
    where: { tenantId: tenant.id },
  });
  if (receivableCount === 0) {
    const demoClients = await prisma.client.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, name: true },
    });
    const clientByName = new Map(demoClients.map((c) => [c.name, c.id]));
    const day = 24 * 60 * 60 * 1000;
    const receivables: Array<{
      clientName: string;
      description: string;
      amount: number;
      dueDays: number;
      status?: "PAID" | "CANCELLED";
      paidDaysAgo?: number;
    }> = [
      { clientName: "Mariana Souza", description: "Crediário — venda #1003", amount: 120, dueDays: -2, status: "PAID", paidDaysAgo: 1 },
      { clientName: "Mariana Souza", description: "Serviço — Troca de Tela (Smartphone)", amount: 180, dueDays: 10 },
      { clientName: "Rafael Lima", description: "Crediário — venda #1007", amount: 95.5, dueDays: -6 },
      { clientName: "Padaria Pão de Ouro", description: "Fornecimento mensal — contrato B2B", amount: 700, dueDays: 15 },
      { clientName: "Clínica Vet Bicho Feliz", description: "Pacote mensal — vacinação e banho", amount: 280, dueDays: -3, status: "PAID", paidDaysAgo: 2 },
      { clientName: "Ana Beatriz Castro", description: "Cobrança duplicada — estornada", amount: 55, dueDays: 5, status: "CANCELLED" },
      { clientName: "Padaria Pão de Ouro", description: "Kits escolares — venda fracionada", amount: 430, dueDays: -1 },
    ];

    let createdReceivables = 0;
    for (const item of receivables) {
      const clientId = clientByName.get(item.clientName);
      if (!clientId) continue;
      await prisma.accountReceivable.create({
        data: {
          tenantId: tenant.id,
          clientId,
          description: item.description,
          amount: item.amount,
          dueDate: new Date(Date.now() + item.dueDays * day),
          status: item.status ?? "PENDING",
          paidAt:
            item.status === "PAID"
              ? new Date(Date.now() - (item.paidDaysAgo ?? 1) * day)
              : null,
        },
      });
      createdReceivables += 1;
    }
    console.log(`Cobranças demo criadas: ${createdReceivables}`);
  }

  console.log(`Tenant demo pronto: ${tenant.id}`);
  console.log(`Login: ${email} / ${password}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
