// src/server/session.ts — Cap. 9.2 / 3.5
//
// Sessão em cookie HTTP-only `filitech.session`. O motivo de migrar de
// localStorage → cookie: o token em localStorage é legível por qualquer XSS e
// não sobrevive a um refresh em outro dispositivo. O cookie HttpOnly é
// invisível ao JavaScript e o navegador o envia sozinho (credentials: 'include').
//
// Bearer continua aceito para clientes não-cookie (EventSource/SSE do Cap. 8.2,
// que não permite headers).
import type { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { signSessionToken, verifySessionToken, type SessionClaims } from './jwt';
import { DomainError } from './api-envelope';

export const SESSION_COOKIE = 'filitech.session';
const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8h — mesma expiração do token (Cap. 3.5)

function isSecure(): boolean {
  // `secure: true` em http://localhost faz o browser descartar o cookie, o que
  // quebra o dev local. Só exigimos secure quando realmente é HTTPS.
  return process.env.NODE_ENV === 'production';
}

export async function createSession(
  claims: Omit<SessionClaims, 'sessionId'>,
): Promise<{ accessToken: string; session: SessionClaims }> {
  const sessionId = randomUUID();
  const accessToken = await signSessionToken({ ...claims, sessionId });
  return { accessToken, session: { ...claims, sessionId } };
}

export function attachSessionCookie(response: NextResponse, accessToken: string): NextResponse {
  response.cookies.set(SESSION_COOKIE, accessToken, {
    httpOnly: true,
    secure: isSecure(),
    sameSite: 'lax',
    maxAge: SESSION_TTL_SECONDS,
    path: '/',
  });
  return response;
}

export function clearSessionCookie(response: NextResponse): NextResponse {
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: isSecure(),
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
  return response;
}

/** Lê a sessão do request (cookie ou Bearer). Retorna null se ausente/inválida. */
export async function readSession(request: RequestLike): Promise<SessionClaims | null> {
  const header = request.headers.get('authorization');
  if (header?.startsWith('Bearer ')) {
    try {
      return await verifySessionToken(header.slice(7));
    } catch {
      return null;
    }
  }

  // EventSource (SSE, Cap. 8.2) não envia headers — aceita ?token=.
  const queryToken = readQueryToken(request);
  if (queryToken) {
    try {
      return await verifySessionToken(queryToken);
    } catch {
      return null;
    }
  }

  const cookieToken = readCookie(request, SESSION_COOKIE);
  if (cookieToken) {
    try {
      return await verifySessionToken(cookieToken);
    } catch {
      return null;
    }
  }

  return null;
}

/** Igual a readSession, mas lança 401 — para handlers obrigatoriamente autenticados. */
export async function requireSession(request: RequestLike): Promise<SessionClaims> {
  const session = await readSession(request);
  if (!session) {
    throw new DomainError('UNAUTHENTICATED', 'Sessão ausente ou expirada.', 401);
  }
  return session;
}

/** Superfície mínima de Request/NextRequest usada pela leitura de sessão. */
export interface RequestLike {
  headers: Headers;
  url?: string;
  cookies?: { get(name: string): { value: string } | undefined };
}

function readQueryToken(request: RequestLike): string | null {
  const url = request.url;
  if (typeof url !== 'string') return null;
  try {
    return new URL(url, 'http://localhost').searchParams.get('token');
  } catch {
    return null;
  }
}

function readCookie(request: RequestLike, name: string): string | undefined {
  // NextRequest expõe `cookies` já parseado — preferível ao header cru.
  const fromNext = request.cookies?.get(name)?.value;
  if (fromNext) return fromNext;

  const header = request.headers.get('cookie');
  if (!header) return undefined;

  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}