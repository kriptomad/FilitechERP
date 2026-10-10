# PLANO DE AÇÃO COMPLETO — FILITECH ERP "READY TO TEST SYSTEM"

## Resumo da Auditoria
- ✅ **Build**: Next.js compila sem erros (`tsc --noEmit` + `pnpm build` OK)
- ✅ **Auth**: Login valida senha via argon2 + Neon (não aceita qualquer credencial)
- ✅ **Billing**: Checkout cria `PaymentCharge` vinculado à `Subscription`; webhook re-verifica no PSP antes de ativar
- ✅ **Nicho**: Seleção no cadastro + painel, carrega template de catálogo + módulos sugeridos
- ✅ **Free Tier**: Plano `FREE` (basePrice=0) ativa sem gateway
- ✅ **Escritório Contabilidade**: Models + rotas + página `/app/contabilidade` existem
- ✅ **Gateway Panel**: Testa conexão real + mostra URL webhook + instruções
- ✅ **PDV**: Seleção de cliente + fidelidade preview + offline queue

---

## GAPS CRÍTICOS PARA "READY TO TEST SYSTEM"

### 1. PAINEL ADMIN GLOBAL (Platform Admin) — CAP. 13
**Status**: ❌ AUSENTE no Next.js (existe apenas em `apps/api` Express que não roda na Vercel)

**Entregáveis**:
- [ ] Novo app `apps/admin-panel` (Vite + React 18 + MUI v5 + `@filitech/design-tokens`)
- [ ] Autenticação separada: `PlatformAdminUser` + JWT RS256 próprio + 2FA obrigatório
- [ ] Páginas:
  - [ ] `/tenants` — lista com filtros (status, nicho, MRR), busca full-text
  - [ ] `/tenants/:id` — ficha 360° + botão "Entrar como" (impersonação auditada)
  - [ ] `/billing/revenue` — MRR total, por plano, por módulo, churn, LTV, projeção 3m
  - [ ] `/billing/coupons` — CRUD de `DiscountCoupon`
  - [ ] `/modules/catalog` — CRUD de `Plan`/`Module` (preço só para novas contratações)
  - [ ] `/observability/audit-log` — visualizador imutável
  - [ ] `/observability/logs` — agregador Pino (tenantId, requestId, level, time)
  - [ ] `/observability/parameters` — `SystemParameter` editáveis com invalidação Redis
  - [ ] `/releases/changelog` — `ReleaseNote` por deploy
  - [ ] `/integrations` — saúde de todas as credenciais por provider
- [ ] Deploy separado em `admin.filitecherp.com.br`

---

### 2. MÓDULOS DE NICHO EXPANDIDOS (CAP. 11/12) — FRONTEND
**Status**: ⚠️ Schema existe, mas **frontend operacional** (`apps/web-app` módulos) incompleto no Next.js

**Módulos faltando no `apps/web-landing/src/app/app/`**:
- [ ] **Restaurante/Lanchonete** (`/app/restaurante`) — Comanda eletrônica, KDS, iFood
- [ ] **Petshop/Veterinária** (`/app/petshop`) — Prontuário, agendamento, vacinação
- [ ] **Ótica** (`/app/otica`) — Receita de grau, pedido de laboratório, consignação
- [ ] **Moda/Calçados** (`/app/moda`) — Grade cor/tamanho, provador, trocas
- [ ] **Papelaria/Presentes** (`/app/papelaria`) — Sazonalidade, kits escolares, personalização
- [ ] **Salão/Barbearia** (`/app/salao`) — Agenda por profissional, comissionamento, pacotes, booking público
- [ ] **Material Construção** (`/app/construcao`) — Venda fracionada, desconto progressivo, crediário PJ
- [ ] **Automotivo** (4 verticais) — Oficina, Pneus, Estética, Seminovos

