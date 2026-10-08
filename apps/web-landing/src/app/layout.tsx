// src/app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Filitech ERP — Gestão completa para qualquer nicho",
    template: "%s · Filitech ERP",
  },
  description:
    "O ERP que se adapta ao seu negócio — mercado, assistência, adega, padaria, farmácia ou varejo — com PDV offline-first. Comece grátis, sem cartão de crédito.",
  keywords: [
    "ERP", "PDV", "sistema para loja", "software de gestão", "PDV offline",
    "multi-nicho", "billing dinâmico", "NFC-e", "SaaS",
  ],
  openGraph: {
    title: "Filitech ERP",
    description: "Gestão completa. Em qualquer nicho. Sem fricção.",
    locale: "pt_BR",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="bg-[#05060A] text-zinc-100 antialiased">{children}</body>
    </html>
  );
}
