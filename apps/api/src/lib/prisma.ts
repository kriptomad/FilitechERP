// src/lib/prisma.ts — Cap. 7.2
import { PrismaClient } from "@prisma/client";
import { createTenantScopedPrismaClient } from "./prisma-tenant-extension.js";

const basePrismaClient = new PrismaClient({ log: ["error", "warn"] });

// Cliente usado em todo o código de aplicação — já blindado.
export const prisma = createTenantScopedPrismaClient(basePrismaClient);

// Cliente "cru", reservado exclusivamente para jobs administrativos de plataforma.
export const prismaUnscoped = basePrismaClient;
