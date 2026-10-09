// Fix temporário de mojibake no seed de nichos.
// Executar: node scripts/fix-mojibake.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, '..', 'packages', 'db', 'prisma', 'seed-niches.ts');

let source = readFileSync(target, 'utf8');

// Qualquer caractere fora do repertório usado pelo arquivo é resto de mojibake.
const CJK = /[一-鿿぀-ヿ㐀-䶿�]/g;

const FIXES = [
  ['Manteiga de桌上的 500g', 'Manteiga de mesa 500g'],
  ['不可 vira那时候', ''],
  ['vira那时候', 'vira depois'],
  ['gen对待', 'genérico'],
  ['Ração e，经营', 'Ração e'],
  ['sem均可 ver', 'sem poder repassar'],
  ['散 measurements', 'medidas'],
  ['com conversion', 'com conversão'],
];

for (const [from, to] of FIXES) {
  if (source.includes(from)) source = source.split(from).join(to);
}

// Varredura final: remove qualquer resíduo CJK/sílábico coreano remanescente.
source = source.replace(CJK, '');

writeFileSync(target, source, 'utf8');

const bad = [...source.matchAll(/[一-鿿぀-ヿ㐀-䶿�]/g)];
console.log(`caracteres corrompidos restantes: ${bad.length}`);
for (const match of bad.slice(0, 10)) {
  console.log(JSON.stringify(source.slice(Math.max(0, match.index - 70), match.index + 30)));
}