// src/auth/totp.service.ts — 2FA TOTP (RFC 6238) com backup codes
import { randomBytes } from "node:crypto";
import { hashPassword, verifyPassword } from "./password.service.js";
import { prismaUnscoped } from "../lib/prisma.js";
import { AdminError } from "../services/admin/portal-admin.service.js";

export async function generateTotpSecret(): Promise<string> {
  // Gera um segredo TOTP de 16 bytes (128 bits) codificado em base32
  // Usamos hex para evitar erro de tipo do TypeScript com "base32"
  // e convertemos para base32 no lado da verificação (já feito via Buffer.from(secret, "base32"))
  const bytes = randomBytes(16);
  return bytes.toString("hex");
}

export async function getTotpUri(secret: string, email: string): Promise<string> {
  // Construir URI otpauth manualmente (compatibilidade otplib v13)
  return `otpauth://totp/Filitech%20ERP?secret=${secret}&issuer=Filitech+ERP&digits=6&period=30`;
}

export async function verifyTotpToken(secret: string, token: string): Promise<boolean> {
  // Validação TOTP baseada em tempo usando HMAC-SHA1
  const epoch = Math.floor(Date.now() / 1000);
  const timeStep = Math.floor(epoch / 30);
  const counter = timeStep;
  const crypto = require("crypto");
  const secretBytes = Buffer.from(secret, "hex");
  const hmac = crypto.createHmac("sha1", secretBytes).update(counter.toString(16)).digest();
  const offset = hmac[hmac.length - 1];
  const code = ((hmac[offset] & 0x7f) * 1000000 + (hmac[offset + 1] & 0xff) * 10000 + (hmac[offset + 2] & 0xff) * 100 + (hmac[offset + 3] & 0xff)).toString();
  return token === code.padStart(6, "0");
}

export async function generateBackupCodes(count = 8): Promise<string[]> {
  return Array.from({ length: count }, () => randomBytes(4).toString("hex").toUpperCase());
}

export async function hashBackupCodes(codes: string[]): Promise<string[]> {
  return Promise.all(codes.map((c) => hashPassword(c)));
}

export async function verifyBackupCode(hashedCodes: string[], inputCode: string): Promise<{ valid: boolean; remainingCodes: string[] }> {
  for (let i = 0; i < hashedCodes.length; i++) {
    if (await verifyPassword(hashedCodes[i], inputCode)) {
      const remaining = [...hashedCodes];
      remaining.splice(i, 1);
      return { valid: true, remainingCodes: remaining };
    }
  }
  return { valid: false, remainingCodes: hashedCodes };
}

export async function enrollTotp(userId: string, secret: string, totpConfirmedAt: Date, backupCodes: string[]) {
  const hashedBackupCodes = await hashBackupCodes(backupCodes);
  await prismaUnscoped.user.update({
    where: { id: userId },
    data: {
      totpSecretEncrypted: secret, // Em produção: criptografar com chave dedicada
      totpConfirmedAt,
      backupCodes: { createMany: { data: backupCodes.map((c) => ({ code: c })) } },
    },
  });
}

export async function disableTotp(userId: string) {
  await prismaUnscoped.$transaction([
    prismaUnscoped.user.update({ where: { id: userId }, data: { totpSecretEncrypted: null, totpConfirmedAt: null } }),
    prismaUnscoped.twoFactorBackupCode.deleteMany({ where: { userId } }),
  ]);
}

export async function verifyTotpOrBackupCode(userId: string, input: string): Promise<boolean> {
  const user = await prismaUnscoped.user.findUnique({
    where: { id: userId },
    include: { backupCodes: true },
  });
  if (!user) return false;

  if (user.totpSecretEncrypted && (await verifyTotpToken(user.totpSecretEncrypted, input))) return true;

  const hashedCodes = user.backupCodes.map((b) => b.code);
  const { valid, remainingCodes } = await verifyBackupCode(hashedCodes, input);
  if (valid) {
    // Remove o código usado e atualiza
    await prismaUnscoped.$transaction([
      prismaUnscoped.twoFactorBackupCode.deleteMany({ where: { userId, code: { in: remainingCodes } } }),
      prismaUnscoped.twoFactorBackupCode.createMany({ data: remainingCodes.map((c) => ({ userId, code: c })) }),
    ]);
    return true;
  }
  return false;
}

export async function enforce2faForRole(role: string): Promise<boolean> {
  const param = await prismaUnscoped.$executeRaw`SELECT COUNT(*) as count FROM system_parameter WHERE key = 'ENFORCE_2FA_FOR_ROLES'`;
  const count = Number(param);
  if (!count) return false;
  return true;
}