// src/app/(portal)/layout.tsx — chrome do portal de administração
import Link from 'next/link';

export const metadata = {
  title: 'Painel',
  robots: { index: false },
};

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#05060A] text-zinc-100">
      <header className="border-b border-white/10 bg-[#05060A]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-500 text-sm font-black text-white">
                F
              </span>
              <span className="text-[15px] font-semibold tracking-tight">
                Filitech <span className="text-zinc-500">ERP</span>
              </span>
            </Link>
            <nav className="hidden items-center gap-4 text-sm text-zinc-400 sm:flex">
              <Link href="/" className="transition hover:text-zinc-100">
                Site
              </Link>
              <Link href="/planos" className="transition hover:text-zinc-100">
                Planos
              </Link>
            </nav>
          </div>
          <Link
            href="/#duvidas"
            className="text-sm text-zinc-500 transition hover:text-zinc-200"
          >
            Ajuda
          </Link>
        </div>
      </header>
      {children}
    </div>
  );
}
