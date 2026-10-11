/**
 * Formatacao monetaria em Real brasileiro.
 *
 * `brl.ts` nao existia, mas cinco paginas do painel global importavam
 * `{ brl }` dele — o build do admin-panel nao passava. A implementacao segue o
 * mesmo contrato do `Intl.NumberFormat('pt-BR', { currency: 'BRL' })` usado no
 * restante do monorepo, devolvendo sempre string (a UI concatena direto).
 */
export function brl(value: number | string | null | undefined): string {
  const n = typeof value === 'string' ? Number(value) : (value ?? 0);
  if (!Number.isFinite(n)) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(n);
}

export default brl;
