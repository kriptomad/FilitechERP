import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../shared/auth/AuthProvider';
import { FullScreenSpinner } from '../shared/ui/FullScreenSpinner';

const LoginPage = lazy(() => import('../pages/auth/LoginPage').then((m) => ({ default: m.LoginPage })));
const TenantListPage = lazy(() => import('../pages/tenants/TenantListPage').then((m) => ({ default: m.TenantListPage })));
const TenantDetailPage = lazy(() => import('../pages/tenants/TenantDetailPage').then((m) => ({ default: m.TenantDetailPage })));
const RevenueDashboardPage = lazy(() => import('../pages/billing/RevenueDashboardPage').then((m) => ({ default: m.RevenueDashboardPage })));
const CouponsPage = lazy(() => import('../pages/billing/CouponsPage').then((m) => ({ default: m.CouponsPage })));
const ModuleCatalogPage = lazy(() => import('../pages/modules/ModuleCatalogPage').then((m) => ({ default: m.ModuleCatalogPage })));
const AuditLogPage = lazy(() => import('../pages/observability/AuditLogPage').then((m) => ({ default: m.AuditLogPage })));
const CentralizedLogsPage = lazy(() => import('../pages/observability/CentralizedLogsPage').then((m) => ({ default: m.CentralizedLogsPage })));
const SystemParametersPage = lazy(() => import('../pages/observability/SystemParametersPage').then((m) => ({ default: m.SystemParametersPage })));
const ChangelogPage = lazy(() => import('../pages/releases/ChangelogPage').then((m) => ({ default: m.ChangelogPage })));
const IntegrationsPage = lazy(() => import('../pages/integrations/IntegrationsPage').then((m) => ({ default: m.IntegrationsPage })));

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  
  if (loading) return <FullScreenSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  
  if (loading) return <FullScreenSpinner />;
  if (user) return <Navigate to="/tenants" replace />;
  return <>{children}</>;
}

export function AppRoutes() {
  return (
    <Suspense fallback={<FullScreenSpinner />}>
      <Routes>
        <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
        
        <Route element={<ProtectedRoute><AdminLayout /></ProtectedRoute>}>
          <Route path="/tenants" element={<TenantListPage />} />
          <Route path="/tenants/:id" element={<TenantDetailPage />} />
          <Route path="/billing/revenue" element={<RevenueDashboardPage />} />
          <Route path="/billing/coupons" element={<CouponsPage />} />
          <Route path="/modules/catalog" element={<ModuleCatalogPage />} />
          <Route path="/observability/audit-log" element={<AuditLogPage />} />
          <Route path="/observability/logs" element={<CentralizedLogsPage />} />
          <Route path="/observability/parameters" element={<SystemParametersPage />} />
          <Route path="/releases/changelog" element={<ChangelogPage />} />
          <Route path="/integrations" element={<IntegrationsPage />} />
          <Route path="/" element={<Navigate to="/tenants" replace />} />
          <Route path="*" element={<Navigate to="/tenants" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

function AdminLayout() {
  const { user, logout } = useAuth();
  
  return (
    <div style={{ minHeight: '100vh', display: 'flex' }}>
      <aside style={{
        width: 280,
        borderRight: '1px solid rgba(0,0,0,0.06)',
        background: 'var(--mui-palette-background-paper)',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <div style={{ padding: 24, borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#6366F1' }}>Filitech Admin</h1>
          <p style={{ fontSize: 12, color: '#71717A', marginTop: 4 }}>Painel Global</p>
        </div>
        
        <nav style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <NavLink to="/tenants" label="Tenants" icon="🏢" />
          <NavLink to="/billing/revenue" label="Receita & Métricas" icon="📈" />
          <NavLink to="/billing/coupons" label="Cupons" icon="🎫" />
          <NavLink to="/modules/catalog" label="Catálogo Planos/Módulos" icon="🧩" />
          <NavLink to="/observability/audit-log" label="Auditoria" icon="📋" />
          <NavLink to="/observability/logs" label="Logs Centralizados" icon="📊" />
          <NavLink to="/observability/parameters" label="Parâmetros do Sistema" icon="⚙️" />
          <NavLink to="/releases/changelog" label="Changelog/Releases" icon="📝" />
          <NavLink to="/integrations" label="Integrações" icon="🔗" />
        </nav>
        
        <div style={{ padding: 16, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#6366F1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600 }}>
              {user?.name?.[0]?.toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.name}</p>
              <p style={{ fontSize: 11, color: '#71717A' }}>{user?.role}</p>
            </div>
          </div>
          <button onClick={logout} style={{
            width: '100%',
            padding: '10px 16px',
            borderRadius: 10,
            border: '1px solid rgba(0,0,0,0.1)',
            background: 'transparent',
            color: '#DC2626',
            fontWeight: 600,
            cursor: 'pointer',
          }}>
            Sair
          </button>
        </div>
      </aside>
      
      <main style={{ flex: 1, padding: 32, overflow: 'auto' }}>
        <Outlet />
      </main>
    </div>
  );
}

function NavLink({ to, label, icon }: { to: string; label: string; icon: string }) {
  const location = useLocation();
  const isActive = location.pathname.startsWith(to);
  
  return (
    <a href={to} style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '12px 16px',
      borderRadius: 10,
      textDecoration: 'none',
      color: isActive ? '#6366F1' : '#52525B',
      background: isActive ? 'rgba(99,102,241,0.1)' : 'transparent',
      fontWeight: isActive ? 600 : 500,
      fontSize: 14,
      transition: 'all 0.2s',
    }}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <span>{label}</span>
    </a>
  );
}

import { Outlet, useLocation } from 'react-router-dom';