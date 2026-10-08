'use client';
// src/app/(marketing)/_components/pricing-calculator-section.tsx — Cap. 2.3

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';

interface ModuleOption {
  code: string;
  label: string;
  monthlyPrice: number;
  description: string;
}

const BASE_PLANS = [
  {
    code: 'BASIC',
    label: 'Essencial',
    basePrice: 89.9,
    includedModules: ['pdv', 'estoque', 'financeiro'],
  },
  {
    code: 'PRO',
    label: 'Profissional',
    basePrice: 169.9,
    includedModules: ['pdv', 'estoque', 'financeiro', 'crm'],
  },
];

const ADDON_MODULES: ModuleOption[] = [
  {
    code: 'fiscal',
    label: 'Emissão Fiscal (NFC-e/NFe)',
    monthlyPrice: 49.9,
    description: 'Emissão ilimitada de documentos fiscais com contingência automática.',
  },
  {
    code: 'whatsapp',
    label: 'Integração WhatsApp',
    monthlyPrice: 39.9,
    description: 'Envio de orçamentos, cobranças e notificações de O.S. direto pelo WhatsApp.',
  },
  {
    code: 'multi-filial',
    label: 'Multi-Filial',
    monthlyPrice: 59.9,
    description: 'Dashboard consolidado para múltiplas lojas sob o mesmo CNPJ matriz.',
  },
  {
    code: 'work-order',
    label: 'Assistência Técnica (O.S.)',
    monthlyPrice: 69.9,
    description: 'Ordens de serviço, checklist, laudo fotográfico e controle de IMEI/Serial.',
  },
  {
    code: 'liquor-ledger',
    label: 'Adega — Conta-Corrente de Cascos',
    monthlyPrice: 29.9,
    description: 'Controle de vasilhames retornáveis por cliente.',
  },
  {
    code: 'recipe-bom',
    label: 'Ficha Técnica (Padaria/Confeitaria)',
    monthlyPrice: 44.9,
    description: 'Receitas, custo de produção e baixa automática de insumos.',
  },
  {
    code: 'pharmacy-sngpc',
    label: 'Farmácia — SNGPC/Controlados',
    monthlyPrice: 79.9,
    description: 'Escrituração eletrônica de controlados e retenção digital de receituário.',
  },
  // Cap. 12 — novos nichos
  {
    code: 'restaurant-pos',
    label: 'Restaurante (Comanda + KDS)',
    monthlyPrice: 74.9,
    description: 'Comanda eletrônica, tela de cozinha e integração iFood.',
  },
  {
    code: 'petshop',
    label: 'Petshop/Veterinária',
    monthlyPrice: 54.9,
    description: 'Prontuário do pet, vacinas e agendamento de serviços.',
  },
  {
    code: 'beauty-salon',
    label: 'Salão/Barbearia',
    monthlyPrice: 54.9,
    description: 'Agenda por profissional, comissionamento e pacotes de sessões.',
  },
  {
    code: 'automotive',
    label: 'Setor Automotivo',
    monthlyPrice: 64.9,
    description: 'Veículos, O.S. automotiva e gestão de peças.',
  },
];

/** Contador numérico animado (Cap. 2.3: useMotionValue + animate, sem reload). */
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
  }, [value, motionValue]);

  return <motion.span>{rounded}</motion.span>;
}

