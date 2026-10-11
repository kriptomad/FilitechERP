// src/app/api/cron/net-worth-snapshot/route.ts
// Snapshot mensal de patrimônio líquido (Cap. 22)
import { NextResponse } from 'next/server';
import { prismaUnscoped } from '@/server/db';
import { env } from '@/server/env';

export const dynamic = 'force-dynamic';

function authorize(request: Request): boolean {
  const secret = env.cronSecret;
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Não autorizado.' } }, { status: 401 });
  }

  try {
    const now = new Date();
    // Só executa no dia 1 do mês
    if (now.getDate() !== 1) {
      return NextResponse.json({ success: true, data: { message: 'Não é dia 1 do mês, pulando.' }, skipped: true });
    }

    const personalTenants = await prismaUnscoped.tenant.findMany({
      where: { tenantType: 'PERSONAL', status: { in: ['ACTIVE', 'TRIAL'] } },
      select: { id: true },
    });

    let snapshotsCreated = 0;

    for (const tenant of personalTenants) {
      // Calcula ativos
      const [accounts, investments, debts] = await Promise.all([
        prismaUnscoped.personalAccount.aggregate({
          where: { tenantId: tenant.id },
          _sum: { currentBalance: true },
        }),
        prismaUnscoped.personalInvestment.aggregate({
          where: { tenantId: tenant.id },
          _sum: { currentPrice: true },
        }),
        prismaUnscoped.personalDebt.aggregate({
          where: { tenantId: tenant.id, status: 'ACTIVE' },
          _sum: { remainingAmount: true },
        }),
      ]);

      const totalAssets = Number(accounts._sum.currentBalance ?? 0) + Number(investments._sum.currentPrice ?? 0);
      const totalLiabilities = Number(debts._sum.remainingAmount ?? 0);
      const netWorth = totalAssets - totalLiabilities;

      await prismaUnscoped.netWorthSnapshot.create({
        data: {
          tenantId: tenant.id,
          snapshotDate: new Date(now.getFullYear(), now.getMonth(), 1),
          totalAssets,
          totalLiabilities,
          netWorth,
        },
      });
      snapshotsCreated++;
    }

    return NextResponse.json({ success: true, data: { snapshotsCreated, tenantsProcessed: personalTenants.length } });
  } catch (err) {
    console.error('[cron:net-worth-snapshot] erro:', err);
    return NextResponse.json({ success: false, error: { code: 'CRON_FAILED', message: 'Falha no snapshot de patrimônio.' } }, { status: 500 });
  }
}