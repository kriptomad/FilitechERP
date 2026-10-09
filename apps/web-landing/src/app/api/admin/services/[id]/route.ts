import { NextRequest, NextResponse } from 'next/server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await request.json();
  return NextResponse.json({ success: true, data: { id: params.id, ...body, updatedAt: new Date().toISOString() } });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return NextResponse.json({ success: true, data: { message: 'Serviço excluído com sucesso.' } });
}