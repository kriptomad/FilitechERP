import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return NextResponse.json({ success: true, data: { message: 'Contrato cancelado com sucesso.', cancelledAt: new Date().toISOString() } });
}