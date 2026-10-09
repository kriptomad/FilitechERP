// src/app/api/work-order/public/[token]/route.ts — Cap. 4.2 / 6.4
// Consulta pública do orçamento — é o que a página de aprovação do cliente
// renderiza. Sem sessão: o token é a autorização.
import { prismaUnscoped } from '@/server/db';
import { DomainError, jsonError } from '@/server/api-envelope';
import { getPublicBudget } from '@/server/services/work-orders';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: { token: string } }) {
  try {
    const budget = await getPublicBudget(prismaUnscoped, params.token);
    return Response.json({ success: true, data: budget, error: null });
  } catch (err) {
    if (err instanceof DomainError) {
      return jsonError(err.status, err.code, err.message);
    }
    throw err;
  }
}