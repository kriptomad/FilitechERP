// src/lib/nfe-xml-parser.ts — Cap. 6.5 — parser de XML de NF-e (entrada)
// Sem dependência externa: extração via regex dos nós de <infNFe>.
// Cobre NF-e 4.0 (procNFe com <protNFe> ou NF-e "crua").
import { ZodError, z } from "zod";

export class NfeXmlParseError extends Error {}

export interface ParsedNfeLine {
  eanCode: string;
  description: string;
  quantity: number;
  unitValue: number;
  totalValue: number;
  batchNumber?: string;
  expirationDate?: Date;
}

export interface ParsedNfe {
  accessKey: string;
  supplierCnpj: string;
  supplierName: string;
  totalValue: number;
  dueDate?: Date;
  items: ParsedNfeLine[];
}

const NfeSchema = z.object({
  accessKey: z.string().length(44),
  supplierCnpj: z.string().min(14),
  supplierName: z.string().min(1),
  totalValue: z.number().nonnegative(),
  items: z
    .array(
      z.object({
        eanCode: z.string(),
        description: z.string(),
        quantity: z.number().positive(),
        unitValue: z.number().nonnegative(),
        totalValue: z.number().nonnegative(),
        batchNumber: z.string().optional(),
        expirationDate: z.date().optional(),
      }),
    )
    .min(1),
});

function tagContent(xml: string, tag: string): string | undefined {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`));
  return match?.[1]?.trim() || undefined;
}

function parseBrNumber(value: string | undefined): number {
  if (!value) return 0;
  return Number(value.replace(/\./g, "").replace(",", "."));
}

function toIsoDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  // Formato NFe: AAAA-MM-DD
  const iso = value.slice(0, 10);
  const date = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Extrai chave de acesso de 44 dígitos (Id="NFe..." ou <chNFe>). */
function extractAccessKey(xml: string): string {
  const fromId = xml.match(/Id="NFe(\d{44})"/)?.[1];
  if (fromId) return fromId;
  const fromChave = xml.match(/<chNFe>\s*(\d{44})\s*<\/chNFe>/)?.[1];
  if (fromChave) return fromChave;
  const anywhere = xml.match(/\b(\d{44})\b/)?.[1];
  if (anywhere) return anywhere;
  throw new NfeXmlParseError(
    "Chave de acesso de 44 dígitos não encontrada no XML da NF-e.",
  );
}

/** Validação defensiva (Zod) do resultado estruturado. */
function validateParsed(parsed: unknown): ParsedNfe {
  try {
    return NfeSchema.parse(parsed) as ParsedNfe;
  } catch (err) {
    if (err instanceof ZodError) {
      throw new NfeXmlParseError(
        `XML de NF-e estruturalmente inválido: ${err.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ")}`,
      );
    }
    throw err;
  }
}

export function parseNfeXml(xmlBuffer: Buffer): ParsedNfe {
  const xml = xmlBuffer.toString("utf-8");

  if (!xml.includes("infNFe")) {
    throw new NfeXmlParseError("O arquivo não contém uma NF-e válida (<infNFe> ausente).");
  }

  const accessKey = extractAccessKey(xml);
  const supplierCnpj = tagContent(xml, "CNPJ") ?? "";
  const supplierName = tagContent(xml, "xNome") ?? "Fornecedor não identificado";
  const totalValue = parseBrNumber(tagContent(xml, "vNF"));

  // Itens: recorta cada <det nItem=...>...</det>
  const detMatches = xml.match(/<det\s+nItem="\d+"[\s\S]*?<\/det>/g) ?? [];
  if (detMatches.length === 0) {
    throw new NfeXmlParseError("NF-e sem itens (<det>) — XML incompleto.");
  }

  const items: ParsedNfeLine[] = detMatches.map((det) => {
    const eanRaw = tagContent(det, "cEAN");
    const eanCode =
      eanRaw && eanRaw !== "SEM GTIN" && eanRaw !== "0000000000000"
        ? eanRaw
        : tagContent(det, "cProd") ?? "";

    const quantity = parseBrNumber(tagContent(det, "qCom"));
    const unitValue = parseBrNumber(tagContent(det, "vUnCom"));
    const totalValueLine = parseBrNumber(tagContent(det, "vProd"));

    // Rastreabilidade (lote/validade) quando presente em <rastro>
    const batchNumber = tagContent(det, "nLote");
    const expirationDate = toIsoDate(tagContent(det, "valLote"));

    return {
      eanCode,
      description: tagContent(det, "xProd") ?? "Item sem descrição",
      quantity: quantity > 0 ? quantity : 1,
      unitValue,
      totalValue: totalValueLine,
      batchNumber,
      expirationDate,
    };
  });

  return validateParsed({
    accessKey,
    supplierCnpj,
    supplierName,
    totalValue,
    items,
  });
}
