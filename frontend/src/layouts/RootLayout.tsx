import React, { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useNotifications } from '../contexts/NotificationContext';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../utils/api';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useSignalToasts } from '../hooks/useSignalToasts';
import { OfflineBanner } from '../components/OfflineBanner';

const OnboardingPage = React.lazy(() => import('../pages/OnboardingPage'));

type Page = 'dashboard' | 'signals' | 'chart' | 'trade' | 'demo' | 'autotrade' | 'scanner' | 'pnl' | 'analytics' | 'settings' | 'activate' | 'admin' | 'profile' | 'privacy' | 'terms' | 'help' | 'backtest' | 'copy' | 'social' | 'trader' | 'wallet';

const PAGE_PATHS: Record<Page, string> = {
  dashboard: '/',
  signals: '/signals',
  chart: '/chart',
  trade: '/trade',
  demo: '/demo',
  autotrade: '/auto',
  scanner: '/scanner',
  pnl: '/pnl',
  analytics: '/analytics',
  settings: '/settings',
  activate: '/activate',
  admin: '/admin',
  profile: '/profile',
  privacy: '/privacy',
  terms: '/terms',
  help: '/help',
  backtest: '/backtest',
  copy: '/copy',
  social: '/social',
  trader: '/trader',
  wallet: '/wallet',
};

const PATH_TO_PAGE: Record<string, Page> = Object.entries(PAGE_PATHS).reduce(
  (acc, [page, path]) => {
    acc[path] = page as Page;
    return acc;
  },
  {} as Record<string, Page>
);

function normalizePath(pathname: string): string {
  let p = pathname || '/';
  const q = p.indexOf('?');
  if (q >= 0) p = p.slice(0, q);
  if (!p.startsWith('/')) p = '/' + p;
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p;
}

function getPageFromPath(pathname: string, allowed: Set<Page>): Page {
  const path = normalizePath(pathname);
  if (path.startsWith('/trader/') && allowed.has('trader')) return 'trader';
  const candidate = PATH_TO_PAGE[path];
  if (candidate && allowed.has(candidate)) return candidate;
  if (allowed.has('dashboard')) return 'dashboard';
  return (Array.from(allowed)[0] ?? 'dashboard') as Page;
}

interface NavItem {
  id: Page;
  label: string;
  group: 'trading' | 'analytics' | 'account';
}

const ALL_PAGES: NavItem[] = [
  { id: 'dashboard', label: 'Главная', group: 'trading' },
  { id: 'trade', label: 'Торговля', group: 'trading' },
  { id: 'signals', label: 'Сигналы', group: 'trading' },
  { id: 'chart', label: 'График', group: 'trading' },
  { id: 'autotrade', label: 'Авто-трейд', group: 'trading' },
  { id: 'demo', label: 'Демо', group: 'trading' },
  { id: 'scanner', label: 'Скринер', group: 'analytics' },
  { id: 'pnl', label: 'PNL', group: 'analytics' },
  { id: 'analytics', label: 'Аналитика', group: 'analytics' },
  { id: 'backtest', label: 'Бэктест', group: 'analytics' },
  { id: 'copy', label: 'Копитрейдинг', group: 'analytics' },
  { id: 'social', label: 'Социальная', group: 'analytics' },
  { id: 'wallet', label: 'Кошелёк', group: 'account' },
  { id: 'settings', label: 'Настройки', group: 'account' },
  { id: 'activate', label: 'Активация', group: 'account' },
  { id: 'admin', label: 'Админ', group: 'account' },
];

const FALLBACK_TABS: Page[] = ['dashboard', 'settings'];
const MOBILE_TABS: Page[] = ['dashboard', 'autotrade', 'chart'];
const GROUP_LABELS: Record<string, string> = {
  trading: 'Торговля',
  analytics: 'Аналитика',
  account: 'Аккаунт',
};

