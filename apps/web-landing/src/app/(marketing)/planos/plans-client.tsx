'use client';
// src/app/(marketing)/planos/plans-client.tsx — vitrine de planos interativa:
// cards de plano, combos com desconto, montador à la carte, limites do Free.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { brl } from '../../../lib/api';
import {
  type Catalog,
  type CatalogModule,
} from '../../../lib/catalog';
import { FaqSection } from '../_components/faq-section';

const PLAN_BLURB: Record<string, string> = {
  FREE: 'Para testar a operação real sem cartão e sem prazo.',
  BASIC: 'O lojista solo que precisa de caixa, estoque e financeiro no dia a dia.',
  PRO: 'Operação completa com CRM, crediário, fidelidade e relatórios de gestão.',
};

const PLAN_HIGHLIGHT = 'PRO';

function moduleLabels(catalog: Catalog, codes: string[]): string[] {
  return codes.map(
    (code) => catalog.modules.find((m) => m.code === code)?.label ?? code,
  );
}

function Check({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="m3.5 8.5 3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PlansPageClient({ catalog }: { catalog: Catalog }) {
  const paidModules = useMemo(
    () => catalog.modules.filter((m) => m.monthlyPrice > 0),
    [catalog.modules],
  );

  // Montador à la carte
  const [basePlan, setBasePlan] = useState('BASIC');
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const builderPlan =
    catalog.plans.find((p) => p.code === basePlan) ?? catalog.plans[1];
  const builderTotal = useMemo(() => {
    const addons = paidModules
      .filter((m) => picked.has(m.code))
      .reduce((sum, m) => sum + m.monthlyPrice, 0);
    return Math.round((builderPlan.basePrice + addons) * 100) / 100;
  }, [paidModules, picked, builderPlan]);

  const toggle = (code: string) =>
    setPicked((prev) => {
      const nextSet = new Set(prev);
      if (nextSet.has(code)) nextSet.delete(code);
      else nextSet.add(code);
      return nextSet;
    });

  const checkoutHref = (planCode: string, mods: string[] = []) => {
    const params = new URLSearchParams({ plan: planCode, cycle: 'MONTHLY' });
    if (mods.length > 0) params.set('mods', mods.join(','));
    return `/checkout?${params.toString()}`;
  };

  return (
    <main className="bg-[#05060A] px-5 pb-24 pt-28 text-zinc-100 lg:px-8">
      <div className="mx-auto max-w-7xl">
        {/* Cabeçalho */}
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-400">
            Preços transparentes
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-6xl">
            Planos que cabem{' '}
            <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
              no seu bolso
            </span>
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-zinc-400">
            Base + módulos à la carte. Sem taxa de setup, sem taxa por venda, sem
            fidelidade — o valor que você vê aqui é exatamente o que o checkout
            cobra e o que aparece itemizado nas suas faturas.
          </p>
        </div>

        {/* ── Cards de plano ── */}
        <section aria-label="Planos" className="mt-14 grid gap-5 lg:grid-cols-3">
          {catalog.plans.map((plan, i) => {
            const isFree = plan.code === 'FREE';
            const highlighted = plan.code === PLAN_HIGHLIGHT;
            return (
              <motion.article
                key={plan.code}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className={`relative flex flex-col rounded-2xl border p-7 backdrop-blur-sm ${
                  highlighted
                    ? 'border-indigo-500/60 bg-indigo-500/[0.07] shadow-[0_0_50px_rgba(99,102,241,0.18)]'
                    : 'border-white/10 bg-zinc-900/40'
                }`}
              >
                {highlighted && (
                  <span className="absolute -top-3 left-6 rounded-full bg-indigo-500 px-3 py-1 text-xs font-semibold text-white">
                    Mais popular
                  </span>
                )}
                <h2 className="text-lg font-semibold text-zinc-100">
                  {isFree ? 'Tier Free' : `Plano ${plan.label}`}
                </h2>
                <p className="mt-1.5 min-h-[40px] text-sm text-zinc-400">
                  {PLAN_BLURB[plan.code] ?? ''}
                </p>
                <p className="mt-5 text-4xl font-bold">
                  {brl(plan.basePrice)}
                  <span className="text-sm font-normal text-zinc-500">/mês</span>
                </p>
                {isFree && (
                  <p className="mt-1 text-xs text-emerald-400">
                    Para sempre · sem cartão de crédito
                  </p>
                )}

                <ul className="mt-6 flex-1 space-y-2.5 text-sm text-zinc-300">
                  {moduleLabels(catalog, plan.includedModules).map((label) => (
                    <li key={label} className="flex items-center gap-2.5">
                      <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-500/15 text-emerald-400">
                        <Check />
                      </span>
                      {label}
                    </li>
                  ))}
                  <li className="flex items-center gap-2.5 pt-2 text-zinc-400">
                    <span className="grid h-5 w-5 place-items-center rounded-full bg-white/5 text-zinc-500">
                      <Check />
                    </span>
                    Suporte {isFree ? 'FAQ e comunidade' : 'prioritário'}
                  </li>
                  <li className="flex items-center gap-2.5 text-zinc-400">
                    <span className="grid h-5 w-5 place-items-center rounded-full bg-white/5 text-zinc-500">
                      <Check />
                    </span>
                    PDV offline-first incluído
                  </li>
                </ul>

                <Link
                  href={
                    isFree
                      ? '/cadastro?plan=FREE'
                      : checkoutHref(plan.code)
                  }
                  className={`mt-7 rounded-xl py-3.5 text-center font-medium transition ${
                    highlighted
                      ? 'bg-indigo-500 text-white hover:bg-indigo-400'
                      : isFree
                        ? 'border border-white/15 text-zinc-100 hover:bg-white/5'
                        : 'bg-white/10 text-white hover:bg-white/15'
                  }`}
                >
                  {isFree ? 'Começar grátis' : `Contratar ${plan.label}`}
                </Link>
              </motion.article>
            );
          })}
        </section>

        {/* ── Combos por nicho (Cap. 2.5) ── */}
        <section aria-label="Combos" className="mt-20">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-400">
                Combos por nicho
              </p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight">
                Pacotes prontos com desconto
              </h2>
              <p className="mt-3 max-w-2xl text-zinc-400">
                Montamos os combos a partir do que cada nicho realmente usa — o
                desconto é sobre o preço à la carte, sempre mostrado ao lado.
              </p>
            </div>
          </div>

          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {catalog.combos.map((combo) => (
              <motion.div
                key={combo.code}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.45 }}
                className="card-site flex flex-col p-6"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-400">
                      −{combo.discountPct}%
                    </span>
                    <p className="mt-3 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                      {combo.niche}
                    </p>
                    <h3 className="mt-1 font-semibold text-zinc-100">
                      {combo.label}
                    </h3>
                  </div>
                </div>

                <ul className="mt-4 flex-1 space-y-1.5 text-sm text-zinc-400">
                  <li className="text-zinc-300">
                    Plano {combo.basePlanLabel} (base)
                  </li>
                  {combo.labels.map((label) => (
                    <li key={label} className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-indigo-400" />
                      {label}
                    </li>
                  ))}
                </ul>

                <div className="mt-5 flex items-end justify-between border-t border-white/5 pt-4">
                  <div>
                    <p className="text-xs text-zinc-500 line-through">
                      {brl(combo.fullPrice)}
                    </p>
                    <p className="text-2xl font-bold text-zinc-100">
                      {brl(combo.price)}
                      <span className="text-sm font-normal text-zinc-500">/mês</span>
                    </p>
                  </div>
                  <p className="text-xs font-medium text-emerald-400">
                    economiza {brl(combo.savings)}/mês
                  </p>
                </div>

                <Link
                  href={checkoutHref(combo.basePlan, combo.includes)}
                  className="mt-5 rounded-xl border border-indigo-500/40 bg-indigo-500/10 py-3 text-center text-sm font-medium text-indigo-200 transition hover:bg-indigo-500/20"
                >
                  Contratar combo
                </Link>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ── Montador à la carte ── */}
        <section aria-label="Montador de plano" className="mt-20">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-400">
            À la carte
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight">
            Monte seu plano módulo a módulo
          </h2>
          <p className="mt-3 max-w-2xl text-zinc-400">
            Escolha a base e ligue só o que precisa. Tudo é prorrogável e
            cancelável pelo painel — com o evento registrado na aba Faturas.
          </p>

          <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
            <div>
              <div className="flex flex-wrap gap-3">
                {catalog.plans
                  .filter((p) => p.code !== 'FREE')
                  .map((plan) => (
                    <button
                      key={plan.code}
                      type="button"
                      onClick={() => setBasePlan(plan.code)}
                      className={`rounded-xl border px-5 py-3 text-sm transition ${
                        basePlan === plan.code
                          ? 'border-indigo-500 bg-indigo-500/10 text-white'
                          : 'border-white/10 bg-zinc-900/40 text-zinc-400 hover:border-white/25'
                      }`}
                    >
                      {plan.label} · {brl(plan.basePrice)}
                    </button>
                  ))}
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {paidModules.map((mod: CatalogModule) => {
                  const isPicked = picked.has(mod.code);
                  const includedInPlan = builderPlan.includedModules.includes(mod.code);
                  return (
                    <button
                      key={mod.code}
                      type="button"
                      disabled={includedInPlan}
                      onClick={() => toggle(mod.code)}
                      className={`rounded-xl border p-4 text-left transition ${
                        includedInPlan
                          ? 'border-emerald-500/30 bg-emerald-500/[0.06] opacity-70'
                          : isPicked
                            ? 'border-indigo-500/60 bg-indigo-500/[0.08]'
                            : 'border-white/10 bg-zinc-900/40 hover:border-white/25'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-zinc-100">
                            {mod.label}
                          </p>
                          <p className="mt-1 text-xs text-zinc-500">
                            {mod.description}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-lg px-2 py-1 text-xs font-semibold ${
                            includedInPlan
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : isPicked
                                ? 'bg-indigo-500 text-white'
                                : 'bg-white/5 text-zinc-300'
                          }`}
                        >
                          {includedInPlan
                            ? 'incluso'
                            : `+${brl(mod.monthlyPrice)}`}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Resumo do montador */}
            <div className="card-site h-fit p-6 lg:sticky lg:top-24">
              <p className="text-sm text-zinc-400">Seu plano personalizado</p>
              <p className="mt-2 text-4xl font-bold">{brl(builderTotal)}</p>
              <p className="text-sm text-zinc-500">por mês, cobrança recorrente</p>

              <div className="mt-5 space-y-1.5 border-t border-white/5 pt-4 text-sm">
                <p className="text-zinc-300">
                  {builderPlan.label} · {brl(builderPlan.basePrice)}
                </p>
                {paidModules
                  .filter((m) => picked.has(m.code))
                  .map((m) => (
                    <p key={m.code} className="text-zinc-400">
                      {m.label} · {brl(m.monthlyPrice)}
                    </p>
                  ))}
                {picked.size === 0 && (
                  <p className="text-zinc-500">Nenhum módulo adicional ainda</p>
                )}
              </div>

              <Link
                href={checkoutHref(basePlan, Array.from(picked))}
                className="mt-6 block rounded-xl bg-indigo-500 py-3.5 text-center font-medium text-white transition hover:bg-indigo-400"
              >
                Ir para o checkout
              </Link>
              <p className="mt-3 text-center text-xs text-zinc-500">
                Você confirma o breakdown completo antes de qualquer cobrança.
              </p>
            </div>
          </div>
        </section>

        {/* ── Limites do Tier Free (Cap. 2.4) — transparência ── */}
        <section aria-label="Limites do Tier Free" className="mt-20">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-400">
            Tier Free — travas por volume
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight">
            O que o grátis inclui (e por quê)
          </h2>
          <p className="mt-3 max-w-2xl text-zinc-400">
            Limites dimensionados por volume de operação, nunca por tempo de
            teste. Cada trava tem um motivo explicado — porque esconder limite é
            a forma mais rápida de queimar confiança.
          </p>

          <div className="mt-8 overflow-hidden rounded-2xl border border-white/10">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-900/70 text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-5 py-3.5 font-medium">Recurso</th>
                  <th className="px-5 py-3.5 font-medium">Limite Free</th>
                  <th className="hidden px-5 py-3.5 font-medium sm:table-cell">
                    Por que esse limite
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {catalog.freeLimits.map((limit) => (
                  <tr key={limit.key} className="bg-zinc-950/40">
                    <td className="px-5 py-4 font-medium text-zinc-200">
                      {limit.label}
                    </td>
                    <td className="px-5 py-4">
                      <span className="rounded-md bg-indigo-500/10 px-2 py-1 text-xs font-semibold text-indigo-300">
                        {limit.limit === null
                          ? limit.unit
                          : limit.limit === 0
                            ? limit.unit
                            : `${limit.limit.toLocaleString('pt-BR')} ${limit.unit}`}
                      </span>
                    </td>
                    <td className="hidden px-5 py-4 text-zinc-400 sm:table-cell">
                      {limit.rationale}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Chamada de transparência ── */}
        <section className="card-site mt-16 flex flex-col items-center gap-4 p-8 text-center sm:flex-row sm:justify-between sm:text-left">
          <div>
            <h2 className="text-xl font-semibold">
              Preço final, sempre visível
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              Nenhuma taxa escondida: o breakdown do checkout é o mesmo que vira
              fatura no seu painel. Sem fidelidade — cancelamento em 1 clique.
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/cadastro?plan=FREE"
              className="rounded-xl bg-indigo-500 px-6 py-3 font-medium text-white transition hover:bg-indigo-400"
            >
              Começar grátis
            </Link>
            <Link
              href="/#calculadora"
              className="rounded-xl border border-white/15 px-6 py-3 font-medium text-zinc-200 transition hover:bg-white/5"
            >
              Calcular meu preço
            </Link>
          </div>
        </section>
      </div>

      <FaqSection />
    </main>
  );
}
