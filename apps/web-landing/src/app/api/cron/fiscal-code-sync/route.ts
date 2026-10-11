// src/app/api/cron/fiscal-code-sync/route.ts
// Sincronização semanal do catálogo fiscal (NCM/NBS/CEST) (Cap. 21.1)
import { NextResponse } from 'next/server';
import { prismaUnscoped } from '@/server/db';
import { env } from '@/server/env';
import { syncFiscalCodeCatalog } from '@/server/services/fiscal-code-catalog.service';

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
    // Em produção, faria download dos arquivos oficiais
    // Aqui apenas registra a tentativa
    const result = await syncFiscalCodeCatalog();

    return NextResponse.json({
      success: true,
      data: {
        message: 'Sincronização do catálogo fiscal iniciada. Em produção, faria download dos arquivos oficiais.',
        result,
      },
    });
  } catch (err) {
    console.error('[cron:fiscal-code-sync] erro:', err);
    return NextResponse.json({ success: false, error: { code: 'CRON_FAILED', message: 'Falha na sincronização do catálogo fiscal.' } }, { status: 500 });
  }
}