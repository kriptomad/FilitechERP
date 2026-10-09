'use client';
// src/app/(marketing)/_components/niche-showcase-section.tsx — Cap. 11 / 2.2
//
// Vitrine interativa de nichos.
//
// Gap corrigido: a seção era uma grade de 18 cards estáticos com apenas nome e
// cor. Clicar não fazia nada — não havia informação de functionality por nicho,
// catálogo inicial nem forma de "escolher meu nicho". Agora cada card abre um
// painel com as funcionalidades reais do nicho (lidas do banco), os módulos que
// ele sugere e o link direto para se cadastrar já naquele nicho.

import { useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import type { NicheSummary } from '@/lib/niches';

export function NicheShowcaseSection({ niches }: { niches: NicheSummary[] }) {
  const [selected, setSelected] = useState<string | null>(niches[0]?.code ?? null);

  const active = niches.find((n) => n.code === selected) ?? niches[0] ?? null;
  const hasDetail = active !== null && active.features.length > 0;

  return (
    <section id="nichos" className="relative py-32 px-10 lg:px-24">
      <div className="mx-auto max-w-7xl">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-400">
          Seis pilares, dezesseis Businesses
        </p>
        <h2 className="mt-2 max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
          Um sistema. Oitozehn negócios.
        </h2>
        <p className="mt-4 max-w-2xl text-zinc-400">
          Escolha o seu nicho e veja exatamente o que o ERP faz por ele — cada nicho
          carrega seu próprio catálogo inicial, para você não começar de uma tela
          em branco.
        </p>

        {/* Grade de nichos */}
        <div className="mt-14 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {niches.map((niche) => {
            const isActive = niche.code === selected;
            return (
              <button
                key={niche.code}
                type="button"
                onClick={() => setSelected(niche.code)}
                aria-pressed={isActive}
                className={`group relative rounded-2xl border p-5 text-left transition-all ${
                  isActive
                    ? 'bg-white/[0.04]'
                    : 'border-white/10 bg-zinc-900/30 hover:border-white/20 hover:bg-white/[0.02]'
                }`}
                style={
                  isActive
                    ? { borderColor: niche.colorHex, boxShadow: `0 0 40px ${niche.colorHex}33` }
                    : undefined
                }
              >
                <span
                  className="mb-3 block h-1 w-10 rounded-full"
                  style={{ backgroundColor: niche.colorHex }}
                />
                <h3
                  className="text-[15px] font-semibold leading-snug"
                  style={{ color: isActive ? niche.colorHex : undefined }}
                >
                  {niche.label}
                </h3>
                {niche.tagline && (
                  <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-zinc-500">
                    {niche.tagline}
                  </p>
                )}
              </button>
            );
          })}
        </div>

        {/* Detalhe do nicho selecionado */}
        <AnimatePresence mode="wait">
          {active && (
            <motion.div
              key={active.code}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="mt-10 grid gap-8 rounded-3xl border border-white/10 bg-zinc-900/40 p-8 lg:grid-cols-[1.1fr_1fr] lg:p-12"
              style={{ borderColor: `${active.colorHex}44` }}
            >
              <div>
                <div className="flex items-center gap-3">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: active.colorHex }}
                  />
                  <span
                    className="text-sm font-semibold uppercase tracking-[0.18em]"
                    style={{ color: active.colorHex }}
                  >
                    {active.label}
                  </span>
                </div>

                <h3 className="mt-4 text-3xl font-bold tracking-tight">
                  {active.tagline}
                </h3>

                {active.description && (
                  <p className="mt-4 leading-relaxed text-zinc-400">{active.description}</p>
                )}

                {active.suggestedModules.length > 0 && (
                  <div className="mt-6">
                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500">
                      Módulos sugeridos
                    </p>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {active.suggestedModules.map((moduleCode) => (
                        <span
                          key={moduleCode}
                          className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-zinc-300"
                        >
                          {moduleCode}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-8 flex flex-wrap gap-3">
                  <Link
                    href={`/cadastro?nicho=${active.code}`}
                    className="rounded-xl px-6 py-3 font-medium text-white transition hover:brightness-110"
                    style={{ backgroundColor: active.colorHex }}
                  >
                    Começar com {active.label}
                  </Link>
                  <Link
                    href="/planos"
                    className="rounded-xl border border-white/15 px-6 py-3 font-medium text-zinc-200 transition hover:bg-white/5"
                  >
                    Ver preços
                  </Link>
                </div>
              </div>

              {/* Funcionalidades específicas do nicho */}
              <div className="lg:border-l lg:border-white/10 lg:pl-10">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500">
                  O que o ERP faz por este nicho
                </p>

                {hasDetail ? (
                  <ul className="mt-4 space-y-3.5">
                    {active.features.map((feature) => (
                      <li key={feature.title} className="flex gap-3">
                        <span
                          className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: active.colorHex }}
                        />
                        <div>
                          <p className="text-sm font-medium text-zinc-200">{feature.title}</p>
                          <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
                            {feature.description}
                          </p>
                          {feature.chapterRef && (
                            <span className="mt-1 inline-block text-[10px] uppercase tracking-wider text-zinc-600">
                              Cap. {feature.chapterRef}
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-4 text-sm text-zinc-500">
                    Funcionalidades deste nicho em configuração. Entre em contato para
                    habilitar.
                  </p>
                )}

                {active.templateItems.length > 0 && (
                  <div className="mt-8">
                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500">
                      Catálogo inicial que você recebe
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {active.templateItems.slice(0, 8).map((item) => (
                        <span
                          key={item.name}
                          className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-zinc-400"
                        >
                          {item.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}