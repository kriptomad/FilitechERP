import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    success: true,
    data: {
      tier: 'FREE',
      usage: { sales: { current: 0, limit: 100 }, users: { current: 1, limit: 1 }, products: { current: 0, limit: 200 } },
      limits: [
        { key: 'sales', label: 'Vendas (PDV)', limit: 100, unit: 'vendas/mês', rationale: 'Suficiente para testar a operação real por semanas.' },
        { key: 'users', label: 'Usuários', limit: 1, unit: 'usuário (Owner)', rationale: 'Upgrade natural assim que o lojista contrata o primeiro funcionário.' },
        { key: 'products', label: 'Produtos cadastrados', limit: 200, unit: 'SKUs', rationale: 'Cobre um pequeno comércio completo.' },
        { key: 'fiscal', label: 'Emissão fiscal', limit: 0, unit: 'não incluída', rationale: "Módulo pago 'fiscal' — exigência legal, ponto de conversão natural." },
        { key: 'storage', label: 'Armazenamento de fotos/XML', limit: 500, unit: 'MB', rationale: 'Operação inicial sem custo de infraestrutura relevante.' },
        { key: 'support', label: 'Suporte', limit: null, unit: 'Comunidade/FAQ', rationale: 'Suporte prioritário é um upsell dos planos pagos.' },
      ],
    }
  });
}