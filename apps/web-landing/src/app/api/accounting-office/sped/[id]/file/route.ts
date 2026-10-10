// src/app/api/accounting-office/sped/[id]/file/route.ts — Cap. 21.18.5
//
// Download do arquivo gerado. O conteúdo é lido do próprio registro
// (`fileUrl` guarda a `data:` URI), então o que o contador recebe é EXATAMENTE
// o que foi produzido na competência — o histórico não muda quando o plano de
// contas muda depois.
//
// O acesso é limitado ao tenant da sessão: um id alheio devolve 404, não 403
// (não se confirma a existência de registro fiscal de terceiros).
import { prismaUnscoped } from '@/server/db';
import { DomainError } from '@/server/api-envelope';
import { requireSession } from '@/server/session';
import { handle } from '@/server/handler';
import { decodeDataUrl } from '@/server/services/sped-export';

export const dynamic = 'force-dynamic';

export const GET = handle(
  async (request: Request, { params }: { params: { id: string } }) => {
    const session = await requireSession(request);

    const document = await prismaUnscoped.officialTaxDocument.findFirst({
      where: { id: params.id, tenantId: session.tenantId },
      select: { id: true, documentType: true, fileUrl: true, layoutVersion: true },
    });

    if (!document) {
      throw new DomainError('DOCUMENT_NOT_FOUND', 'Documento não encontrado.', 404);
    }

    const decoded = decodeDataUrl(document.fileUrl);
    if (!decoded) {
      throw new DomainError(
        'DOCUMENT_PAYLOAD_INVALID',
        'O arquivo deste documento não está legível. Gere novamente.',
        500,
      );
    }

    const filename = `filitech-${document.documentType}-${document.layoutVersion}-${document.id}.csv`;

    return new Response(decoded.content, {
      status: 200,
      headers: {
        'Content-Type': `${decoded.mime}; charset=utf-8`,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, max-age=0, must-revalidate',
      },
    });
  },
);
