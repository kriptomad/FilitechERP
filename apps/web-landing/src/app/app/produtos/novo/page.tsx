// src/app/app/produtos/novo/page.tsx — Cap. 4.1
import Link from 'next/link';
import { Suspense } from 'react';
import { ProdutoForm } from './produto-form';

export default function NovoProdutoPage() {
  return (
    <div className="space-y-8">
      <div>
        <Link href="/app/produtos" className="text-sm text-zinc-500 hover:text-zinc-300">
          ← Produtos
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Novo produto</h1>
      </div>

      <Suspense fallback={<div className="text-zinc-500">Carregando…</div>}>
        <ProdutoForm />
      </Suspense>
    </div>
  );
}