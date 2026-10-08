# Filitech ERP — Architecture Review (V2 Spec)

> Auditoria do documento `BIBLE_ENGINEERING_V2.md` — pontos fortes, lacunas e recomendações.

---

## ✅ Pontos Fortes (decisões bem fundamentadas)

| # | Decisão | Por que funciona |
|---|---------|------------------|
| 1 | **Prisma Client Extension fail-closed** (Cap. 7.2) | Elimina a causa nº1 de vazamento multi-tenant (esquecer `where.tenantId`). Operação desconhecida → throw, não bypass. |
| 2 | **Gaveta cega no caixa** (Cap. 4.1) | Resolve o problema real de "ajustar" contagem para bater com esperado — prática comum que mascara desvio. |
| 3 | **Idempotency-Key no PDV offline** (Cap. 8.3) | UUID gerado no cliente vira chave no servidor → reconexão instável não duplica venda. |
| 4 | **BOM na produção, não na venda** (Cap. 6.3) | Reflete realidade de padaria: insumo consumido na fornada, produto fica em estoque. |
| 5 | **FEFO com `SELECT ... FOR UPDATE`** (Cap. 6.2) | Lock pessimista + Serializable garante que duas vendas simultâneas não disputam o mesmo lote. |
| 6 | **Circuit breaker + contingência NFC-e** (Cap. 10.2) | SEFAZ instável nunca trava o PDV — cupom emitido localmente com numeração reservada. |
| 7 | **Tier Free por volume, não por tempo** (Cap. 2.4) | Lojista testa a operação real sem pressão de expiração; upgrade natural ao contratar 1º funcionário (1 usuário). |
| 8 | **Cascos com ledger separado** (Cap. 4.3) | Vasilhame é patrimônio da distribuidora, não do cliente — conta corrente própria evita confusão financeira. |
| 9 | **Comissão só em DELIVERED** (Cap. 4.2) | Protege contra cancelamento tardio de O.S. após comissão já paga. |
| 10 | **SSE > WebSocket para O.S.** (Cap. 8.2) | Unidirecional, mais barato, `EventSource` reconecta nativamente. |

---

## ⚠️ Lacunas e Riscos Identificados

### 1. `expectedAmount` exposto no schema mas não protegido na API
**Risco:** `CashRegister.expectedAmount` está no modelo (Cap. 5), mas não há garantia de que o handler de fechamento nunca serialize esse campo antes da confirmação da contagem física.
**Recomendação:** Nunca incluir `expectedAmount` em responses do caixa; retornar apenas após `closingAmount` ser setado. Adicionar teste de contrato.

### 2. Gatekeeper consulta `prisma.tenant` a cada request
**Risco:** O gatekeeper (Cap. 6.1) faz `findUniqueOrThrow` em `Tenant` a cada request autenticada — round-trip desnecessário para status que muda ~1x/mês.
**Recomendação:** Cache de status do tenant em JWT claims (curto TTL, ex.: 5 min) ou Redis, invalidado por webhook de billing.

### 3. Cache de módulos com `length === 0` como miss
**Risco:** Se um tenant genuinamente não tem módulos ativos (só Free), `smembers` retorna `[]` e o código recarrega do banco a cada request — cache miss eterno.
**Recomendação:** Usar um marker (ex.: chave `tenant:{id}:modules:loaded`) ou `SISMEMBER` com conjunto sempre populado (mesmo que vazio).

### 4. `RolePermission` query por `role` vs schema por `userId`
**Risco:** O gatekeeper (Cap. 6.1) busca `rolePermission` com `role: session.role`, mas o schema (Cap. 5) indexa por `userId`, não `role`. A query não bate com o modelo.
**Recomendação:** Definir matriz de permissões por `Role` em tabela separada (`RolePermissionMatrix`), OU corrigir a query para filtrar por `userId`.

### 5. `findUnique` em operação de escrita (`upsert`) não injeta `tenantId` no `create`
**Risco:** O `upsert` cai em `WRITE_WHERE_OPERATIONS` e injeta `tenantId` no `where`, mas o `create` do upsert não recebe `tenantId` — pode criar linha sem tenant.
**Recomendação:** Tratar `upsert` separadamente: injetar `tenantId` em `args.create` E em `args.where`.

