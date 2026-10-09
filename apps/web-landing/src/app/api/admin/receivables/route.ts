import { NextRequest, NextResponse } from 'next/server';

const DEMO_RECEIVABLES = [
  { id: '1', clientId: '1', clientName: 'Mercado Central', description: 'Venda de mercadorias', amount: 1200.00, dueDate: '2024-12-15T00:00:00Z', status: 'PENDING', isOverdue: false, paidAt: null, createdAt: '2024-11-15T10:00:00Z' },
  { id: '2', clientId: '2', clientName: 'João da Silva', description: 'Serviço de manutenção', amount: 300.00, dueDate: '2024-11-10T00:00:00Z', status: 'OVERDUE', isOverdue: true, paidAt: null, createdAt: '2024-10-10T14:30:00Z' },
];

export async function GET() {
  return NextResponse.json({ success: true, data: DEMO_RECEIVABLES });
}

export async function POST(request: Request) {
  const body = await request.json();
  const newReceivable = { id: String(Date.now()), ...body, status: 'PENDING', isOverdue: false, paidAt: null, createdAt: new Date().toISOString() };
  return NextResponse.json({ success: true, data: newReceivable }, { status: 201 });
}