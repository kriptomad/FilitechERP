// prisma/seed.ts — Cap. 2.3/2.5/12/14/15/17/21 — seed completo de dados essenciais
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
  {
    code: "PERSONAL_FREE",
    label: "Pessoal Free",
    basePrice: 0,
    includedModules: ["pessoal-conta", "pessoal-orcamento", "pessoal-divida", "pessoal-patrimonio"],
  },
  {
    code: "PERSONAL_PLENO",
    label: "Pessoal Pleno",
    basePrice: 29.9,
    includedModules: ["pessoal-conta", "pessoal-orcamento", "pessoal-divida", "pessoal-patrimonio", "pessoal-investimento", "pessoal-open-finance"],
  },
];

const MODULES = [
  // Core (inclusos nos planos)
  { code: "pdv", label: "PDV", monthlyPrice: 0, description: "Frente de caixa offline-first (incluso nos planos)." },
  { code: "estoque", label: "Estoque", monthlyPrice: 0, description: "Compras, inventário, lote/validade/serial/grade (incluso)." },
  { code: "financeiro", label: "Financeiro", monthlyPrice: 0, description: "Contas a pagar/receber e fluxo de caixa (incluso)." },
  { code: "crm", label: "CRM", monthlyPrice: 0, description: "Cliente, crediário e fidelidade (incluso no PRO)." },

  // Add-ons B2B
  { code: "fiscal", label: "Emissão Fiscal (NFC-e/NFe)", monthlyPrice: 49.9, description: "Emissão ilimitada de documentos fiscais com contingência automática." },
  { code: "whatsapp", label: "Integração WhatsApp", monthlyPrice: 39.9, description: "Orçamentos, cobranças e notificações de O.S. via WhatsApp." },
  { code: "multi-filial", label: "Multi-Filial", monthlyPrice: 59.9, description: "Dashboard consolidado para múltiplas lojas." },
  { code: "work-order", label: "Assistência Técnica (O.S.)", monthlyPrice: 69.9, description: "Ordens de serviço, checklist, laudo e IMEI/Serial." },
  { code: "liquor-ledger", label: "Adega — Conta-Corrente de Cascos", monthlyPrice: 29.9, description: "Controle de vasilhames retornáveis por cliente." },
  { code: "recipe-bom", label: "Ficha Técnica (Padaria/Confeitaria)", monthlyPrice: 44.9, description: "Receitas, custo de produção e baixa automática." },
  { code: "pharmacy-sngpc", label: "Farmácia — SNGPC/Controlados", monthlyPrice: 79.9, description: "Escrituração eletrônica e retenção digital de receituário." },

  // Cap. 12 — expansão de 12 nichos
  { code: "restaurant-pos", label: "Restaurante (Comanda + KDS)", monthlyPrice: 74.9, description: "Comanda eletrônica, KDS e iFood." },
  { code: "petshop", label: "Petshop/Veterinária", monthlyPrice: 54.9, description: "Prontuário do pet, vacinas e agendamento." },
  { code: "beauty-salon", label: "Salão/Barbearia", monthlyPrice: 54.9, description: "Agenda por profissional e comissionamento." },
  { code: "automotive", label: "Setor Automotivo", monthlyPrice: 64.9, description: "Veículos, O.S. automotiva e peças." },
  { code: "optical", label: "Ótica", monthlyPrice: 49.9, description: "Receita de grau, laboratório e consignação." },
  { code: "fashion-grid", label: "Moda/Calçados (Grade)", monthlyPrice: 39.9, description: "Grade cor/tamanho/numeração e curva ABC por variante." },
  { code: "stationery-seasonal", label: "Papelaria (Sazonalidade/Kits)", monthlyPrice: 34.9, description: "Janelas sazonais e kits compostos." },
  { code: "construction-fractional", label: "Construção (Venda Fracionada)", monthlyPrice: 44.9, description: "Compra vs venda, conversão de unidade e desconto progressivo." },

  // Módulos Filitech Pessoal (B2C)
  { code: "pessoal-conta", label: "Contas & Cartões", monthlyPrice: 0, description: "Contas correntes, poupança, cartões e investimentos." },
  { code: "pessoal-orcamento", label: "Orçamento & Metas", monthlyPrice: 0, description: "Orçamento mensal com alertas 80%/100%." },
  { code: "pessoal-divida", label: "Dívidas & Quitação", monthlyPrice: 0, description: "Calculadora Avalanche vs Snowball." },
  { code: "pessoal-patrimonio", label: "Patrimônio Líquido", monthlyPrice: 0, description: "Net Worth + mark-to-market investimentos." },
  { code: "pessoal-investimento", label: "Investimentos", monthlyPrice: 0, description: "Carteira com mark-to-market B3." },
  { code: "pessoal-open-finance", label: "Open Finance (Pluggy)", monthlyPrice: 14.9, description: "Sincronização bancária automática via Pluggy." },
];

