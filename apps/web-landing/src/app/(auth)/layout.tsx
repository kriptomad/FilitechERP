// src/app/(auth)/layout.tsx — chrome mínimo para /cadastro, /checkout e /entrar
import Link from 'next/link';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
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

          {/* Link de login sempre presente: era o botão "Entrar" quebrado da
              navbar que apontava para string vazia quando a env var faltava. */}
          <Link
            href="/entrar"
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-zinc-300 transition hover:bg-white/5"
          >
            Entrar
          </Link>
        </div>
      </header>
      {children}
    </div>
  );
}