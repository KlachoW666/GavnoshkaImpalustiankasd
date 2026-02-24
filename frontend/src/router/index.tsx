import { createBrowserRouter, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import RootLayout from '../layouts/RootLayout';
import AuthPage from '../pages/AuthPage';
import MaintenancePage from '../pages/MaintenancePage';
import { useParams, useNavigate } from 'react-router-dom';
import TraderProfilePage from '../pages/TraderProfilePage';

function TraderProfileRoute() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  return (
    <TraderProfilePage
      traderId={userId ?? ''}
      onBackToSocial={() => navigate('/social')}
    />
  );
}

const router = createBrowserRouter([
  {
    path: '/auth',
    element: <AuthPage />,
  },
  {
    path: '/maintenance',
    element: <MaintenancePage />,
  },
  {
    path: '/',
    element: <ProtectedRoute />,
    children: [
      {
        element: <RootLayout />,
        children: [
          { index: true, lazy: () => import('../pages/Dashboard').then((m) => ({ Component: m.default })) },
          { path: 'trade', lazy: () => import('../pages/TradePage').then((m) => ({ Component: m.default })) },
          { path: 'signals', lazy: () => import('../pages/SignalFeed').then((m) => ({ Component: m.default })) },
          { path: 'chart', lazy: () => import('../pages/ChartView').then((m) => ({ Component: m.default })) },
          { path: 'demo', lazy: () => import('../pages/DemoPage').then((m) => ({ Component: m.default })) },
          { path: 'auto', lazy: () => import('../pages/AutoTradingPage').then((m) => ({ Component: m.default })) },
          { path: 'scanner', lazy: () => import('../pages/ScannerPage').then((m) => ({ Component: m.default })) },
          { path: 'pnl', lazy: () => import('../pages/PnlCalculatorPage').then((m) => ({ Component: m.default })) },
          { path: 'analytics', lazy: () => import('../pages/MyAnalyticsPage').then((m) => ({ Component: m.default })) },
          { path: 'backtest', lazy: () => import('../pages/BacktestPage').then((m) => ({ Component: m.default })) },
          { path: 'copy', lazy: () => import('../pages/CopyTradingPage').then((m) => ({ Component: m.default })) },
          { path: 'social', lazy: () => import('../pages/SocialPage').then((m) => ({ Component: m.default })) },
          { path: 'trader/:userId', element: <TraderProfileRoute /> },
          { path: 'settings', lazy: () => import('../pages/SettingsPage').then((m) => ({ Component: m.default })) },
          { path: 'activate', lazy: () => import('../pages/ActivatePage').then((m) => ({ Component: m.default })) },
          { path: 'admin/*', lazy: () => import('../pages/AdminPanel').then((m) => ({ Component: m.default })) },
          { path: 'profile', lazy: () => import('../pages/ProfilePage').then((m) => ({ Component: m.default })) },
          { path: 'wallet', lazy: () => import('../pages/WalletPage').then((m) => ({ Component: m.default })) },
          { path: 'help', lazy: () => import('../pages/HelpPage').then((m) => ({ Component: m.default })) },
          { path: 'privacy', lazy: () => import('../pages/PrivacyPage').then((m) => ({ Component: m.default })) },
          { path: 'terms', lazy: () => import('../pages/TermsPage').then((m) => ({ Component: m.default })) },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);

export default router;
