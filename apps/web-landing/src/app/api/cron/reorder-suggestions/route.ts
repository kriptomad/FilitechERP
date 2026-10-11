// src/app/api/cron/reorder-suggestions/route.ts
// Sugestões de compra por estoque mínimo (Cap. 17.5)
import { NextResponse } from 'next/server';
import { prismaUnscoped } from '@/server/db';
import { env } from '@/server/env';
import { emitNotification } from '@/server/services/notifications';

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
    // Produtos com estoque abaixo do mínimo e que têm ponto de reposição
    const products = await prismaUnscoped.product.findMany({
      where: {
        active: true,
        minStockThreshold: { gt: 0 },
        reorderTargetQuantity: { gt: 0 },
        stockQuantity: { lt: prismaUnscoped.product.fields.minStockThreshold },
        tenant: { status: { in: ['ACTIVE', 'TRIAL'] } },
      },
      select: {
        id: true,
        sku: true,
        name: true,
        stockQuantity: true,
        minStockThreshold: true,
        reorderTargetQuantity: true,
        unit: true,
        tenantId: true,
        unitPrice: true,
      },
    });

    let suggestionsCreated = 0;
    let alertsSent = 0;

    for (const product of products) {
      // Cria sugestão de compra
      const suggestedQty = Number(product.reorderTargetQuantity) - Number(product.stockQuantity);
      const estimatedCost = suggestedQty * Number(product.unitPrice ?? 0);

      // Emite notificação
      await emitNotification({
        recipientId: product.tenantId,
        category: 'stock_low',
        title: 'Estoque baixo — sugestão de compra',
        body: `${product.name} (${product.sku}): ${Number(product.stockQuantity)} ${product.unit} (mín: ${product.minStockThreshold}). Sugerido: ${suggestedQty} ${product.unit} — est. R$ ${estimatedCost.toFixed(2)}`,
        data: { productId: product.id, suggestedQty, estimatedCost },
        priority: 'NORMAL',
      });
      alertsSent++;
      suggestionsCreated++;
    }

    return NextResponse.json({ success: true, data: { productsChecked: products.length, suggestionsCreated, alertsSent } });
  } catch (err) {
    console.error('[cron:reorder-suggestions] erro:', err);
    return NextResponse.json({ success: false, error: { code: 'CRON_FAILED', message: 'Falha no cron de sugestões de compra.' } }, { status: 500 });
  }
}