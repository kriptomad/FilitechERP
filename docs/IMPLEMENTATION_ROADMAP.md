# Filitech ERP — Implementation Roadmap (V2 Spec)

> Derived from `BIBLE_ENGINEERING_V2.md` — 18 niches, PLG billing, offline-first PDV, structural multi-tenancy.

---

## Phase 0: Foundation (Weeks 1-2)

| ID | Task | Effort | Dependencies | Deliverable |
|----|------|--------|--------------|-------------|
| F01 | Monorepo setup (Turborepo + pnpm) | 3d | — | `pnpm-workspace.yaml`, `turbo.json`, shared TS config |
| F02 | Prisma schema (Ch. 5 + Ch. 12) → `packages/db` | 3d | F01 | `schema.prisma`, generated client, migrations |
| F03 | Multi-tenant Prisma extension (Ch. 7) | 2d | F02 | `prisma-tenant-extension.ts`, canary test |
| F04 | Auth: argon2 + RS256 JWT + session middleware | 2d | F02 | `auth/password.service.ts`, `auth/jwt.service.ts` |
| F05 | Cloudflare R2 client + signed URLs (Ch. 3.3) | 1d | F01 | `infra/storage/r2-client.ts` |
| F06 | Pino logger with LGPD redaction (Ch. 10.1) | 1d | F01 | `lib/logger.ts`, request logger middleware |
| F07 | Circuit breakers for SEFAZ/WhatsApp (Ch. 10.2) | 1d | F01 | `lib/circuit-breaker.ts` |
| F08 | Docker Compose (Postgres 15, Redis, MinIO for local R2) | 1d | F01 | `docker-compose.yml`, `.env.example` |

**Exit Criteria:** `pnpm db:migrate` runs clean; canary isolation test passes; `docker compose up` healthy.

---

## Phase 1: Billing & PLG Engine (Weeks 3-4)

| ID | Task | Effort | Dependencies | Deliverable |
|----|------|--------|--------------|-------------|
| B01 | Plan/Module/Subscription models + Stripe/Asaas webhooks | 3d | F02 | `billing/webhooks/`, `billing/checkout.service.ts` |
| B02 | Feature gating middleware (Ch. 2.6, 6.1) | 2d | B01, F03 | `middlewares/gatekeeper.middleware.ts` |
| B03 | Tier Free enforcement (100 sales, 1 user, 200 SKUs) | 2d | B02 | Quota checks in gatekeeper |
| B04 | Niche combo templates + discount calc (Ch. 2.5) | 1d | B01 | Seed script for `Module` + `Plan` catalog |
| B05 | Upsell modal frontend component (React) | 2d | B02 | `packages/ui/UpsellModal.tsx` |
| B06 | Public pricing calculator API (Ch. 9.3) | 1d | B01 | `POST /api/billing/calculate` |

**Exit Criteria:** Free tenant hits quota → 402 with upsell payload; paid tenant activates module → immediate access.

---

## Phase 2: Landing Page (Weeks 3-4, parallel)

| ID | Task | Effort | Dependencies | Deliverable |
|----|------|--------|--------------|-------------|
| L01 | Next.js 14 App Router + Tailwind + Framer Motion + GSAP + R3F | 2d | F01 | `apps/web-landing` scaffold |
| L02 | Hero section with 3D device mesh (Ch. 2.2) | 2d | L01 | `HeroSection.tsx`, `ErpDeviceMesh.tsx` |
| L03 | Niche showcase with GSAP parallax (Ch. 2.2) | 1d | L01 | `NicheShowcaseSection.tsx` |
| L04 | Interactive pricing calculator (Ch. 2.3) | 3d | L01, B06 | `PricingCalculatorSection.tsx` |
| L05 | Social proof + footer + SEO metadata | 1d | L01 | Complete landing page |
| L06 | Deploy to Vercel (preview + prod) | 1d | L05 | `filitecherp.com.br` live |

**Exit Criteria:** Lighthouse > 90; calculator updates MRR in real-time; "Assinar agora" → `/api/billing/checkout`.

---

## Phase 3: Core Transactional Engine (Weeks 5-8)

