// src/lib/niches.ts — Cap. 11 / 1.2.2
//
// Nichos para a vitrine interativa. Buscam do BANCO (seed-niches.ts) com
// fallback local mínimo — a vitrine precisa renderizar mesmo com a API fora,
// mas o conteúdo real (features, tagline, template) vem do banco.

export interface NicheFeature {
  title: string;
  description: string;
  chapterRef: string | null;
  icon: string | null;
}

export interface NicheSummary {
  code: string;
  label: string;
  tagline: string;
  description: string;
  colorHex: string;
  icon: string | null;
  suggestedModules: string[];
  selectableOnSignup: boolean;
  features: NicheFeature[];
  templateItems: { name: string; category: string | null; unitPrice: number }[];
}

/** Só o necessário para o grid da vitrine — evita baixar tudo no primeiro paint. */
export async function fetchNicheSummaries(): Promise<NicheSummary[]> {
  try {
    const res = await fetch('/api/niches', {
      // O catálogo muda raramente; revalidar a cada 10min evita refetch por
      // visita sem servir dado velho por muito tempo.
      next: { revalidate: 600 },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`niches ${res.status}`);
    const json = await res.json();
    if (!json?.success || !Array.isArray(json.data?.niches)) throw new Error('envelope');
    return json.data.niches as NicheSummary[];
  } catch {
    return FALLBACK_NICHES;
  }
}

export async function fetchNiche(code: string): Promise<NicheSummary | null> {
  try {
    const res = await fetch(`/api/niches?code=${encodeURIComponent(code)}`, {
      next: { revalidate: 600 },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data?.niches?.[0] ?? null;
  } catch {
    return FALLBACK_NICHES.find((n) => n.code === code) ?? null;
  }
}

/**
 * Fallback mínimo: só identidade visual dos nichos. Sem features nem
 * template — inventar copy aqui foi exatamente o que fez a vitrine parecer
 * estática e genérica antes.
 */
const FALLBACK_NICHES: NicheSummary[] = [
  { code: 'MERCADO', label: 'Mercado / Conveniência', tagline: 'Frente de caixa que nunca para', description: '', colorHex: '#6366F1', icon: null, suggestedModules: ['pdv', 'estoque', 'financeiro', 'crm'], selectableOnSignup: true, features: [], templateItems: [] },
  { code: 'ASSISTENCIA_TECNICA', label: 'Assistência Técnica', tagline: 'Do checklist assinado ao comissionamento', description: '', colorHex: '#06B6D4', icon: null, suggestedModules: ['pdv', 'estoque', 'work-order'], selectableOnSignup: true, features: [], templateItems: [] },
  { code: 'ADEGA', label: 'Adega / Bebidas', tagline: 'Conta-corrente de cascos', description: '', colorHex: '#A855F7', icon: null, suggestedModules: ['pdv', 'estoque', 'liquor-ledger'], selectableOnSignup: true, features: [], templateItems: [] },
  { code: 'PADARIA', label: 'Padaria / Confeitaria', tagline: 'Custo real por unidade produzida', description: '', colorHex: '#F59E0B', icon: null, suggestedModules: ['pdv', 'estoque', 'recipe-bom'], selectableOnSignup: true, features: [], templateItems: [] },
  { code: 'FARMACIA', label: 'Farmácia / Drogaria', tagline: 'FEFO e controlados', description: '', colorHex: '#10B981', icon: null, suggestedModules: ['pdv', 'estoque', 'pharmacy-sngpc'], selectableOnSignup: true, features: [], templateItems: [] },
  { code: 'VAREJO_GERAL', label: 'Varejo Geral', tagline: 'Grade de variações e crediário', description: '', colorHex: '#F43F5E', icon: null, suggestedModules: ['pdv', 'estoque', 'crm'], selectableOnSignup: true, features: [], templateItems: [] },
  { code: 'RESTAURANTE', label: 'Restaurante / Lanchonete', tagline: 'Comanda, KDS e iFood', description: '', colorHex: '#EF4444', icon: null, suggestedModules: ['pdv', 'restaurant-pos'], selectableOnSignup: true, features: [], templateItems: [] },
  { code: 'PETSHOP', label: 'Petshop / Veterinária', tagline: 'Prontuário do pet e agenda', description: '', colorHex: '#8B5CF6', icon: null, suggestedModules: ['pdv', 'crm', 'petshop'], selectableOnSignup: true, features: [], templateItems: [] },
  { code: 'SALAO_BELARIA', label: 'Salão / Barbearia', tagline: 'Agenda por profissional', description: '', colorHex: '#EC4899', icon: null, suggestedModules: ['pdv', 'crm', 'beauty-salon'], selectableOnSignup: true, features: [], templateItems: [] },
  { code: 'AUTOMOTIVA', label: 'Automotiva', tagline: 'OS com peças e garantia', description: '', colorHex: '#0EA5E9', icon: null, suggestedModules: ['pdv', 'estoque', 'work-order'], selectableOnSignup: true, features: [], templateItems: [] },
  { code: 'OTICA', label: 'Ótica', tagline: 'Receita de grau e laboratório', description: '', colorHex: '#06B6D4', icon: null, suggestedModules: ['pdv', 'crm', 'optical'], selectableOnSignup: true, features: [], templateItems: [] },
  { code: 'MODA_CALCADOS', label: 'Moda / Calçados', tagline: 'Grade com curva ABC por variação', description: '', colorHex: '#A855F7', icon: null, suggestedModules: ['pdv', 'estoque', 'fashion-grid'], selectableOnSignup: true, features: [], templateItems: [] },
  { code: 'PAPELARIA', label: 'Papelaria / Presentes', tagline: 'Sazonalidade e kits', description: '', colorHex: '#F59E0B', icon: null, suggestedModules: ['pdv', 'estoque', 'stationery-seasonal'], selectableOnSignup: true, features: [], templateItems: [] },
  { code: 'CONSTRUCAO', label: 'Construção / Material', tagline: 'Venda fracionada e desconto por volume', description: '', colorHex: '#78716C', icon: null, suggestedModules: ['pdv', 'estoque', 'construction-fractional'], selectableOnSignup: true, features: [], templateItems: [] },
  { code: 'ESCRITORIO_CONTABILIDADE', label: 'Escritório de Contabilidade', tagline: 'Escritório virtual: ECD, ECF e SPED', description: '', colorHex: '#1D4ED8', icon: null, suggestedModules: ['pdv', 'estoque', 'accounting-integration'], selectableOnSignup: true, features: [], templateItems: [] },
  { code: 'PERSONAL', label: 'Filitech Pessoal', tagline: 'Finanças da casa', description: '', colorHex: '#10B981', icon: null, suggestedModules: ['pdv', 'financeiro'], selectableOnSignup: true, features: [], templateItems: [] },
];