const LAYOUT_VERSIONS = [
  {
    documentType: "ECD" as const,
    layoutVersion: "ECD-2025",
    sourceDescription:
      "Referência de leiaute registrada pela plataforma para escrituração contábil " +
      "(blocos 0/T/I/J/L). Catálogo interno — não substitui o leiaute oficial da " +
      "Receita; atualize quando ela publicar nova versão.",
  },
  {
    documentType: "ECF" as const,
    layoutVersion: "ECF-2025",
    sourceDescription:
      "Referência de leiaute registrada pela plataforma para escrituração contábil " +
      "fiscal. Catálogo interno — não substitui o leiaute oficial da Receita.",
  },
  {
    documentType: "EFD_REINF" as const,
    layoutVersion: "EFD_REINF-2025",
    sourceDescription:
      "Referência de leiaute registrada pela plataforma para EFD-Reinf. " +
      "Catálogo interno — não substitui o leiaute oficial da Receita.",
  },
  {
    documentType: "DCTFWEB" as const,
    layoutVersion: "DCTFWEB-2025",
    sourceDescription:
      "Referência de leiaute registrada pela plataforma para DCTFWeb. " +
      "Catálogo interno — não substitui o leiaute oficial da Receita.",
  },
  {
    documentType: "DEFIS" as const,
    layoutVersion: "DEFIS-2025",
    sourceDescription:
      "Referência de leiaute registrada pela plataforma para o DEFIS do Simples " +
      "Nacional. Catálogo interno — não substitui o leiaute oficial da Receita.",
  },
];

const SYSTEM_PARAMETERS = [
  { key: "FREE_TIER_MAX_SALES_PER_MONTH", value: "100", description: "Limite de vendas/mês no Tier Free (Cap. 2.4)" },
  { key: "TRIAL_DAYS", value: "7", description: "Dias de trial para planos pagos (Cap. 2.4)" },
  { key: "ENFORCE_2FA_FOR_ROLES", value: "OWNER,MANAGER", description: "Papéis que exigem 2FA obrigatório (Cap. 14)" },
  { key: "FREE_TIER_MAX_PRODUCTS", value: "200", description: "Limite de SKUs no Tier Free" },
  { key: "FREE_TIER_MAX_USERS", value: "1", description: "Limite de usuários no Tier Free (apenas OWNER)" },
  { key: "FREE_TIER_STORAGE_MB", value: "500", description: "Limite de armazenamento R2 no Tier Free (MB)" },
  { key: "GRACE_PERIOD_DAYS", value: "7", description: "Dias de carência após primeira falha de pagamento (Cap. 2.7)" },
  { key: "DUNNING_RETRY_DAYS", value: "1,3,5,7", description: "Dias de retentativa no dunning (Cap. 2.7.4)" },
  { key: "INVOICE_RETENTION_YEARS", value: "6", description: "Anos de retenção de XMLs fiscais (legal)" },
  { key: "LGPD_LOG_REDACTION", value: "true", description: "Ofuscar dados pessoais em logs (Cap. 10.1)" },
  { key: "BACKUP_RETENTION_DAYS", value: "35", description: "Retenção de backups diários" },
  { key: "BACKUP_MONTHLY_RETENTION_MONTHS", value: "13", description: "Retenção de backups mensais" },
  { key: "PLUGGY_SYNC_HOUR", value: "5", description: "Hora da sincronização Pluggy (UTC)" },
  { key: "NET_WORTH_SNAPSHOT_DAY", value: "1", description: "Dia do mês para snapshot de patrimônio" },
  { key: "REORDER_SUGGESTION_HOUR", value: "6", description: "Hora da sugestão de reposição (UTC)" },
  { key: "BUDGET_ALERT_HOUR", value: "9", description: "Hora dos alertas de orçamento (UTC)" },
  { key: "BILL_ALERT_HOUR", value: "9", description: "Hora dos alertas de contas a pagar (UTC)" },
  { key: "FISCAL_CODE_SYNC_DAY", value: "0", description: "Dia da semana para sync fiscal (0=domingo)" },
  { key: "BACKUP_HOUR", value: "3", description: "Hora do backup criptografado (UTC)" },
];