| ID | Task | Effort | Dependencies | Deliverable |
|----|------|--------|--------------|-------------|
| T01 | Product catalog CRUD (batch/serial/variant) | 3d | F02, F03 | `modules/catalog/` |
| T02 | Stock movements + FEFO deduction (Ch. 6.2) | 3d | T01, F03 | `services/stock/deduct-stock-fefo.service.ts` |
| T03 | Recipe/BOM + Production batch (Ch. 6.3) | 2d | T01, F03 | `services/production/produce-recipe-batch.service.ts` |
| T04 | Sale + Payment + CashRegister (blind close) | 3d | T01, F03 | `modules/sales/`, `modules/cash-register/` |
| T05 | AccountPayable/Receivable + NF-e import (Ch. 6.5) | 3d | T01, F05 | `services/fiscal/import-nfe-xml.service.ts` |
| T06 | Work Order lifecycle + WhatsApp approval (Ch. 6.4) | 3d | T01, F03 | `modules/work-order/`, `services/work-order/approve-budget.service.ts` |
| T07 | Casco ledger (Adega) | 1d | T01 | `modules/beverage-store/container-ledger.service.ts` |
| T08 | PrescriptionRecord + SNGPC stub (Ch. 4.5) | 2d | T01 | `modules/pharmacy/prescription.service.ts` |

**Exit Criteria:** All transactional handlers pass integration tests with Serializable isolation; NF-e import creates stock + payable atomically.

---

## Phase 4: Offline-First PDV (Weeks 7-10, overlaps Phase 3)

| ID | Task | Effort | Dependencies | Deliverable |
|----|------|--------|--------------|-------------|
| P01 | Dexie.js schema + offline DB (Ch. 8.3) | 2d | F01 | `packages/shared/offline/db.ts` |
| P02 | Service Worker + Background Sync (Ch. 8.3) | 3d | P01 | `public/service-worker.js`, `registerBackgroundSync()` |
| P03 | Idempotency key flow (client UUID → server `idempotencyKey`) | 1d | P02, T04 | Verified duplicate POST returns 200 idempotent |
| P04 | Optimistic stock decrement on offline sale | 1d | P01, T02 | Local snapshot updated before sync |
| P05 | POS screen (lazy-loaded module) | 3d | P01, F03 | `apps/web-app/modules/market/pos/pos-screen.tsx` |
| P06 | Offline indicator + pending queue UI | 1d | P02 | `OfflineStatusBadge.tsx`, `PendingSalesList.tsx` |
| P07 | Thermal printer integration (Web USB/Bluetooth) | 2d | P05 | `hardware/printer.service.ts` |

**Exit Criteria:** Flight mode → complete sale → print non-fiscal receipt → reconnect → auto-sync → fiscal doc authorized.

---

## Phase 5: Real-Time & Niche Modules (Weeks 9-12)

| ID | Task | Effort | Dependencies | Deliverable |
|----|------|--------|--------------|-------------|
| R01 | SSE gateway (BullMQ → Redis → EventSource) | 2d | F01 | `gateways/sse.gateway.ts` |
| R02 | Work Order live status hook (Ch. 8.2) | 1d | R01, T06 | `useWorkOrderLiveStatus.ts` |
| R03 | KDS (Kitchen Display) for Restaurant niche | 2d | R01, T03 | `modules/restaurant/kds-screen.tsx` |
| R04 | Appointment scheduler (Petshop, Beauty, Automotive) | 2d | F02 | `modules/scheduling/appointment-board.tsx` |
| R05 | Optical prescription + lab order flow | 2d | F02 | `modules/optical/prescription-form.tsx` |
| R06 | Vehicle + VehicleListing (Automotive niches) | 2d | F02 | `modules/automotive/vehicle-registry.tsx` |
| R07 | Fashion/Footwear variant grid management | 1d | T01 | `modules/fashion/variant-grid.tsx` |
| R08 | Construction fractional sale (purchaseUnit/saleUnit) | 1d | T01 | `modules/hardware/fractional-pos.tsx` |

---

## Phase 6: SRE & Observability (Weeks 11-12)

