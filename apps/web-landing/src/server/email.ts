// src/server/email.ts — Cap. 20.8
// Envio de e-mail via Resend
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
}

export async function sendEmail(input: SendEmailInput): Promise<{ id: string }> {
  const { to, subject, html, text, from, replyTo } = input;

  const result = await resend.emails.send({
    from: from ?? process.env.EMAIL_FROM ?? 'noreply@filitecherp.com.br',
    to,
    subject,
    html,
    text,
    reply_to: replyTo ?? process.env.EMAIL_REPLY_TO,
  });

  if (result.error) {
    throw new Error(`Resend error: ${result.error.message}`);
  }

  return { id: result.data!.id };
}

/**
 * Envia e-mail de boas-vindas (onboarding)
 */
export async function sendWelcomeEmail(to: string, name: string, loginUrl: string): Promise<void> {
  await sendEmail({
    to,
    subject: 'Bem-vindo ao Filitech ERP!',
    html: `
      <div style="font-family: system-ui; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #4F46E5;">Bem-vindo, ${name}!</h1>
        <p>Sua conta no Filitech ERP foi criada com sucesso. Estamos felizes em ter você conosco.</p>
        <p><a href="${loginUrl}" style="background: #4F46E5; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block;">Acessar meu ERP</a></p>
        <hr style="margin: 24px 0; border-color: #E5E7EB;">
        <p style="font-size: 12px; color: #9CA3AF;">Se você não criou esta conta, ignore este e-mail.</p>
      </div>
    `,
  });
}

/**
 * Envia e-mail de reset de senha
 */
export async function sendPasswordResetEmail(to: string, name: string, resetUrl: string, expiresInMinutes: number): Promise<void> {
  await sendEmail({
    to,
    subject: 'Redefinição de senha - Filitech ERP',
    html: `
      <div style="font-family: system-ui; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #4F46E5;">Redefinição de senha</h1>
        <p>Olá, ${name}. Você solicitou a redefinição de sua senha.</p>
        <p><a href="${resetUrl}" style="background: #4F46E5; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block;">Redefinir minha senha</a></p>
        <p style="color: #6B7280; font-size: 14px;">Este link expira em ${expiresInMinutes} minutos. Se você não solicitou, ignore este e-mail.</p>
        <hr style="margin: 24px 0; border-color: #E5E7EB;">
        <p style="font-size: 12px; color: #9CA3AF;">Filitech ERP — Segurança em primeiro lugar.</p>
      </div>
    `,
  });
}

/**
 * Envia e-mail de confirmação de pagamento
 */
export async function sendPaymentConfirmationEmail(to: string, name: string, amount: number, planName: string): Promise<void> {
  await sendEmail({
    to,
    subject: 'Pagamento confirmado - Filitech ERP',
    html: `
      <div style="font-family: system-ui; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #10B981;">Pagamento confirmado!</h1>
        <p>Olá, ${name}. Seu pagamento de <strong>R$ ${amount.toFixed(2).replace('.', ',')}</strong> foi processado com sucesso.</p>
        <p>Seu plano <strong>${planName}</strong> está agora ativo.</p>
        <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/painel" style="background: #10B981; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block;">Acessar painel</a></p>
      </div>
    `,
  });
}

/**
 * Envia e-mail de falha de pagamento (dunning)
 */
export async function sendPaymentFailedEmail(to: string, name: string, amount: number, retryDate: Date, attempt: number): Promise<void> {
  await sendEmail({
    to,
    subject: 'Ação necessária: Pagamento não processado - Filitech ERP',
    html: `
      <div style="font-family: system-ui; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #EF4444;">Pagamento não processado</h1>
        <p>Olá, ${name}. Não conseguimos processar seu pagamento de <strong>R$ ${amount.toFixed(2).replace('.', ',')}</strong>.</p>
        <p>Tentativa ${attempt} de 4. Próxima tentativa em <strong>${retryDate.toLocaleDateString('pt-BR')}</strong>.</p>
        <p>Para evitar a suspensão da sua conta, <a href="${process.env.NEXT_PUBLIC_APP_URL}/configuracoes/cobranca" style="color: #4F46E5;">atualize seu cartão</a> ou entre em contato com o suporte.</p>
        <hr style="margin: 24px 0; border-color: #E5E7EB;">
        <p style="font-size: 12px; color: #9CA3AF;">Se já atualizou seu cartão, ignore este e-mail.</p>
      </div>
    `,
  });
}