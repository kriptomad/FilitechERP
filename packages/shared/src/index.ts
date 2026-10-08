// src/index.ts
export * from "./module-codes";
export * from "./api-envelope";

/** Formata valor BRL — usado em landing, PDV e faturas. */
export function formatBRL(value: number): string {
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}
