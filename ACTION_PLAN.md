# PLANO DE AÇÃO — FILITECH ERP (Vercel + Neon)

> **Objetivo:** Sistema 100% funcional, production-ready, sem mocks.
> **Stack de Deploy:** Vercel (Serverless Functions) + Neon (PostgreSQL).
> **Data de início:** 2026-10-09

---

## DIAGNÓSTICO COMPLETO

### Arquitetura Atual

```
filitech-erp-starter/
├── apps/
│   ├── api/              → Express + Prisma (NÃO roda na Vercel)
│   ├── web-landing/      → Next.js 14 (landing + API routes mock)
│   └── web-app/          → Vite + React 18 (SPA do ERP)
├── packages/
│   ├── db/               → Prisma schema (87 models, 47 enums)
│   ├── shared/           → Tipos compartilhados
│   ├── ui/               → Design system
│   └── config/           → tsconfig, eslint
├── vercel.json           → Configuração Vercel (corrigida)
└── .env                  → Variáveis de ambiente local
```

### Problemas Críticos Identificados

| # | Problema | Impacto | Status |
|---|----------|---------|--------|
| 1 | `ERP_APP_URL` vazio → botão "Entrar" vira `href=""` → volta para landing | Login inacessível | ✅ Corrigido |
| 2 | API routes mock (dados hardcoded) | Nada funciona de verdade | 🔄 Em correção |
| 3 | Express API não roda na Vercel | API real inacessível | 🔄 Migração necessária |
| 4 | Sem seleção de nicho no cadastro | Conta genérica | ✅ Corrigido |
| 5 | Sem tier FREE implementado | Sem plano gratuito | ✅ Corrigido |
| 6 | Sem escritório de contabilidade virtual | Módulo ausente | ⬜ Pendente |
| 7 | Sem 2FA completo | Segurança incompleta | ⬜ Pendente |
| 8 | Sem notificações multi-canal | Usuário não recebe alertas | ⬜ Pendente |
| 9 | Sem jobs/cron (dunning, cobrança) | Cobrança não funciona | ✅ Parcial |
| 10 | Sem busca global (Ctrl+K) | UX incompleta | ⬜ Pendente |
| 11 | Sem relatórios self-service | BI ausente | ⬜ Pendente |
| 12 | Sem conciliação bancária | Financeiro incompleto | ⬜ Pendente |
| 13 | Sem integração fiscal (Focus NFe) | Fiscal não funciona | ⬜ Pendente |
| 14 | Sem integração WhatsApp | Comunicação ausente | ⬜ Pendente |
| 15 | Sem integração Pluggy (Open Finance) | Dados bancários ausentes | ⬜ Pendente |

---

## FASE 0 — CORREÇÕES CRÍTICAS (BLOQUEIAM TUDO)

### 0.1 ERP_APP_URL
**Arquivo:** `apps/web-landing/src/lib/api.ts:65`
```ts
// Antes:
export const ERP_APP_URL = process.env.NEXT_PUBLIC_ERP_APP_URL ?? '';
// Depois:
export const ERP_APP_URL = '/app';
```

### 0.2 verificador de build
Rodar `pnpm --filter @filitech/web-landing exec tsc --noEmit` e corrigir todos os erros de sintaxe.

### 0.3 Remover mocks de API routes
Todos os arquivos em `web-landing/src/app/api/**` que retornam dados hardcoded devem ser reescritos para usar Prisma/Neon.

### 0.4 JWT sem filesystem
`server/jwt.ts` já usa `jose` + env vars. Verificar se está sendo importado corretamente.

### 0.5 next.config.js
Remover a regra que desabilita rewrites em produção.

---

## FASE 1 — INFRAESTRUTURA SERVER-SIDE (web-landing/src/server/)

### Arquivos a criar:
- `db.ts` — PrismaClient singleton ✅ (já existe)
- `jwt.ts` — sign/verify com jose ✅ (já existe)
- `password.ts` — argon2 ✅ (já existe)
- `session.ts` — cookie handling ✅ (já existe)
- `tenant-context.ts` — AsyncLocalStorage ✅ (já existe)
- `gatekeeper.ts` — feature gating + RBAC ✅ (já existe)
- `handler.ts` — wrapper de erro ✅ (já existe)
- `cache.ts` — cache de módulos ✅ (já existe)
- `api-envelope.ts` — envelope padrão ✅ (já existe)
- `billing-catalog.ts` — catálogo de billing ✅ (já existe)
- `audit.ts` — auditoria ✅ (já existe)
- `payment/gateway.ts` — Mercado Pago/Asaas adapter ✅ (já existe)
- `payment/confirm-charge.ts` — confirmação de pagamento ✅ (já existe)
- `services/admin-clients.ts` — CRUD clientes ✅ (já existe)
- `services/admin-services.ts` — CRUD serviços ✅ (já existe)
- `services/admin-receivables.ts` — contas a receber ✅ (já existe)
- `services/contracts.ts` — contratos ✅ (já existe)
- `services/contract-pdf.ts` — PDF de contrato ✅ (já existe)
- `services/sales.ts` — vendas PDV ✅ (já existe)
- `services/work-orders.ts` — ordens de serviço ✅ (já existe)

