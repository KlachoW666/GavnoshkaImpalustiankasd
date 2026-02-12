import { useState, useEffect } from 'react';
import { isAdminAuthenticated, clearAdminToken, setAdminUnauthorizedCallback } from '../../utils/adminApi';
import AdminLogin from './AdminLogin';
import AdminDashboard from './AdminDashboard';
import AdminAnalytics from './AdminAnalytics';
import AdminLogs from './AdminLogs';
import AdminUsers from './AdminUsers';
import AdminGroups from './AdminGroups';
import AdminActivationKeys from './AdminActivationKeys';
import AdminSubscriptionPlans from './AdminSubscriptionPlans';
import AdminProxies from './AdminProxies';
import AdminTrading from './AdminTrading';
import AdminStatsDisplay from './AdminStatsDisplay';

type AdminTab = 'dashboard' | 'trading' | 'analytics' | 'logs' | 'users' | 'groups' | 'keys' | 'plans' | 'proxies' | 'stats';

const TABS: { id: AdminTab; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '📋' },
  { id: 'trading', label: 'Торговля', icon: '📈' },
  { id: 'analytics', label: 'Аналитика', icon: '📊' },
  { id: 'logs', label: 'Логи', icon: '🖥️' },
  { id: 'users', label: 'Пользователи', icon: '👥' },
  { id: 'groups', label: 'Группы', icon: '🔐' },
  { id: 'keys', label: 'Ключи', icon: '🔑' },
  { id: 'plans', label: 'Тарифы', icon: '📦' },
  { id: 'proxies', label: 'Прокси', icon: '🌐' },
  { id: 'stats', label: 'Демо-статистики', icon: '📊' }
];

export default function AdminPanel() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState<AdminTab>('dashboard');

  useEffect(() => {
    setAuthenticated(isAdminAuthenticated());
    setChecking(false);
  }, []);

  useEffect(() => {
    setAdminUnauthorizedCallback(() => setAuthenticated(false));
    return () => setAdminUnauthorizedCallback(() => {});
  }, []);

  useEffect(() => {
    (window as any).__adminSetTab = setTab;
    return () => { delete (window as any).__adminSetTab; };
  }, []);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-base)' }}>
        <p style={{ color: 'var(--text-muted)' }}>Загрузка…</p>
      </div>
    );
  }

  if (!authenticated) {
    return <AdminLogin onSuccess={() => setAuthenticated(true)} />;
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-base)', color: 'var(--text-primary)' }}>
      {/* Header */}
      <header
        className="sticky top-0 z-10 border-b px-4 py-3 md:px-6"
        style={{ background: 'var(--bg-card-solid)', borderColor: 'var(--border)', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }}
      >
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="" className="h-8 w-auto object-contain opacity-90" />
            <div>
              <h1 className="text-lg font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>CLABX Admin</h1>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Панель управления</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => { clearAdminToken(); window.location.reload(); }}
            className="self-start sm:self-center text-sm px-4 py-2 rounded-lg transition-opacity hover:opacity-90"
            style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
          >
            Выйти
          </button>
        </div>
        {/* Tabs — scrollable on small screens, scrollbar hidden */}
        <div className="hide-scrollbar max-w-7xl mx-auto mt-4 -mb-px overflow-x-auto flex gap-1 pb-px">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              data-admin-tab={t.id}
              className={`shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-t-lg text-sm font-medium transition-all ${
                tab === t.id ? 'text-white shadow' : 'hover:bg-[var(--bg-hover)]'
              }`}
              style={{
                background: tab === t.id ? 'var(--accent)' : 'transparent',
                color: tab === t.id ? 'white' : 'var(--text-secondary)'
              }}
            >
              <span aria-hidden>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-6 px-4 md:px-6">
        {tab === 'dashboard' && <AdminDashboard />}
        {tab === 'trading' && <AdminTrading />}
        {tab === 'analytics' && <AdminAnalytics />}
        {tab === 'logs' && <AdminLogs />}
        {tab === 'users' && <AdminUsers />}
        {tab === 'groups' && <AdminGroups />}
        {tab === 'keys' && <AdminActivationKeys />}
        {tab === 'plans' && <AdminSubscriptionPlans />}
        {tab === 'proxies' && <AdminProxies />}
        {tab === 'stats' && <AdminStatsDisplay />}
      </main>
    </div>
  );
}
