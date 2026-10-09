import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    success: true,
    data: {
      subscription: { id: 'demo-sub', status: 'ACTIVE', provider: 'ASAAS', currentPeriodEnd: new Date(Date.now() + 30*24*60*60*1000).toISOString(), createdAt: new Date().toISOString() },
      plan: { code: 'FREE', label: 'Free', basePrice: 0, includedModules: ['pdv', 'estoque', 'financeiro'] },
      tenant: { tradeName: 'Filitech Demo', legalName: 'Filitech Demo LTDA', status: 'ACTIVE', slug: 'demo', createdAt: new Date().toISOString() },
      activeModules: ['pdv', 'estoque', 'financeiro'],
      breakdown: [{ code: 'FREE', label: 'Plano Free (base)', price: 0 }],
      mrr: 0,
      billingEvents: [],
    }
  });
}