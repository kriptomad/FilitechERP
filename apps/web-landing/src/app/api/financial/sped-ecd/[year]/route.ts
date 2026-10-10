// src/app/api/financial/sped-ecd/[year]/route.ts — Cap. 17.6
//
// Geração do arquivo ECD (Escrituração Contábil Digital) a partir do
// ChartOfAccount do tenant.
//
// Correção: a validação devolvia um objeto `success:false`, que o `handle()`
// re-empacotava em `{success:true, data:{success:false}}` com HTTP 200 — o
// cliente baixaria um "erro" como se fosse arquivo. Agora é DomainError.
import { prismaUnscoped } from '@/server/db';
import { DomainError } from '@/server/api-envelope';
import { requireSession } from '@/server/session';
import { handle } from '@/server/handler';

export const dynamic = 'force-dynamic';

export const GET = handle(async (request: Request, { params }: { params: { year: string } }) => {
  const session = await requireSession(request);

  const year = Number(params.year);
  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    throw new DomainError('VALIDATION_ERROR', 'Ano inválido.', 400, { field: 'year' });
  }

  const accounts = await prismaUnscoped.chartOfAccount.findMany({
    orderBy: { code: 'asc' },
    where: { tenantId: session.tenantId },
  });

  // Layout ECD: registro de abertura, contas (I050) e totalizador.
  // O campo de data segue o formato AAAA-MM-DD esperado pelo leitor validation.
  const lines = [
    `|0000|LECD|${year}-01-01|${year}-12-31|`,
    ...accounts.map((a) => `|I050|${a.code}|${a.name}|${a.nature}|`),
    `|9999|${accounts.length + 2}|`,
  ];

  const body = lines.join('\r\n');

  // PDF/TXT como bytes puros: `new Response(string)` funciona, mas devolver
  // bytes deixa o Content-Length correto e evita re-encoding no transporte.
  const bytes = Buffer.from(`${body}\r\n`, 'utf8');
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;

  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="ECD_${year}.txt"`,
      'Cache-Control': 'no-store',
    },
  });
});
