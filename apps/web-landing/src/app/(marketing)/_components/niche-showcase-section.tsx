'use client';
// src/app/(marketing)/_components/niche-showcase-section.tsx — Cap. 2.2 (GSAP + ScrollTrigger)

import { useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(ScrollTrigger, useGSAP);

const NICHES = [
  { name: 'Mercado', color: '#6366F1' },
  { name: 'Assistência Técnica', color: '#06B6D4' },
  { name: 'Adega', color: '#A855F7' },
  { name: 'Padaria', color: '#F59E0B' },
  { name: 'Farmácia', color: '#10B981' },
  { name: 'Varejo Geral', color: '#F43F5E' },
  { name: 'Restaurante', color: '#EC4899' },
  { name: 'Ótica', color: '#8B5CF6' },
  { name: 'Petshop', color: '#14B8A6' },
  { name: 'Moda', color: '#F97316' },
  { name: 'Papelaria', color: '#EAB308' },
  { name: 'Salão', color: '#F472B6' },
  { name: 'Calçados', color: '#60A5FA' },
  { name: 'Construção', color: '#A3A3A3' },
  { name: 'Oficina', color: '#EF4444' },
  { name: 'Pneus', color: '#374151' },
  { name: 'Estética Auto', color: '#38BDF8' },
  { name: 'Seminovos', color: '#84CC16' },
];

export function NicheShowcaseSection() {
  const sectionRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const cards = gsap.utils.toArray<HTMLElement>('.niche-card');

      // Efeito parallax: cada card se move a uma velocidade levemente diferente
      // conforme a seção é rolada, criando profundidade sem custo de reflow.
      cards.forEach((card, index) => {
        gsap.to(card, {
          yPercent: -15 * (index % 2 === 0 ? 1 : -1),
          ease: 'none',
          scrollTrigger: {
            trigger: sectionRef.current,
            start: 'top bottom',
            end: 'bottom top',
            scrub: 0.6,
          },
        });
      });

      // Revelação em stagger dos cards ao entrar no viewport.
      gsap.from(cards, {
        opacity: 0,
        y: 60,
        stagger: 0.08,
        duration: 0.8,
        ease: 'power3.out',
        scrollTrigger: { trigger: sectionRef.current, start: 'top 75%' },
      });
    },
    { scope: sectionRef },
  );

  return (
    <section id="nichos" ref={sectionRef} className="border-b border-white/5 px-5 py-24 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-400">
          18 nichos, 1 motor
        </p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">
          Um sistema. Dezoito negócios.
        </h2>
        <p className="mt-4 max-w-2xl text-lg text-zinc-400">
          Do mercado de bairro à concessionária de seminovos — o Filitech cobre 18 nichos
          com módulos especializados que você liga e desliga como quiser.
        </p>
        <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {NICHES.map((niche) => (
            <div
              key={niche.name}
              className="niche-card rounded-2xl border p-5 bg-zinc-900/40 backdrop-blur-sm
                         transition-all hover:scale-105 cursor-default"
              style={{ borderColor: `${niche.color}33` }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.boxShadow = `0 0 40px ${niche.color}33`)
              }
              onMouseLeave={(e) => (e.currentTarget.style.boxShadow = 'none')}
            >
              <h3 className="text-base font-semibold" style={{ color: niche.color }}>
                {niche.name}
              </h3>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