**O que cada módulo precisa**:
- [ ] Lazy-loaded via `React.lazy` no `AppRoutes` (gateado por `hasModule('MODULE_CODE')`)
- [ ] Service layer em `src/server/services/` (portado de `apps/api/src/services/`)
- [ ] API Routes em `src/app/api/` (gateadas por `gatekeeper({moduleCode, requiredPermission})`)
- [ ] Componentes MUI v5 com `@filitech/design-tokens`

---

### 3. OPEN FINANCE (PLUGGY) — CAP. 17.4.1 / 22.5
**Status**: ❌ AUSENTE no Next.js

**Entregáveis**:
- [ ] `IntegrationCredential` provider `BANK_OPEN_FINANCE_PLUGGY`
- [ ] `src/services/integrations/pluggy.service.ts` — createConnectToken, fetchAccounts, fetchTransactions, fetchInvestments
- [ ] `src/app/api/webhooks/pluggy/route.ts` — handler assíncrono (200 imediato + fila BullMQ)
- [ ] `src/jobs/personal/sync-open-finance.worker.ts` — roteia para `BankAccount`/`BankTransaction` (BUSINESS) ou `PersonalAccount`/`PersonalTransaction` (PERSONAL)
- [ ] UI em `/configuracoes/financeiro/bancos` — botão "Conectar banco" abre Pluggy Connect Widget
- [ ] Conciliação automática reaproveita `findReconciliationCandidate` do OFX

---

### 4. FILITECH PESSOAL (B2C) — CAP. 22
**Status**: ⚠️ Schema pronto (`TenantType.PERSONAL`, models `PersonalAccount`, etc.), **frontend ausente**

**Entregáveis**:
- [ ] Onboarding de residência (`/cadastro?personal=1`) — pula CNPJ/regime/nicho
- [ ] Menu dinâmico por `tenantType` — carrega só rotas `PERSONAL` (code-splitting)
- [ ] Dashboard doméstico — contas, categorias, transações, splits casal, privacidade
- [ ] Recorrência + orçamento + alertas WhatsApp/push
- [ ] Open Finance (Pluggy) para sincronização bancária
- [ ] Investimentos + patrimônio líquido (snapshot mensal)
- [ ] Calculadora quitação dívidas (Avalanche vs Snowball)
- [ ] Fatura cartão + alertas contas a pagar
- [ ] Carnê-Leão organizador
- [ ] Planos B2C: Free (1 conta conectada) + Pleno (ilimitado)

---

### 5. MOTOR FISCAL COMPLETO — CAP. 21
**Status**: ⚠️ Schema pronto, **serviços ausentes no Next.js**

**Serviços a portar de `apps/api` → `apps/web-landing/src/server/services/`**:
- [ ] `tax-engine.service.ts` — `calculateFullTax` (ICMS/ST, ISS/Fator-r, PIS/COFINS monofásico, DIFAL, base reduzida veículos, Reforma Tributária)
- [ ] `cfop-resolver.service.ts` — resolve CFOP por operação
- [ ] `fiscal-emission.service.ts` — Focus NFe (NFC-e síncrona, NFe assíncrona, certificado A1 upload)
- [ ] `import-nfe-xml.service.ts` — entrada NF-e → `AccountPayable` + `StockMovement` + `ProductBatch`/`ProductSerial` (placeholder)
- [ ] `cancel-fiscal-document.service.ts` — cancelamento + CC-e + manifestação destinatário
- [ ] `sped-efd-generator.service.ts` — EFD ICMS/IPI (bloco 0, C, 9)
- [ ] `sped-ecd-generator.service.ts` — ECD (bloco 0, I, J, 9) via `ChartOfAccount`
- [ ] `sped-ecf-generator.service.ts` — ECF (bloco C do ECD + L/N/P/M/Y)
- [ ] `defis-generator.service.ts` — DEFIS anual via `Sale` + `CompanyPartner`
- [ ] `efd-reinf-generator.service.ts` — R-1000, R-2010/2020, R-9000
- [ ] `dctfweb-generator.service.ts` — consolida EFD-Reinf + regime
- [ ] `federal-withholding.service.ts` — IRRF/PIS/COFINS/CSLL/INSS retenção B2B
- [ ] `used-vehicle-icms.service.ts` — base reduzida veículos seminovos
- [ ] `fiscal-code-catalog.service.ts` — importação NCM/NBS/CEST versionada