export function PricingCalculatorSection() {
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState(BASE_PLANS[0]);
  const [activeModules, setActiveModules] = useState<Set<string>>(new Set());

  const totalMrr = useMemo(() => {
    const addonsTotal = ADDON_MODULES.filter((m) => activeModules.has(m.code)).reduce(
      (sum, m) => sum + m.monthlyPrice,
      0
    );
    return selectedPlan.basePrice + addonsTotal;
  }, [selectedPlan, activeModules]);

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

  /**
   * Vai para /checkout com a configuração escolhida — a página de checkout
   * mostra o breakdown completo (transparência) antes de qualquer cobrança.
   */
  function handleCheckout() {
    const params = new URLSearchParams({ plan: selectedPlan.code });
    if (activeModules.size > 0) {
      params.set('mods', Array.from(activeModules).join(','));
    }
    params.set('cycle', 'MONTHLY');
    router.push(`/checkout?${params.toString()}`);
  }

  return (
    <section id="calculadora" className="border-y border-white/5 bg-zinc-950/60 px-5 py-24 lg:px-8">
      <div className="mx-auto max-w-7xl">
      <div className="max-w-2xl">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-400">
          Calculadora à la carte
        </p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">
          Monte o plano do seu negócio
        </h2>
        <p className="mt-4 text-lg text-zinc-400">
          Pague apenas pelos módulos que o seu nicho realmente usa. Sem contrato de fidelidade,
          sem letra miúda — o que você soma aqui é exatamente o que o checkout cobra.
        </p>
      </div>

      <div className="mt-12 grid gap-10 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {/* Planos base */}
          <div className="flex gap-4 mb-8">
            {BASE_PLANS.map((plan) => (
              <button
                key={plan.code}
                onClick={() => setSelectedPlan(plan)}
                className={`flex-1 rounded-2xl border p-6 text-left transition-all ${
                  selectedPlan.code === plan.code
                    ? 'border-indigo-500 bg-indigo-500/10 shadow-[0_0_30px_rgba(99,102,241,0.3)]'
                    : 'border-zinc-800 hover:border-zinc-600'
                }`}
              >
                <h3 className="text-xl font-semibold">{plan.label}</h3>
                <p className="text-zinc-400 text-sm mt-1">
                  PDV + Estoque + Financeiro{plan.code === 'PRO' ? ' + CRM' : ''}
                </p>
                <p className="mt-4 text-2xl font-bold">
                  R$ {plan.basePrice.toFixed(2).replace('.', ',')}
                  <span className="text-sm font-normal text-zinc-500">/mês</span>
                </p>
              </button>
            ))}
          </div>

          {/* Módulos add-on */}
          <div className="space-y-3">
            {ADDON_MODULES.map((moduleOption) => {
              const isActive = activeModules.has(moduleOption.code);
              return (
                <motion.button
                  key={moduleOption.code}
                  onClick={() => toggleModule(moduleOption.code)}
                  whileTap={{ scale: 0.98 }}
                  className={`w-full flex items-center justify-between rounded-xl border p-4 transition-colors ${
                    isActive
                      ? 'border-indigo-500/60 bg-indigo-500/5'
                      : 'border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  <div className="text-left">
                    <p className="font-medium">{moduleOption.label}</p>
                    <p className="text-xs text-zinc-500">{moduleOption.description}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-zinc-400">
                      +R$ {moduleOption.monthlyPrice.toFixed(2).replace('.', ',')}
                    </span>
                    <span
                      className={`h-6 w-11 rounded-full p-1 transition-colors ${
                        isActive ? 'bg-indigo-500' : 'bg-zinc-700'
                      }`}
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

        {/* Resumo sticky */}
        <div className="rounded-2xl border border-zinc-800 p-8 h-fit sticky top-10 bg-zinc-900/60 backdrop-blur-md">
          <p className="text-zinc-400 text-sm">Sua assinatura mensal estimada</p>
          <p className="text-5xl font-bold mt-2 mb-6">
            <AnimatedCurrency value={totalMrr} />
          </p>
          <div className="text-sm text-zinc-500 mb-6 space-y-1">
            <p>✓ Plano {selectedPlan.label}</p>
            <p>✓ {activeModules.size} módulo(s) adicional(is)</p>
            <p>✓ Tier Free disponível para testar</p>
          </div>
          <button
            onClick={handleCheckout}
            className="w-full rounded-xl bg-indigo-600 py-4 font-semibold shadow-[0_0_30px_rgba(99,102,241,0.4)]
                       hover:bg-indigo-500 transition-colors"
          >
            Assinar agora
          </button>
          <p className="mt-4 text-center text-xs text-zinc-500">
            Preço final visível antes da confirmação · sem taxa de setup
          </p>
          <a
            href="/planos"
            className="mt-3 block text-center text-sm text-indigo-400 hover:text-indigo-300"
          >
            Ver planos, combos e limites do Free →
          </a>
        </div>
      </div>
      </div>
    </section>
  );
}
