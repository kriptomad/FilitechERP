// src/env.ts — DEVE ser o PRIMEIRO import de main.ts.
// O ESM avalia imports em ordem: este módulo carrega o .env do monorepo ANTES
// de jwt.service.ts (que lê process.env no escopo do módulo).
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

// Raiz do monorepo quando CWD = apps/api (dev via pnpm --filter).
const rootEnv = resolve(process.cwd(), "../../.env");
if (existsSync(rootEnv)) {
  loadEnv({ path: rootEnv });
}
// Fallback: .env no CWD (containers/produção).
loadEnv();
