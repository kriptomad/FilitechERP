// prisma/seed.ts — Cap. 2.3/2.5/12 — planos, módulos e combos
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PLANS = [
  {
    code: "FREE",
    label: "Free",
    basePrice: 0,
    includedModules: ["pdv", "estoque", "financeiro"],
  },
  {
    code: "BASIC",
    label: "Essencial",
    basePrice: 89.9,
    includedModules: ["pdv", "estoque", "financeiro"],
  },
  {
    code: "PRO",
    label: "Profissional",
    basePrice: 169.9,
    includedModules: ["pdv", "estoque", "financeiro", "crm"],
  },
];

const MODULES = [
  { code: "fiscal", label: "Emissão Fiscal (NFC-e/NFe)", monthlyPrice: 49.9, description: "Emissão ilimitada de documentos fiscais com contingência automática." },
  { code: "whatsapp", label: "Integração WhatsApp", monthlyPrice: 39.9, description: "Orçamentos, cobranças e notificações de O.S. via WhatsApp." },
  { code: "multi-filial", label: "Multi-Filial", monthlyPrice: 59.9, description: "Dashboard consolidado para múltiplas lojas." },
  { code: "work-order", label: "Assistência Técnica (O.S.)", monthlyPrice: 69.9, description: "Ordens de serviço, checklist, laudo e IMEI/Serial." },
  { code: "liquor-ledger", label: "Adega — Conta-Corrente de Cascos", monthlyPrice: 29.9, description: "Controle de vasilhames retornáveis por cliente." },
  { code: "recipe-bom", label: "Ficha Técnica (Padaria/Confeitaria)", monthlyPrice: 44.9, description: "Receitas, custo de produção e baixa automática." },
  { code: "pharmacy-sngpc", label: "Farmácia — SNGPC/Controlados", monthlyPrice: 79.9, description: "Escrituração eletrônica e retenção digital de receituário." },
  // Módulo base (sempre ativo no plano) — necessário para gatekeeper do PDV
  { code: "pdv", label: "PDV", monthlyPrice: 0, description: "Frente de caixa offline-first (incluso nos planos)." },
  { code: "estoque", label: "Estoque", monthlyPrice: 0, description: "Compras, inventário, lote/validade/serial/grade (incluso)." },
  { code: "financeiro", label: "Financeiro", monthlyPrice: 0, description: "Contas a pagar/receber e fluxo de caixa (incluso)." },
  { code: "crm", label: "CRM", monthlyPrice: 0, description: "Cliente, crediário e fidelidade (incluso no PRO)." },
  // Cap. 12 — expansão de 12 nichos
  { code: "restaurant-pos", label: "Restaurante (Comanda + KDS)", monthlyPrice: 74.9, description: "Comanda eletrônica, KDS e iFood." },
  { code: "petshop", label: "Petshop/Veterinária", monthlyPrice: 54.9, description: "Prontuário do pet, vacinas e agendamento." },
  { code: "beauty-salon", label: "Salão/Barbearia", monthlyPrice: 54.9, description: "Agenda por profissional e comissionamento." },
  { code: "automotive", label: "Setor Automotivo", monthlyPrice: 64.9, description: "Veículos, O.S. automotiva e peças." },
  { code: "optical", label: "Ótica", monthlyPrice: 49.9, description: "Receita de grau, laboratório e consignação." },
  { code: "fashion-grid", label: "Moda/Calçados (Grade)", monthlyPrice: 39.9, description: "Grade cor/tamanho/numeração e curva ABC por variante." },
  { code: "stationery-seasonal", label: "Papelaria (Sazonalidade/Kits)", monthlyPrice: 34.9, description: "Janelas sazonais e kits compostos." },
  { code: "construction-fractional", label: "Construção (Venda Fracionada)", monthlyPrice: 44.9, description: "Compra vs venda, conversão de unidade e desconto progressivo." },
];

async function main() {
  for (const plan of PLANS) {
    await prisma.plan.upsert({
      where: { code: plan.code },
      create: plan,
      update: plan,
    });
  }

  for (const mod of MODULES) {
    await prisma.module.upsert({
      where: { code: mod.code },
      create: mod,
      update: mod,
    });
  }

  console.log(`Seeded ${PLANS.length} planos e ${MODULES.length} módulos.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
