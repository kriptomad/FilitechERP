import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ success: true, data: [] });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  return NextResponse.json({ success: true, data: { id: `wo-${Date.now()}`, ...body, status: 'OPEN', createdAt: new Date().toISOString() } });
}