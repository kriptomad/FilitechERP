// src/server/jwt.ts — Cap. 3.5
//
// Diferença crítica em relação ao `apps/api/src/auth/jwt.service.ts`: lá as
// chaves RS256 são lidas do DISCO (`readFileSync`). Isso quebra em serverless
// (a imagem da função é read-only e o .gitignore nunca versionou `keys/*.pem`).
// Aqui as chaves vêm de variáveis de ambiente em base64 ou PEM puro.
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

const ISSUER = 'filitech-erp';
const ALGORITHM = 'RS256';

/** Aceita PEM cru ou base64 (com/sem prefixo data URI). */
function toPem(raw: string): string {
  const value = raw.trim();
  if (value.includes('-----BEGIN')) return value.replace(/\\n/g, '\n');

  const decoded = Buffer.from(value, 'base64').toString('utf8');
  if (!decoded.includes('-----BEGIN')) {
    throw new Error(
      '[jwt] JWT_PRIVATE_KEY/JWT_PUBLIC_KEY não é um PEM válido nem base64 de um PEM. ' +
        'Gere com: openssl genrsa -out private.key 2048 && openssl rsa -in private.key -pubout -out public.key',
    );
  }
  return decoded;
}

function privateKey(): Uint8Array {
  return new TextEncoder().encode(toPem(process.env.JWT_PRIVATE_KEY ?? ''));
}

function publicKey(): Uint8Array {
  return new TextEncoder().encode(toPem(process.env.JWT_PUBLIC_KEY ?? ''));
}

export interface SessionClaims {
  userId: string;
  tenantId: string;
  role: string;
  sessionId: string;
}

/**
 * Desafio de 2FA (Cap. 14.2) — token de 5 minutos que prova "a senha já foi
 * validada" SEM ser uma sessão.
 *
 * Por que não emitir a sessão direto e verificar depois: uma sessão emitida
 * antes do segundo fator é uma sessão completa — qualquer endpoint a aceitaria.
 * O desafio carrega `purpose: '2fa'` e o `verifySessionToken` normal o recusa.
 */
export interface ChallengeClaims {
  userId: string;
  purpose: '2fa';
}

const CHALLENGE_TTL_SECONDS = 5 * 60;

export async function signChallengeToken(userId: string): Promise<string> {
  return new SignJWT({ userId, purpose: '2fa' })
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${CHALLENGE_TTL_SECONDS}s`)
    .sign(privateKey());
}

/** Valida o desafio. Lança se expirado, adulterado ou não for um desafio. */
export async function verifyChallengeToken(token: string): Promise<string> {
  const { payload } = await jwtVerify(token, publicKey(), {
    algorithms: [ALGORITHM],
    issuer: ISSUER,
  });
  if (payload.purpose !== '2fa') {
    throw new Error('Token não é um desafio de 2FA.');
  }
  if (typeof payload.userId !== 'string') {
    throw new Error('Desafio de 2FA sem userId.');
  }
  return payload.userId;
}

export async function signSessionToken(
  claims: SessionClaims,
  expiresInSeconds = 60 * 60 * 8,
): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${expiresInSeconds}s`)
    .sign(privateKey());
}

export async function verifySessionToken(token: string): Promise<SessionClaims> {
  const { payload } = await jwtVerify(token, publicKey(), {
    algorithms: [ALGORITHM],
    issuer: ISSUER,
  });
  return toClaims(payload);
}

function toClaims(payload: JWTPayload): SessionClaims {
  // Um token de desafio 2FA NUNCA vale como sessão: ele só tem userId e
  // purpose, então as claims obrigatórias falhariam de qualquer forma — mas a
  // checagem explícita torna a intenção impossível de burlar por acidente.
  if (payload.purpose === '2fa') {
    throw new Error('Token de desafio 2FA não é uma sessão válida.');
  }
  const { userId, tenantId, role, sessionId } = payload as Record<string, unknown>;
  if (typeof userId !== 'string' || typeof tenantId !== 'string') {
    throw new Error('Token sem claims obrigatórias.');
  }
  return {
    userId,
    tenantId,
    role: typeof role === 'string' ? role : 'CASHIER',
    sessionId: typeof sessionId === 'string' ? sessionId : '',
  };
}