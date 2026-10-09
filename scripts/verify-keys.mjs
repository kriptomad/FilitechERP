// Valida que as chaves RS256 do .env são PEM válidos em base64.
// Uso: node scripts/verify-keys.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const env = readFileSync(join(root, '.env'), 'utf8');

function extract(name) {
  const match = env.match(new RegExp(`${name}="([^"]+)"`));
  return match?.[1] ?? null;
}

const privateKey = extract('JWT_PRIVATE_KEY');
const publicKey = extract('JWT_PUBLIC_KEY');

let failed = false;

for (const [name, value, marker] of [
  ['JWT_PRIVATE_KEY', privateKey, 'BEGIN PRIVATE KEY'],
  ['JWT_PUBLIC_KEY', publicKey, 'BEGIN PUBLIC KEY'],
]) {
  if (!value) {
    console.error(`✗ ${name} ausente no .env`);
    failed = true;
    continue;
  }

  const decoded = Buffer.from(value, 'base64').toString('utf8');

  if (!decoded.includes(marker)) {
    console.error(`✗ ${name}: o base64 decodifica mas não contém "${marker}"`);
    failed = true;
    continue;
  }

  // Import real: prova que a chave serve para assinar/verificar de fato.
  const { createPrivateKey, createPublicKey } = await import('node:crypto');

  try {
    if (name === 'JWT_PRIVATE_KEY') {
      createPrivateKey(decoded);
    } else {
      createPublicKey(decoded);
    }
    console.log(`✓ ${name}: PEM válido (${value.length} chars base64)`);
  } catch (err) {
    console.error(`✗ ${name}: PEM inválido — ${err.message}`);
    failed = true;
  }
}

process.exit(failed ? 1 : 0);