'use client';
// src/app/(marketing)/_components/social-proof-section.tsx — Cap. 2.2
// Prova social em CARROSSEL: autoplay, setas, dots e arrasto (framer-motion),
// responsivo por quantidade de slides visíveis (1 / 2 / 3).

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

const TESTIMONIALS = [
  {
    quote:
      'Antes eu usava planilha para tudo. Agora fecho o caixa em 2 minutos e não perco mais venda por falta de internet.',
    author: 'Maria Helena',
    role: 'Padaria Boa Estrela — Curitiba/PR',
    niche: 'Padaria',
    color: '#F59E0B',
  },
  {
    quote:
      'A aprovação do orçamento pelo WhatsApp cortou 60% das idas do cliente até a loja. A fila da oficina acabou.',
    author: 'Carlos Andrade',
    role: 'Andrade Informática — São Paulo/SP',
    niche: 'Assistência Técnica',
    color: '#06B6D4',
  },
  {
    quote:
      'O controle de cascos por cliente parou de comer minha margem. Em dois meses, as devoluções subiram 40%.',
    author: 'Fernanda Lima',
    role: 'Adega Villa Nova — Belo Horizonte/MG',
    niche: 'Adega',
    color: '#A855F7',
  },
  {
    quote:
      'A curva ABC me mostrou que 12 SKUs pagam o aluguel. Passei a comprar com base em giro, não em achismo.',
    author: 'Roberto Dias',
    role: 'Dias Mercado — Recife/PE',
    niche: 'Mercado',
    color: '#6366F1',
  },
  {
    quote:
      'Escrituração de controlados e retenção de receita no mesmo sistema. A auditoria da Anvisa virou uma exportação.',
    author: 'Juliana Prado',
    role: 'Drogaria Central — Salvador/BA',
    niche: 'Farmácia',
    color: '#10B981',
  },
  {
    quote:
      'Liguei o multi-filial em duas semanas: estoque de cada loja separado e o consolidado da rede numa tela só.',
    author: 'Marcos Vinícius',
    role: 'Rede Pneus Vitória — Vitória/ES',
    niche: 'Pneus',
    color: '#374151',
  },
];

const STATS = [
  { value: '500+', label: 'lojistas ativos' },
  { value: '18', label: 'nichos cobertos' },
  { value: '99,9%', label: 'disponibilidade do PDV' },
  { value: 'R$ 0', label: 'para começar (Tier Free)' },
];

function useVisibleSlides(): number {
  const [visible, setVisible] = useState(1);

  useEffect(() => {
    const compute = () => {
      const w = window.innerWidth;
      setVisible(w < 768 ? 1 : w < 1100 ? 2 : 3);
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, []);

  return visible;
}

export function SocialProofSection() {
  const visible = useVisibleSlides();
  const maxIndex = Math.max(0, TESTIMONIALS.length - visible);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const dragStartX = useRef<number | null>(null);

  // Sempre dentro do intervalo válido ao mudar o nº de slides visíveis
  useEffect(() => {
    setIndex((i) => Math.min(i, Math.max(0, TESTIMONIALS.length - visible)));
  }, [visible]);

  const next = useCallback(
    () => setIndex((i) => (i >= maxIndex ? 0 : i + 1)),
    [maxIndex],
  );
  const prev = useCallback(
    () => setIndex((i) => (i <= 0 ? maxIndex : i - 1)),
    [maxIndex],
  );

  // Autoplay (pausa no hover/foco)
  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(next, 4800);
    return () => window.clearInterval(id);
  }, [next, paused]);

  // Navegação por teclado quando o carrossel está focado
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      next();
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      prev();
    }
  };

  const slideBasis = 100 / visible;
  const trackOffset = -index * slideBasis;

  return (
    <section
      id="prova"
      className="px-5 py-24 sm:px-10 lg:px-24"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-400">
            Prova social
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">
            Lojistas que já operam no Filitech
          </h2>
          <p className="mt-4 text-lg text-zinc-400">
            Mais de 500 negócios, 18 nichos, uma única verdade: gestão sem
            fricção.
          </p>
        </div>

        <div className="flex items-center gap-2" role="group" aria-label="Navegação do carrossel">
          <button
            type="button"
            aria-label="Depoimento anterior"
            onClick={prev}
            className="grid h-11 w-11 place-items-center rounded-full border border-white/15 text-zinc-300 transition hover:border-indigo-400/60 hover:text-white"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12.5 4.5 7 10l5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Próximo depoimento"
            onClick={next}
            className="grid h-11 w-11 place-items-center rounded-full border border-white/15 text-zinc-300 transition hover:border-indigo-400/60 hover:text-white"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M7.5 4.5 13 10l-5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      <div
        className="mt-12 overflow-hidden rounded-2xl"
        role="region"
        aria-roledescription="carrossel"
        aria-label="Depoimentos de clientes"
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={(e) => {
          dragStartX.current = e.clientX;
        }}
        onPointerUp={(e) => {
          if (dragStartX.current === null) return;
          const delta = e.clientX - dragStartX.current;
          dragStartX.current = null;
          if (Math.abs(delta) > 60) (delta < 0 ? next : prev)();
        }}
        onPointerCancel={() => {
          dragStartX.current = null;
        }}
      >
        <motion.div
          className="flex cursor-grab active:cursor-grabbing"
          animate={{ x: `${trackOffset}%` }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          {TESTIMONIALS.map((t) => (
            <figure
              key={t.author}
              style={{ flex: `0 0 ${slideBasis}%` }}
              className="px-2"
            >
              <div className="card-site flex h-full flex-col p-7 sm:p-8">
                <span
                  className="inline-block w-fit rounded-full px-3 py-1 text-xs font-semibold"
                  style={{ backgroundColor: `${t.color}22`, color: t.color }}
                >
                  {t.niche}
                </span>
                <blockquote className="mt-5 flex-1 text-[15px] leading-relaxed text-zinc-300">
                  “{t.quote}”
                </blockquote>
                <figcaption className="mt-6 flex items-center gap-3 border-t border-white/5 pt-5">
                  <span
                    className="grid h-10 w-10 place-items-center rounded-full text-sm font-bold"
                    style={{ backgroundColor: `${t.color}26`, color: t.color }}
                    aria-hidden
                  >
                    {t.author.charAt(0)}
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-zinc-100">
                      {t.author}
                    </span>
                    <span className="block text-xs text-zinc-500">{t.role}</span>
                  </span>
                </figcaption>
              </div>
            </figure>
          ))}
        </motion.div>
      </div>

      {/* Dots */}
      <div className="mt-6 flex items-center justify-center gap-2">
        {Array.from({ length: maxIndex + 1 }).map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Ir para o grupo ${i + 1}`}
            aria-current={i === index}
            onClick={() => setIndex(i)}
            className={`h-2 rounded-full transition-all ${
              i === index ? 'w-7 bg-indigo-400' : 'w-2 bg-zinc-700 hover:bg-zinc-600'
            }`}
          />
        ))}
      </div>

      <div className="mt-16 grid grid-cols-2 gap-8 text-center lg:grid-cols-4">
        {STATS.map((stat) => (
          <div key={stat.label}>
            <p className="text-4xl font-bold text-indigo-400">{stat.value}</p>
            <p className="mt-1 text-sm text-zinc-500">{stat.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
