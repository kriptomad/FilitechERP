// src/server/two-factor.ts — Cap. 14.2
//
// Utilitários do segundo fator.
//
// Códigos de backup ficam no banco apenas como HASH. São 10 valores de uso
// único que funcionam como "chave reserva" da conta: guardá-los em claro seria
// entregar a chave reserva junto com o cadeado a quem obtiver o dump.
//
// SHA-256 aqui é deliberado e NÃO é o mesmo motivo do argon2 da senha (Cap.
// 3.5): a senha tem entropia baixa e sofre ataque de dicionário offline; o
// código de backup tem ~50 bits de entropia gerados por CSPRNG, não há
// dicionário a percorrer, e a comparação precisa ser rápida porque acontece
// durante o login. O prefixo de domínio evita que o mesmo valor servindo de
// senha e de código produza o mesmo hash.
import { createHash } from 'node:crypto';

export function backupCodeHash(code: string): string {
  const normalized = code.trim().toUpperCase().replace(/[\s-]/g, '');
  return createHash('sha256').update(`2fa-backup:${normalized}`).digest('hex');
}

/**
 * Formata um código de backup no padrão `XXXXX-XXXXX` para exibição.
 * Só de apresentação — a validação normaliza removendo hífen e espaço.
 */
export function formatBackupCode(raw: string): string {
  const compact = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (compact.length <= 5) return compact;
  return `${compact.slice(0, 5)}-${compact.slice(5, 10)}`;
}
