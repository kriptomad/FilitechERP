// src/server/db.ts — Cap. 3.4 / 7.2
// Cliente Prisma singleton, seguro para serverless (Vercel).
//
// Por que singleton: em serverless cada invocação pode criar um novo módulo,
// e o Prisma abre um pool de conexões por instância. Sem o cache global o
// Neon recebe dezenas de pools e esgota os slots de conexão (max_connections).
import { PrismaClient } from '@prisma/client';

// Em dev (hot reload) o Next.js recarrega o módulo a cada alteração e
// criaria um pool novo por reload sem este cache.
const globalForPrisma = globalThis as unknown as {
  prismaUnscoped?: PrismaClient;
};

export const prismaUnscoped: PrismaClient =
  globalForPrisma.prismaUnscoped ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prismaUnscoped = prismaUnscoped;
}