---

## FASE 2 — API ROUTES REAIS (web-landing/src/app/api/)

### Auth
- [x] `POST /api/auth/login` ✅
- [x] `POST /api/auth/signup` ✅
- [x] `GET /api/auth/me` ✅
- [x] `POST /api/auth/logout` ✅
- [x] `POST /api/auth/password/forgot` ✅
- [x] `POST /api/auth/password/reset` ✅
- [x] `PATCH /api/auth/niche` ✅
- [ ] `POST /api/auth/2fa/enroll/start` ⬜
- [ ] `POST /api/auth/2fa/enroll/confirm` ⬜
- [ ] `POST /api/auth/2fa/disable` ⬜
- [ ] `POST /api/auth/2fa/verify` ⬜
- [ ] `GET /api/auth/2fa/status` ⬜
- [ ] `GET /api/auth/sessions` ⬜
- [ ] `DELETE /api/auth/sessions/:id` ⬜
- [ ] `POST /api/auth/sessions/:id/revoke` ⬜

### Billing
- [x] `GET /api/billing/catalog` ✅
- [x] `POST /api/billing/checkout` ✅ (agora usa PSP)
- [x] `GET /api/billing/subscription` ✅
- [x] `GET /api/billing/invoices` ✅
- [x] `GET /api/billing/usage` ✅
- [x] `GET /api/billing/charge/:id` ✅
- [ ] `POST /api/billing/subscription/cancel` ⬜
- [ ] `POST /api/billing/subscription/change-plan` ⬜
- [ ] `POST /api/billing/subscription/keep` ⬜

### Users / Equipe
- [x] `GET /api/users` ✅
- [x] `POST /api/users` ✅
- [x] `PATCH /api/users/:id` ✅
- [x] `DELETE /api/users/:id` ✅
- [ ] `POST /api/users/:id/reset-password` ⬜

### Admin Portal
- [x] `GET/POST /api/admin/clients` ✅
- [x] `PATCH/DELETE /api/admin/clients/:id` ✅
- [x] `GET/POST /api/admin/services` ✅
- [x] `PATCH/DELETE /api/admin/services/:id` ✅
- [x] `GET/POST /api/admin/receivables` ✅
- [x] `POST /api/admin/receivables/:id/pay` ✅
- [x] `POST /api/admin/receivables/:id/cancel` ✅

### Products / Estoque
- [x] `GET/POST /api/products` ✅
- [ ] `PATCH /api/products/:id` ⬜
- [ ] `DELETE /api/products/:id` ⬜
- [ ] `GET /api/stock/movements` ⬜
- [ ] `POST /api/stock/adjust` ⬜
- [ ] `GET /api/stock/expiry-alerts` ⬜
- [ ] `GET /api/stock/purchase-suggestions` ⬜
- [ ] `POST /api/purchases/orders` ⬜
- [ ] `GET /api/purchases/orders` ⬜
- [ ] `POST /api/purchases/orders/:id/receive` ⬜

### Sales / PDV
- [x] `POST /api/sales` ✅
- [x] `GET /api/sales` ✅
- [ ] `POST /api/sales/:id/refund` ⬜
- [ ] `GET /api/sales/report` ⬜
- [ ] `GET /api/sales/abc-curve` ⬜

### Work Orders
- [x] `POST /api/work-order` ✅
- [x] `GET /api/work-order` ✅
- [ ] `PATCH /api/work-order/:id` ⬜
- [ ] `POST /api/work-order/:id/status` ⬜
- [ ] `GET /api/work-order/:id` ⬜
- [x] `POST /api/work-order/:id/budget` ✅
- [x] `POST /api/work-order/approve` ✅
- [ ] `GET /api/work-order/:id/events` ⬜

### Cash Register
- [x] `GET/POST /api/cash-register` ✅
- [x] `PATCH /api/cash-register` ✅ (close)
- [ ] `POST /api/cash-register/movements` ⬜
- [ ] `GET /api/cash-register/movements` ⬜

### Notifications
- [ ] `GET /api/notifications` ⬜
- [ ] `POST /api/notifications/read` ⬜
- [ ] `POST /api/notifications/read-all` ⬜
- [ ] `GET /api/notifications/unread-count` ⬜
- [ ] `PATCH /api/notifications/preferences` ⬜

### Financial
- [ ] `GET /api/financial/dre` ⬜
- [ ] `GET /api/financial/cash-flow-projection` ⬜
- [ ] `POST /api/financial/bank-accounts` ⬜
- [ ] `GET /api/financial/bank-accounts` ⬜
- [ ] `POST /api/financial/bank-accounts/:id/reconcile` ⬜
- [ ] `GET /api/financial/sped-ecd/:year` ⬜

