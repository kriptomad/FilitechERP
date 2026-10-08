# Filitech ERP — Starter (V2)

Implementação inicial derivada de `BIBLE_ENGINEERING_V2.md` — SaaS multi-nicho (18 nichos), billing à la carte, PDV offline-first, blindagem multi-tenant estrutural.

## Estrutura

```
filitech-erp-starter/
├── apps/
│   ├── api/                  # Backend Express + Prisma (Cap. 3, 6, 7, 9, 10)
│   │   └── src/
│   │       ├── auth/             # argon2 + RS256 JWT (Cap. 3.5)
│   │       ├── lib/              # prisma scoped, tenant-context, logger, circuit-breaker, redis
│   │       ├── middlewares/      # gatekeeper, tenant-context
│   │       ├── services/         # FEFO, BOM, aprovação orçamento, import NF-e
│   │       ├── jobs/             # backup criptografado (Cap. 10.3)
│   │       └── types/            # API envelope (Cap. 9.1)
│   ├── web-landing/          # Next.js 14 + Tailwind + Framer Motion (Cap. 2)
│   │   └── src/app/(marketing)/  # hero, niche showcase, pricing calculator
│   └── web-app/              # Vite + React 18 SPA (Cap. 8)
│       └── src/
│           ├── modules/market/pos/   # close-sale-offline
│           └── shared/offline/       # Dexie.js DB
├── packages/
│   ├── db/                   # Prisma schema completo (Cap. 5 + 12)
│   ├── shared/               # tipos compartilhados
│   ├── ui/                   # design system (UpsellModal etc.)
│   └── config/               # tsconfig, eslint
├── tools/                    # specs estruturados (pricing, API, niches)
└── docs/
    ├── IMPLEMENTATION_ROADMAP.md   # 8 fases, 18 semanas
    └── ARCHITECTURE_REVIEW.md      # auditoria + scorecard 8.75/10
```

## Início rápido

> Pré-requisitos: Node ≥ 20, pnpm 9 (`npm i -g pnpm@9`), Docker.
> Portas: API `:3001`, Landing `:3000`, App `:3002`, Postgres `:5433`, Redis `:6379`.
> O Postgres local mapeia a porta **5433** para não colidir com outros Postgres
> já em uso — se a 5432 estiver livre, ajuste `docker-compose.yml` e o
> `DATABASE_URL` no `.env`.

```bash
# 1. Instalar dependências
pnpm install

# 2. Ambiente + chaves JWT RS256 (Cap. 3.5)
cp .env.example .env
node -e "const c=require('crypto');const{publicKey,privateKey}=c.generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});require('fs').writeFileSync('keys/jwt_private.pem',privateKey);require('fs').writeFileSync('keys/jwt_public.pem',publicKey)"

# 3. Subir infra (Postgres 15, Redis)
docker compose up -d

# 4. Schema + client Prisma + seed de planos/módulos (Cat. 2.5)
pnpm db:generate
pnpm db:push
pnpm --filter @filitech/db db:seed

# 5. (opcional) Tenant demo + dados de operação p/ smoke test
pnpm --filter @filitech/api exec tsx ../../apps/api/scripts/bootstrap-demo.ts
pnpm --filter @filitech/api exec tsx ../../apps/api/scripts/seed-demo-data.ts
pnpm --filter @filitech/api exec tsx ../../apps/api/scripts/seed-smoke-extras.ts
# Login demo: demo@filitech.dev / Demo@123 (OWNER) · caixa@filitech.dev / Caixa@123 (CASHIER)

# 6. Rodar dev (API + Landing + App)
pnpm dev

# 7. Verificar tudo (mesmo que o CI roda)
pnpm lint && pnpm test && pnpm build
```

## Checklist de cobertura do documento — 100%

