'use client';
// src/app/(marketing)/_components/pricing-calculator-section.tsx — Cap. 2.3
//
// Calculadora à la carte.
//
// Gap corrigido: os preços aqui vinham de `BASE_PLANS`/`ADDON_MODULES`
// hardcoded no próprio componente — uma quarta tabela de preços, já divergida do
// banco. O que o cliente via na landing podia não ser o que o checkout cobra.
// Agora tudo vem de `/api/billing/catalog` (banco).

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { fetchCatalogClient, type Catalog } from '@/lib/catalog';

function AnimatedCurrency({ value }: { value: number }) {
  const motionValue = useMotionValue(value);
  const rounded = useTransform(motionValue, (latest) =>
    `R$ ${latest.toFixed(2).replace('.', ',')}`,
  );

  useEffect(() => {
    const controls = animate(motionValue, value, {
      duration: 0.5,
      ease: [0.22, 1, 0.36, 1],
    });
    return () => controls.stop();
  }, [motionValue, value]);

  return <motion.span>{rounded}</motion.span>;
}

export function PricingCalculatorSection() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [planCode, setPlanCode] = useState<string | null>(null);
  const [activeModules, setActiveModules] = useState<Set<string>>(new Set());
  const [niche, setNiche] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchCatalogClient().then((data) => {
      if (cancelled) return;
      setCatalog(data);
      setPlanCode(data.plans.find((p) => p.code === 'BASIC')?.code ?? data.plans[0]?.code ?? null);

      // Deep link: /?nicho=ADEGA pré-seleciona os módulos daquele negócio.
      const params = new URLSearchParams(window.location.search);
      const fromUrl = params.get('nicho');
      if (fromUrl) setNiche(fromUrl);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // Nicho escolhido pré-seleciona os módulos que aquele negócio precisa.
  useEffect(() => {
    if (!catalog || !niche) return;

    void (async () => {
      try {
        const res = await fetch(`/api/niches?code=${encodeURIComponent(niche)}`);
        const json = await res.json();
        const suggested: string[] = json?.data?.niches?.[0]?.suggestedModules ?? [];
        const plan = catalog.plans.find((p) => p.code === planCode);
        const planIncluded = new Set(plan?.includedModules ?? []);
        setActiveModules(new Set(suggested.filter((code) => !planIncluded.has(code))));
      } catch {
        setActiveModules(new Set());
      }
    })();
  }, [catalog, niche, planCode]);

  const plan = useMemo(
    () => catalog?.plans.find((p) => p.code === planCode) ?? catalog?.plans[0] ?? null,
    [catalog, planCode],
  );

  const totalMrr = useMemo(() => {
    if (!catalog || !plan) return 0;
    const addons = catalog.modules
      .filter((m) => activeModules.has(m.code) && !plan.includedModules.includes(m.code))
      .reduce((sum, m) => sum + m.monthlyPrice, 0);
    return Math.round((plan.basePrice + addons) * 100) / 100;
  }, [catalog, plan, activeModules]);

  if (!catalog || !plan) {
    return (
      <section id="calculadora" className="grid min-h-[40vh] place-items-center py-32">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </section>
    );
  }

  function toggleModule(code: string) {
    setActiveModules((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  }

  const checkoutHref = `/checkout?plan=${plan.code}&mods=${[...activeModules].join(',')}&nicho=${niche ?? ''}`;

  return (
    <section id="calculadora" className="bg-zinc-950/60 py-32 px-10 lg:px-24">
      <div className="mx-auto max-w-7xl">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-400">
          Preço transparente
        </p>
        <h2 className="mt-2 text-4xl font-bold tracking-tight">Monte o plano do seu negócio</h2>
        <p className="mt-4 max-w-2xl text-zinc-400">
          Pague apenas pelos módulos que o seu nicho realmente usa. O valor abaixo é
          exatamente o que o checkout cobra — nada de &quot;consulte&quot;.
        </p>

        <div className="mt-14 grid gap-10 lg:grid-cols-[1fr_400px]">
          <div className="lg:col-span-2">
            <div className="flex flex-wrap gap-4">
              {catalog.plans.map((option) => (
                <button
                  key={option.code}
                  type="button"
                  onClick={() => setPlanCode(option.code)}
                  className={`min-w-[200px] flex-1 rounded-2xl border p-6 text-left transition-all ${
                    plan.code === option.code
                      ? 'border-indigo-500 bg-indigo-500/10 shadow-[0_0_30px_rgba(99,102,241,0.3)]'
                      : 'border-zinc-800 hover:border-zinc-600'
                  }`}
                >
                  <h3 className="text-xl font-semibold">{option.label}</h3>
                  <p className="mt-1 text-sm text-zinc-400">
                    {option.includedModules.join(' · ')}
                  </p>
                  <p className="mt-4 text-2xl font-bold">
                    R$ {option.basePrice.toFixed(2).replace('.', ',')}
                    <span className="text-sm font-normal text-zinc-500">/mês</span>
                  </p>
                </button>
              ))}
            </div>

            <div className="mt-8 space-y-3">
              {catalog.modules
                .filter((m) => !plan.includedModules.includes(m.code))
                .map((moduleOption) => {
                  const isActive = activeModules.has(moduleOption.code);
                  return (
                    <motion.button
                      key={moduleOption.code}
                      type="button"
                      onClick={() => toggleModule(moduleOption.code)}
                      whileTap={{ scale: 0.99 }}
                      className={`w-full flex items-center justify-between gap-4 rounded-xl border p-4 text-left transition-colors ${
                        isActive
                          ? 'border-indigo-500/60 bg-indigo-500/5'
                          : 'border-zinc-800 hover:border-zinc-700'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="font-medium">{moduleOption.label}</p>
                        <p className="mt-0.5 text-xs text-zinc-500">
                          {moduleOption.description}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-3">
                        <span className="text-sm text-zinc-400">
                          +R$ {moduleOption.monthlyPrice.toFixed(2).replace('.', ',')}
                        </span>
                        <span
                          className={`h-6 w-11 rounded-full p-1 transition-colors ${
                            isActive ? 'bg-indigo-500' : 'bg-zinc-700'
                          }`}
                          aria-hidden
                        >
                          <motion.span
                            className="block h-4 w-4 rounded-full bg-white"
                            animate={{ x: isActive ? 20 : 0 }}
                            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                          />
                        </span>
                      </div>
                    </motion.button>
                  );
                })}
            </div>
          </div>

          <div className="h-fit sticky top-24 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 backdrop-blur-md">
            <p className="text-sm text-zinc-400">Sua assinatura mensal estimada</p>
            <p className="my-6 text-5xl font-bold">
              <AnimatedCurrency value={totalMrr} />
            </p>

            <ul className="space-y-2 text-sm text-zinc-400">
              <li className="flex justify-between">
                <span>Plano {plan.label}</span>
                <span>R$ {plan.basePrice.toFixed(2).replace('.', ',')}</span>
              </li>
              {[...activeModules]
                .filter((code) => !plan.includedModules.includes(code))
                .map((code) => {
                  const mod = catalog.modules.find((m) => m.code === code);
                  if (!mod) return null;
                  return (
                    <li key={code} className="flex justify-between">
                      <span className="truncate pr-2">{mod.label}</span>
                      <span>R$ {mod.monthlyPrice.toFixed(2).replace('.', ',')}</span>
                    </li>
                  );
                })}
            </ul>

            <Link
              href={checkoutHref}
              className="mt-8 block w-full rounded-xl bg-indigo-600 py-4 text-center font-semibold shadow-[0_0_30px_rgba(99,102,241,0.4)] transition hover:bg-indigo-500"
            >
              {totalMrr === 0 ? 'Começar no plano grátis' : 'Assinar agora'}
            </Link>

            <p className="mt-4 text-center text-xs text-zinc-600">
              Sem fidelidade. Cancele quando quiser.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}