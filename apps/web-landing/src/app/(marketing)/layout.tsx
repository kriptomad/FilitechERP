// src/app/(marketing)/layout.tsx — chrome da vitrine: navbar + footer
import { Navbar } from './_components/navbar';
import { Footer } from './_components/footer';

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <Navbar />
      {children}
      <Footer />
    </div>
  );
}