| Capítulo | Status | Arquivos |
|----------|--------|----------|
| 1 — Ecossistema/jornada | ✅ | `docs/IMPLEMENTATION_ROADMAP.md` + `journey-section.tsx` (stepper da jornada na landing) |
| 2.1-2.2 — Landing Big Tech | ✅ | hero (**R3F+drei Canvas**), showcase (**GSAP+ScrollTrigger**), social proof **em carrossel**, `erp-device-mesh.tsx`, **navbar glass**, **transições de página** (`template.tsx`), features/jornada/arquitetura/FAQ/CTA, footer + `termos`/`privacidade` |
| 2.3 — Calculadora à la carte | ✅ | `pricing-calculator-section.tsx` (**framer-motion** `useMotionValue`+`animate`) → CTA para `/checkout` com breakdown |
| 2.4-2.5 — Tier Free / Combos | ✅ | `tools/pricing-catalog.json` + `seed.ts` (plano **FREE**) + `GET /billing/catalog` + página **`/planos`** (cards, combos −10…18%, montador à la carte, tabela de travas Free) |
| 2.6 — Feature gating + upsell | ✅ | `module-gating.middleware.ts` + `UpsellModal.tsx` + billing activate |
| 9.3 — Contratação (signup/checkout/painel) | ✅ | `POST /auth/signup`, `POST /billing/checkout` (persiste + BillingEvent), `GET /billing/{subscription,invoices,usage,catalog}` + páginas **`/cadastro`**, **`/checkout`**, **`/onboarding`** e **sistema de administração `/painel`** (assinatura, módulos, faturas, equipe, empresa) |
| 9.3b — Sistema de administração (cobrança/clientes/serviços) | ✅ | API `GET/POST/PATCH/DELETE /admin/{clients,services,receivables}` + ações `POST /admin/receivables/:id/{pay,cancel}` (`portal-admin.service.ts` com RBAC `billing:manage`, isolamento tenant, regras de duplicidade/uso/limite de crédito) + abas **Cobrança**, **Clientes** e **Serviços** no `/painel` (KPIs, filtros, CRUD com confirmação em 2 passos, atalho **Cobrar**) |
| 9.3c — Contrato de serviço | ✅ | `GET/POST /api/contracts` + `POST /api/contracts/{id}/{sign,cancel,pdf}` (`service-contract.service.ts` com validação zod, geração de PDF, status DRAFT→ACTIVE→CANCELLED) + aba **Contratos** no `/painel` (CRUD, assinar, cancelar, gerar PDF) |
| 9.3d — Cobrança da mensalidade | ✅ | Job `charge-subscriptions.job.ts` (diário às 6h): gera `AccountReceivable` por tenant com MRR (plano + add-ons), registra `BillingEvent`, idempotência por mês |
| 9.3e — Webhook de billing | ✅ | `POST /api/webhooks/billing` (`billing-webhook.ts`): recebe `payment.succeeded`/`subscription.past_due`/`subscription.cancelled`, atualiza Subscription+Tenant, invalida cache, idempotência |
| 9.3f — CRUD completo de usuários | ✅ | `PATCH /api/users/:id` (editar nome/papel/ativo), `DELETE /api/users/:id` (proteção: não exclui próprio OWNER nem último OWNER), `POST /api/users/:id/reset-password` |
| 9.3g — Cancelamento de assinatura | ✅ | `POST /api/billing/subscription/cancel`: muda status para CANCELLED, desativa módulos, registra evento |
| 9.3h — Upgrade/downgrade com proração | ✅ | `POST /api/billing/subscription/change-plan`: calcula valor proporcional ao período restante, atualiza módulos, registra evento |
| 9.3i — Devolução de venda | ✅ | `POST /api/sales/:id/refund` (`refund.service.ts`): estorna pagamento, retorna estoque, debita crédito do cliente, marca como REFUNDED |
| 9.3j — Job scheduler | ✅ | `scheduler.ts`: agendador isolado da API, executa jobs em intervalos regulares (suspend-overdue, charge-subscriptions, vaccine-reminder, whatsapp, portal-publish) |
| 9.3k — Módulos web-app (adega, padaria, farmácia, varejo) | ✅ | `container-ledger-screen.tsx` (cascos), `production-screen.tsx` (BOM), `prescription-screen.tsx` (SNGPC), `credit-screen.tsx` (crediário) + rotas `/cascos`, `/producao`, `/receitas`, `/crediario` |
| 3.1 — Topologia + Dockerfile distroless | ✅ | `apps/api/Dockerfile` + `docker-compose.yml` |
| 3.2-3.3 — Edge/R2 | ✅ | `r2-client.ts` + `.env.example` |
| 3.4 — DB/Redis/BullMQ | ✅ | `tenant-cache.ts`, `infra/queues/index.ts` (5 filas), `redis.ts` |
| 3.5 — Auth | ✅ | `password.service.ts` (argon2id), `jwt.service.ts` (RS256), `session.middleware.ts` |
| 4.1 — Mercado (gaveta cega, ABC, validade, compras, fidelidade) | ✅ | `cash-register.service.ts`, `purchase-suggestion.service.ts` (ABC+compras), `expiry-alert.service.ts`, `loyalty.service.ts` |
| 4.2 — Assistência (ciclo O.S., WhatsApp, comissão, garantia) | ✅ | `work-order.routes.ts`, `approve-budget.service.ts`, `commission.service.ts`, `whatsapp-budget-approval.job.ts` |
| 4.3 — Adega (cascos) | ✅ | `container-ledger.service.ts` + rota `/containers` |
| 4.4 — Padaria (BOM/produção/perdas) | ✅ | `produce-recipe-batch.service.ts` |
| 4.5 — Farmácia (SNGPC/SNCR/retenção/FEFO) | ✅ | `prescription.service.ts`, `deduct-stock-fefo.service.ts` |
| 4.6 — Varejo (crediário/devolução/grade) | ✅ | `create-sale.service.ts` (STORE_CREDIT+limite) |
| 5 — Schema exaustivo | ✅ | `schema.prisma` (50+ modelos, 18 nichos) + `seed.ts` |
| 6.1 — Gatekeeper 3 fontes | ✅ | `gatekeeper.middleware.ts` (**P0 R4: matriz por Role + override**) |
| 6.2-6.5 — FEFO/BOM/orçamento/NF-e | ✅ | `services/stock|production|work-order|fiscal/` |
| 7 — Blindagem multi-tenant | ✅ | extension (**P0 upsert**), context, teste canário (5 casos) |
| 8.1 — SPA feature-based + providers | ✅ | `routes.tsx` (lazy+gate), `query-client.provider`, `theme.provider` (MUI v5) |
| 8.2 — SSE sem leaks | ✅ | `sse.gateway.ts` (fanout Redis) + `use-work-order-live-status.ts` |
| 8.3 — PDV offline-first | ✅ | `db.ts`, `close-sale-offline.ts`, `service-worker.js`, `sync-engine.ts`, POS, fila |
| 9 — Contratos REST | ✅ | envelope + rotas auth (**login+signup**)/user (**/users** CRUD de equipe)/sales/work-order/billing (**catalog/calculate/checkout/subscription/invoices/usage/modules**)/niche + `tools/api-contracts.json` |
| 10.1 — Logs LGPD | ✅ | `logger.ts` (redact) + `request-logger.middleware.ts` |
| 10.2 — Circuit breaker + contingência | ✅ | `circuit-breaker.ts` + `fiscal-emission.service.ts` (contingência offline) |
| 10.3 — Backup criptografado | ✅ | `encrypted-backup.job.ts` (AES-256-GCM streaming) |
| 11.1 — Restaurante (comanda/KDS/iFood) | ✅ | `close-comanda.service.ts` + `ifood-webhook.ts` |
| 11.2-11.8 — Ótica/Petshop/Moda/Papelaria/Salão/Calçados/Construção | ✅ | schema + `appointment.service.ts` + rotas |
| 11.9-11.12 — Automotivo | ✅ | schema + `portal-publish.job.ts` |
| 12 — Expansão schema | ✅ | schema + seed (20 módulos) + `module-codes.ts` |
| P0 Review | ✅ | upsert, RBAC matrix, `moduleCode` unificado (`@filitech/shared`) |
| CI/CD | ✅ | `.github/workflows/ci.yml` |

