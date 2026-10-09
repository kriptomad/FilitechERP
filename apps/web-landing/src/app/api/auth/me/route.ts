// src/app/api/auth/me/route.ts — Cap. 9.2
//
// GET /api/auth/me — devolve a sessão atual + módulos ativos.
// É o que o Gate do app e o painel do site consultam para decidir entre
// "tela de login", "sem acesso" e "conteúdo".
import { NextResponse } from 'next/server';
import { prismaUnscoped } from '@/server/db';
import { jsonError } from '@/server/api-envelope';
import { readSession } from '@/server/session';
import { handle } from '@/server/handler';

export const dynamic = 'force-dynamic';

export const GET = handle(async (request: Request) => {
  const session = await readSession(request);

  if (!session) {
    return jsonError(401, 'UNAUTHENTICATED', 'Sessão ausente ou expirada.');
  }

  const tenantModules = await prismaUnscoped.tenantModule.findMany({
    where: { tenantId: session.tenantId, active: true },
    select: { moduleCode: true },
  });

  return NextResponse.json({
    success: true,
    data: {
      userId: session.userId,
      tenantId: session.tenantId,
      role: session.role,
      activeModules: tenantModules.map((tm) => tm.moduleCode),
    },
    error: null,
  });
});