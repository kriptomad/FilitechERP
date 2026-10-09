import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const body = await request.json();
  return NextResponse.json({ success: true, data: { id: `sale-${Date.now()}`, ...body, createdAt: new Date().toISOString() } });
}