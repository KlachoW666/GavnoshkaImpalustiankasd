import { createContext, useContext, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

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

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();

  const navigateTo = useCallback((page: Page) => {
    navigate(PAGE_PATHS[page] ?? '/');
  }, [navigate]);

  const navigateToTrader = useCallback((userId: string) => {
    navigate(`/trader/${encodeURIComponent(userId)}`);
  }, [navigate]);

  return (
    <NavigationContext.Provider value={{ navigateTo, navigateToTrader }}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  return useContext(NavigationContext);
}
