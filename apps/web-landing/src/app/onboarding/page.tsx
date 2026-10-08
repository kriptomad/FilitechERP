// src/app/onboarding/page.tsx — URL de retorno legada do checkout (Cap. 9.3):
// redireciona para /cadastro preservando a configuração escolhida.
import { redirect } from 'next/navigation';

export default function OnboardingPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const params = new URLSearchParams();
  for (const key of ['plan', 'mods', 'cycle'] as const) {
    const value = searchParams[key];
    if (typeof value === 'string' && value) params.set(key, value);
  }
  const qs = params.toString();
  redirect(`/cadastro${qs ? `?${qs}` : ''}`);
}
