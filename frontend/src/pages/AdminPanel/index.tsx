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
import AdminExternalAi from './AdminExternalAi';
import AdminWallet from './AdminWallet';
import AdminCopyTrading from './AdminCopyTrading';
import AdminSignalProviders from './AdminSignalProviders';
import AdminDepositAddresses from './AdminDepositAddresses';
import AdminTransactions from './AdminTransactions';
import AdminFinance from './AdminFinance';
import AdminNews from './AdminNews';

type AdminTab = 'dashboard' | 'trading' | 'analytics' | 'logs' | 'users' | 'groups' | 'keys' | 'plans' | 'proxies' | 'stats' | 'external-ai' | 'wallet' | 'copy-trading' | 'signal-providers' | 'deposit-addresses' | 'transactions' | 'finance' | 'news';

interface TabItem {
  id: AdminTab;
  label: string;
  icon: string;
  group: 'main' | 'finance' | 'users' | 'system';
}

const TABS: TabItem[] = [
  { id: 'dashboard', label: 'Главная', icon: '📋', group: 'main' },
  { id: 'finance', label: 'Финансы', icon: '💰', group: 'finance' },
  { id: 'transactions', label: 'Транзакции', icon: '💳', group: 'finance' },
  { id: 'wallet', label: 'Кошелёк', icon: '👛', group: 'finance' },
  { id: 'copy-trading', label: 'Копитрейдинг', icon: '👥', group: 'finance' },
  { id: 'signal-providers', label: 'Провайдеры', icon: '🤖', group: 'finance' },
  { id: 'deposit-addresses', label: 'Адреса депозитов', icon: '🏦', group: 'finance' },
  { id: 'trading', label: 'Торговля', icon: '📈', group: 'finance' },
  { id: 'users', label: 'Пользователи', icon: '👤', group: 'users' },
  { id: 'groups', label: 'Группы', icon: '🔐', group: 'users' },
  { id: 'keys', label: 'Ключи активации', icon: '🔑', group: 'users' },
  { id: 'plans', label: 'Тарифы', icon: '📦', group: 'users' },
  { id: 'analytics', label: 'Аналитика', icon: '📊', group: 'system' },
  { id: 'logs', label: 'Логи', icon: '🖥', group: 'system' },
  { id: 'external-ai', label: 'Внешний ИИ', icon: '🤖', group: 'system' },
  { id: 'proxies', label: 'Прокси', icon: '🌐', group: 'system' },
  { id: 'stats', label: 'Демо-статистики', icon: '📊', group: 'system' },
  { id: 'news', label: 'Новости', icon: '📰', group: 'main' }
];

const GROUP_LABELS: Record<string, string> = {
  main: 'Главное',
  finance: 'Финансы',
  users: 'Пользователи и доступ',
  system: 'Система'
};

export default function AdminPanel() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState<AdminTab>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Загрузка…</p>
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return <AdminLogin onSuccess={() => setAuthenticated(true)} />;
  }

  const groups = Array.from(new Set(TABS.map((t) => t.group)));

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg-base)', color: 'var(--text-primary)' }}>
      {/* Sidebar — desktop fixed, mobile overlay */}
      <aside
        className={`
          fixed lg:sticky top-0 left-0 z-20 flex-shrink-0 w-64 h-screen flex flex-col
          transition-transform duration-200 ease-out lg:translate-x-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
        style={{
          background: 'var(--bg-card-solid)',
          borderRight: '1px solid var(--border)',
          boxShadow: sidebarOpen ? '4px 0 24px rgba(0,0,0,0.15)' : 'none'
        }}
      >
        <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2">
            <img src="/logo.svg" alt="" className="h-7 w-7 object-contain opacity-90" />
            <span className="font-bold text-sm" style={{ color: 'var(--accent)' }}>CLABX Admin</span>
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-2 rounded-lg hover:bg-[var(--bg-hover)] transition-colors"
            style={{ color: 'var(--text-muted)' }}
            aria-label="Закрыть меню"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto py-4 custom-scrollbar">
          {groups.map((groupKey) => (
            <div key={groupKey} className="mb-6">
              <p className="px-4 mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                {GROUP_LABELS[groupKey]}
              </p>
              <ul className="space-y-0.5">
                {TABS.filter((t) => t.group === groupKey).map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => { setTab(t.id); setSidebarOpen(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm font-medium transition-colors rounded-none lg:rounded-r-lg"
                      style={{
                        background: tab === t.id ? 'var(--accent-dim)' : 'transparent',
                        color: tab === t.id ? 'var(--accent)' : 'var(--text-secondary)',
                        borderLeft: tab === t.id ? '3px solid var(--accent)' : '3px solid transparent'
                      }}
                    >
                      <span className="text-base" aria-hidden>{t.icon}</span>
                      {t.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="p-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <button
            type="button"
            onClick={() => { clearAdminToken(); window.location.reload(); }}
            className="w-full flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
            style={{ background: 'var(--bg-hover)', color: 'var(--danger)' }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Выйти
          </button>
        </div>
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-10 lg:hidden"
          style={{ background: 'rgba(0,0,0,0.4)' }}
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar — mobile: menu + title; desktop: title only */}
        <header
          className="sticky top-0 z-10 flex items-center gap-4 px-4 py-3 lg:px-6 border-b shrink-0"
          style={{ background: 'var(--bg-card-solid)', borderColor: 'var(--border)' }}
        >
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 rounded-lg hover:bg-[var(--bg-hover)] transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            aria-label="Меню"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1 className="text-lg font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
            {TABS.find((t) => t.id === tab)?.label ?? 'Админ-панель'}
          </h1>
        </header>

        <main className="flex-1 py-6 px-4 lg:px-6 overflow-auto">
          <div className="max-w-6xl mx-auto">
            {tab === 'dashboard' && <AdminDashboard />}
            {tab === 'finance' && <AdminFinance />}
            {tab === 'transactions' && <AdminTransactions />}
            {tab === 'wallet' && <AdminWallet />}
            {tab === 'copy-trading' && <AdminCopyTrading />}
            {tab === 'signal-providers' && <AdminSignalProviders />}
            {tab === 'deposit-addresses' && <AdminDepositAddresses />}
            {tab === 'trading' && <AdminTrading />}
            {tab === 'external-ai' && <AdminExternalAi />}
            {tab === 'analytics' && <AdminAnalytics />}
            {tab === 'logs' && <AdminLogs />}
            {tab === 'users' && <AdminUsers />}
            {tab === 'groups' && <AdminGroups />}
            {tab === 'keys' && <AdminActivationKeys />}
            {tab === 'plans' && <AdminSubscriptionPlans />}
            {tab === 'proxies' && <AdminProxies />}
            {tab === 'stats' && <AdminStatsDisplay />}
            {tab === 'news' && <AdminNews />}
          </div>
        </main>
      </div>
    </div>
  );
}