**Rotas a criar**:
- [ ] `/api/fiscal/emit` — emissão NFC-e/NFe (gateada `fiscal:emit`)
- [ ] `/api/fiscal/nfe/import` — upload XML NF-e entrada
- [ ] `/api/fiscal/nfce/:id/cancel` — cancelamento + justificativa ≥15 chars
- [ ] `/api/fiscal/cc-e` — carta de correção (bloqueia valor/tributo/data)
- [ ] `/api/fiscal/manifestation` — ciência/confirmação/desconhecimento
- [ ] `/api/fiscal/sped/ecd/:year` — download ECD (OWNER/ACCOUNTANT)
- [ ] `/api/fiscal/sped/ecf/:year` — download ECF
- [ ] `/api/fiscal/sped/efd-icms-ipi/:month` — download EFD
- [ ] `/api/fiscal/defis/:year` — download DEFIS
- [ ] `/api/fiscal/efd-reinf/:month` — download EFD-Reinf
- [ ] `/api/fiscal/dctfweb/:month` — download DCTFWeb

---

### 6. MÓDULO FINANCEIRO AVANÇADO — CAP. 17
**Status**: ⚠️ Rotas básicas existem, **serviços incompletos**

- [ ] `generate-dre.service.ts` — DRE automática por `ChartOfAccount` + comparação período anterior
- [ ] `cash-flow-projection.service.ts` — fluxo projetado vs realizado + alerta `CASH_FLOW_ALERT`
- [ ] `reconcile-bank-statement.service.ts` — importação OFX + `findReconciliationCandidate` + confirmação 1-clique
- [ ] `purchase-order.service.ts` — Pedido de Compra (DRAFT→SENT→PARTIALLY_RECEIVED→RECEIVED) + recebimento atômico (estoque + custo médio ponderado + `AccountPayable`)
- [ ] `reorder-suggestion.service.ts` — job diário por `minStockThreshold`/`reorderTargetQuantity` + `emitNotification(STOCK_LOW)`
- [ ] `inventory-count.service.ts` — contagem cega (blind count) + `divergenceReason` obrigatório + `StockMovement(ADJUSTMENT)`
- [ ] `payment-charge.service.ts` — Boleto/Pix avulsos (venda a prazo) + webhook confirmação → baixa `AccountReceivable`
- [ ] `sped-ecd-generator.service.ts` — exportação contábil (anti-lock-in)

---

### 7. CRONS E JOBS (BullMQ → Vercel Cron)
**Status**: ⚠️ Alguns crons implementados, **faltam jobs críticos**

**Crons atuais no `vercel.json`**:
- ✅ `/api/cron/dunning` (0 3 * * *)
- ✅ `/api/cron/expire-charges` (0 3 * * *)
- ✅ `/api/cron/accounting-tasks` (30 3 * * *)
- ✅ `/api/cron/loyalty-expire` (0 4 * * *)

**Crons a adicionar** (máx 1/dia no Hobby — agrupar em horários diferentes):
- [ ] `/api/cron/open-finance-sync` — sincronização Pluggy (diário 05h)
- [ ] `/api/cron/reorder-suggestions` — sugestões de compra (diário 06h)
- [ ] `/api/cron/budget-alerts` — alertas orçamento pessoal (diário 09h)
- [ ] `/api/cron/bill-alerts` — alertas contas a pagar (diário 09h)
- [ ] `/api/cron/net-worth-snapshot` — patrimônio líquido (mensal dia 1, 05h)
- [ ] `/api/cron/recurrence-rules` — geração transações recorrentes (diário 04h)
- [ ] `/api/cron/fiscal-code-sync` — sincronização catálogo NCM/NBS/CEST (semanal)
- [ ] `/api/cron/backup-encrypted` — backup criptografado pg_dump → R2 (diário 03h)

