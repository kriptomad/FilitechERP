// vitest.config.ts — carrega o .env do monorepo antes dos testes de integração.
import { defineConfig } from "vitest/config";
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

// CWD = apps/api — .env vive na raiz do monorepo.
const rootEnv = resolve(process.cwd(), "../../.env");
if (existsSync(rootEnv)) {
  loadEnv({ path: rootEnv });
}

export default defineConfig({
  test: {
    include: ["tests/**/*.spec.ts", "src/**/*.spec.ts"],
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Testes de integração rodam sequencialmente — transações Serializable
    // concorrentes no mesmo Postgres podem serializar falsos negativos.
    fileParallelism: false,
  },
});
