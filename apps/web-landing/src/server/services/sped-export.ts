// src/server/services/sped-export.ts — Cap. 21.18.5 / 21.18.7
//
// Exportação REAL dos dados contábeis (Caminho B do 21.18.1) e base do Caminho A.
//
// Duas disciplinas que este arquivo não quebra:
//
//  1. NUNCA leiaute hardcoded (21.18.7). A versão vigente vem do catálogo
//     `OfficialDocumentLayoutVersion`, atualizado uma vez na plataforma e
//     válido para todos os tenants. Sem versão vigente a exportação é
//     RECUSADA — emitir com versão inventada produziria arquivo que a Receita
//     rejeita e o contador só descobre depois.
//
//  2. NUNCA fingir transmissão. O que sai daqui fica com status GENERATED.
//     Protocolo exige assinatura digital fora da plataforma, então
//     `transmissionProtocol` permanece nulo — essa nulidade é a prova.
import { prismaUnscoped } from '../db';
import { DomainError } from '../api-envelope';

type DocumentType = 'ECD' | 'ECF' | 'DEFIS';

const CSV = ';';

/** Versão vigente do leiaute (21.18.7). Fail-closed: sem cadastro, nada sai. */
export async function getCurrentLayoutVersion(documentType: DocumentType): Promise<{
  layoutVersion: string;
  sourceDescription: string;
}> {
  const now = new Date();

  const layout = await prismaUnscoped.officialDocumentLayoutVersion.findFirst({
    where: {
      documentType: documentType as never,
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
    },
    orderBy: { effectiveFrom: 'desc' },
    select: { layoutVersion: true, sourceDescription: true },
  });

  if (!layout) {
    throw new DomainError(
      'LAYOUT_VERSION_NOT_FOUND',
      `Não há leiaute vigente de "${documentType}" cadastrado na plataforma. ` +
        'Contate o suporte antes de gerar — a versão não pode ser inventada.',
      503,
      { documentType },
    );
  }

  return layout;
}

const brl = (value: number): string => value.toFixed(2).replace('.', ',');
const isoDate = (date: Date): string => date.toISOString().slice(0, 10);

function header(
  documentType: string,
  layoutVersion: string,
  sourceDescription: string,
  tenantName: string,
  inicio: Date,
  fim: Date,
): string[] {
  return [
    '# FILITECH ERP - EXPORTACAO CONTABIL',
    `# DOCUMENTO=${documentType}`,
    `# LEIUTE=${layoutVersion}`,
    `# LEIUTE_DESCRICAO=${sourceDescription}`,
    `# TENANT=${tenantName}`,
    `# COMPETENCIA_INICIO=${isoDate(inicio)}`,
    `# COMPETENCIA_FIM=${isoDate(fim)}`,
    '# STATUS=GERADO (sem protocolo de transmissao - entrega ao contador)',
    `# GERADO_EM=${new Date().toISOString()}`,
    '',
  ];
}

export interface ExportInput {
  tenantId: string;
  documentType: DocumentType;
  competenciaInicio: Date;
  competenciaFim: Date;
}

export interface ExportResult {
  content: string;
  layoutVersion: string;
  sourceDescription: string;
  /** `data:` URI — arquivo imutável junto com o registro, sem bucket externo. */
  dataUrl: string;
  bytes: number;
}

const toDataUrl = (content: string): string =>
  `data:text/csv;charset=utf-8;base64,${Buffer.from(content, 'utf8').toString('base64')}`;