---

### 8. NOTIFICAÇÕES CENTRALIZADAS — CAP. 8.4.5
**Status**: ⚠️ Model `Notification` existe, **serviço + UI ausentes**

- [ ] `notification.service.ts` — `emitNotification` ponto único (in-app, e-mail, push, WhatsApp)
- [ ] `NotificationPreference` por usuário/categoria
- [ ] Badge no header do app + painel admin (consome SSE unificado)
- [ ] Templates: `personal_budget_exceeded`, `personal_budget_warning_80`, `personal_bill_reminder`, `personal_bill_overdue`, `carne_leao_due`, `work_order_approved`, `payment_failed`, `stock_low`, `cash_flow_alert`, `accounting_task_reminder`, `fiscal_document_rejected`

---

### 9. SEED DE DADOS ESSENCIAIS
**Status**: ⚠️ `seed-niches.ts` existe, **faltam seeds críticos**

- [ ] `Plan` — FREE (0), BASIC (89.90), PRO (169.90) + `PlanAudience` BUSINESS/PERSONAL/BOTH
- [ ] `Module` — todos os 13+ módulos com `monthlyPrice` e `description`
- [ ] `RoleDefaultPermission` — matriz por papel (OWNER='*', MANAGER=..., TECHNICIAN=..., CASHIER=...)
- [ ] `OfficialDocumentLayoutVersion` — ECD/ECF/EFD-Reinf/DEFIS/DCTFWeb (ano-calendário atual)
- [ ] `TaxRule` — regras mínimas por nicho/UF/NCM para não bloquear vendas
- [ ] `FiscalCodeCatalogImport` — NCM/NBS/CEST base (pode ser importação manual inicial)
- [ ] `SystemParameter` — `FREE_TIER_MAX_SALES_PER_MONTH=100`, `TRIAL_DAYS=7`, `ENFORCE_2FA_FOR_ROLES=OWNER,MANAGER`

---

### 10. SEGURANÇA E 2FA — CAP. 14
**Status**: ✅ Login/2FA funcional, **faltam**:
- [ ] `TwoFactorBackupCode` — geração/validação/uso único (10 códigos)
- [ ] `PasswordResetToken` — SHA-256 + 15min TTL + rate limit (3/h conta, 50/h IP) + resposta idêntica
- [ ] `ActiveSession` — lista sessões + revogação individual/todas
- [ ] `AdminIpAllowlistEntry` — CIDR por operador admin
- [ ] Bloqueio login: 5 tentativas/15min → lock 15min + `AUTH_ACCOUNT_LOCKED`
- [ ] Reautenticação sensível: trocar senha/2FA/backup codes exige senha+2FA atual

---

### 11. VITRINE VIRTUAL (Loja Online) — CAP. 8.5
**Status**: ❌ AUSENTE
- [ ] Subdomínio `{slug}.loja.filitecherp.com.br` (Next.js separado, SSR/SSG para SEO)
- [ ] `OnlineStoreSettings` — `isActive`, `customSlug`, `primaryColorHex`, `logoStorageKey`, `deliveryEnabled`
- [ ] Catálogo público `GET /api/public/store/{slug}/products` (rate limited Cloudflare)
- [ ] Checkout Session Stripe/Asaas (conta conectada do tenant, não mestra)
- [ ] Webhook `sale.completed` → cria `Sale(channel=ONLINE_STORE)` + baixa estoque + emite fiscal
- [ ] QR Code público gerado automaticamente

---

### 12. INTEGRAÇÕES HARDWARE — CAP. 20.7
**Status**: ❌ AUSENTE no Next.js (requer Electron/Node local)
- [ ] Balanças Toledo/Filizola — protocolo serial/TCP, EAN-13 peso variável (prefixo 2)
- [ ] TEF — SDK local (Stone/SiTef/Rede) socket `localhost:4000` → NSU em `Payment.externalProviderId`
- [ ] Impressora térmica ESC/POS (cupom) + ZPL (etiquetas) — `node-thermal-printer` + socket RAW 9100

