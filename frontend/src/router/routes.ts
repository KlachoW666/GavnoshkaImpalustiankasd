/**
 * Route configuration — centralized page/path mapping.
 * Extracted from App.tsx for better maintainability.
 */

export type Page =
  | 'dashboard' | 'signals' | 'chart' | 'trade' | 'demo'
  | 'autotrade' | 'autodemo' | 'scanner' | 'pnl' | 'settings'
  | 'activate' | 'admin' | 'profile' | 'privacy' | 'terms'
  | 'help' | 'backtest' | 'copy' | 'social' | 'trader' | 'wallet';

export const PAGE_PATHS: Record<Page, string> = {
  dashboard: '/',
  signals: '/signals',
  chart: '/chart',
  trade: '/trade',
  demo: '/demo',
  autotrade: '/auto',
  autodemo: '/autodemo',
  scanner: '/scanner',
  pnl: '/pnl',
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
  wallet: '/wallet'
};

export const PATH_TO_PAGE: Record<string, Page> = Object.entries(PAGE_PATHS).reduce(
  (acc, [page, path]) => {
    acc[path] = page as Page;
    return acc;
  },
  {} as Record<string, Page>
);

export function normalizePath(pathname: string): string {
  let p = pathname || '/';
  const q = p.indexOf('?');
  if (q >= 0) p = p.slice(0, q);
  if (!p.startsWith('/')) p = '/' + p;
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p;
}

export function getTraderIdFromPath(): string | null {
  if (typeof window === 'undefined') return null;
  const path = (window.location.pathname || '').trim();
  const match = path.match(/^\/trader\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function getPageFromLocation(allowed: Set<Page>): Page {
  if (typeof window === 'undefined') return 'dashboard';
  const path = normalizePath(window.location.pathname);
  if (path.startsWith('/trader/') && allowed.has('trader')) return 'trader';
  const candidate = PATH_TO_PAGE[path];
  if (candidate && allowed.has(candidate)) return candidate;
  if (allowed.has('dashboard')) return 'dashboard';
  const first = (Array.from(allowed)[0] ?? 'dashboard') as Page;
  return first;
}

export function getPageFromUrl(): Page {
  if (typeof window === 'undefined') return 'dashboard';
  const path = normalizePath(window.location.pathname);
  if (path.startsWith('/trader/')) return 'trader';
  const candidate = PATH_TO_PAGE[path];
  return (candidate as Page) ?? 'dashboard';
}

export interface NavItem {
  id: Page;
  label: string;
  group: 'trading' | 'analytics' | 'account';
}

export const ALL_PAGES: NavItem[] = [
  { id: 'dashboard', label: 'Главная', group: 'trading' },
  { id: 'trade', label: 'Торговля', group: 'trading' },
  { id: 'signals', label: 'Сигналы', group: 'trading' },
  { id: 'chart', label: 'График', group: 'trading' },
  { id: 'autotrade', label: 'Авто-трейд', group: 'trading' },
  { id: 'autodemo', label: 'Авто-Демо', group: 'trading' },
  { id: 'demo', label: 'Демо', group: 'trading' },
  { id: 'scanner', label: 'Скринер', group: 'analytics' },
  { id: 'pnl', label: 'PNL', group: 'analytics' },
  { id: 'backtest', label: 'Бэктест', group: 'analytics' },
  { id: 'copy', label: 'Копитрейдинг', group: 'analytics' },
  { id: 'social', label: 'Социальная', group: 'analytics' },
  { id: 'wallet', label: 'Кошелёк', group: 'account' },
  { id: 'settings', label: 'Настройки', group: 'account' },
  { id: 'activate', label: 'Активация', group: 'account' },
  { id: 'admin', label: 'Админ', group: 'account' },
];

/** Нижняя панель: Скринер и Сигналы только в выпадающем меню. */
export const MOBILE_TABS: Page[] = ['dashboard', 'autotrade', 'chart'];

export const GROUP_LABELS: Record<string, string> = {
  trading: 'Торговля',
  analytics: 'Аналитика',
  account: 'Аккаунт',
};

export const NAV_ICONS: Record<string, string> = {
  dashboard: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4',
  signals: 'M13 10V3L4 14h7v7l9-11h-7z',
  chart: 'M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4v16',
  trade: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6',
  demo: 'M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664zM21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  autotrade: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
  autodemo: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
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