const NAV_ICONS: Record<string, string> = {
  dashboard: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4',
  signals: 'M13 10V3L4 14h7v7l9-11h-7z',
  chart: 'M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4v16',
  trade: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6',
  demo: 'M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664zM21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  autotrade: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
  scanner: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
  pnl: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  analytics: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  backtest: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  copy: 'M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2',
  social: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
  settings: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z',
  activate: 'M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z',
  admin: 'M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4',
  wallet: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z',
  help: 'M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  profile: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  menu: 'M4 6h16M4 12h16M4 18h16',
};

function NavIcon({ name, className }: { name: string; className?: string }) {
  const d = NAV_ICONS[name];
  if (!d) return null;
  return (
    <svg className={className || 'w-5 h-5 shrink-0'} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

function NavDropdown({
  label,
  items,
  activePage,
  onSelect,
  open,
  onToggle,
}: {
  label: string;
  items: NavItem[];
  activePage: Page;
  onSelect: (p: Page) => void;
  open: boolean;
  onToggle: () => void;
}) {
  const hasActive = items.some((i) => i.id === activePage);
  if (items.length === 0) return null;
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-1 px-3 py-2 text-sm font-medium transition-colors rounded"
        style={{ color: hasActive ? 'var(--accent)' : 'var(--text-secondary)' }}
      >
        {label}
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={onToggle} />
          <div
            className="absolute left-0 top-full mt-1 py-1 min-w-[200px] z-50 animate-fade-in"
            style={{
              background: 'var(--bg-card-solid)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            {items.map((item) => {
              const active = activePage === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onSelect(item.id);
                    onToggle();
                  }}
                  className="w-full px-4 py-2 text-left text-sm flex items-center gap-2.5 transition-colors"
                  style={{
                    color: active ? 'var(--accent)' : 'var(--text-secondary)',
                    background: active ? 'var(--accent-dim)' : 'transparent',
                  }}
                  onMouseEnter={(e) => {
                    if (!active) e.currentTarget.style.background = 'var(--bg-hover)';
                  }}
                  onMouseLeave={(e) => {
                    if (!active) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <NavIcon name={item.id} className="w-4 h-4 shrink-0" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export default function RootLayout() {
  const year = new Date().getFullYear();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, token, logout } = useAuth();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const { toasts, clearAll } = useNotifications();

  useSignalToasts();

  const allowedSet = useMemo(() => {
    const tabs = user?.allowedTabs ?? [];
    const set = new Set<Page>(tabs.length > 0 ? (tabs as Page[]) : FALLBACK_TABS);
    set.add('privacy');
    set.add('terms');
    set.add('profile');
    set.add('help');
    if (set.has('autotrade')) set.add('copy');
    if (set.has('social') || set.has('copy')) set.add('trader');
    if (set.has('admin')) set.add('trader');
    return set;
  }, [user?.allowedTabs]);

  const PAGES = useMemo(() => {
    let list = ALL_PAGES.filter((p) => allowedSet.has(p.id));
    if (user?.activationActive) list = list.filter((p) => p.id !== 'activate');
    if (!allowedSet.has('admin')) list = list.filter((p) => p.id !== 'autotrade');
    if (!allowedSet.has('admin')) list = list.filter((p) => p.id !== 'analytics' && p.id !== 'wallet');
    return list.length > 0 ? list : ALL_PAGES.filter((p) => p.id !== 'admin');
  }, [allowedSet, user?.activationActive]);

  const safePage = useMemo(
    () => (allowedSet.has(getPageFromPath(location.pathname, allowedSet)) ? getPageFromPath(location.pathname, allowedSet) : 'dashboard'),
    [location.pathname, allowedSet]
  );

  useEffect(() => {
    if (!user?.id || !token) return;
    api
      .get<{ mode: 'auto_trading' | 'copy_trading' }>('/user/mode', { headers: { Authorization: 'Bearer ' + token } })
      .then((r) => {
        if (r.mode) setShowOnboarding(false);
        else setShowOnboarding(true);
      })
      .catch(() => setShowOnboarding(true));
  }, [user?.id, token]);

  useEffect(() => {
    if (user?.activationActive && location.pathname === '/activate') navigate('/', { replace: true });
  }, [user?.activationActive, location.pathname, navigate]);

  useEffect(() => {
    if (user) {
      try {
        if (sessionStorage.getItem('post_register_go_profile') === '1' && allowedSet.has('profile')) {
          sessionStorage.removeItem('post_register_go_profile');
          navigate('/profile?welcome=1');
        }
      } catch {}
    }
  }, [user?.id, allowedSet, navigate]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        const target: Page | null =
          e.key === '1' ? 'dashboard' : e.key === '2' ? 'signals' : e.key === '3' ? 'chart' : e.key === '4' ? 'demo' : e.key === '5' ? 'autotrade' : e.key === '6' ? 'scanner' : e.key === '7' ? 'pnl' : e.key === ',' ? 'settings' : e.key === '9' ? 'activate' : e.key === '8' ? 'admin' : null;
        if (target && allowedSet.has(target)) {
          navigate(PAGE_PATHS[target]);
          e.preventDefault();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [allowedSet, navigate]);

  const setPageSafe = useCallback(
    (p: Page) => {
      if (!allowedSet.has(p)) return;
      navigate(PAGE_PATHS[p] ?? '/');
      setMobileMenuOpen(false);
      setOpenDropdown(null);
    },
    [allowedSet, navigate]
  );

  const online = useOnlineStatus();

  if (showOnboarding) {
    return (
      <Suspense
        fallback={
          <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-base)' }}>
            <div className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin-slow" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
          </div>
        }
      >
        <OnboardingPage
          onComplete={(mode) => {
            setShowOnboarding(false);
            if (mode === 'copy_trading') navigate('/copy');
          }}
        />
      </Suspense>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg-base)', color: 'var(--text-primary)' }}>
      <header
        className="h-12 shrink-0 flex items-center justify-between px-4 lg:px-6 border-b sticky top-0 z-30"
        style={{ background: 'var(--bg-topbar)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="lg:hidden p-2 -ml-2 rounded transition-colors hover:bg-[var(--bg-hover)]"
            style={{ color: 'var(--text-secondary)' }}
            aria-label="Меню"
          >
            <NavIcon name="menu" className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 mr-4 cursor-pointer" onClick={() => setPageSafe('dashboard')}>
            <img src="/logo.svg" alt="CLABX" className="h-6 w-6 object-contain" />
            <span className="font-bold text-sm tracking-tight hidden sm:block" style={{ color: 'var(--accent)' }}>CLABX</span>
          </div>
          <nav className="hidden lg:flex items-center gap-0.5">
            {(['trading', 'analytics', 'account'] as const).map((group) => {
              const items = PAGES.filter((p) => p.group === group);
              if (items.length === 0) return null;
              return (
                <NavDropdown
                  key={group}
                  label={GROUP_LABELS[group]}
                  items={items}
                  activePage={safePage}
                  onSelect={setPageSafe}
                  open={openDropdown === group}
                  onToggle={() => setOpenDropdown(openDropdown === group ? null : group)}
                />
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setNotifOpen(!notifOpen);
              setUserMenuOpen(false);
              setOpenDropdown(null);
            }}
            className="relative p-2 rounded transition-colors hover:bg-[var(--bg-hover)]"
            aria-label="Уведомления"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} style={{ color: 'var(--text-secondary)' }}>
              <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {toasts.length > 0 && (
              <span className="absolute top-1 right-1 min-w-[14px] h-[14px] rounded-full flex items-center justify-center text-[9px] font-bold" style={{ background: 'var(--danger)', color: '#fff' }}>
                {Math.min(toasts.length, 99)}
              </span>
            )}
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setUserMenuOpen(!userMenuOpen);
                setNotifOpen(false);
                setOpenDropdown(null);
              }}
              className="flex items-center gap-2 p-1.5 rounded transition-colors hover:bg-[var(--bg-hover)]"
            >
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                {(user?.username || '?')[0].toUpperCase()}
              </div>
              <span className="hidden sm:block text-sm font-medium max-w-[100px] truncate" style={{ color: 'var(--text-secondary)' }}>{user?.username}</span>
              <svg className="w-3 h-3 hidden sm:block" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} style={{ color: 'var(--text-muted)' }}>
                <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {userMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 py-1 min-w-[180px] z-50 animate-fade-in" style={{ background: 'var(--bg-card-solid)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)' }}>
                  <div className="px-4 py-2.5 border-b" style={{ borderColor: 'var(--border)' }}>
                    <p className="text-sm font-medium truncate">{user?.username}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{user?.allowedTabs?.includes('admin') ? 'Администратор' : 'Трейдер'}</p>
                  </div>
                  {[
                    { id: 'profile' as Page, label: 'Профиль', icon: 'profile' },
                    { id: 'wallet' as Page, label: 'Кошелёк', icon: 'wallet' },
                    { id: 'settings' as Page, label: 'Настройки', icon: 'settings' },
                    { id: 'help' as Page, label: 'Помощь', icon: 'help' },
                  ].map((item) => (
                    <button key={item.id} type="button" onClick={() => { setPageSafe(item.id); setUserMenuOpen(false); }} className="w-full px-4 py-2 text-left text-sm hover:bg-[var(--bg-hover)] transition-colors flex items-center gap-2.5">
                      <NavIcon name={item.icon} className="w-4 h-4" />
                      {item.label}
                    </button>
                  ))}
                  <div className="border-t my-1" style={{ borderColor: 'var(--border)' }} />
                  <div className="px-4 py-2 flex items-center justify-between">
                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Тема</span>
                    <ThemeToggle />
                  </div>
                  <button type="button" onClick={() => { setUserMenuOpen(false); logout(); }} className="w-full px-4 py-2 text-left text-sm hover:bg-[var(--bg-hover)] transition-colors flex items-center gap-2.5" style={{ color: 'var(--danger)' }}>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    Выйти
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {notifOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
          <div className="fixed right-4 sm:right-6 top-14 w-80 z-50 overflow-hidden animate-fade-in" style={{ background: 'var(--bg-card-solid)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)' }}>
            <div className="px-4 py-3 border-b flex justify-between items-center" style={{ borderColor: 'var(--border)' }}>
              <span className="font-semibold text-sm">Уведомления</span>
              {toasts.length > 0 && (
                <button type="button" onClick={clearAll} className="text-xs font-medium hover:opacity-80 transition-opacity" style={{ color: 'var(--accent)' }}>Очистить</button>
              )}
            </div>
            <div className="max-h-72 overflow-y-auto custom-scrollbar">
              {toasts.length === 0 ? (
                <div className="px-5 py-8 text-center">
                  <svg className="w-8 h-8 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} style={{ color: 'var(--text-muted)' }}>
                    <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 00-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Нет уведомлений</p>
                </div>
              ) : (
                toasts.slice().reverse().map((t) => (
                  <div key={t.id} className="px-4 py-3 border-b hover:bg-[var(--bg-hover)] transition-colors" style={{ borderColor: 'var(--border)' }}>
                    <p className="font-medium text-sm leading-snug">{t.title}</p>
                    {t.message && <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>{t.message}</p>}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {mobileMenuOpen && (
        <>
          <div className="fixed inset-0 z-40 lg:hidden animate-fade-in" style={{ background: 'var(--bds-trans-mask)' }} onClick={() => setMobileMenuOpen(false)} />
          <div className="fixed top-0 left-0 z-50 w-72 max-w-[85vw] h-full overflow-y-auto lg:hidden animate-slide-up custom-scrollbar" style={{ background: 'var(--bg-card-solid)', borderRight: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)' }}>
            <div className="h-12 px-4 flex items-center justify-between border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-2">
                <img src="/logo.svg" alt="CLABX" className="h-5 w-5" />
                <span className="font-bold text-sm" style={{ color: 'var(--accent)' }}>CLABX</span>
              </div>
              <button type="button" onClick={() => setMobileMenuOpen(false)} className="p-2 rounded hover:bg-[var(--bg-hover)]" style={{ color: 'var(--text-muted)' }}>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <nav className="p-2 flex flex-col gap-0.5">
              {(['trading', 'analytics', 'account'] as const).map((group) => {
                const items = PAGES.filter((p) => p.group === group);
                if (items.length === 0) return null;
                return (
                  <div key={group} className="mb-2">
                    <p className="text-[11px] font-medium uppercase tracking-wider px-3 mb-1 mt-2" style={{ color: 'var(--text-muted)' }}>{GROUP_LABELS[group]}</p>
                    {items.map((p) => {
                      const active = safePage === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setPageSafe(p.id)}
                          className="w-full px-3 py-2.5 text-left text-sm font-medium flex items-center gap-3 min-h-[40px] transition-colors"
                          style={{ color: active ? 'var(--accent)' : 'var(--text-secondary)', background: active ? 'var(--accent-dim)' : 'transparent', borderRadius: 'var(--radius)' }}
                        >
                          <NavIcon name={p.id} className="w-[18px] h-[18px] shrink-0" />
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </nav>
          </div>
        </>
      )}

      <main className="flex-1 min-h-0 overflow-auto px-4 sm:px-6 lg:px-8 py-5 pb-32 lg:pb-5">
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin-slow" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
            </div>
          }
        >
          <div key={safePage} className="animate-page-in max-w-7xl mx-auto">
            <Outlet />
          </div>
        </Suspense>
      </main>

      <footer className="hidden lg:block shrink-0 border-t px-6 py-2.5" style={{ borderColor: 'var(--border)', background: 'var(--bg-topbar)', color: 'var(--text-muted)' }}>
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-[11px]">
          <p>© {year} <span style={{ color: 'var(--accent)' }}>CLABX</span> — Crypto Trading Platform</p>
          <div className="flex flex-wrap gap-4">
            <a href="https://clabx.ru" target="_blank" rel="noreferrer" className="hover:text-[var(--text-secondary)] transition-colors">clabx.ru</a>
            <a href="https://t.me/clabx_bot" target="_blank" rel="noreferrer" className="hover:text-[var(--text-secondary)] transition-colors">@clabx_bot</a>
            <button type="button" onClick={() => setPageSafe('help')} className="hover:text-[var(--text-secondary)] transition-colors bg-transparent border-0 p-0 cursor-pointer text-inherit">Помощь</button>
            <button type="button" onClick={() => setPageSafe('privacy')} className="hover:text-[var(--text-secondary)] transition-colors bg-transparent border-0 p-0 cursor-pointer text-inherit">Конфиденциальность</button>
            <button type="button" onClick={() => setPageSafe('terms')} className="hover:text-[var(--text-secondary)] transition-colors bg-transparent border-0 p-0 cursor-pointer text-inherit">Условия</button>
          </div>
        </div>
      </footer>

      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around border-t"
        style={{ background: 'var(--bg-topbar)', borderColor: 'var(--border)', minHeight: '5.5rem', paddingTop: '0.75rem', paddingBottom: 'env(safe-area-inset-bottom, 0.5rem)' }}
      >
        {MOBILE_TABS.filter((id) => allowedSet.has(id)).map((id) => {
          const active = safePage === id;
          const info = ALL_PAGES.find((p) => p.id === id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => setPageSafe(id)}
              className="flex flex-col items-center justify-center gap-1.5 flex-1 py-2 transition-colors relative"
              style={{ color: active ? 'var(--accent)' : 'var(--text-muted)' }}
            >
              <NavIcon name={id} className="w-7 h-7" />
              <span className="text-xs font-medium">{info?.label ?? id}</span>
              {active && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full" style={{ background: 'var(--accent)' }} />}
            </button>
          );
        })}
        <button type="button" onClick={() => setMobileMenuOpen(true)} className="flex flex-col items-center justify-center gap-1.5 flex-1 py-2 transition-colors" style={{ color: 'var(--text-muted)' }}>
          <NavIcon name="menu" className="w-7 h-7" />
          <span className="text-xs font-medium">Ещё</span>
        </button>
      </nav>

      {!online && <OfflineBanner />}
    </div>
  );
}
