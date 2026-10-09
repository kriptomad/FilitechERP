import { NextRequest, NextResponse } from 'next/server';

const DEMO_USERS = [
  { 
    email: 'demo@filitech.dev', 
    password: 'Demo@123', 
    role: 'OWNER', 
    tenantId: 'demo-tenant', 
    userId: 'demo-user',
    tradeName: 'Filitech Demo',
    name: 'Demo Owner'
  },
  { 
    email: 'caixa@filitech.dev', 
    password: 'Caixa@123', 
    role: 'CASHIER', 
    tenantId: 'demo-tenant', 
    userId: 'caixa-user',
    tradeName: 'Filitech Demo',
    name: 'Caixa User'
  },
];

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Token não fornecido.' } },
      { status: 401 }
    );
  }

  const token = authHeader.substring(7);
  
  if (token.startsWith('demo-token-')) {
    const userId = token.split('-')[2];
    const isCaixa = userId === 'caixa-user';
    
    return NextResponse.json({
      success: true,
      data: {
        userId: isCaixa ? 'caixa-user' : 'demo-user',
        tenantId: 'demo-tenant',
        role: isCaixa ? 'CASHIER' : 'OWNER',
        activeModules: ['pdv', 'estoque', 'financeiro'],
      }
    });
  }

  return NextResponse.json(
    { success: false, error: { code: 'INVALID_TOKEN', message: 'Token inválido.' } },
    { status: 401 }
  );
}