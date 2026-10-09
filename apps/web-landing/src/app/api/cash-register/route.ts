import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ success: true, data: { status: 'CLOSED', openingAmount: 0, closingAmount: 0, openedAt: null, closedAt: null } });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  return NextResponse.json({ success: true, data: { id: `cr-${Date.now()}`, ...body, status: 'OPEN', openedAt: new Date().toISOString() } });
}