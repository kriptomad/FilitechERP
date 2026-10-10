# PLANO DE AÇÃO MASSIVO — FILITECH ERP (100% FUNCIONAL)

## 🔴 CRÍTICO — FAZER AGORA (Bloqueiam tudo)

### 1. CONFIGURAR VARIÁVEIS NA VERCEL (URGENTE)
| Variável | Status | Ação |
|----------|--------|------|
| `DATABASE_URL` | ❌ Não configurado | Copiar do Neon (pooled) |
| `JWT_PRIVATE_KEY` | ❌ Não configurado | Gerar: `openssl genrsa -out private.pem 2048 && openssl rsa -in private.pem -pubout -out public.pem && base64 -w 0 private.pem` |
| `JWT_PUBLIC_KEY` | ❌ Não configurado | `base64 -w 0 public.pem` |
| `BILLING_GATEWAY` | ❌ Não configurado | `mercadopago` ou `asaas` |
| `MERCADO_PAGO_ACCESS_TOKEN` | ❌ Não configurado | Pegar no painel MP |
| `ASAAS_API_KEY` | ❌ Não configurado | Pegar no painel Asaas |
| `CRON_SECRET` | ❌ Não configurado | `openssl rand -hex 32` |
| `NEXT_PUBLIC_APP_URL` | ❌ Não configurado | `https://seu-dominio.vercel.app` |

### 2. SEED DO BANCO NEON (OBRIGATÓRIO)
```bash
pnpm --filter @filitech/db db:push
pnpm --filter @filitech/db db:seed
```
Isso cria: planos (FREE/BASIC/PRO), módulos, nichos, templates de produtos.

---

## 🟠 ALTA PRIORIDADE — FAZER HOJE

### 1. Corrigir Login (PRIORIDADE MÁXIMA)
- [ ] Verificar se `JWT_PRIVATE_KEY` e `JWT_PUBLIC_KEY` estão na Vercel
- [ ] Verificar se `DATABASE_URL` aponta para Neon pooled
- [ ] Testar login com `demo@filitech.dev` / `Demo@123`
- [ ] Se falhar: ver logs da Vercel Function Logs

### 2. Corrigir Signup (não faz nada)
- Verificar se checkboxes de termos/privacidade são obrigatórios no frontend
- Verificar se `termsAccepted` e `privacyPolicyAccepted` são enviados
- Verificar se `nicheCode` é enviado (obrigatório para criar tenant com template)

### 3. Checkout Real (não ativa sem pagar)
- [ ] Configurar `BILLING_GATEWAY=mercadopago` na Vercel
- [ ] Adicionar `MERCADO_PAGO_ACCESS_TOKEN` e `MERCADO_PAGO_WEBHOOK_SECRET`
- [ ] Testar checkout com PIX (gerar QR Code)
- [ ] Verificar webhook `/api/webhooks/billing` processa `payment.succeeded`

### 4. Painel Admin (parametrização)
- [ ] Nichos: criar `/api/admin/niches` + UI no painel
- [ ] Módulos: ativar/desativar via `/api/billing/modules/:code/activate`
- [ ] Clientes: CRUD completo
- [ ] Serviços: CRUD com nicho
- [ ] Faturas: listar, pagar, cancelar

### 5. Seleção de Nicho (Onboarding)
- [ ] Página `/cadastro` mostra cards de nicho clicáveis
- [ ] Ao selecionar, carrega template de produtos do nicho
- [ ] Salva `nicheCode` no tenant
- [ ] Carrega produtos template do nicho automaticamente

### 6. Tier Free (básico)
- [ ] Plano FREE no seed (R$ 0, 100 vendas, 1 user, 200 SKUs)
- [ ] Checkout FREE ativa sem gateway
- [ ] Limites visíveis no painel (`/api/billing/usage`)

### 7. Checkout Real (não mock)
- [ ] Configurar `BILLING_GATEWAY=mercadopago` + `MERCADO_PAGO_ACCESS_TOKEN`
- [ ] Checkout cria `PaymentCharge` PENDING
- [ ] Retorna QR Code PIX / Link checkout
- [ ] Webhook `/api/webhooks/billing` processa `payment.succeeded`
- [ ] Webhook chama `confirmCharge()` → ativa módulos + subscription ACTIVE

