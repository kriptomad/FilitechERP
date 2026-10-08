// src/app/(marketing)/planos/page.tsx — página de planos (Cap. 2.3/2.4/2.5)
import type { Metadata } from 'next';
import { fetchCatalog } from '../../../lib/catalog';
import { PlansPageClient } from './plans-client';

export const metadata: Metadata = {
  title: 'Planos e preços',
  description:
    'Planos Free, Essencial e Profissional, combos por nicho com desconto e módulos à la carte — com o preço final visível antes da contratação.',
};

export default async function PlansPage() {
  const catalog = await fetchCatalog();
  return <PlansPageClient catalog={catalog} />;
}