const ROLE_PERMISSIONS: Record<string, string[]> = {
  OWNER: ["*"],
  MANAGER: [
    "pdv:sell", "pdv:close-register", "pdv:approve-discount",
    "estoque:read", "estoque:adjust", "estoque:purchase",
    "financeiro:read", "financeiro:pay", "financeiro:receive",
    "crm:read", "crm:write",
    "work-order:create", "work-order:budget", "work-order:deliver", "work-order:assign",
    "fiscal:emit", "report:read", "billing:manage",
  ],
  TECHNICIAN: [
    "pdv:sell", "estoque:read", "crm:read",
    "work-order:create", "work-order:budget", "work-order:update",
    "report:read",
  ],
  CASHIER: ["pdv:sell", "pdv:close-register", "estoque:read", "crm:read", "crm:write"],
  ACCOUNTANT: ["financeiro:read", "fiscal:read", "report:read"],
  HOUSEHOLD_MEMBER: [
    "pessoal:contas:read", "pessoal:contas:write",
    "pessoal:transacoes:read", "pessoal:transacoes:write",
    "pessoal:orcamentos:read", "pessoal:orcamentos:write",
    "pessoal:metas:read", "pessoal:metas:write",
    "pessoal:investimentos:read", "pessoal:investimentos:write",
    "pessoal:dividas:read", "pessoal:dividas:write",
    "pessoal:patrimonio:read", "pessoal:patrimonio:write",
    "pessoal:open-finance:read", "pessoal:open-finance:write",
  ],
};

const PLUGGY_INTEGRATION = {
  provider: "BANK_OPEN_FINANCE_PLUGGY",
  environment: "PRODUCTION" as const,
};

