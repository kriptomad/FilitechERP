'use client';
// src/app/(marketing)/_components/niche-showcase-section.tsx — Cap. 2.2 (Simplificado sem GSAP)

import { useEffect, useRef } from 'react';

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

  useEffect(() => {
    // Simple intersection observer for fade-in (sem GSAP)
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('animate-fade-in-up');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
    );

    const cards = sectionRef.current?.querySelectorAll('.niche-card');
    cards?.forEach((card, index) => {
      (card as HTMLElement).style.transitionDelay = `${index * 80}ms`;
      observer.observe(card);
    });

    return () => observer.disconnect();
  }, []);

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
                         transition-all duration-300 hover:scale-105 cursor-default opacity-0 animate-none"
              style={{ borderColor: `${niche.color}33` }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = `0 0 40px ${niche.color}33`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = 'none';
              }}
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