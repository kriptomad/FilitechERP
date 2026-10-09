// src/app/api/auth/logout/route.ts — Cap. 9.2
// POST /api/auth/logout — encerra a sessão limpando o cookie HTTP-only.
import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/server/session';

export const dynamic = 'force-dynamic';

export async function POST() {
  const response = NextResponse.json({
    success: true,
    data: { message: 'Sessão encerrada.' },
    error: null,
  });

  return clearSessionCookie(response);
}