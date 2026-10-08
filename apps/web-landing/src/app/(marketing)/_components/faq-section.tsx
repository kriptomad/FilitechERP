'use client';
// src/app/(marketing)/_components/faq-section.tsx — transparência total:
// preços, fidelidade, offline, dados e cancelamento respondidos sem enrolação.

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const FAQ = [
  {
    q: 'O preço da calculadora é o preço que eu pago?',
    a: 'Sim. O valor exibido é o mesmo que o checkout cobra: base do plano + módulos à la carte, sem taxa de setup, sem taxa por venda e sem taxa escondida. O breakdown que você vê antes de confirmar é gravado como evento de cobrança no seu painel.',
  },
  {
    q: 'Tem fidelidade ou multa de cancelamento?',
    a: 'Não. O plano é mensal: você cancela quando quiser e mantém o acesso até o fim do período já pago. Módulos add-on podem ser desativados a qualquer momento pelo painel, com o evento registrado na aba Faturas.',
  },
  {
    q: 'O Tier Free expira ou exige cartão?',
    a: 'Nunca. O Tier Free é por volume, não por tempo: 100 vendas/mês, 1 usuário, 200 SKUs e 500 MB — sem cartão de crédito e sem prazo de expiração. Você evolui quando a operação pedir.',
  },
  {
    q: 'E se a internet cair no meio da venda?',
    a: 'O PDV segue vendendo: a venda é gravada localmente (IndexedDB) e entra numa fila com Idempotency-Key. Quando a conexão volta, o Background Sync envia ao servidor — que deduplica, então nenhuma venda se repete nem se perde.',
  },
  {
    q: 'Meus dados ficam isolados de outros clientes?',
    a: 'Sim, estruturalmente. Cada consulta passa por um cliente Prisma com escopo de tenant injetado: uma consulta no contexto do seu tenant jamais retorna linha de outro — mesmo informando o ID exato. Há teste canário automatizado de vazamento-zero na suíte.',
  },
  {
    q: 'Posso contratar só um módulo avulso?',
    a: 'Pode. Os módulos são à la carte: fiscal, WhatsApp, multi-filial, O.S., SNGPC etc., cada um com preço próprio mensal. A ativação é imediata e proporcional ao ciclo — e aparece itemizada nas suas faturas.',
  },
  {
    q: 'Como funciona o suporte?',
    a: 'No Tier Free: FAQ e comunidade. Nos planos pagos: suporte prioritário por WhatsApp e e-mail, com SLA publicado no contrato. O upgrade de suporte é o mesmo motivo de muitos assinarem o Essencial.',
  },
];

export function FaqSection() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="duvidas" className="relative px-5 py-24 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-400">
            Dúvidas frequentes
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">
            Respostas diretas, sem letras miúdas
          </h2>
        </div>

        <div className="mt-12 space-y-3">
          {FAQ.map((item, i) => {
            const isOpen = open === i;
            return (
              <div key={item.q} className="card-site overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                >
                  <span className="font-medium text-zinc-100">{item.q}</span>
                  <motion.span
                    animate={{ rotate: isOpen ? 45 : 0 }}
                    transition={{ duration: 0.25 }}
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-white/15 text-indigo-300"
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M7 2v10M2 7h10" strokeLinecap="round" />
                    </svg>
                  </motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <p className="border-t border-white/5 px-5 py-4 text-sm leading-relaxed text-zinc-400">
                        {item.a}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