### 8. Painel Admin (parametrização completa)
- [ ] Aba "Módulos": listar, ativar/desativar, ver preço
- [ ] Aba "Cobrança": faturas, uso, limites
- [ ] Aba "Clientes": CRUD, limite crédito
- [ ] Aba "Serviços": CRUD com nicho
- [ ] Aba "Faturas": listar, baixar PDF
- [ ] Aba "Equipe": convidar, editar papel, reset senha

---

## 🟡 MÉDIA PRIORIDADE — ESTA SEMANA

### 9. Nichos Interativos (Landing)
- [ ] Cards clicáveis → abrem painel lateral com features
- [ ] Mostrar módulos sugeridos, template de produtos
- [ ] Botão "Começar com [Nicho]" → `/cadastro?nicho=X`

### 10. Tier Free (básico)
- Plano FREE no seed (R$ 0, 100 vendas, 1 user, 200 SKUs)
- Limites visíveis no painel (`/api/billing/usage`)

### 11. Escritório de Contabilidade Virtual
- Modelo `AccountingFirmProfile` (já no schema)
- `AccountingEngagement` (procuração eletrônica)
- `AccountingTask` (tarefas recorrentes por competência)
- Marketplace de contadores no painel admin

### 11. NFe/NFSe (Focus NFe)
- Integração `fiscal-emission.service.ts` → Focus NFe
- Webhook de status (autorizada/rejeitada)
- Contingência offline (Cap. 10.2)

### 12. PDV Offline-First
- IndexedDB (Dexie) + Service Worker
- Sincronização em background
- Fechamento de caixa cega (gaveta cega)

---

## 🟢 BAIXA PRIORIDADE — PRÓXIMAS SPRINTS

### 13. Multi-filial / Multi-tenant
- `parentTenantId` no Tenant
- Dashboard consolidado

### 14. App Mobile (React Native + Expo)
- PDV móvel
- Aprovação orçamentos via push

### 15. Marketplace de Apps
- API Keys por tenant
- Webhooks configuráveis

---

## CHECKLIST DE DEPLOY (Vercel + Neon)

### Variáveis Obrigatórias na Vercel
```bash
DATABASE_URL="postgresql://...neon.tech/filitech_erp?sslmode=require"
JWT_PRIVATE_KEY="base64..."
JWT_PUBLIC_KEY="base64..."
BILLING_GATEWAY="mercadopago"
MERCADO_PAGO_ACCESS_TOKEN="APP_USR-..."
MERCADO_PAGO_WEBHOOK_SECRET="..."
ASAAS_API_KEY=""
ASAAS_WEBHOOK_SECRET=""
CRON_SECRET="..."
NEXT_PUBLIC_APP_URL="https://seu-dominio.vercel.app"
```

### Deploy Checklist
- [ ] `pnpm db:push` no Neon
- [ ] `pnpm db:seed` 
- [ ] Build passa: `pnpm build`
- [ ] Deploy Vercel
- [ ] Testar login: `demo@filitech.dev` / `Demo@123`
- [ ] Testar signup com nicho
- [ ] Testar checkout PIX (sandbox)
- [ ] Verificar webhook billing

---

## COMANDOS ÚTEIS

```bash
# Desenvolvimento local
pnpm dev

# Build
pnpm build

# Banco
pnpm --filter @filitech/db db:push
pnpm --filter @filitech/db db:seed
pnpm --filter @filitech/db db:studio

# Testes
pnpm test
pnpm --filter @filitech/web-landing exec tsc --noEmit
```

---

## PRIORIDADE ABSOLUTA AGORA

1. **Configure as variáveis na Vercel** (JWT keys, DATABASE_URL, BILLING_GATEWAY)
2. **Rode seed no Neon** (`pnpm db:seed`)
3. **Deploy** na Vercel
4. **Teste login** com `demo@filitech.dev` / `Demo@123`
5. **Teste signup** com nicho selecionado
6. **Teste checkout** PIX (sandbox Mercado Pago)

---

**PRÓXIMO PASSO IMEDIATO:** Configure as variáveis na Vercel e rode o seed. Sem isso, NADA funciona.