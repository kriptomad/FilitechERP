// src/auth/role-permissions.ts — Correção P0 (Review R4)
// Matriz padrão de permissões por Role (Cap. 5 — "matriz padrão por Role"),
// com overrides finos por usuário via `RolePermission` (userId + granted).
// O gatekeeper consulta PRIMEIRO o override do usuário, DEPOIS a matriz padrão.

export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  OWNER: [
    "*",
  ],
  MANAGER: [
    "pdv:sell",
    "pdv:close-register",
    "pdv:approve-discount",
    "estoque:read",
    "estoque:adjust",
    "estoque:purchase",
    "financeiro:read",
    "financeiro:pay",
    "crm:read",
    "crm:write",
    "work-order:create",
    "work-order:budget",
    "work-order:deliver",
    "work-order:assign",
    "fiscal:emit",
    "report:read",
    "billing:manage",
  ],
  TECHNICIAN: [
    "pdv:sell",
    "estoque:read",
    "crm:read",
    "work-order:create",
    "work-order:budget",
    "work-order:update",
    "report:read",
  ],
  CASHIER: [
    "pdv:sell",
    "pdv:close-register",
    "estoque:read",
    "crm:read",
    "crm:write",
  ],
};

export function roleHasPermission(
  role: string,
  permission: string,
  userOverrides?: { permission: string; granted: boolean }[],
): boolean {
  // 1. Override explícito do usuário tem precedência (positivo ou negativo).
  const override = userOverrides?.find((o) => o.permission === permission);
  if (override) return override.granted;

  // 2. Matriz padrão do papel.
  const defaults = DEFAULT_ROLE_PERMISSIONS[role] ?? [];
  if (defaults.includes("*")) return true;
  return defaults.includes(permission);
}
