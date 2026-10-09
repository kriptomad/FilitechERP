// src/app/api/financial/sped-ecd/[year]/route.ts — Cap. 17.6
// Geração do arquivo ECD (Escrituração Contábil Digital) usando ChartOfAccount.
import { prismaUnscoped } from '@/server/db';
import { readSession } from '@/server/session';
import { handle } from '@/server/handler';

export const dynamic = 'force-dynamic';

export const GET = handle(async (request: Request, { params }: { params: { year: string } }) => {
  const session = await readSession(request);
  if (!session) return Response.json({ success: false, data: null, error: { code: 'UNAUTHENTICATED', message: 'Sessão ausente ou expirada.' } }, { status: 401 });

  const year = Number(params.year);
  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    return { success: false, data: null, error: { code: 'VALIDATION_ERROR', message: 'Ano inválido.' } };
  }

  const accounts = await prismaUnscoped.chartOfAccount.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { code: 'asc' },
  });

  const lines = [
    '|0000|LECD|' + `${year}-01-01|${year}-12-31|`,
    ...accounts.map((a) => `|I050|${a.code}|${a.name}|${a.nature}|`),
    `|9999|${accounts.length + 1}|`,
  ];

  return new Response(lines.join('\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/plain',
      'Content-Disposition': `attachment; filename=ECD_${year}.txt`,
    },
  });
});
