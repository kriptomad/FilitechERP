import { NextRequest, NextResponse } from 'next/server';

// Simple demo auth - replace with real Prisma/jwt logic later
const DEMO_USERS = [
  { email: 'demo@filitech.dev', password: 'Demo@123', role: 'OWNER', tenantId: 'demo-tenant', userId: 'demo-user' },
  { email: 'caixa@filitech.dev', password: 'Caixa@123', role: 'CASHIER', tenantId: 'demo-tenant', userId: 'caixa-user' },
];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    const user = DEMO_USERS.find(u => u.email === email && u.password === password);
    
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_CREDENTIALS', message: 'E-mail ou senha inválidos.' } },
        { status: 401 }
      );
    }

    // In production, generate real JWT here
    const accessToken = `demo-token-${user.userId}-${Date.now()}`;

    return NextResponse.json({
      success: true,
      data: { accessToken }
    });
  } catch {
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Erro interno do servidor.' } },
      { status: 500 }
    );
  }
}