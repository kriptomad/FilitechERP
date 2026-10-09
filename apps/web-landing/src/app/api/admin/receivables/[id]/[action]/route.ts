import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; action: string } }
) {
  const { id, action } = params;
  
  if (!['pay', 'cancel'].includes(action)) {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_ACTION', message: 'Ação inválida.' } },
      { status: 400 }
    );
  }

  return NextResponse.json({
    success: true,
    data: { id, action, message: action === 'pay' ? 'Pagamento registrado com sucesso.' : 'Cobrança cancelada com sucesso.', updatedAt: new Date().toISOString() }
  });
}