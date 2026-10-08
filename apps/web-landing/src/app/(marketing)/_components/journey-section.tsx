'use client';
// src/app/(marketing)/_components/journey-section.tsx
// Cap. 1.2 — a jornada do cliente (Descoberta → Expansão) como stepper visual.

import { motion } from 'framer-motion';

const STEPS = [
  {
    phase: 'Fase 1',
    title: 'Descoberta',
    text: 'Você calcula o preço na vitrine, vê o limite do Tier Free por volume (nunca por tempo) e contrata em minutos — sem falar com vendedor.',
  },
  {
    phase: 'Fase 2',
    title: 'Onboarding',
    text: 'Cadastro da empresa, importação de produtos e clientes, mapeamento de tributos e treinamento da equipe em uma tarde.',
  },
  {
    phase: 'Fase 3',
    title: 'Operação diária',
    text: 'PDV, estoque, caixa e fiscal no mesmo fluxo. O sistema trabalha offline quando a conexão falha e sincroniza sozinho depois.',
  },
  {
    phase: 'Fase 4',
    title: 'Crescimento',
    text: 'Ativação de módulos à la carte quando a operação pede: WhatsApp, multi-filial, ficha técnica, SNGPC. Você paga só pelo que usa.',
  },
  {
    phase: 'Fase 5',
    title: 'Expansão',
    text: 'Nova loja, novo nicho, nova linha de negócio — a mesma plataforma, com billing proporcional e sem migração de dados.',
  },
];

export function JourneySection() {
  return (
    <section id="jornada" className="relative px-5 py-24 lg:px-8">
      {/* linha conectora de fundo */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-[55%] hidden h-px bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent lg:block"
      />
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-400">
            Jornada do cliente
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">
            Da primeira visita à quinta loja
          </h2>
          <p className="mt-4 text-lg text-zinc-400">
            A mesma plataforma acompanha o negócio em todas as fases — sem
            trocar de sistema no meio do caminho.
          </p>
        </div>

        <ol className="mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-5">
          {STEPS.map((step, i) => (
            <motion.li
              key={step.title}
              initial={{ opacity: 0, y: 32 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ delay: i * 0.1, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              className="relative"
            >
              <div className="card-site h-full p-5">
                <div className="flex items-center gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-indigo-500 text-sm font-bold text-white">
                    {i + 1}
                  </span>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-400">
                    {step.phase}
                  </span>
                </div>
                <h3 className="mt-4 text-lg font-semibold text-zinc-100">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                  {step.text}
                </p>
              </div>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}
