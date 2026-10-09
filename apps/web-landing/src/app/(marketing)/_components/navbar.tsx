'use client';
// src/app/(marketing)/_components/navbar.tsx — nav fixa com vidro
// (transparência/backdrop-blur) + menu mobile animado.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const LINKS = [
  { href: '/#recursos', label: 'Recursos' },
  { href: '/#nichos', label: 'Nichos' },
  { href: '/planos', label: 'Planos' },
  { href: '/#calculadora', label: 'Calculadora' },
  { href: '/#duvidas', label: 'Dúvidas' },
];

export function Navbar() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Fecha o menu mobile ao trocar de rota
  useEffect(() => setOpen(false), [pathname]);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        scrolled
          ? 'border-b border-white/10 bg-[#05060A]/75 backdrop-blur-xl'
          : 'border-b border-transparent bg-transparent'
      }`}
    >
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 lg:px-8">
        <Link href="/" className="group flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-500 text-sm font-black text-white shadow-[0_0_24px_rgba(99,102,241,0.6)] transition group-hover:shadow-[0_0_32px_rgba(99,102,241,0.85)]">
            F
          </span>
          <span className="text-[15px] font-semibold tracking-tight">
            Filitech <span className="text-zinc-500">ERP</span>
          </span>
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-sm text-zinc-400 transition hover:bg-white/5 hover:text-zinc-100"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <Link
            href="/entrar"
            className="rounded-lg px-3 py-2 text-sm text-zinc-300 transition hover:bg-white/5"
          >
            Entrar
          </Link>
          <Link
            href="/cadastro"
            className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-400"
          >
            Começar grátis
          </Link>
        </div>

        <button
          type="button"
          aria-label="Abrir menu"
          onClick={() => setOpen((v) => !v)}
          className="grid h-10 w-10 place-items-center rounded-lg border border-white/10 text-zinc-300 md:hidden"
        >
          <span className="relative block h-3 w-4">
            <span
              className={`absolute left-0 h-0.5 w-4 bg-current transition ${open ? 'top-1.5 rotate-45' : 'top-0'}`}
            />
            <span
              className={`absolute left-0 h-0.5 w-4 bg-current transition ${open ? '-top-1.5 -rotate-45' : 'top-3'}`}
            />
          </span>
        </button>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden border-t border-white/10 bg-[#05060A]/95 backdrop-blur-xl md:hidden"
          >
            <div className="space-y-1 px-5 py-4">
              {LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-2.5 text-sm text-zinc-300 hover:bg-white/5"
                >
                  {link.label}
                </Link>
              ))}
              <div className="flex gap-2 pt-3">
                <Link
                  href="/entrar"
                  className="flex-1 rounded-lg border border-white/10 px-4 py-2.5 text-center text-sm text-zinc-200"
                >
                  Entrar
                </Link>
                <Link
                  href="/cadastro"
                  onClick={() => setOpen(false)}
                  className="flex-1 rounded-lg bg-indigo-500 px-4 py-2.5 text-center text-sm font-medium text-white"
                >
                  Começar grátis
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
