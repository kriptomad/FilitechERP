// src/app/(marketing)/privacidade/page.tsx — Política de privacidade / LGPD
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacidade e LGPD',
  description:
    'Como a Filitech trata dados pessoais — transparência, direitos do titular e segurança.',
};

const SECTIONS = [
  {
    title: '1. Controlador e dados tratados',
    text: 'A Filitech atua como controladora dos dados de cadastro (nome, e-mail, CNPJ, razão social) e como operadora dos dados comerciais do lojista (clientes, vendas, estoque), estes últimos inseridos pelo próprio cliente na sua base.',
  },
  {
    title: '2. Finalidade e base legal',
    text: 'Os dados são tratados para execução do contrato (prestar o serviço de gestão), cumprimento de obrigação legal (escrituração fiscal) e legítimo interesse (segurança, prevenção a fraude e melhoria do produto). Nenhum dado é vendido a terceiros.',
  },
  {
    title: '3. Segurança',
    text: 'Senhas armazenadas com Argon2id; sessões com JWT RS256; isolamento multi-tenant por escopo estrutural em cada consulta, com teste canário automatizado de vazamento-zero; backups completos criptografados (AES-256-GCM) e trilha de auditoria em operações críticas.',
  },
  {
    title: '4. Direitos do titular (LGPD)',
    text: 'Você pode solicitar acesso, correção, portabilidade, anonimização ou eliminação dos seus dados a qualquer momento. A exportação total (CSV/XML) está disponível de forma autônoma pelo sistema — sem depender de atendimento.',
  },
  {
    title: '5. Retenção',
    text: 'Dados são mantidos enquanto a conta estiver ativa e pelo prazo legal mínimo exigido pela legislação fiscal (obrigações acessórias). Após o encerramento, a eliminação é confirmada ao titular dentro do prazo contratual.',
  },
  {
    title: '6. Compartilhamento',
    text: 'Compartilhamos dados apenas com operadores essenciais à prestação do serviço (provedor de infraestrutura, gateway de pagamento e emissores fiscais), sempre sob contrato e limitados à finalidade. Eventuais transferências internacionais seguem cláusulas contratuais padrão.',
  },
  {
    title: '7. Cookies',
    text: 'O site usa apenas armazenamento local para manter a sessão autenticada (token) — sem cookies de rastreamento publicitário. O aplicativo operacional usa IndexedDB para o espelho offline do PDV, apagado ao sair da conta.',
  },
  {
    title: '8. Encarregado (DPO)',
    text: 'Solicitações relacionadas a dados pessoais: dpo@filitech.example — resposta em até 15 dias, conforme a LGPD (Lei 13.709/2018).',
  },
];

export default function PrivacyPage() {
  return (
    <main className="bg-[#05060A] px-5 pb-24 pt-28 text-zinc-100 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-400">
          Legal
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight">
          Privacidade e LGPD
        </h1>
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
