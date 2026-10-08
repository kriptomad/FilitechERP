// src/module-codes.ts — P0 (Review R10): vocabulário ÚNICO de moduleCode.
// Fonte única de verdade para API, schema (Module.code), seed e frontend.
// Formato: kebab-case (compatível com o schema Prisma e o gatekeeper).

export const MODULE_CODES = {
  // Módulos base (inclusos nos planos)
  PDV: "pdv",
  ESTOQUE: "estoque",
  FINANCEIRO: "financeiro",
  CRM: "crm",
  // Add-ons de billing (Cap. 2.3)
  FISCAL: "fiscal",
  WHATSAPP: "whatsapp",
  MULTI_FILIAL: "multi-filial",
  WORK_ORDER: "work-order",
  LIQUOR_LEDGER: "liquor-ledger",
  RECIPE_BOM: "recipe-bom",
  PHARMACY_SNGPC: "pharmacy-sngpc",
  // Expansão Cap. 12
  RESTAURANT_POS: "restaurant-pos",
  PETSHOP: "petshop",
  BEAUTY_SALON: "beauty-salon",
  AUTOMOTIVE: "automotive",
  OPTICAL: "optical",
  FASHION_GRID: "fashion-grid",
  STATIONERY_SEASONAL: "stationery-seasonal",
  CONSTRUCTION_FRACTIONAL: "construction-fractional",
} as const;

export type ModuleCode = (typeof MODULE_CODES)[keyof typeof MODULE_CODES];

export function isModuleCode(value: string): value is ModuleCode {
  return Object.values(MODULE_CODES).includes(value as ModuleCode);
}
