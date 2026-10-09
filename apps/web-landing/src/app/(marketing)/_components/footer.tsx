// src/app/(marketing)/_components/footer.tsx — rodapé institucional
import Link from 'next/link';

const COLUMNS = [
  {
    title: 'Produto',
    links: [
      { label: 'Recursos', href: '/#recursos' },
      { label: 'Nichos atendidos', href: '/#nichos' },
      { label: 'Calculadora de preço', href: '/#calculadora' },
      { label: 'Planos e combos', href: '/planos' },
      { label: 'Dúvidas frequentes', href: '/#duvidas' },
    ],
  },
  {
    title: 'Conta',
    links: [
      { label: 'Começar grátis', href: '/cadastro' },
      { label: 'Painel de assinatura', href: '/painel' },
      { label: 'Contratar plano', href: '/checkout' },
      { label: 'Entrar no sistema', href: '/entrar' },
    ],
  },
  {
    title: 'Empresa',
    links: [
      { label: 'Sobre a Filitech', href: '/#prova' },
      { label: 'Jornada do cliente', href: '/#jornada' },
      { label: 'Arquitetura (offline-first)', href: '/#arquitetura' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Termos de uso', href: '/termos' },
      { label: 'Privacidade e LGPD', href: '/privacidade' },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-[#05060A]">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:grid-cols-2 lg:grid-cols-6 lg:px-8">
        <div className="lg:col-span-2">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-500 text-sm font-black text-white">
              F
            </span>
            <span className="text-[15px] font-semibold tracking-tight">
              Filitech <span className="text-zinc-500">ERP</span>
            </span>
          </div>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-zinc-500">
            SaaS multi-nicho com billing dinâmico: 18 segmentos, PDV que opera
            sem internet e módulos contratados à la carte — com preço
            transparente do primeiro ao último centavo.
          </p>
          <p className="mt-4 text-xs text-zinc-600">
            © {new Date().getFullYear()} Filitech ERP — Todos os direitos
            reservados.
          </p>
        </div>

        {COLUMNS.map((column) => (
          <nav key={column.title} aria-label={column.title}>
            <h3 className="text-sm font-semibold text-zinc-200">
              {column.title}
            </h3>
            <ul className="mt-4 space-y-2.5">
              {column.links.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-zinc-500 transition hover:text-zinc-200"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="border-t border-white/5">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-5 py-5 text-xs text-zinc-600 sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <span>
            Demonstração pública — dados fictícios. Nenhum dado real é coletado.
          </span>
          <span>
            Postgres · Redis · Express · Prisma · Next.js · Tailwind ·
            Framer&nbsp;Motion · GSAP · R3F · Dexie
          </span>
        </div>
      </div>
    </footer>
  );
}
