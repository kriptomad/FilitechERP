// src/app/app/produtos/page.tsx — Cap. 4.1 / 6.1
//
// Catálogo do tenant. Lê do banco; o template do nicho (Cap. 1.2.2) aparece
// aqui logo após o cadastro.

import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { prismaUnscoped } from '@/server/db';
import { getSessionContext } from '@/server/session-context';

export const dynamic = 'force-dynamic';

export default async function ProdutosPage() {
  const context = await getSessionContext();
  if (!context) return null;

  const products = await prismaUnscoped.product.findMany({
    where: { tenantId: context.tenant.id },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
    take: 200,
  });

  const bzl = (value: Prisma.Decimal | number | null | undefined) =>
    `R$ ${Number(value ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const grouped = products.reduce<Record<string, typeof products>>((acc, product) => {
    const key = product.category ?? 'Sem categoria';
    (acc[key] ??= []).push(product);
    return acc;
  }, {});

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Produtos</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {products.length} produto{products.length === 1 ? '' : 's'} cadastrado
            {products.length === 1 ? '' : 's'}.
          </p>
        </div>

        <Link
          href="/app/produtos/novo"
          className="rounded-xl bg-indigo-600 px-5 py-2.5 font-medium text-white transition hover:bg-indigo-500"
        >
          Novo produto
        </Link>
      </div>

      {products.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 p-12 text-center">
          <p className="text-lg font-medium">Catálogo vazio</p>
          <p className="mt-2 text-sm text-zinc-500">
            {context.niche
              ? `O template de ${context.niche.label} não foi aplicado. Escolha o nicho em Configurações para carregar o catálogo inicial.`
              : 'Escolha seu nicho em Configurações para receber um catálogo inicial pronto.'}
          </p>
          <Link
            href="/app/configuracoes"
            className="mt-6 inline-block rounded-xl border border-white/15 px-5 py-2.5 text-sm text-zinc-200 transition hover:bg-white/5"
          >
            Ir para Configurações
          </Link>
        </div>
      ) : (
        Object.entries(grouped).map(([category, items]) => (
          <section key={category}>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.15em] text-zinc-500">
              {category}
            </h2>
            <div className="overflow-hidden rounded-xl border border-white/10">
              <table className="w-full text-sm">
                <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-wider text-zinc-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Produto</th>
                    <th className="px-4 py-3 font-medium">SKU</th>
                    <th className="px-4 py-3 text-right font-medium">Preço</th>
                    <th className="px-4 py-3 text-right font-medium">Estoque</th>
                    <th className="px-4 py-3 text-right font-medium">Mínimo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {items.map((product) => (
                    <tr key={product.id} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-3">
                        <span className="font-medium">{product.name}</span>
                        {product.isControlledSubstance && (
                          <span className="ml-2 rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-medium text-rose-300">
                            controlado
                          </span>
                        )}
                        {product.requiresPrescriptionRetention && (
                          <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                            retenção
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-zinc-500">{product.sku}</td>
                      <td className="px-4 py-3 text-right">{bzl(product.unitPrice)}</td>
                      <td
                        className={`px-4 py-3 text-right ${
                          Number(product.stockQuantity) <= 0 ? 'text-rose-400' : ''
                        }`}
                      >
                        {Number(product.stockQuantity).toLocaleString('pt-BR', {
                          maximumFractionDigits: 3,
                        })}
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-500">
                        {product.minStockThreshold
                          ? Number(product.minStockThreshold).toLocaleString('pt-BR')
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}
    </div>
  );
}