// src/server/password.ts — Cap. 3.5
// argon2id com os parâmetros da arquitetura. Módulo nativo: por isso o
// next.config.js declara `serverExternalPackages: ['argon2']` para o Next não
// tentar bundlará-lo (quebraria o build da function).
import argon2 from 'argon2';

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(plainPassword: string): Promise<string> {
  return argon2.hash(plainPassword, ARGON2_OPTIONS);
}

export async function verifyPassword(
  hash: string,
  plainPassword: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, plainPassword);
  } catch {
    // Hash corrompido/expirado: tratar como credencial inválida, nunca como 500.
    return false;
  }
}

/** Senha provisória de convite (Cap. 14) — forte o bastante, semvusuário final. */
export function generateTemporaryPassword(): string {
  return `Filia${Math.random().toString(36).slice(2, 10).toUpperCase()}!`;
}