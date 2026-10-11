// src/server/env.ts — leitura validada das variáveis de ambiente.
//
// Por que centralizar: a Vercel injeta env no runtime das functions. Um
// `process.env.X!` espalhado pelo código quebra em silêncio (undefined) e só
// falha no meio de uma requisição. Aqui a falha é explícita e na inicialização.

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(
      `[env] Variável obrigatória ausente: ${name}. Configure no painel da Vercel ` +
        '(Settings > Environment Variables) ou no .env local.',
    );
  }
  return value;
}

function optional(name: string, fallback = ''): string {
  const value = process.env[name];
  return value && value.trim() !== '' ? value : fallback;
}

export const env = {
  get databaseUrl(): string {
    return required('DATABASE_URL');
  },
  get jwtPrivateKey(): string {
    return required('JWT_PRIVATE_KEY');
  },
  get jwtPublicKey(): string {
    return required('JWT_PUBLIC_KEY');
  },
  get appUrl(): string {
    return optional('NEXT_PUBLIC_APP_URL', 'http://localhost:3000');
  },
  /** Provedor de pagamento ativo: `mercadopago` | `asaas`. Vazio = sem gateway. */
  get billingGateway(): string {
    return optional('BILLING_GATEWAY');
  },
  get mercadoPagoAccessToken(): string {
    return optional('MERCADO_PAGO_ACCESS_TOKEN');
  },
  get asaasApiKey(): string {
    return optional('ASAAS_API_KEY');
  },
  get asaasWebhookSecret(): string {
    return optional('ASAAS_WEBHOOK_SECRET');
  },
  get mercadoPagoWebhookSecret(): string {
    return optional('MERCADO_PAGO_WEBHOOK_SECRET');
  },
  get metaWebhookSecret(): string {
    return optional('META_WEBHOOK_SECRET');
  },
  get metaWebhookVerifyToken(): string {
    return optional('META_WEBHOOK_VERIFY_TOKEN');
  },
  get stripeSecretKey(): string {
    return optional('STRIPE_SECRET_KEY');
  },
  get stripeWebhookSecret(): string {
    return optional('STRIPE_WEBHOOK_SECRET');
  },
  get redisUrl(): string {
    return optional('REDIS_URL');
  },
  get resendApiKey(): string {
    return optional('RESEND_API_KEY');
  },
  get cronSecret(): string {
    return optional('CRON_SECRET');
  },
  get backupEncryptionKey(): string {
    return optional('BACKUP_ENCRYPTION_KEY');
  },
};

/** URL absoluto do site, usado em redirects e links de e-mail. */
export function absoluteUrl(path: string): string {
  return new URL(path, env.appUrl).toString();
}