async function main() {
  console.log("🌱 Iniciando seed completo...");

  // 1. Plans
  for (const plan of PLANS) {
    await prisma.plan.upsert({
      where: { code: plan.code },
      create: plan,
      update: plan,
    });
  }
  console.log(`✅ ${PLANS.length} planos seedados`);

  // 2. Modules
  for (const mod of MODULES) {
    await prisma.module.upsert({
      where: { code: mod.code },
      create: mod,
      update: mod,
    });
  }
  console.log(`✅ ${MODULES.length} módulos seedados`);

  // 3. Layout Versions
  let seededLayouts = 0;
  for (const layout of LAYOUT_VERSIONS) {
    const existing = await prisma.officialDocumentLayoutVersion.findFirst({
      where: { documentType: layout.documentType, layoutVersion: layout.layoutVersion },
    });

    if (existing) {
      await prisma.officialDocumentLayoutVersion.update({
        where: { id: existing.id },
        data: { sourceDescription: layout.sourceDescription, effectiveTo: null },
      });
    } else {
      await prisma.officialDocumentLayoutVersion.create({
        data: { ...layout, effectiveFrom: new Date("2025-01-01T00:00:00Z") },
      });
    }
    seededLayouts += 1;
  }
  console.log(`✅ ${seededLayouts} leiautes oficiais seedados`);

  // 4. System Parameters
  for (const param of SYSTEM_PARAMETERS) {
    await prisma.systemParameter.upsert({
      where: { key: param.key },
      create: param,
      update: { value: param.value, description: param.description },
    });
  }
  console.log(`✅ ${SYSTEM_PARAMETERS.length} parâmetros de sistema seedados`);

  // 5. Role Default Permissions (upsert by role)
  for (const [role, permissions] of Object.entries(ROLE_PERMISSIONS)) {
    // Delete existing for this role and recreate
    await prisma.roleDefaultPermission.deleteMany({ where: { role } });
    for (const perm of permissions) {
      await prisma.roleDefaultPermission.create({
        data: { role, permission: perm },
      });
    }
  }
  console.log(`✅ Permissões padrão por papel seedadas (${Object.keys(ROLE_PERMISSIONS).length} papéis)`);

  // 6. Pluggy Integration Credential (template - tenant will fill)
  await prisma.integrationCredential.upsert({
    where: { tenantId_provider_environment: { tenantId: "SYSTEM_TEMPLATE", provider: "BANK_OPEN_FINANCE_PLUGGY", environment: "PRODUCTION" } },
    create: { tenantId: "SYSTEM_TEMPLATE", provider: "BANK_OPEN_FINANCE_PLUGGY", environment: "PRODUCTION", encryptedPayload: Buffer.from(""), encryptionKeyId: "system" },
    update: {},
  });
  console.log("✅ Template de credencial Pluggy criado");

  // 7. Incidente inicial (exemplo)
  await prisma.incidentEvent.upsert({
    where: { id: "initial-incident" },
    create: {
      id: "initial-incident",
      component: "API",
      severity: "MAINTENANCE",
      title: "Sistema operacional",
      description: "Plataforma Filitech ERP operacional. Nenhum incidente ativo.",
      severity: "MAINTENANCE",
      startedAt: new Date(),
      isPublic: true,
    },
    update: {},
  });
  console.log("✅ IncidentEvent inicial criado");

  // 8. ReleaseNote inicial
  await prisma.releaseNote.upsert({
    where: { id: "v1.0.0" },
    create: {
      id: "v1.0.0",
      version: "1.0.0",
      title: "Filitech ERP v1.0.0 — Lançamento Oficial",
      body: "🎉 **Filitech ERP v1.0.0 está no ar!**\n\n---\n\n### ✨ Principais Funcionalidades\n- **PDV Offline-First** — Venda mesmo sem internet, sincronização automática ao reconectar\n- **Multi-Nicho** — 18 nichos com templates de catálogo e regras fiscais específicas\n- **Billing Real** — Checkout PIX/boleto/cartão, webhook idempotente, dunning automático\n- **Tier Free** — 100 vendas/mês, 1 usuário, 200 SKUs grátis para sempre\n- **Fiscal Completo** — NFC-e/NFe via Focus NFe, contingência, cancelamento, CC-e\n- **Escritório de Contabilidade** — Marketplace, procuração e-CAC, SPED (ECD/ECF/EFD-Reinf/DCTFWeb/DEFIS)\n- **Filitech Pessoal (B2C)** — Contas, orçamento, dívidas, investimentos, Open Finance (Pluggy)\n- **Fidelidade** — Pontos por venda, resgate, expiração automática\n- **Indicação** — 1 mês grátis para quem indica + 20% off no 1º ciclo\n- **2FA TOTP** — Enrollment, backup codes, enforce por papel\n- **Multi-Tenant Estrutural** — Isolamento via Prisma Extension (fail-closed)\n\n---\n\n### 🛡️ Segurança\n- Argon2id para senhas\n- JWT RS256 (chaves RSA 2048)\n- Isolamento multi-tenant a nível de Prisma Extension\n- Rate limiting por tenant + IP\n- Auditoría imutável (AuditLog)\n\n---\n\n### 📚 Documentação\n- [Bíblia de Engenharia](https://docs.filitecherp.com.br/bible)\n- [API Reference](https://docs.filitecherp.com.br/api)\n- [Guia de Deploy](https://docs.filitecherp.com.br/deploy)\n\n---\n\n**Filitech ERP** — O ERP que se adapta ao seu negócio.",
      isPublic: true,
      publishedAt: new Date(),
    },
    update: {},
  });
  console.log("✅ ReleaseNote inicial criada");

  console.log("\n🎉 Seed completo finalizado com sucesso!");
}

main()
  .catch((e) => {
    console.error("❌ Erro no seed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());