import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const body = await request.json();
  return NextResponse.json({ success: true, data: { message: 'E-mail de recuperação enviado se o e-mail existir.' } });
}