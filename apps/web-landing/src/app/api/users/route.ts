import { NextRequest, NextResponse } from 'next/server';

const DEMO_USERS = [
  { id: 'demo-user', name: 'Demo Owner', email: 'demo@filitech.dev', role: 'OWNER', active: true, createdAt: '2024-01-01T00:00:00Z' },
  { id: 'caixa-user', name: 'Caixa User', email: 'caixa@filitech.dev', role: 'CASHIER', active: true, createdAt: '2024-01-01T00:00:00Z' },
];

export async function GET() {
  return NextResponse.json({ success: true, data: DEMO_USERS });
}

export async function POST(request: Request) {
  const body = await request.json();
  const newUser = { id: `user-${Date.now()}`, ...body, active: true, createdAt: new Date().toISOString() };
  return NextResponse.json({ success: true, data: newUser }, { status: 201 });
}