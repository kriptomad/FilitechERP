// src/server/totp-secret.ts — Cap. 14.2
//
// Cofre do segredo TOTP.
//
// A coluna se chama `totpSecretEncrypted` mas até agora gravava apenas
// `base64(secret)` — ou seja, quem conseguisse o dump do banco (vazamento de
// credencial de backup, SQL injection, snapshot de desenvolvimento) reconstituía
// imediatamente o segundo fator de todas as contas, que é exatamente o que o
// 2FA existe para proteger. O próprio `apps/api` deixava o TODO:
// "Em produção: criptografar com chave dedicada".
//
// Aqui é AES-256-GCM autenticado:
//   • IV de 96 bits aleatório por registro (mesmo segredo não cifrado duas vezes igual);
//   • auth tag impede adulteração silenciosa (o GCM falha na abertura);
//   • o formato `v1:` carrega a versão, permitindo trocar o algoritmo depois
//     sem adivinhar o que está no banco.
//
// A chave vem de `TOTP_ENCRYPTION_KEY` (32 bytes em hex ou base64). Se não
// estiver definida, deriva de `JWT_PRIVATE_KEY` via HKDF-SHA256 — a chave JWT é
// obrigatória no ambiente e é um material forte, então NUNCA caímos em
// "sem chave ⇒ grava em claro" silenciosamente.
import {
  createDecipheriv,
  createCipheriv,
  hkdfSync,
  randomBytes,
} from 'node:crypto';

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

let cachedKey: Buffer | null = null;

function encryptionKey(): Buffer {
  if (cachedKey) return cachedKey;

  const explicit = process.env.TOTP_ENCRYPTION_KEY?.trim();

  if (explicit) {
    if (/^[0-9a-fA-F]{64}$/.test(explicit)) {
      cachedKey = Buffer.from(explicit, 'hex');
      return cachedKey;
    }
    const decoded = Buffer.from(explicit, 'base64');
    if (decoded.length === KEY_LENGTH) {
      cachedKey = decoded;
      return cachedKey;
    }
    throw new Error(
      '[totp] TOTP_ENCRYPTION_KEY deve ter 32 bytes — 64 caracteres hex ou base64 de 44 chars. ' +
        'Gere com: openssl rand -hex 32',
    );
  }

  const material = process.env.JWT_PRIVATE_KEY ?? '';
  if (!material) {
    // Falhar é deliberado: gravar em claro só para não derrubar o login seria
    // trocar segurança por conveniência sem avisar ninguém.
    throw new Error(
      '[totp] Defina TOTP_ENCRYPTION_KEY (recomendado) ou JWT_PRIVATE_KEY — ' +
        'sem nenhuma das duas não há como cifrar o segredo TOTP.',
    );
  }

  cachedKey = Buffer.from(
    hkdfSync(
      'sha256',
      Buffer.from(material, 'utf8'),
      Buffer.from('filitech-erp-totp-v1'),
      Buffer.from('totp-secret'),
      KEY_LENGTH,
    ),
  );
  return cachedKey;
}

/** Cifra o segredo bruto para gravação. */
export function sealTotpSecret(secret: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString('base64'),
    tag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

/** `true` quando o valor ainda está no formato legado (base64 puro, sem cifra). */
export function isLegacyTotpSecret(stored: string): boolean {
  return !stored.startsWith(`${VERSION}:`);
}

/**
 * Abre o segredo para verificação do TOTP.
 * Aceita o formato `v1:` e o legado base64, para não invalidar contas que já
 * ativaram o 2FA antes desta correção (a próxima gravação já sai cifrada).
 */
export function openTotpSecret(stored: string): string {
  if (isLegacyTotpSecret(stored)) {
    return Buffer.from(stored, 'base64').toString('utf8');
  }

  const [version, ivB64, tagB64, ctB64] = stored.split(':');
  if (version !== VERSION || !ivB64 || !tagB64 || !ctB64) {
    throw new Error('[totp] Formato do segredo TOTP irreconhecível.');
  }

  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