### 6. Falta `Comanda` → `Sale` atomicidade
**Risco:** Fechamento de comanda (Cap. 11.1) transforma `Comanda` em `Sale`, mas não há service transacional definido (a exemplo de `importNfeXml`).
**Recomendação:** Criar `closeComanda.service.ts` com transação: valida itens → cria `Sale` + `SaleItem` → baixa estoque → seta `Comanda.saleId` → dispara fiscal.

### 7. `VehicleListing` sem relação `tenant → WorkOrder.vehicleId`
**Risco:** `WorkOrder.vehicleId` aponta para `Vehicle`, mas seminovos usam `VehicleListing` (chassi) — não há `Vehicle` criado automaticamente ao criar listing.
**Recomendação:** Ao criar `VehicleListing`, criar também um `Vehicle` stub vinculado (owner = consignor ou loja).

### 8. SNGPC: `PrescriptionRecord.saleItemId` unique global, não por tenant
**Risco:** `@@unique` em `saleItemId` é global (não composto com `tenantId`) — não é um bug real (saleItemId já é global único), mas inconsistente com padrão dos demais modelos.
**Recomendação:** Manter como está (UUID global), mas documentar.

### 9. Falta estrutura de testes automatizados
**Risco:** O spec define teste canário de isolamento (Cap. 7.3) mas não define cobertura para FEFO, comissão, gaveta cega, idempotência offline.
**Recomendação:** Meta mínima: 80% cobertura nos `services/` transacionais; testes de contrato para API envelope.

### 10. Frontend: `useActiveModules` não definido
**Risco:** `routes.tsx` (Cap. 8.1) usa `hasModule("MARKET_POS")`, mas o hook `useActiveModules` não é especificado — e os códigos (`MARKET_POS`) divergem dos códigos do schema (`fiscal`, `whatsapp`...).
**Recomendação:** Unificar vocabulário de `moduleCode` (snake_case vs kebab-case) em um único `ModuleCode` type compartilhado (shared package).

---

## 🔧 Recomendações de Implementação (priorização)

> **Status (pós-implementação):** os itens P0 abaixo foram APLICADOS no starter:
> upsert no extension ✅ · `expectedAmount` protegido (`serializeRegisterForList`) ✅ ·
> `moduleCode` unificado em `@filitech/shared` ✅ · query `RolePermission` corrigida
> (matriz por Role + override por usuário, `role-permissions.ts`) ✅ · cache de status
> do tenant parcial (login bloqueia + gatekeeper consulta) ✅.

| Prioridade | Item | Esforço |
|------------|------|---------|
| P0 | Corrigir upsert no Prisma extension (R5) | 0.5d |
| P0 | Proteger `expectedAmount` no fechamento de caixa (R1) | 1d |
| P0 | Unificar `moduleCode` vocabulary (R10) | 1d |
| P1 | Corrigir query de `RolePermission` (R4) | 0.5d |
| P1 | Cache de status do tenant (R2) | 1d |
| P1 | Cache marker para módulos vazios (R3) | 0.5d |
| P2 | `closeComanda.service.ts` (R6) | 2d |
| P2 | Testes FEFO/comissão/gaveta (R9) | 5d |
| P3 | `VehicleListing` → `Vehicle` stub (R7) | 1d |

---

## 📊 Scorecard

| Dimensão | Nota | Justificativa |
|----------|------|---------------|
| Modelagem de dados | 9/10 | Schema exaustivo, 18 nichos cobertos; alguns índices compostos faltando (ex.: `ComandaItem.tenantId+comandaId` já presente ✓) |
| Isolamento multi-tenant | 9/10 | Abordagem estrutural (extension) é ouro; upsert e RBAC query são os únicos gaps |
| Transacionalidade (ACID) | 9/10 | FEFO, BOM, NF-e, aprovação — todos com `Serializable` ou lock condicional; falta comanda |
| Resiliência (SRE) | 8/10 | Circuit breaker, backup criptografado, logs LGPD; falta métricas Prometheus e alerting definidos |
| UX de conversão (PLG) | 9/10 | Calculadora real-time, Tier Free por volume, upsell contextual — padrão Stripe/Linear |
| Cobertura de nichos | 10/10 | 18 nichos com regras reais pesquisadas, não genéricas |
| Testabilidade | 6/10 | Canário de isolamento é bom; demais fluxos transacionais sem testes especificados |
| Documentabilidade | 9/10 | Código comentado com racional; único documento de verdade |

**Média geral: 8.75/10 — especificação pronta para implementação com as correções P0 aplicadas.**
