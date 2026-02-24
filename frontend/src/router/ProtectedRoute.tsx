import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import MaintenancePage from '../pages/MaintenancePage';

function LoadingSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-base)' }}>
      <div className="flex flex-col items-center gap-4">
        <div
          className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin-slow"
          style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }}
        />
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Загрузка…</p>
      </div>
    </div>
  );
}

/**
 * Guards authenticated routes: loading → spinner; no user + maintenance → MaintenancePage;
 * no user → redirect to /auth; otherwise renders Outlet (RootLayout children).
 */
export function ProtectedRoute() {
  const { user, loading, maintenanceMode } = useAuth();

  if (loading) return <LoadingSpinner />;
  if (!user && maintenanceMode) return <MaintenancePage />;
  if (!user) return <Navigate to="/auth" replace />;
  return <Outlet />;
}
