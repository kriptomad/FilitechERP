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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, tradeName, name, planCode, selectedModuleCodes, billingCycle } = body;

    // Login
    if (email && password && !tradeName) {
      const user = DEMO_USERS.find(u => u.email === email && u.password === password);
      
      if (!user) {
        return NextResponse.json(
          { success: false, error: { code: 'INVALID_CREDENTIALS', message: 'E-mail ou senha inválidos.' } },
          { status: 401 }
        );
      }

      const accessToken = `demo-token-${user.userId}-${Date.now()}`;

      return NextResponse.json({
        success: true,
        data: { 
          accessToken,
          user: {
            id: user.userId,
            name: user.name,
            role: user.role,
            tenantId: user.tenantId,
            tenantSubdomain: 'demo'
          },
          activeModules: ['pdv', 'estoque', 'financeiro'],
          plan: 'FREE',
          subscriptionId: 'demo-sub'
        }
      });
    }

    // Signup
    if (tradeName && name && email && password) {
      const newUser = {
        userId: `user-${Date.now()}`,
        tenantId: `tenant-${Date.now()}`,
        tradeName,
        name,
        email,
        role: 'OWNER',
        password
      };
      
      DEMO_USERS.push({ ...newUser, password });
      
      const accessToken = `demo-token-${newUser.userId}-${Date.now()}`;

      return NextResponse.json({
        success: true,
        data: { 
          accessToken,
          user: {
            id: newUser.userId,
            name: newUser.name,
            role: 'OWNER',
            tenantId: newUser.tenantId,
            tenantSubdomain: tradeName.toLowerCase().replace(/\s+/g, '-')
          },
          activeModules: ['pdv', 'estoque', 'financeiro'],
          plan: planCode || 'FREE',
          subscriptionId: `sub-${Date.now()}`
        }
      });
    }

    return NextResponse.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: 'Dados inválidos.' } },
      { status: 400 }
    );
  } catch {
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Erro interno do servidor.' } },
      { status: 500 }
    );
  }
}