| ID | Task | Effort | Dependencies | Deliverable |
|----|------|--------|--------------|-------------|
| S01 | Health checks + `/ready` `/live` endpoints | 1d | F01 | `GET /health`, `/ready` |
| S02 | Prometheus metrics (HTTP latency, queue depth, PDV sync lag) | 2d | F01 | `metrics.ts`, `/metrics` endpoint |
| S03 | Grafana dashboards (PDV offline rate, FEFO errors, billing conversion) | 1d | S02 | JSON dashboards |
| S04 | Encrypted backup job (Ch. 10.3) | 1d | F08 | `jobs/encrypted-backup.job.ts` (BullMQ cron) |
| S05 | Load test: 100 concurrent PDV offline sales sync | 2d | P03 | k6 script + results |
| S06 | Chaos test: SEFAZ circuit breaker → NFC-e contingency | 1d | T05, S04 | Verified contingency mode works |

---

## Phase 7: Multi-Filial & Expansion Niches (Weeks 13-16)

| ID | Task | Effort | Dependencies | Deliverable |
|----|------|--------|--------------|-------------|
| M01 | Tenant hierarchy (`parentTenantId`) + consolidated dashboard | 3d | F03, B01 | `modules/multi-filial/consolidated-dashboard.tsx` |
| M02 | Restaurant/ifood webhook integration | 2d | T04, R01 | `webhooks/ifood.ts` |
| M03 | Optical lab order tracking | 1d | R05 | `modules/optical/lab-tracking.tsx` |
| M04 | Petshop vaccine reminders (WhatsApp/SMS job) | 1d | R04 | `jobs/vaccine-reminder.job.ts` |
| M05 | Stationery seasonal purchase suggestions | 1d | T01 | `modules/stationery/seasonal-suggest.service.ts` |
| M06 | Consignment inventory (Optical frames, Used cars) | 2d | T01 | `modules/consignment/consignment.service.ts` |
| M07 | Automotive portal publishing (OLX/Webmotors) | 2d | R06 | `jobs/portal-publish.job.ts` |

---

## Phase 8: Polish & Launch Prep (Weeks 17-18)

| ID | Task | Effort | Dependencies | Deliverable |
|----|------|--------|--------------|-------------|
| X01 | E2E tests (Playwright): onboarding → first sale → close caixa | 3d | All | `tests/e2e/` |
| X02 | Load test: 500 tenants, 50 concurrent PDV each | 2d | S05 | k6 results |
| X03 | Security audit (SQLi, XSS, tenant isolation, LGPD logs) | 3d | All | Audit report |
| X04 | Documentation site (Docusaurus) + API reference | 2d | All | `docs.filitecherp.com.br` |
| X05 | Marketing site analytics (Plausible/PostHog) | 1d | L06 | Event tracking |
| X06 | Production deploy (Hetzner K3s + Cloudflare) | 2d | F08, S04 | `filitecherp.com.br` prod |

---

## Summary Timeline

```
Weeks 1-2   ████████████  Foundation
Weeks 3-4   ████████████████████  Billing + Landing (parallel)
Weeks 5-8   ████████████████████████████  Core Transactional
Weeks 7-10        ████████████████████  Offline PDV
Weeks 9-12              ████████████████  Real-time + Niches
Weeks 11-12                    ████████  SRE
Weeks 13-16                          ████████████████  Multi-filial + Expansion
Weeks 17-18                                  ████████  Polish & Launch
```

**Total: ~18 weeks (4.5 months) for MVP covering all 18 niches with offline PDV.**

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| SEFAZ instability blocks fiscal emission | High | High | Circuit breaker + offline contingency (implemented Ch. 10.2) |
| Multi-tenant data leak via raw SQL | Medium | Critical | Prisma extension fail-closed + canary test (Ch. 7) |
| Offline PDV sync conflicts (stock oversell) | Medium | High | Optimistic local decrement + server-side FEFO validation on sync |
| iFood/WhatsApp API rate limits | Medium | Medium | Circuit breaker + exponential backoff + dead-letter queue |
| Prisma Serializable isolation perf on high concurrency | Low | Medium | Benchmark early; fallback to advisory locks if needed |
| LGPD compliance gaps in logs/backups | Low | Critical | Automated redaction + encrypted streaming backup (Ch. 10) |
| Browser Background Sync not supported (Safari/iOS) | High | Medium | Fallback to `online` event + manual sync button (Ch. 8.3) |