'use client';
// src/app/(portal)/painel/niche-picker.tsx — Cap. 1.2.2 / 11
//
// Escolha do nicho no painel.
//
// Gap que este componente fecha: a pessoa relatou que "não tem como a pessoa
// escolher o nicho que ela quer" e que "está tudo indo genérico". O nicho
// existia no schema mas não tinha NENHUMA interface — não no cadastro, não no
// painel. Agora é possível trocar a qualquer momento, e trocar recarrega o
// template de catálogo daquele negócio.

import { useCallback, useEffect, useState } from 'react';
import { api, patch, ApiError } from '@/lib/api';
import type { NicheSummary } from '@/lib/niches';

interface NicheResponse {
  niches: NicheSummary[];
}

interface SelectResponse {
  tenant: { id: string; slug: string; tradeName: string; nicheCode: string | null };
  niche: { code: string; label: string; tagline: string; suggestedModules: string[] };
  templateProducts: { name: string; category: string | null; unitPrice: number }[];
}

interface Props {
  currentCode: string | null;
}

export function NichePicker({ currentCode }: Props) {
  const [niches, setNiches] = useState<NicheSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(currentCode);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SelectResponse | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<NicheResponse>('/api/niches');
      setNiches(data.niches);
    } catch {
      setError('Não foi possível carregar os nichos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function confirm() {
    if (!selected) return;

    setSaving(true);
    setError(null);
    setResult(null);

    try {
      const response = await patch<SelectResponse>('/api/auth/niche', {
        nicheCode: selected,
      });
      setResult(response);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao salvar o nicho.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="text-sm text-zinc-500">Carregando nichos…</div>;
  }

  const active = niches.find((n) => n.code === (selected ?? currentCode));

  return (
    <div className="space-y-5">
      {!currentCode && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          Escolha seu nicho para carregar o catálogo inicial e ativar os módulos
          recomendados para o seu tipo de negócio.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {niches.map((niche) => {
          const isActive = niche.code === selected;
          const isCurrent = niche.code === currentCode;

          return (
            <button
              key={niche.code}
              type="button"
              onClick={() => setSelected(niche.code)}
              className={`rounded-xl border p-4 text-left transition ${
                isActive
                  ? 'bg-white/[0.04]'
                  : 'border-white/10 hover:border-white/20 hover:bg-white/[0.02]'
              }`}
              style={
                isActive
                  ? { borderColor: niche.colorHex, boxShadow: `0 0 30px ${niche.colorHex}2e` }
                  : undefined
              }
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: niche.colorHex }}
                />
                <span className="text-sm font-semibold leading-snug">{niche.label}</span>
              </div>

              {niche.tagline && (
                <p className="mt-1.5 line-clamp-2 text-xs text-zinc-500">{niche.tagline}</p>
              )}

              {isCurrent && (
                <span className="mt-2 inline-block rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                  nicho atual
                </span>
              )}
            </button>
          );
        })}
      </div>

      {active && active.features.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-zinc-900/40 p-5">
          <p className="text-sm font-semibold">
            O que {active.label} unlocka
          </p>
          <ul className="mt-3 space-y-2">
            {active.features.slice(0, 5).map((feature) => (
              <li key={feature.title} className="flex gap-2.5 text-sm">
                <span
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: active.colorHex }}
                />
                <span>
                  <span className="text-zinc-200">{feature.title}</span>
                  <span className="mt-0.5 block text-xs text-zinc-500">
                    {feature.description}
                  </span>
                </span>
              </li>
            ))}
          </ul>

          {active.suggestedModules.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Módulos que serão sugeridos
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {active.suggestedModules.map((code) => (
                  <code key={code} className="rounded bg-black/30 px-2 py-1 text-[11px] text-zinc-400">
                    {code}
                  </code>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {error}
        </p>
      )}

      {result && (
        <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
          Nicho {result.niche.label} salvo.
          {result.templateProducts.length > 0
            ? ` ${result.templateProducts.length} produtos de exemplo foram carregados no seu catálogo.`
            : ''}
        </p>
      )}

      <button
        type="button"
        onClick={confirm}
        disabled={saving || !selected || selected === currentCode}
        className="rounded-xl bg-indigo-600 px-5 py-2.5 font-medium text-white transition hover:bg-indigo-500 disabled:opacity-60"
      >
        {saving ? 'Salvando…' : 'Salvar nicho'}
      </button>

      {!currentCode && (
        <p className="text-xs text-zinc-600">
          Trocar de nicho atualiza os módulos sugeridos e carrega o template de
          catálogo correspondente. Os módulos já contratados não são removidos.
        </p>
      )}
    </div>
  );
}