---

### 13. PÁGINA DE STATUS PÚBLICA — CAP. 15.1.5
**Status**: ❌ AUSENTE
- [ ] `status.filitecherp.com.br` (Next.js SSG + ISR 60s)
- [ ] Consome `IncidentEvent` + `ReleaseNote(isPublic=true)` via API pública
- [ ] Tradução `component` → label de negócio (não expor `CIRCUIT_SEFAZ` etc.)

---

### 14. HELPDESK INTERNO — CAP. 15.3
**Status**: ❌ AUSENTE
- [ ] `SupportTicket` + `SupportTicketMessage` (anexos R2)
- [ ] Fila por prioridade/SLA (URGENT 1h primeira resposta)
- [ ] Roteamento round-robin `SUPPORT_AGENT`
- [ ] Vinculo `BUG` → `ReleaseNote` futuro

---

### 15. API KEYS E WEBHOOKS DOS TENANTS — CAP. 15.4
**Status**: ⚠️ Models existem, **UI ausente**
- [ ] `/configuracoes/integracoes` — CRUD `TenantApiKey` (scopes, exibe prefixo `fltk_live_...`, revogação imediata)
- [ ] `TenantWebhookEndpoint` — URL, eventos, `signingSecretEncrypted`, histórico entregas + replay manual
- [ ] Backoff exponencial automático (1m, 5m, 30m, 2h)

---

### 16. PROGRAMA DE INDICAÇÃO — CAP. 2.8
**Status**: ❌ AUSENTE (schema tem `ReferralCode`/`Referral`)
- [ ] `/configuracoes/indicacoes` — link único `app.filitecherp.com.br/cadastro?ref={code}`
- [ ] `applyReferralRewardOnFirstPayment` — crédito 1 mês indicador + 20% desconto 1º ciclo indicado
- [ ] `creditBalanceMonths` consumido pelo job de cobrança antes de debitar cartão

---

## ORDEM DE EXECUÇÃO RECOMENDADA

### FASE 1 — Fundação Crítica (Semana 1-2)
1. **Admin Panel** — separar identidade, criar app Vite, autenticação PlatformAdmin + 2FA obrigatório
2. **Seeds essenciais** — Plans, Modules, RoleDefaultPermission, LayoutVersions, TaxRules mínimas, SystemParameters
3. **Motor fiscal core** — `tax-engine` + `cfop-resolver` + `fiscal-emission` (Focus NFe)
4. **Crons consolidados** — agrupar jobs em ≤1/dia no Hobby

### FASE 2 — Módulos de Nicho (Semana 3-5)
5. Módulo **Restaurante** (maior demanda) — comanda + KDS + iFood
6. Módulo **Petshop** — prontuário + agendamento + vacinação
7. Módulo **Ótica** — receita + laboratório + consignação
8. Módulos **Moda/Calçados** + **Papelaria** + **Salão** (reaproveitam `ProductVariant`/`Service`/`Appointment`)
9. Módulos **Automotivos** (4 verticais) — reaproveitam `WorkOrder` + `Vehicle`

### FASE 3 — Financeiro + Fiscal Completo (Semana 6-8)
10. DRE + Fluxo de Caixa + Conciliação Bancária (OFX + Open Finance)
11. Pedidos de Compra + Recebimento + Custo Médio + Sugestão Reposição
12. SPED completo (ECD/ECF/EFD/DEFIS/DCTFWeb/EFD-Reinf) + exportação contábil
13. Retenções federais B2B + base reduzida veículos

### FASE 4 — B2C + Extras (Semana 9-11)
14. Filitech Pessoal completo
15. Vitrine Virtual
16. Programa Indicação
17. Helpdesk + Status Page + API Keys/Webhooks tenants

