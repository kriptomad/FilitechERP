// src/server/request.ts — leitura e validação do body das rotas.
// Sem isso, cada handler repetiria o mesmo `await request.json()` sem
// tratamento — e JSON malformado estouraria como 500 em vez de 400.
import { DomainError } from './api-envelope';

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new DomainError('INVALID_JSON', 'Corpo da requisição inválido.', 400);
  }
}

export function requireString(
  value: unknown,
  field: string,
  { min = 1, max = 255 }: { min?: number; max?: number } = {},
): string {
  if (typeof value !== 'string' || value.trim().length < min) {
    throw new DomainError(
      'VALIDATION_ERROR',
      `Campo "${field}" é obrigatório.`,
      400,
      { field },
    );
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    throw new DomainError(
      'VALIDATION_ERROR',
      `Campo "${field}" deve ter no máximo ${max} caracteres.`,
      400,
      { field },
    );
  }
  return trimmed;
}

export function optionalString(
  value: unknown,
  field: string,
  max = 255,
): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') {
    throw new DomainError('VALIDATION_ERROR', `Campo "${field}" inválido.`, 400, { field });
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    throw new DomainError(
      'VALIDATION_ERROR',
      `Campo "${field}" deve ter no máximo ${max} caracteres.`,
      400,
      { field },
    );
  }
  return trimmed || undefined;
}

export function requireEmail(value: unknown): string {
  const email = requireString(value, 'email', { max: 180 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new DomainError('VALIDATION_ERROR', 'E-mail inválido.', 400, { field: 'email' });
  }
  return email;
}

export function requireNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new DomainError('VALIDATION_ERROR', `Campo "${field}" deve ser numérico.`, 400, {
      field,
    });
  }
  return value;
}

export function requireStringArray(value: unknown, field: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new DomainError('VALIDATION_ERROR', `Campo "${field}" deve ser lista.`, 400, { field });
  }
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

/** Slug único a partir do nome fantasia (Cap. 1.2.1). */
export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}