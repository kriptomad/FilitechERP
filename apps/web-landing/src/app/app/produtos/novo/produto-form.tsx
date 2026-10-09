'use client';
// src/app/app/produtos/novo/produto-form.tsx — Cap. 4.1

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { post, ApiError } from '@/lib/api';

const inputClass =
  'w-full rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-3 text-sm text-zinc-100 outline-none transition focus:border-indigo-500/70';

const TRACKING_OPTIONS = [
  { code: 'NONE', label: 'Sem controle' },
  { code: 'BATCH', label: 'Lote e validade (FEFO)' },
  { code: 'SERIAL', label: 'Serial / IMEI' },
  { code: 'VARIANT', label: 'Variações (cor/tamanho)' },
];

export function ProdutoForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    name: '',
    sku: '',
    barcode: '',
    category: '',
    unitPrice: '',
    stockQuantity: '0',
    minStockThreshold: '',
    trackingType: 'NONE',
    isWeighted: false,
    isReturnableContainer: false,
    isReturnable: true,
    requiresPrescriptionRetention: false,
    isControlledSubstance: false,
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    try {
      await post('/api/products', {
        name: form.name,
        sku: form.sku || undefined,
        barcode: form.barcode || undefined,
        category: form.category || undefined,
        unitPrice: Number(form.unitPrice),
        stockQuantity: Number(form.stockQuantity),
        minStockThreshold: form.minStockThreshold
          ? Number(form.minStockThreshold)
          : undefined,
        trackingType: form.trackingType,
        isWeighted: form.isWeighted,
        isReturnableContainer: form.isReturnableContainer,
        isReturnable: form.isReturnable,
        requiresPrescriptionRetention: form.requiresPrescriptionRetention,
        isControlledSubstance: form.isControlledSubstance,
      });

      router.push('/app/produtos');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao salvar o produto.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="max-w-2xl space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome" required>
          <input
            required
            className={inputClass}
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="Arroz agulhina tipo 1 — 5kg"
          />
        </Field>

        <Field label="SKU" hint="Deixe vazio para gerar automaticamente">
          <input
            className={inputClass}
            value={form.sku}
            onChange={(e) => set('sku', e.target.value)}
            placeholder="ARROZ-5KG"
          />
        </Field>

        <Field label="Código de barras">
          <input
            className={inputClass}
            value={form.barcode}
            onChange={(e) => set('barcode', e.target.value)}
            placeholder="7891000000000"
          />
        </Field>

        <Field label="Categoria">
          <input
            className={inputClass}
            value={form.category}
            onChange={(e) => set('category', e.target.value)}
            placeholder="Mercearia"
          />
        </Field>

        <Field label="Preço de venda" required>
          <input
            required
            type="number"
            step="0.01"
            min="0"
            className={inputClass}
            value={form.unitPrice}
            onChange={(e) => set('unitPrice', e.target.value)}
            placeholder="28.90"
          />
        </Field>

        <Field label="Estoque inicial">
          <input
            type="number"
            step="0.001"
            className={inputClass}
            value={form.stockQuantity}
            onChange={(e) => set('stockQuantity', e.target.value)}
          />
        </Field>

        <Field label="Estoque mínimo" hint="Usado na sugestão de compra">
          <input
            type="number"
            step="0.001"
            className={inputClass}
            value={form.minStockThreshold}
            onChange={(e) => set('minStockThreshold', e.target.value)}
          />
        </Field>

        <Field label="Controle de estoque">
          <select
            className={inputClass}
            value={form.trackingType}
            onChange={(e) => set('trackingType', e.target.value)}
          >
            {TRACKING_OPTIONS.map((option) => (
              <option key={option.code} value={option.code} className="bg-zinc-900">
                {option.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <fieldset className="rounded-xl border border-white/10 p-5">
        <legend className="px-1 text-sm font-medium text-zinc-300">Comportamento</legend>
        <div className="mt-2 space-y-3">
          <Toggle
            checked={form.isReturnable}
            onChange={(v) => set('isReturnable', v)}
            label="Permitir devolução"
            hint="Desmarque para produtos de higiene (roupa íntima)"
          />
          <Toggle
            checked={form.isReturnableContainer}
            onChange={(v) => set('isReturnableContainer', v)}
            label="É vasilhame retornável"
            hint="Ativa a conta-corrente de cascos (Adega)"
          />
          <Toggle
            checked={form.isWeighted}
            onChange={(v) => set('isWeighted', v)}
            label="Vendido por peso"
            hint="Balança integrate o preço por kg"
          />
          <Toggle
            checked={form.requiresPrescriptionRetention}
            onChange={(v) => set('requiresPrescriptionRetention', v)}
            label="Exige retenção de receita"
            hint="Farmácia — bloqueia a venda sem registro da receita"
          />
          <Toggle
            checked={form.isControlledSubstance}
            onChange={(v) => set('isControlledSubstance', v)}
            label="Substância controlada"
            hint="Escrituração SNGPC/SNCR (tarja preta)"
          />
        </div>
      </fieldset>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300"
        >
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-xl bg-indigo-600 px-6 py-3 font-medium text-white transition hover:bg-indigo-500 disabled:opacity-60"
        >
          {busy ? 'Salvando…' : 'Salvar produto'}
        </button>
        <Link
          href="/app/produtos"
          className="rounded-xl border border-white/15 px-6 py-3 text-zinc-200 transition hover:bg-white/5"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-zinc-400">
        {label}
        {required && <span className="ml-1 text-rose-400">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-zinc-600">{hint}</span>}
    </label>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-white/20 bg-zinc-900 accent-indigo-500"
      />
      <span>
        <span className="block text-sm text-zinc-300">{label}</span>
        {hint && <span className="block text-xs text-zinc-600">{hint}</span>}
      </span>
    </label>
  );
}