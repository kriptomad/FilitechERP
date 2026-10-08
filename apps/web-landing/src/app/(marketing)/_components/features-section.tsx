'use client';
// src/app/(marketing)/_components/features-section.tsx
// Explica "toda a ideia" do Filitech ERP: oito pilares da operação.

import { motion } from 'framer-motion';

const reveal = {
  hidden: { opacity: 0, y: 28 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.07, duration: 0.55, ease: [0.22, 1, 0.36, 1] },
  }),
};

type Icon = (props: { className?: string }) => JSX.Element;

const Wallet: Icon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
    <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18a1 1 0 0 1 1 1v1.5" strokeLinecap="round" />
    <rect x="3" y="7.5" width="18" height="12" rx="2.5" />
    <circle cx="16.5" cy="13.5" r="1.4" fill="currentColor" stroke="none" />
  </svg>
);

const Boxes: Icon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
    <path d="M12 3 3.5 7.2v9.6L12 21l8.5-4.2V7.2L12 3Z" strokeLinejoin="round" />
    <path d="M3.5 7.2 12 11.5l8.5-4.3M12 11.5V21" strokeLinecap="round" />
  </svg>
);

const Register: Icon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
    <rect x="4" y="3.5" width="16" height="13" rx="2" />
    <path d="M7 7h10M7 10.5h5" strokeLinecap="round" />
    <path d="M7.5 20.5h9M9.5 16.5v4M14.5 16.5v4" strokeLinecap="round" />
  </svg>
);

const Receipt: Icon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
    <path d="M6 3h12v18l-3-1.7-3 1.7-3-1.7L6 21V3Z" strokeLinejoin="round" />
    <path d="M9 8h6M9 12h6" strokeLinecap="round" />
  </svg>
);

const Heart: Icon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
    <path d="M12 20s-7.5-4.6-7.5-9.6A4.4 4.4 0 0 1 12 7.6a4.4 4.4 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20Z" strokeLinejoin="round" />
  </svg>
);

const Shield: Icon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
    <path d="M12 3 5 6v5.5c0 4.4 3 7.8 7 9.5 4-1.7 7-5.1 7-9.5V6l-7-3Z" strokeLinejoin="round" />
    <path d="m9 12 2.2 2.2L15.5 10" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const Building: Icon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
    <rect x="4" y="4" width="7" height="16" rx="1" />
    <rect x="13" y="9" width="7" height="11" rx="1" />
    <path d="M6.5 7.5h2M6.5 11h2M6.5 14.5h2M15.5 12.5h2M15.5 16h2" strokeLinecap="round" />
  </svg>
);

const Chart: Icon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
    <path d="M4 20V4" strokeLinecap="round" />
    <path d="M4 20h16" strokeLinecap="round" />
    <path d="m7.5 15 3.5-4 3 2.5L19 7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const FEATURES: {
  icon: Icon;
  title: string;
  text: string;
  tag: string;
}[] = [
  {
    icon: Wallet,
    tag: 'Financeiro',
    title: 'Caixa que fecha certinho',
    text: 'Contas a pagar e a receber, fluxo de caixa projetado, abertura e fechamento de caixa com conferência de gaveta — sem surpresa no fim do expediente.',
  },
  {
    icon: Boxes,
    tag: 'Estoque',
    title: 'Do lote à curva ABC',
    text: 'Rastreio por lote, validade e número de série, custo médio/PEPS, entradas por NF e sugestão de compra calculada sobre giro real.',
  },
  {
    icon: Register,
    tag: 'PDV',
    title: 'Vende sem internet',
    text: 'Frente de caixa offline-first: IndexedDB local, fila de sincronização por Background Sync e idempotência por Idempotency-Key. A internet cai, a fila não.',
  },
  {
    icon: Receipt,
    tag: 'Fiscal',
    title: 'NFC-e e NF-e com contingência',
    text: 'Emissão com autorização da SEFAZ, reprocessamento idempotente e queda automática para modo contingência quando o governo responde mal.',
  },
  {
    icon: Heart,
    tag: 'CRM',
    title: 'Cliente, crediário e fidelidade',
    text: 'Conta-corrente de cliente, limite de crédito, histórico de compras, orçamentos com validade e aprovação remota por WhatsApp.',
  },
  {
    icon: Shield,
    tag: 'Segurança',
    title: 'Isolamento e papéis',
    text: 'Multi-tenant estrutural com prisma-scoping, Argon2id nas senhas, JWT RS256 e permissões granulares por papel (OWNER, MANAGER, CASHIER, TECH).',
  },
  {
    icon: Building,
    tag: 'Multi-filial',
    title: 'Matriz, filiais e balanço consolidado',
    text: 'Hierarquia de lojas com estoque e caixa próprios, dashboard consolidado da rede e migração de saldo entre filiais com trilha de auditoria.',
  },
  {
    icon: Chart,
    tag: 'Gestão',
    title: 'Relatórios que decidem',
    text: 'Margem bruta, CMV, curva ABC, giro de SKU, ruptura de estoque e sugestão de reposição — números que o dono usa na segunda de manhã.',
  },
];

export function FeaturesSection() {
  return (
    <section id="recursos" className="relative px-5 py-24 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-400">
            A ideia inteira em um sistema
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">
            Um ERP completo —{' '}
            <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
              não uma coleção de apps
            </span>
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-zinc-400">
            O Filitech substitui planilhas, cadernos de crédito e cinco
            softwares desconexos por uma única fonte de verdade: venda, estoque,
            caixa, fiscal e cliente se atualizam no mesmo evento — no mesmo
            segundo, mesmo com a internet fora.
          </p>
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature, i) => (
            <motion.article
              key={feature.title}
              custom={i}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-60px' }}
              variants={reveal}
              className="card-site group p-6 transition hover:border-indigo-500/40 hover:bg-zinc-900/60"
            >
              <div className="flex items-center justify-between">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-500/10 text-indigo-400 transition group-hover:bg-indigo-500/20">
                  <feature.icon className="h-6 w-6" />
                </span>
                <span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                  {feature.tag}
                </span>
              </div>
              <h3 className="mt-5 text-base font-semibold text-zinc-100">
                {feature.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                {feature.text}
              </p>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
