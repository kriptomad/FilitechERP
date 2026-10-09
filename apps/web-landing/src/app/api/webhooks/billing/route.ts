import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const body = await request.json();
  console.log('Billing webhook received:', body);
  return NextResponse.json({ success: true, message: 'Webhook de billing recebido com sucesso.' });
}