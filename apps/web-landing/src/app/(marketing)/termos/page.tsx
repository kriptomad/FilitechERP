// src/app/(marketing)/termos/page.tsx — Termos de uso (transparência/legal)
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Termos de uso',
  description: 'Termos de uso da plataforma Filitech ERP.',
};

const SECTIONS = [
  {
    title: '1. Objeto',
    text: 'Estes Termos regulam o uso da plataforma Filitech ERP — software de gestão multi-nicho fornecido como serviço (SaaS) — incluindo vitrine, painel de assinatura, aplicação operacional e PDV. Ao criar uma conta ou contratar um plano, você aceita estes Termos.',
  },
  {
    title: '2. Conta e acessos',
    text: 'Você é responsável pela veracidade dos dados cadastrais e pela guarda das credenciais. O Tier Free permite um usuário (papel OWNER); planos pagos podem incluir membros adicionais com papéis e permissões próprios (OWNER, MANAGER, CASHIER, TECH).',
  },
  {
    title: '3. Planos, preços e cobrança',
    text: 'Os preços exibidos na vitrine, na calculadora e no checkout são idênticos: valor base do plano somado aos módulos à la carte, sem taxa de setup. A cobrança é mensal e recorrente, com primeira cobrança na contratação e renovação a cada 30 dias. Todo evento que altera o valor mensal é registrado como fatura/evento de cobrança no painel.',
  },
  {
    title: '4. Fidelidade e cancelamento',
    text: 'Não há fidelidade nem multa de cancelamento. O cancelamento pode ser solicitado a qualquer momento e produz efeito ao final do período já pago. Módulos add-on podem ser desativados pelo painel, com efeito imediato na composição da cobrança seguinte.',
  },
  {
    title: '5. Tier Free',
    text: 'O Tier Free é concedido por volume de uso (vendas/mês, usuários, SKUs e armazenamento), sem prazo de expiração e sem exigência de cartão de crédito. Ultrapassar o limite exige evolução para plano pago, com o valor previamente visível.',
  },
  {
    title: '6. Uso aceitável',
    text: 'É proibido usar a plataforma para atividades ilícitas, envio de conteúdo fraudulentos, tentativas de violação de segurança ou exploração de falhas. Suspensão por inadimplência ou violação segue o processo descrito na Política de Privacidade.',
  },
  {
    title: '7. Disponibilidade e dados',
    text: 'O PDV opera offline-first: vendas realizadas sem conexão são sincronizadas quando a internet volta, sem duplicação. Backup automatizado é criptografado; a exportação total dos dados (CSV/XML) é sempre disponível ao cliente.',
  },
  {
    title: '8. Limitação de responsabilidade',
    text: 'A plataforma é fornecida no estado em que se encontra. Em nenhum caso a Filitech responderá por lucros cessantes ou danos indiretos decorrentes da indisponibilidade pontual do serviço, salvo descumprimento de obrigação expressa destes Termos.',
  },
  {
    title: '9. Alterações',
    text: 'Estes Termos podem ser atualizados, com aviso razoável por e-mail ou no painel para alterações relevantes. O uso continuado após a vigência das alterações constitui aceitação.',
  },
];

export default function TermsPage() {
  return (
    <main className="bg-[#05060A] px-5 pb-24 pt-28 text-zinc-100 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-400">
          Legal
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight">Termos de uso</h1>
        <p className="mt-3 text-sm text-zinc-500">
          Última atualização: {new Date().toLocaleDateString('pt-BR')} ·
          Documento de demonstração
        </p>

        <div className="mt-10 space-y-8">
          {SECTIONS.map((section) => (
            <section key={section.title}>
              <h2 className="text-lg font-semibold text-zinc-100">
                {section.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                {section.text}
              </p>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
