'use client';
// src/app/app/app-shell.tsx — Cap. 8.1 (chrome do ERP)

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

interface NavItem {
  href: string;
  label: string;
  moduleCode: string;
}

const NAV: NavItem[] = [
  { href: '/app', label: 'Visão geral', moduleCode: '' },
  { href: '/app/pdv', label: 'PDV', moduleCode: 'pdv' },
  { href: '/app/produtos', label: 'Produtos', moduleCode: 'estoque' },
  { href: '/app/caixa', label: 'Caixa', moduleCode: 'pdv' },
  { href: '/app/ordens-servico', label: 'Ordens de serviço', moduleCode: 'work-order' },
  { href: '/app/clientes', label: 'Clientes', moduleCode: 'pdv' },
  { href: '/app/financeiro', label: 'Financeiro', moduleCode: 'financeiro' },
  { href: '/app/configuracoes', label: 'Configurações', moduleCode: '' },
];

interface Props {
  user: { name: string; email: string; role: string };
  activeModules: string[];
  tenant: { tradeName: string; slug: string; nicheCode: string | null };
  niche: { code: string; label: string; tagline: string } | null;
  children: React.ReactNode;
}

export function AppShell({ user, activeModules, tenant, niche, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // Filtra a navegação pelos módulos contratados (Cap. 8.1 — lazy por módulo).
  // Mostrar um item que o gatekeeper recusaria seria prometer o que não existe.
  const visibleNav = NAV.filter(
    (item) => item.moduleCode === '' || activeModules.includes(item.moduleCode),
  );

  async function signOut() {
    setSigningOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      router.push('/');
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  const roleLabel: Record<string, string> = {
    OWNER: 'Proprietário',
    MANAGER: 'Gerente',
    TECHNICIAN: 'Técnico',
    CASHIER: 'Caixa',
    ACCOUNTANT: 'Contador',
  };

  return (
    <div className="flex min-h-screen bg-[#08090D] text-zinc-100">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 border-r border-white/10 bg-[#0A0B10] transition-transform lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="flex h-16 items-center gap-2 border-b border-white/10 px-5">
            <Link href="/app" className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-500 text-sm font-black text-white">
                F
              </span>
              <span className="text-[15px] font-semibold tracking-tight">
                Filitech <span className="text-zinc-500">ERP</span>
              </span>
            </Link>
          </div>

          <div className="border-b border-white/10 px-5 py-4">
            <p className="truncate text-sm font-medium">{tenant.tradeName}</p>
            {niche ? (
              <p className="mt-0.5 truncate text-xs text-indigo-400">{niche.label}</p>
            ) : (
              <Link
                href="/app/configuracoes"
                className="mt-0.5 block text-xs text-amber-400 hover:underline"
              >
                Escolher nicho →
              </Link>
            )}
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto p-3">
            {visibleNav.map((item) => {
              const isActive =
                item.href === '/app' ? pathname === '/app' : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`block rounded-lg px-3 py-2.5 text-sm transition ${
                    isActive
                      ? 'bg-indigo-500/15 font-medium text-indigo-300'
                      : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-100'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="border-t border-white/10 p-4">
            <p className="truncate text-sm">{user.name}</p>
            <p className="mt-0.5 text-xs text-zinc-500">
              {roleLabel[user.role] ?? user.role}
            </p>
            <div className="mt-3 flex gap-2">
              <Link
                href="/painel"
                className="flex-1 rounded-lg border border-white/10 px-3 py-2 text-center text-xs text-zinc-400 transition hover:bg-white/5"
              >
                Painel
              </Link>
              <button
                type="button"
                onClick={signOut}
                disabled={signingOut}
                className="flex-1 rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-400 transition hover:border-rose-500/40 hover:text-rose-300 disabled:opacity-60"
              >
                {signingOut ? 'Saindo…' : 'Sair'}
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Overlay do menu mobile */}
      {open && (
        <button
          type="button"
          aria-label="Fechar menu"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
        />
      )}

      <div className="flex-1 lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-white/10 bg-[#08090D]/80 px-5 backdrop-blur-xl">
          <button
            type="button"
            aria-label="Abrir menu"
            onClick={() => setOpen((v) => !v)}
            className="grid h-10 w-10 place-items-center rounded-lg border border-white/10 text-zinc-300 lg:hidden"
          >
            <span className="space-y-1">
              <span className="block h-0.5 w-4 bg-current" />
              <span className="block h-0.5 w-4 bg-current" />
            </span>
          </button>

          <p className="text-sm text-zinc-500">
            {niche ? niche.tagline : 'Sistema de gestão'}
          </p>

          <div className="ml-auto flex items-center gap-3 text-xs text-zinc-500">
            <span className="hidden sm:inline">
              {activeModules.length} módulo{activeModules.length === 1 ? '' : 's'} ativo
              {activeModules.length === 1 ? '' : 's'}
            </span>
            <Link href="/painel" className="rounded-lg border border-white/10 px-3 py-1.5 transition hover:bg-white/5">
              Assinatura
            </Link>
          </div>
        </header>

        <main className="p-5 lg:p-8">{children}</main>
      </div>
    </div>
  );
}