// src/app/routes.tsx — Cap. 8.1 (lazy-loading condicionado a TenantModule)
import { lazy, Suspense, ReactNode } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useActiveModules } from "../shared/hooks/use-active-modules";
import { LoginScreen } from "../shared/auth/login-screen";
import { NoAccessScreen } from "../shared/auth/no-access-screen";

const PosScreen = lazy(() => import("../modules/market/pos/pos-screen"));
const WorkOrderBoard = lazy(
  () => import("../modules/tech-assistance/work-orders/work-order-board"),
);
const ContainerLedgerScreen = lazy(
  () => import("../modules/beverage-store/container-ledger/container-ledger-screen"),
);
const ProductionScreen = lazy(
  () => import("../modules/bakery/production/production-screen"),
);
const PrescriptionScreen = lazy(
  () => import("../modules/pharmacy/prescriptions/prescription-screen"),
);
const CreditScreen = lazy(
  () => import("../modules/general-retail/credit/credit-screen"),
);
const PendingSalesQueue = lazy(
  () => import("../shared/offline/pending-sales-queue"),
);

function FullScreenSpinner() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-zinc-950">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
    </div>
  );
}

function Gate({
  moduleCode,
  children,
}: {
  moduleCode: string;
  children: ReactNode;
}) {
  const { hasModule, isLoading, isUnauthenticated } = useActiveModules();

  // Ainda consultando /auth/me — não decide (evita loop de redirect).
  if (isLoading) return <FullScreenSpinner />;

  // Sem sessão válida → tela de login.
  if (isUnauthenticated) return <Navigate to="/login" replace />;

  // Sessão ok, mas módulo não contratado → tela de sem acesso.
  if (!hasModule(moduleCode)) {
    return <Navigate to={`/sem-acesso?modulo=${moduleCode}`} replace />;
  }

  return <>{children}</>;
}

export function AppRoutes() {
  return (
    <BrowserRouter>
      <Suspense fallback={<FullScreenSpinner />}>
        <Routes>
          <Route path="/login" element={<LoginScreen />} />
          <Route path="/sem-acesso" element={<NoAccessScreen />} />
          <Route path="/" element={<Navigate to="/pdv" replace />} />
          <Route
            path="/pdv"
            element={
              <Gate moduleCode="pdv">
                <PosScreen />
              </Gate>
            }
          />
          <Route
            path="/ordens-servico"
            element={
              <Gate moduleCode="work-order">
                <WorkOrderBoard />
              </Gate>
            }
          />
          <Route
            path="/cascos"
            element={
              <Gate moduleCode="liquor-ledger">
                <ContainerLedgerScreen />
              </Gate>
            }
          />
          <Route
            path="/producao"
            element={
              <Gate moduleCode="recipe-bom">
                <ProductionScreen />
              </Gate>
            }
          />
          <Route
            path="/receitas"
            element={
              <Gate moduleCode="pharmacy-sngpc">
                <PrescriptionScreen />
              </Gate>
            }
          />
          <Route
            path="/crediario"
            element={
              <Gate moduleCode="pdv">
                <CreditScreen />
              </Gate>
            }
          />
          <Route path="/fila-sincronizacao" element={<PendingSalesQueue />} />
          {/* Catch-all: qualquer rota desconhecida volta ao início */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
