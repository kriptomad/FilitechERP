// src/app/api/contracts/[id]/pdf/route.ts — Cap. 11.18
//
// Antes devolvia `pdfUrl: https://filitecherp.vercel.app/api/contracts/{id}/
// download.pdf` — uma URL para uma rota que nunca existiu (404 na aba).
//
// Agora o PDF é renderizado de verdade e devolvido como bytes. O painel abre
// esta mesma rota em GET.
import { jsonError } from '@/server/api-envelope';
import { prismaUnscoped } from '@/server/db';
import { requireSession } from '@/server/session';
import { getContract } from '@/server/services/contracts';
import { renderContractPdf } from '@/server/services/contract-pdf';
import { handle } from '@/server/handler';

export const dynamic = 'force-dynamic';

async function render(request: Request, params: { id: string }): Promise<Response> {
  const session = await requireSession(request);

  const contract = await getContract(prismaUnscoped, session.tenantId, params.id);
  const bytes = renderContractPdf(contract);

  const filename = `${contract.contractNumber}.pdf`;
  // Copia para um ArrayBuffer puro: Buffer/Uint8Array não satisfaz BodyInit
  // no TS 5.7+, e o Next rejeitaria o tipo em build.
  const copy = bytes.slice();
  const body = copy.buffer.slice(
    copy.byteOffset,
    copy.byteOffset + copy.byteLength,
  ) as ArrayBuffer;

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(bytes.byteLength),
      'Cache-Control': 'no-store',
    },
  });
}

export const GET = handle(
  async (request: Request, { params }: { params: { id: string } }) => {
    try {
      return await render(request, params);
    } catch (err) {
      if (err instanceof Error && 'code' in err && (err as { code: string }).code === 'NOT_FOUND') {
        return jsonError(404, 'NOT_FOUND', 'Contrato não encontrado.');
      }
      throw err;
    }
  },
);

/** POST mantido por compatibilidade com chamadas antigas do painel. */
export const POST = handle(
  async (request: Request, { params }: { params: { id: string } }) => {
    try {
      return await render(request, params);
    } catch (err) {
      if (err instanceof Error && 'code' in err && (err as { code: string }).code === 'NOT_FOUND') {
        return jsonError(404, 'NOT_FOUND', 'Contrato não encontrado.');
      }
      throw err;
    }
  },
);
