'use client';
// src/app/(marketing)/_components/hero-section.tsx — Cap. 2.2 (R3F + drei)

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Canvas } from '@react-three/fiber';
import { Float, Environment } from '@react-three/drei';
import { ErpDeviceMesh } from './erp-device-mesh';

const fadeUpStagger = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.12, duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  }),
};

export function HeroSection() {
  return (
    <section className="relative flex min-h-screen items-center justify-between px-5 pb-20 pt-28 lg:px-16">
      {/* Glow dinâmico de fundo — gradiente radial animado atrás do conteúdo */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(99,102,241,0.25),transparent_60%)]" />

      <div className="relative z-10 max-w-2xl">
        <motion.span
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="glass inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium text-indigo-300"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          18 nichos · PDV offline-first · Tier Free sem cartão
        </motion.span>

        {['Gestão completa.', 'Em qualquer nicho.', 'Sem fricção.'].map((line, i) => (
          <motion.h1
            key={line}
            custom={i}
            initial="hidden"
            animate="visible"
            variants={fadeUpStagger}
            className="mt-6 text-5xl font-bold leading-[1.05] tracking-tight lg:text-7xl"
          >
            {line}
          </motion.h1>
        ))}

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.8 }}
          className="mt-6 max-w-lg text-lg text-zinc-400"
        >
          O ERP que se adapta ao seu negócio — mercado, assistência técnica, adega, padaria,
          farmácia ou varejo geral — com PDV que nunca para, mesmo sem internet.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9, duration: 0.6 }}
          className="mt-10 flex flex-col gap-3 sm:flex-row"
        >
          <Link
            href="/cadastro"
            className="group relative rounded-xl bg-indigo-600 px-8 py-4 text-center font-semibold
                       shadow-[0_0_40px_rgba(99,102,241,0.4)] transition-shadow
                       hover:bg-indigo-500 hover:shadow-[0_0_60px_rgba(99,102,241,0.6)]"
          >
            Começar grátis
          </Link>
          <Link
            href="/entrar"
            className="rounded-xl border border-zinc-700 px-8 py-4 text-center font-semibold
                       transition-all hover:border-indigo-400 hover:shadow-[0_0_24px_rgba(99,102,241,0.3)]"
          >
            Ver demonstração
          </Link>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.15, duration: 0.6 }}
          className="mt-6 text-sm text-zinc-500"
        >
          Sem cartão de crédito · Configuração em uma tarde · Cancele quando quiser
        </motion.p>
      </div>

      {/* Mockup 3D interativo do sistema, renderizado em WebGL (Cap. 2.1: R3F + drei) */}
      <div className="relative z-10 hidden lg:block h-[600px] w-[600px]">
        <Canvas camera={{ position: [0, 0, 5], fov: 35 }}>
          <Environment preset="city" />
          <ambientLight intensity={0.4} />
          <directionalLight position={[3, 3, 3]} intensity={1.2} />
          <Float speed={1.4} rotationIntensity={0.6} floatIntensity={0.8}>
            <ErpDeviceMesh />
          </Float>
        </Canvas>
      </div>
    </section>
  );
}
