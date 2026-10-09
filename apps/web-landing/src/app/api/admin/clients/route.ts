import { NextRequest, NextResponse } from 'next/server';

const DEMO_CLIENTS = [
  { id: '1', name: 'Mercado Central', document: '12.345.678/0001-90', phone: '(11) 99999-9999', email: 'contato@mercadocentral.com', creditLimit: 5000, creditBalanceUsed: 1200, isBusinessAccount: true, openBalance: 1200, createdAt: '2024-01-15T10:00:00Z' },
  { id: '2', name: 'João da Silva', document: '123.456.789-00', phone: '(11) 98888-7777', email: 'joao@email.com', creditLimit: 1000, creditBalanceUsed: 300, isBusinessAccount: false, openBalance: 300, createdAt: '2024-02-20T14:30:00Z' },
];

export async function GET() {
  return NextResponse.json({ success: true, data: DEMO_CLIENTS });
}

export async function POST(request: Request) {
  const body = await request.json();
  const newClient = { id: String(Date.now()), ...body, creditBalanceUsed: 0, openBalance: 0, createdAt: new Date().toISOString() };
  return NextResponse.json({ success: true, data: newClient }, { status: 201 });
}