// scripts/wrap-handlers.mjs
//
// Aplica `handle(...)` nos Route Handlers que lançam DomainError sem converter.
//
// Uso: node scripts/wrap-handlers.mjs
//
// Idempotente: rotas já envolvidas são puladas.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const apiRoot = join(root, 'apps', 'web-landing', 'src', 'app', 'api');

/** Percorre recursivamente todo route.ts. */
function findRouteFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...findRouteFiles(full));
    } else if (entry === 'route.ts') {
      found.push(full);
    }
  }
  return found;
}

const VERBS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS', 'HEAD'];

let changedFiles = 0;
let wrapped = 0;
let skipped = 0;

for (const file of findRouteFiles(apiRoot)) {
  let source = readFileSync(file, 'utf8');
  const original = source;

  // Precisa importar o helper?
  const needsImport = !source.includes("from '@/server/handler'");
  const throwsDomainError = source.includes('new DomainError(') || source.includes('requireSession(');

  if (!throwsDomainError) {
    skipped++;
    continue;
  }

  let touched = false;

  for (const verb of VERBS) {
    // Captura a assinatura completa do handler, com quebras de linha.
    const pattern = new RegExp(
      `export\\s+(?:async\\s+)?function\\s+${verb}\\s*\\([^)]*\\)\\s*(?::\\s*Promise<[^>]*>)?\\s*\\{`,
      'g',
    );

    source = source.replace(pattern, (match) => {
      if (match.includes('handle(')) return match;
      touched = true;
      wrapped++;
      // `export async function GET(...)` → `export const GET = handle(async (...)`
      return match
        .replace(/export\s+async\s+function/, 'export const')
        .replace(/_(\w+)\s*(?::\s*[^)]*)?\)\s*(?::\s*Promise<[^>]*>)?\s*\{/, '= handle(async ($1) => {');
    });
  }

  if (!touched) {
    skipped++;
    continue;
  }

  // Fecha o wrapper: a chave de fechamento do handler vira `});`
  // Feito por contagem de profundidade para não quebrar handlers com blocos
  // aninhados (if/for/try).
  source = closeWrappedFunctions(source);

  if (needsImport) {
    // Insere o import depois do último import existente.
    const importRe = /^import[\s\S]*?from\s+'[^']+';$/gm;
    let lastEnd = 0;
    let m;
    while ((m = importRe.exec(source)) !== null) {
      lastEnd = m.index + m[0].length;
    }
    if (lastEnd > 0) {
      source =
        source.slice(0, lastEnd) +
        "\nimport { handle } from '@/server/handler';" +
        source.slice(lastEnd);
    }
  }

  if (source !== original) {
    writeFileSync(file, source, 'utf8');
    changedFiles++;
  }
}

console.log(`${wrapped} handlers envolvidos em ${changedFiles} arquivos (${skipped} sem DomainError)`);

/**
 * Encontra o fechamento correto de cada `= handle(async (...) => {` inserido.
 * Percorre contando chaves, ignorando strings e comentários.
 */
function closeWrappedFunctions(code) {
  const marker = '= handle(async (';
  let result = '';
  let index = 0;

  while (true) {
    const at = code.indexOf(marker, index);
    if (at === -1) {
      result += code.slice(index);
      break;
    }

    const openBrace = code.indexOf('{', at);
    let depth = 0;
    let cursor = openBrace;

    // Varredura com noção de string/template/comentário para não contar
    // chaves que estão dentro de literais.
    while (cursor < code.length) {
      const ch = code[cursor];
      const next = code[cursor + 1];

      if (ch === '/' && next === '/') {
        cursor = code.indexOf('\n', cursor);
        if (cursor === -1) break;
        continue;
      }
      if (ch === '/' && next === '*') {
        cursor = code.indexOf('*/', cursor) + 2;
        continue;
      }
      if (ch === "'" || ch === '"' || ch === '`') {
        cursor = skipString(code, cursor, ch);
        continue;
      }
      if (ch === '{') depth++;
      if (ch === '}') {
        depth--;
        if (depth === 0) break;
      }
      cursor++;
    }

    // cursor está na chave de fechamento do handler → substitui por `});`
    result += code.slice(index, cursor) + '});';
    index = cursor + 1;
  }

  return result;
}

function skipString(code, start, quote) {
  let i = start + 1;
  while (i < code.length) {
    if (code[i] === '\\') {
      i += 2;
      continue;
    }
    if (code[i] === quote) return i + 1;
    i++;
  }
  return i;
}