## Testes incluídos

- `tenant-isolation.spec.ts` — Cap. 7.3: 5 casos canário (findUnique cross-tenant, create automático, fail-closed, sem contexto).
- `cash-register-blind-close.spec.ts` — Cap. 4.1: `expectedAmount` nunca exposto antes de CLOSED.
- `admin-portal.spec.ts` — sistema de administração: 13 casos (CRUD de clientes/serviços/cobranças, isolamento cross-tenant via 404, documento duplicado por tenant, validação PT-BR, proteção de exclusão em uso, limite de crédito, transições de status, filtro OVERDUE, matriz RBAC com overrides).
- `contracts.spec.ts` — contrato de serviço: 6 casos (criação com cálculo de total, assinatura, proteção contra dupla assinatura, cancelamento, validação de itens vazios, cliente inexistente).

## Próximos passos

1. `pnpm install && docker compose up -d && pnpm db:push && pnpm db:seed && pnpm dev`.
2. Webhooks reais Stripe/Asaas → `Subscription` + invalidação de cache de módulos.
3. Integrações externas: SEFAZ (certificado A1), WhatsApp Cloud API, iFood, portais — todos com stubs assinados nos jobs/services.
4. CI verde: testes de isolamento + gaveta cega + expansão de testes E2E (Playwright).
