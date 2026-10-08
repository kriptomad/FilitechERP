'use client';
// src/app/(marketing)/_components/final-cta-section.tsx — convite final

import Link from 'next/link';
import { motion } from 'framer-motion';

export function FinalCtaSection() {
  return (
    <section className="relative px-5 py-24 lg:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_60%,rgba(99,102,241,0.18),transparent_65%)]" />
      <motion.div
        initial={{ opacity: 0, y: 32 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative mx-auto max-w-4xl rounded-3xl border border-indigo-500/25 bg-gradient-to-b from-indigo-500/10 to-transparent px-6 py-16 text-center backdrop-blur-sm sm:px-16"
      >
        <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">
          Comece hoje.{' '}
          <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
            Grátis de verdade.
          </span>
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-zinc-400">
          Tier Free sem cartão e sem prazo: 100 vendas por mês, 200 SKUs e o
          PDV offline completo. Quando crescer, os módulos entram por um clique
          — com o preço já visível antes de você confirmar.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/cadastro"
            className="glow-indigo w-full rounded-xl bg-indigo-500 px-7 py-3.5 font-medium text-white transition hover:bg-indigo-400 sm:w-auto"
          >
            Criar minha conta grátis
          </Link>
          <Link
            href="/planos"
            className="w-full rounded-xl border border-white/15 px-7 py-3.5 font-medium text-zinc-200 transition hover:bg-white/5 sm:w-auto"
          >
            Ver planos e combos
          </Link>
        </div>
        <p className="mt-6 text-xs text-zinc-500">
          Sem cartão de crédito · Cancelamento em 1 clique · Dados exportáveis a
          qualquer momento
        </p>
      </motion.div>
    </section>
  );
}