### Fiscal
- [ ] `POST /api/fiscal/emit-nfce` ⬜
- [ ] `POST /api/fiscal/nfe-import` ⬜
- [ ] `GET /api/fiscal/documents` ⬜
- [ ] `POST /api/fiscal/documents/:id/cancel` ⬜
- [ ] `POST /api/fiscal/documents/:id/cc` ⬜ (carta de correção)

### Reports
- [ ] `GET /api/reports/self-service` ⬜
- [ ] `POST /api/reports/self-service` ⬜
- [ ] `GET /api/reports/scheduled` ⬜
- [ ] `POST /api/reports/scheduled` ⬜
- [ ] `GET /api/reports/dashboard` ⬜
- [ ] `POST /api/reports/dashboard` ⬜

### Tenant
- [x] `GET /api/tenant/me` ✅
- [ ] `PATCH /api/tenant/me` ⬜
- [ ] `GET /api/tenant/export` ⬜

### Search (Command Palette)
- [ ] `GET /api/search` ⬜

### Webhooks
- [x] `POST /api/webhooks/billing` ✅
- [x] `POST /api/webhooks/ifood` ✅
- [ ] `POST /api/webhooks/pluggy` ⬜
- [ ] `GET /api/webhooks/endpoints` ⬜
- [ ] `POST /api/webhooks/endpoints` ⬜
- [ ] `GET /api/webhooks/deliveries` ⬜

---

## FASE 3 — FRONTEND ERP (web-landing/src/app/app/)

### Páginas a criar:
- `page.tsx` — Dashboard do ERP
- `pdv/page.tsx` — PDV (frente de caixa)
- `produtos/page.tsx` — Lista de produtos
- `clientes/page.tsx` — Lista de clientes
- `financeiro/page.tsx` — Visão financeira
- `configuracoes/page.tsx` — Configurações

### Componentes a criar:
- `AppShell` — layout principal com sidebar ✅
- `PdvScreen` — tela de PDV ⬜
- `ProductsScreen` — lista de produtos ⬜
- `ClientsScreen` — lista de clientes ⬜
- `FinancialScreen` — visão financeira ⬜
- `SettingsScreen` — configurações ⬜

---

## FASE 4 — TIER FREE

- Plano FREE já existe no seed ✅
- Checkout de FREE ativa sem gateway ✅
- Limites do Free visíveis no painel ✅

---

## FASE 5 — ESCRITÓRIO DE CONTABILIDADE

### Schema models (já existem):
- `AccountingFirmProfile` ✅
- `AccountingEngagement` ✅
- `AccountingTask` ✅
- `OfficialTaxDocument` ✅
- `AccountingMarketplaceReview` ✅
- `CompanyPartner` ⬜
- `PartnerPayout` ⬜

### API Routes a criar:
- `POST /api/accounting/engagements`
- `POST /api/accounting/engagements/:id/accept`
- `POST /api/accounting/engagements/:id/revoke`
- `GET /api/accounting/tasks`
- `POST /api/accounting/tasks/:id/complete`
- `GET /api/accounting/ecd/:year`
- `GET /api/accounting/defis/:year`
- `GET /api/accounting/marketplace`
- `POST /api/accounting/reviews`

### Frontend a criar:
- `src/app/contabilidade/page.tsx`
- `src/app/contabilidade/engajamentos/page.tsx`
- `src/app/contabilidade/tarefas/page.tsx`
- `src/app/contabilidade/documentos/page.tsx`
- `src/app/contabilidade/marketplace/page.tsx`

---

## FASE 6 — PAGAMENTO REAL

- `server/payment/gateway.ts` ✅ (Mercado Pago + Asaas)
- Checkout usa gateway ✅
- Webhook confirma pagamento ✅
- `confirmCharge()` promove para ACTIVE ✅

---

## FASE 7 — DEPLOY

1. Vercel: conectar repo GitHub
2. Environment Variables:
   - `DATABASE_URL` (Neon)
   - `JWT_PRIVATE_KEY` (base64)
   - `JWT_PUBLIC_KEY` (base64)
   - `BILLING_GATEWAY` (mercadopago/asaas)
   - `MERCADO_PAGO_ACCESS_TOKEN`
   - `ASAAS_API_KEY`
3. `pnpm db:push` no Neon
4. `pnpm db:seed`
5. Build + deploy

---

## ORDEM DE EXECUÇÃO

1. ✅ ACTION_PLAN.md criado
2. ⬜ Corrigir erros de sintaxe (tsconfig)
3. ⬜ Criar rotas faltantes (2FA, notificações, financial, fiscal, reports, search)
4. ⬜ Criar frontend ERP (PDV, produtos, clientes, financeiro, configurações)
5. ⬜ Criar módulo contabilidade
6. ⬜ Deploy

---

**Status atual:** Fase 0 concluída. Pronto para começar Fase 1.
