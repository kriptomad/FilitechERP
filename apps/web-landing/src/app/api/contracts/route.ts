import { NextRequest, NextResponse } from 'next/server';

const DEMO_CONTRACTS = [
  { id: '1', contractNumber: 'CTR-2024-0001', clientId: '1', clientName: 'Mercado Central', title: 'Contrato de Manutenção Mensal', description: 'Manutenção preventiva mensal', status: 'ACTIVE', totalAmount: 500.00, startDate: '2024-01-01', endDate: '2024-12-31', signedAt: '2024-01-01T10:00:00Z', pdfUrl: null, itemCount: 2, createdAt: '2023-12-15T10:00:00Z' },
];

export async function GET() {
  return NextResponse.json({ success: true, data: DEMO_CONTRACTS });
}

export async function POST(request: Request) {
  const body = await request.json();
  const newContract = { id: String(Date.now()), contractNumber: `CTR-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`, ...body, status: 'DRAFT', signedAt: null, pdfUrl: null, itemCount: body.items?.length || 0, createdAt: new Date().toISOString() };
  return NextResponse.json({ success: true, data: newContract }, { status: 201 });
}