import { createContext, useContext, useCallback } from 'react';

export type Page = 'dashboard' | 'signals' | 'chart' | 'trade' | 'demo' | 'autotrade' | 'scanner' | 'pnl' | 'analytics' | 'settings' | 'activate' | 'admin' | 'profile' | 'privacy' | 'terms' | 'help' | 'backtest' | 'copy' | 'social' | 'trader' | 'wallet';

export const PAGE_PATHS: Record<Page, string> = {
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
  wallet: '/wallet'
};

interface NavigationContextValue {
  navigateTo: (page: Page) => void;
  navigateToTrader: (userId: string) => void;
}

const NavigationContext = createContext<NavigationContextValue>({
  navigateTo: () => {},
  navigateToTrader: () => {}
});

export function NavigationProvider({
  children,
  onNavigate,
  onNavigateToTrader
}: {
  children: React.ReactNode;
  onNavigate: (page: Page) => void;
  onNavigateToTrader: (userId: string) => void;
}) {
  const navigateTo = useCallback((page: Page) => {
    onNavigate(page);
  }, [onNavigate]);

  const navigateToTrader = useCallback((userId: string) => {
    onNavigateToTrader(userId);
  }, [onNavigateToTrader]);

  return (
    <NavigationContext.Provider value={{ navigateTo, navigateToTrader }}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  return useContext(NavigationContext);
}