### FASE 5 — Hardware + Polish (Semana 12)
18. Balanças + TEF + Impressoras (documentação + service workers locais)
19. Testes de integração completos (tenant-isolation, tenant-isolation.spec.ts)
20. Documentação de deploy (Vercel env vars, Neon, Cloudflare R2, DNS)

---

## VARIÁVEIS DE AMBIENTE NECESSÁRIAS (Vercel)

```bash
# Auth
JWT_PRIVATE_KEY_BASE64=...
JWT_PUBLIC_KEY_BASE64=...
TOTP_ENCRYPTION_KEY=...

# Database
DATABASE_URL=postgresql://...

# Billing
BILLING_GATEWAY=mercadopago|asaas
MERCADO_PAGO_ACCESS_TOKEN=...
MERCADO_PAGO_WEBHOOK_SECRET=...
ASAAS_API_KEY=...
ASAAS_WEBHOOK_SECRET=...

# Free tier
TRIAL_DAYS=7

# Crons
CRON_SECRET=...

# Storage
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...

# Email
RESEND_API_KEY=...
EMAIL_FROM=noreply@filitecherp.com.br

# WhatsApp
META_APP_ID=...
META_APP_SECRET=...
META_WEBHOOK_SECRET=...

# Pluggy (Open Finance)
PLUGGY_CLIENT_ID=...
PLUGGY_CLIENT_SECRET=...

# Fiscal
FOCUS_NFE_API_TOKEN=...
FOCUS_NFE_BASE_URL=https://api.focusnfe.com.br/v2

# Backup
BACKUP_ENCRYPTION_KEY=... (32 bytes hex)
```

---

## CHECKLIST "READY TO TEST SYSTEM"

- [ ] Deploy na Vercel com todas as env vars
- [ ] `prisma db push` no Neon
- [ ] Seeds executados (`pnpm --filter @filitech/db db:seed`)
- [ ] Landing page carrega + calculadora puxa preços do banco
- [ ] Cadastro cria tenant TRIAL + User OWNER + Subscription + TenantModules
- [ ] Free tier ativa módulos base sem cartão
- [ ] Plano pago gera cobrança PIX (QR Code + copia-e-cola) no checkout
- [ ] Webhook Mercado Pago/Asaas confirma → `confirmCharge` → Tenant ACTIVE + módulos liberados
- [ ] Login valida argon2 + 2FA se habilitado
- [ ] PDV abre caixa + vende + fecha gaveta cega
- [ ] Estoque baixa por FEFO/FIFO/Serial/Variante
- [ ] Financeiro: DRE + fluxo projetado + contas a pagar/receber
- [ ] Fiscal: NFC-e emite (Focus NFe) + cancelamento + CC-e
- [ ] Nicho selecionado carrega template + sugere módulos
- [ ] Admin panel lista tenants + impersonação + MRR + módulos
- [ ] Esc. Contabilidade: marketplace + procuração + tasks + SPED
- [ ] Notificações centralizadas (in-app + e-mail + WhatsApp)
- [ ] Open Finance sincroniza extrato → conciliação sugerida
- [ ] Exportação total dados (CSV + XMLs) em todos os planos

---

## COMANDOS ÚTEIS

```bash
# Desenvolvimento
pnpm dev --filter @filitech/web-landing

# Build + TypeCheck
pnpm --filter @filitech/web-landing build
pnpm --filter @filitech/web-landing exec tsc --noEmit

# Database
pnpm --filter @filitech/db exec prisma generate
pnpm --filter @filitech/db exec prisma db push
pnpm --filter @filitech/db exec tsx prisma/seed.ts
pnpm --filter @filitech/db exec tsx prisma/seed-niches.ts

# Testes
pnpm --filter @filitech/api test
pnpm --filter @filitech/web-landing test
```

---

**Próximo passo imediato**: Iniciar **FASE 1** — criar `apps/admin-panel` e executar seeds essenciais.