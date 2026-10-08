// src/app/(auth)/layout.tsx — chrome mínimo para /cadastro e /checkout
import Link from 'next/link';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#05060A] text-zinc-100">
      <header className="border-b border-white/10">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-500 text-sm font-black text-white">
              F
            </span>
            <span className="text-[15px] font-semibold tracking-tight">
              Filitech <span className="text-zinc-500">ERP</span>
            </span>
          </Link>
          <Link
            href="/planos"
            className="text-sm text-zinc-400 transition hover:text-zinc-100"
          >
            ← Voltar para os planos
          </Link>
        </div>
      </header>
      {children}
    </div>
  );
}
