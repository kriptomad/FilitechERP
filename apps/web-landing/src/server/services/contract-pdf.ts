// src/server/services/contract-pdf.ts — Cap. 11.18
//
// Geração do PDF do contrato.
//
// A versão anterior devolvia `https://filitecherp.vercel.app/api/contracts/{id}/
// download.pdf` — uma URL para uma rota que NUNCA EXISTIU. O painel abria uma
// aba e levava a um 404.
//
// Aqui o documento é renderizado de verdade com uma biblioteca que roda em
// serverless (sem binário externo), e devolvido como bytes. Nenhuma dependência
// de storage externo para a assinatura do contrato funcionar.
import type { ContractDetail } from './contracts';

/** Quebra linha de forma que caiba na largura útil, respeitando palavras. */
function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (current.length + word.length + 1 <= maxChars) {
      current = current ? `${current} ${word}` : word;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

const PAGE_WIDTH = 595.28; // A4 em pontos
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const LINE_HEIGHT = 15;

/**
 * Renderiza o contrato em um PDF mínimo e válido.
 *
 * Implementação própria (PDF 1.4, um objeto de conteúdo por página) em vez de
 * depender de uma lib com fonte embutida: o formato de que precisamos cabe em
 * texto puro, e isso mantém a function pequena e sem dependência nativa.
 */
export function renderContractPdf(contract: ContractDetail): Uint8Array {
  const pages: string[] = [];
  let content: string[] = [];
  let y = PAGE_HEIGHT - MARGIN;

  const newPage = () => {
    if (content.length > 0) pages.push(content.join('\n'));
    content = [];
    y = PAGE_HEIGHT - MARGIN;
  };

  const ensureSpace = (needed: number) => {
    if (y - needed < MARGIN) newPage();
  };

  const text = (value: string, size = 10, font: 'F1' | 'F2' = 'F1') => {
    ensureSpace(LINE_HEIGHT);
    content.push(
      `BT /${font} ${size} Tf 1 0 0 1 ${MARGIN.toFixed(2)} ${y.toFixed(2)} Tm (${escapePdf(value)}) Tj ET`,
    );
    y -= LINE_HEIGHT;
  };

  const gap = (amount = LINE_HEIGHT) => {
    y -= amount;
  };

  const rule = () => {
    ensureSpace(LINE_HEIGHT);
    content.push(
      `0.85 0.85 0.85 RG 0.8 w ${MARGIN.toFixed(2)} ${y.toFixed(2)} m ${(PAGE_WIDTH - MARGIN).toFixed(2)} ${y.toFixed(2)} l S`,
    );
    y -= LINE_HEIGHT;
  };

  // ── Cabeçalho ───────────────────────────────────────────────────────────
  text(contract.tenant.tradeName, 16, 'F2');
  text(`CNPJ ${contract.tenant.cnpj}`, 9);
  gap(LINE_HEIGHT);
  text('CONTRATO DE SERVIÇOS', 13, 'F2');
  text(`Número: ${contract.contractNumber}`, 10);
  rule();

  // ── Partes ──────────────────────────────────────────────────────────────
  text('CONTRATANTE', 10, 'F2');
  text(contract.client.name, 10);
  if (contract.client.document) text(`Documento: ${contract.client.document}`, 9);
  if (contract.client.email) text(`E-mail: ${contract.client.email}`, 9);
  if (contract.client.phone) text(`Telefone: ${contract.client.phone}`, 9);
  gap();

  text('CONTRATADA', 10, 'F2');
  text(contract.tenant.legalName, 10);
  text(`CNPJ ${contract.tenant.cnpj}`, 9);
  gap();

  // ── Objeto ──────────────────────────────────────────────────────────────
  text('OBJETO', 10, 'F2');
  for (const line of wrapText(contract.title, 92)) text(line, 10);
  if (contract.description) {
    gap();
    for (const line of wrapText(contract.description, 92)) text(line, 9);
  }
  gap();

  // ── Vigência ────────────────────────────────────────────────────────────
  text('VIGÊNCIA', 10, 'F2');
  text(`Início: ${formatDate(contract.startDate)}`, 9);
  if (contract.endDate) text(`Término: ${formatDate(contract.endDate)}`, 9);
  gap();

  // ── Itens ───────────────────────────────────────────────────────────────
  text('ITENS', 10, 'F2');
  text('Descrição'.padEnd(52) + 'Qtd'.padStart(8) + 'Unitário'.padStart(14) + 'Total'.padStart(14), 9, 'F2');
  rule();

  for (const item of contract.items) {
    ensureSpace(LINE_HEIGHT * 2);
    const descriptionLines = wrapText(item.description, 50);
    text(descriptionLines[0] ?? '', 9);
    text(
      formatQuantity(item.quantity).padStart(8) +
        formatMoney(item.unitPrice).padStart(14) +
        formatMoney(item.totalPrice).padStart(14),
      9,
    );
    for (const extra of descriptionLines.slice(1)) text(extra, 9);
  }

  rule();
  text('TOTAL DO CONTRATO'.padEnd(60) + formatMoney(contract.totalAmount).padStart(14), 11, 'F2');
  gap(LINE_HEIGHT);

  // ── Assinaturas ─────────────────────────────────────────────────────────
  ensureSpace(90);
  text('ASSINATURAS', 10, 'F2');
  gap(LINE_HEIGHT * 2);
  const half = CONTENT_WIDTH / 2;
  content.push(
    `0.2 0.2 0.2 RG 0.6 w ${MARGIN.toFixed(2)} ${y.toFixed(2)} m ${(MARGIN + half - 10).toFixed(2)} ${y.toFixed(2)} l S ` +
      `${(MARGIN + half + 10).toFixed(2)} ${y.toFixed(2)} m ${(PAGE_WIDTH - MARGIN).toFixed(2)} ${y.toFixed(2)} l S`,
  );
  y -= LINE_HEIGHT;
  text('_________________________________          _________________________________', 8);
  text(padRightCentered('CONTRATADA', 33) + '  ' + 'CONTRATANTE', 8);

  if (pages.length === 0 || content.length > 0) pages.push(content.join('\n'));

  return buildPdf(pages);
}

function escapePdf(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

function formatMoney(value: number): string {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatQuantity(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function padRightCentered(value: string, width: number): string {
  const pad = Math.max(0, Math.floor((width - value.length) / 2));
  return ' '.repeat(pad) + value;
}

/** Monta a estrutura de objetos PDF a partir do conteúdo de cada página. */
function buildPdf(pages: string[]): Uint8Array {
  const objects: string[] = [];
  const pageCount = pages.length;

  // 1 = Catalog, 2 = Pages, 3 = F1, 4 = F2, depois pares (page, content).
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push(
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${5 + i * 2} 0 R`).join(' ')}] /Count ${pageCount} >>`,
  );
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');

  pages.forEach((content, index) => {
    const pageObj = 5 + index * 2;
    const contentObj = 6 + index * 2;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObj} 0 R >>`,
    );
    objects.push(
      `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
    );
  });

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];

  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefStart = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  return new Uint8Array(Buffer.from(pdf, 'latin1'));
}