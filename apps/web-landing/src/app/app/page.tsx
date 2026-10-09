// src/app/app/page.tsx — Cap. 8.1 / 1.2.3
//
// Visão geral do ERP: o que fazer agora. Conta com o que o lojista precisa ver
// ao abrir o sistema de manhã (Cap. 1.2.3) — caixa aberto, vendas do dia,
// alertas de estoque.

import Link from 'next/link';
import { prismaUnscoped } from '@/server/db';
import { getSessionContext } from '@/server/session-context';

export const dynamic = 'force-dynamic';

export default async function AppHomePage() {
  const context = await getSessionContext();
  if (!context) return null;

  const { tenant, activeModules, niche } = context;
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [openRegister, salesToday, lowStock, pendingWorkOrders, unpaidReceivables] =
    await Promise.all([
      prismaUnscoped.cashRegister.findFirst({
        where: { tenantId: tenant.id, status: 'OPEN' },
        select: { id: true, openedAt: true, openingAmount: true },
      }),
      prismaUnscoped.sale.aggregate({
        where: { tenantId: tenant.id, createdAt: { gte: startOfDay } },
        _sum: { totalAmount: true },
        _count: { _all: true },
      }),
      prismaUnscoped.product.count({
        where: {
          tenantId: tenant.id,
          active: true,
          OR: [
            { stockQuantity: { lte: 0 } },
            { minStockThreshold: { not: null, lte: 0 } },
          ],
        },
      }),
      activeModules.includes('work-order')
        ? prismaUnscoped.workOrder.count({
            where: {
              tenantId: tenant.id,
              status: { in: ['RECEIVED', 'DIAGNOSING', 'AWAITING_APPROVAL', 'IN_REPAIR', 'READY'] },
            },
          })
        : Promise.resolve(0),
      prismaUnscoped.accountReceivable.aggregate({
        where: { tenantId: tenant.id, status: { in: ['PENDING', 'OVERDUE'] } },
        _sum: { amount: true },
      }),
    ]);

  const bzl = (value: number | null | undefined) =>
    `R$ ${(value ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Olá, {tenant.tradeName}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          {niche
            ? `${niche.label} — ${niche.tagline}`
            : 'Escolha seu nicho em Configurações para carregar o catálogo inicial.'}
        </p>
      </div>

      {/* Ação principal: o caixa. O PDV não funciona sem ele. */}
      <section className="rounded-2xl border border-white/10 bg-zinc-900/40 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.15em] text-zinc-500">
              Caixa
            </p>
            {openRegister ? (
              <>
                <p className="mt-1.5 text-lg">
                  Aberto desde{' '}
                  {new Date(openRegister.openedAt).toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
                <p className="text-sm text-zinc-500">
                  Fundo inicial {bzl(Number(openRegister.openingAmount))}
                </p>
              </>
            ) : (
              <>
                <p className="mt-1.5 text-lg text-amber-400">Caixa fechado</p>
                <p className="text-sm text-zinc-500">
                  Abra o caixa com o fundo de troco para começar a vender.
                </p>
              </>
            )}
          </div>

          <Link
            href={openRegister ? '/app/caixa' : '/app/caixa?abrir=1'}
            className="rounded-xl bg-indigo-600 px-6 py-3 font-medium text-white transition hover:bg-indigo-500"
          >
            {openRegister ? 'Ir para o caixa' : 'Abrir caixa'}
          </Link>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Vendas hoje"
          value={String(salesToday._count._all)}
          detail={bzl(Number(salesToday._sum.totalAmount ?? 0))}
        />
        <StatCard
          label="Produtos zerados"
          value={String(lowStock)}
          detail={lowStock > 0 ? 'Repor antes de perder venda' : 'Estoque saudável'}
          tone={lowStock > 0 ? 'warn' : 'ok'}
        />
        {activeModules.includes('work-order') && (
          <StatCard
            label="O.S. em andamento"
            value={String(pendingWorkOrders)}
            detail="Aguardando conclusão"
          />
        )}
        <StatCard
          label="A receber"
          value={bzl(Number(unpaidReceivables._sum.amount ?? 0))}
          detail="Faturas em aberto"
          tone={Number(unpaidReceivables._sum.amount ?? 0) > 0 ? 'warn' : 'ok'}
        />
      </div>

      {/* Atalhos por módulo contratado */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-zinc-500">
          Módulos ativos
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {activeModules.map((code) => (
            <span
              key={code}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm text-zinc-300"
            >
              {code}
            </span>
          ))}
        </div>

        {activeModules.length === 0 && (
          <p className="mt-3 text-sm text-zinc-500">
            Nenhum módulo ativo. Contrate um plano para liberar o sistema.
          </p>
        )}
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  detail,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  detail: string;
  tone?: 'neutral' | 'ok' | 'warn';
}) {
  const toneClass =
    tone === 'warn'
      ? 'text-amber-400'
      : tone === 'ok'
        ? 'text-emerald-400'
        : 'text-zinc-100';

  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/40 p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${toneClass}`}>{value}</p>
      <p className="mt-1 text-xs text-zinc-500">{detail}</p>
    </div>
  );
}