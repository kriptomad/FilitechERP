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