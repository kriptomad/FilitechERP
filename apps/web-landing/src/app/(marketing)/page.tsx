// src/app/(marketing)/page.tsx — Cap. 2.2 (vitrine completa)
//
// Dados do servidor: os nichos vêm do banco, não de um array no componente.
import { HeroSection } from './_components/hero-section';
import { FeaturesSection } from './_components/features-section';
import { NicheShowcaseSection } from './_components/niche-showcase-section';
import { JourneySection } from './_components/journey-section';
import { OfflineShowcaseSection } from './_components/offline-showcase-section';
import { PricingCalculatorSection } from './_components/pricing-calculator-section';
import { SocialProofSection } from './_components/social-proof-section';
import { FaqSection } from './_components/faq-section';
import { FinalCtaSection } from './_components/final-cta-section';
import { fetchNicheSummaries } from '@/lib/niches';

export default async function LandingPage() {
  const niches = await fetchNicheSummaries();

  return (
    <main className="bg-[#05060A] text-zinc-100 overflow-x-hidden">
      <HeroSection />
      <FeaturesSection />
      <NicheShowcaseSection niches={niches} />
      <JourneySection />
      <OfflineShowcaseSection />
      <PricingCalculatorSection />
      <SocialProofSection />
      <FaqSection />
      <FinalCtaSection />
    </main>
  );
}