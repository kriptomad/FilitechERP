import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  request: NextRequest,
  { params }: { params: { code: string; action: string } }
) {
  const { code, action } = params;
  
  if (!['activate', 'deactivate'].includes(action)) {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_ACTION', message: 'Ação inválida.' } },
      { status: 400 }
    );
  }

  return NextResponse.json({
    success: true,
    data: { moduleCode: code, action, message: `Módulo ${action === 'activate' ? 'ativado' : 'desativado'} com sucesso.` }
  });
}