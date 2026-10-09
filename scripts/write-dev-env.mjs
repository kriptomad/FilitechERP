// Reescreve o .env de desenvolvimento com as chaves RS256 de keys/*.b64.
// Uso: node scripts/write-dev-env.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const privateKey = readFileSync(join(root, 'keys', 'jwt_private.b64'), 'utf8').trim();
const publicKey = readFileSync(join(root, 'keys', 'jwt_public.b64'), 'utf8').trim();

const content = `# .env de DESENVOLVIMENTO local. Gerado por scripts/write-dev-env.mjs.
# Para producao, configure estas variaveis no painel da Vercel (Settings > Environment Variables).

# --- Banco (Neon em producao, Postgres local em dev) ---
DATABASE_URL="postgresql://filitech:filitech_dev@localhost:5433/filitech_erp"
DIRECT_URL="postgresql://filitech:filitech_dev@localhost:5433/filitech_erp"

# --- Auth RS256 (base64 das chaves em keys/) ---
# Serverless nao tem filesystem: em dev o .env carrega o base64; na Vercel as
# chaves vao direto no painel.
JWT_PRIVATE_KEY="${privateKey}"
JWT_PUBLIC_KEY="${publicKey}"

# --- Site ---
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# --- Pagamento (Cap. 2.7 / 20.4) ---
# Vazio = sem provedor. O checkout de plano pago responde 503 com orientacao,
# em vez de liberar acesso sem pagamento.
BILLING_GATEWAY=""
MERCADO_PAGO_ACCESS_TOKEN=""
MERCADO_PAGO_WEBHOOK_SECRET=""
ASAAS_API_KEY=""
ASAAS_WEBHOOK_SECRET=""

# --- Cron (Cap. 2.7.4) ---
CRON_SECRET="dev-cron-secret-nao-usar-em-producao"

# --- E-mail (Cap. 14.3) ---
RESEND_API_KEY=""
EMAIL_FROM="Filitech ERP <nao-responda@localhost>"

# --- iFood (Cap. 11.1) ---
IFOOD_WEBHOOK_SECRET=""

# --- Cache / Storage / Server ---
REDIS_URL="redis://localhost:6379"
R2_ACCOUNT_ID=""
R2_ACCESS_KEY_ID=""
R2_SECRET_ACCESS_KEY=""
R2_BUCKET="filitech-assets"
NODE_ENV="development"
PORT="3001"
`;

writeFileSync(join(root, '.env'), content, 'utf8');
console.log('.env reescrito com as chaves de keys/*.b64');