export async function generateExport(input: ExportInput): Promise<ExportResult> {
  const { tenantId, documentType, competenciaInicio, competenciaFim } = input;

  if (competenciaFim < competenciaInicio) {
    throw new DomainError('VALIDATION_ERROR', 'O fim da competência é anterior ao início.', 400, {
      field: 'competenciaFim',
    });
  }

  const [layout, tenant] = await Promise.all([
    getCurrentLayoutVersion(documentType),
    prismaUnscoped.tenant.findUnique({
      where: { id: tenantId },
      select: {
        tradeName: true,
        cnpj: true,
        taxRegime: true,
        simplesNacionalAnexo: true,
      },
    }),
  ]);

  if (!tenant) throw new DomainError('TENANT_NOT_FOUND', 'Conta não encontrada.', 404);

  const createdAt = { gte: competenciaInicio, lte: competenciaFim };
  const lines = header(
    documentType,
    layout.layoutVersion,
    layout.sourceDescription,
    `${tenant.tradeName} - CNPJ ${tenant.cnpj}`,
    competenciaInicio,
    competenciaFim,
  );

  let totalDebit = 0;
  let totalCredit = 0;

  if (documentType === 'DEFIS') {
    // DEFIS é anual e apura sobre o corte Simples Nacional (21.18.11). A fonte
    // são as vendas já registradas no PDV — nunca uma contabilidade paralela.
    const months = await prismaUnscoped.$queryRaw<Array<{ mes: Date; total: number }>>`
      SELECT date_trunc('month', "createdAt") AS mes, SUM("totalAmount")::float AS total
      FROM "sales"
      WHERE "tenantId" = ${tenantId}
        AND "createdAt" >= ${competenciaInicio}
        AND "createdAt" <= ${competenciaFim}
      GROUP BY 1
      ORDER BY 1
    `;

    lines.push(`# REGIME=${tenant.taxRegime}`);
    lines.push(`# ANEXO_SIMPLES=${tenant.simplesNacionalAnexo ?? 'NAO_INFORMADO'}`);
    lines.push('');
    lines.push(['MES', 'RECEITA_BRT'].join(CSV));

    let annual = 0;
    for (const row of months) {
      annual += Number(row.total);
      lines.push([isoDate(new Date(row.mes)), brl(Number(row.total))].join(CSV));
    }
    totalCredit = annual;
    lines.push('');
    lines.push(['TOTAL_ANO', brl(annual)].join(CSV));
  } else {
    const [payables, receivables, chart] = await Promise.all([
      prismaUnscoped.accountPayable.groupBy({
        by: ['accountId'],
        where: { tenantId, createdAt },
        _sum: { amount: true },
      }),
      prismaUnscoped.accountReceivable.groupBy({
        by: ['accountId'],
        where: { tenantId, createdAt },
        _sum: { amount: true },
      }),
      prismaUnscoped.chartOfAccount.findMany({
        where: { tenantId },
        orderBy: { code: 'asc' },
        select: { id: true, code: true, name: true, nature: true },
      }),
    ]);

    const payableBy = new Map(payables.map((r) => [r.accountId ?? '', r]));
    const receivableBy = new Map(receivables.map((r) => [r.accountId ?? '', r]));

    lines.push(
      ['CODIGO', 'NATUREZA', 'DESCRICAO', 'LANCAMENTOS_PAGAR', 'LANCAMENTOS_RECEBER', 'SALDO']
        .join(CSV),
    );

    for (const account of chart) {
      const debit = Number(payableBy.get(account.id)?._sum.amount ?? 0);
      const credit = Number(receivableBy.get(account.id)?._sum.amount ?? 0);
      if (debit === 0 && credit === 0) continue;

      totalDebit += debit;
      totalCredit += credit;
      lines.push(
        [
          account.code,
          account.nature,
          `"${account.name.replace(/"/g, '""')}"`,
          brl(debit),
          brl(credit),
          brl(credit - debit),
        ].join(CSV),
      );
    }

    lines.push('');
    lines.push(
      ['TOTAL', '', '', brl(totalDebit), brl(totalCredit), brl(totalCredit - totalDebit)].join(CSV),
    );
  }

  lines.push('');
  lines.push(`# TOTAL_DEBITO=${brl(totalDebit)}`);
  lines.push(`# TOTAL_CREDITO=${brl(totalCredit)}`);

  const content = lines.join('\r\n');
  const bytes = Buffer.byteLength(content, 'utf8');

  if (bytes > 2_000_000) {
    throw new DomainError(
      'EXPORT_TOO_LARGE',
      'A exportação ultrapassa 2 MB. Reduza o período e gere em lotes.',
      413,
      { bytes },
    );
  }

  return {
    content,
    layoutVersion: layout.layoutVersion,
    sourceDescription: layout.sourceDescription,
    dataUrl: toDataUrl(content),
    bytes,
  };
}

/** Decodifica arquivo persistido — usado pela rota de download. */
export function decodeDataUrl(fileUrl: string): { content: string; mime: string } | null {
  const match = /^data:([^;,]+)(;charset=[^;,]+)?;base64,(.+)$/.exec(fileUrl);
  if (!match) return null;
  return { mime: match[1], content: Buffer.from(match[3], 'base64').toString('utf8') };
}
