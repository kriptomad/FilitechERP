import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const body = await request.json();
  
  return NextResponse.json({
    success: true,
    data: { 
      subscriptionId: `sub-${Date.now()}`, 
      computedMrr: body.planCode === 'PRO' ? 169.9 : 89.9,
      paymentUrl: 'https://sandbox.asaas.com/pay/demo'
    }
  });
}