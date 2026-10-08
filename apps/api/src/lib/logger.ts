// src/lib/logger.ts — Cap. 10.1
import pino from "pino";

const SENSITIVE_PATHS = [
  "*.password",
  "*.cpf",
  "*.cnpj",
  "*.cardNumber",
  "*.cvv",
  "req.headers.authorization",
  "req.headers.cookie",
  "*.patientDocument",
];

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: { paths: SENSITIVE_PATHS, censor: "[REDACTED]" },
  formatters: {
    level: (label) => ({ level: label }),
  },
  base: { service: "filitech-api", env: process.env.NODE_ENV },
});
