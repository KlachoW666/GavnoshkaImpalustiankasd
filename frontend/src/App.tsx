import { useState, useEffect } from 'react';
import Dashboard from './pages/Dashboard';
import SignalFeed from './pages/SignalFeed';
import ChartView from './pages/ChartView';
import DemoPage from './pages/DemoPage';
import AutoTradingPage from './pages/AutoTradingPage';
import SettingsPage from './pages/SettingsPage';
import PnlCalculatorPage from './pages/PnlCalculatorPage';
import { getSavedPage, savePage } from './store/appStore';
import { useNotifications } from './contexts/NotificationContext';
import { getSettings } from './store/settingsStore';

type Page = 'dashboard' | 'signals' | 'chart' | 'demo' | 'autotrade' | 'pnl' | 'settings';

const PAGES: { id: Page; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Обзор', icon: '◉' },
  { id: 'signals', label: 'Сигналы', icon: '◈' },
  { id: 'chart', label: 'График', icon: '▣' },
  { id: 'demo', label: 'Демо', icon: '◆' },
  { id: 'autotrade', label: 'Авто', icon: '◇' },
  { id: 'pnl', label: 'PNL', icon: '💰' },
  { id: 'settings', label: 'Настройки', icon: '⚙' }
];

function useSignalToasts() {
  const { addToast } = useNotifications();

  useEffect(() => {
    const wsUrl = (location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host + '/ws';
    const ws = new WebSocket(wsUrl);
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'signal' && msg.data) {
          const s = msg.data;
          const cfg = getSettings().notifications;
          const conf = (s.confidence ?? 0) * 100;
          if (conf < (cfg?.minConfidence ?? 75)) return;
          if (s.direction === 'LONG' && !cfg?.long) return;
          if (s.direction === 'SHORT' && !cfg?.short) return;
          addToast({
            type: 'signal',
            title: `${s.symbol} — ${s.direction}`,
            message: `Вход: ${s.entry_price?.toLocaleString('ru-RU')} • Уверенность: ${conf.toFixed(0)}%`,
            duration: 6000
          });
          if (cfg?.sound) {
            try {
              const ac = new AudioContext();
              const o = ac.createOscillator();
              const g = ac.createGain();
              o.connect(g);
              g.connect(ac.destination);
              o.frequency.value = 880;
              g.gain.setValueAtTime(0.1, ac.currentTime);
              g.gain.exponentialRampToValueAtTime(0.01, ac.currentTime + 0.15);
              o.start(ac.currentTime);
              o.stop(ac.currentTime + 0.15);
            } catch {}
          }
          if (cfg?.desktop && 'Notification' in window && Notification.permission === 'granted') {
            new Notification(`${s.symbol} ${s.direction}`, {
              body: `Вход: ${s.entry_price?.toLocaleString('ru-RU')} • ${conf.toFixed(0)}%`,
              icon: '/favicon.ico'
            });
          }
        }
      } catch {}
    };
    return () => ws.close();
  }, [addToast]);
}

export default function App() {
  const [page, setPage] = useState<Page>(() => {
    const saved = getSavedPage();
    return (PAGES.some((p) => p.id === saved) ? saved : 'dashboard') as Page;
  });
  const [notifOpen, setNotifOpen] = useState(false);
  const { toasts, clearAll } = useNotifications();

  useSignalToasts();

  useEffect(() => {
    savePage(page);
  }, [page]);

  const setPageSafe = (p: Page) => setPage(p);
  useEffect(() => {
    (window as any).__navigateTo = setPageSafe;
    return () => { delete (window as any).__navigateTo; };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '1') { setPage('dashboard'); e.preventDefault(); }
        else if (e.key === '2') { setPage('signals'); e.preventDefault(); }
        else if (e.key === '3') { setPage('chart'); e.preventDefault(); }
        else if (e.key === '4') { setPage('demo'); e.preventDefault(); }
        else if (e.key === '5') { setPage('autotrade'); e.preventDefault(); }
        else if (e.key === '6') { setPage('pnl'); e.preventDefault(); }
        else if (e.key === ',') { setPage('settings'); e.preventDefault(); }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg-base)', color: 'var(--text-primary)' }}>
      {/* Top bar — Cryptory style */}
      <header
        className="shrink-0 h-14 px-6 md:px-8 lg:px-10 flex items-center justify-between border-b"
        style={{ background: 'var(--bg-topbar)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded flex items-center justify-center font-bold text-lg"
            style={{ background: 'var(--accent-gradient)', color: 'white', letterSpacing: '-0.05em' }}
          >
            C
          </div>
          <h1 className="text-lg font-semibold tracking-tight">CryptoSignal Pro</h1>
        </div>
        <nav className="flex items-center gap-1">
          {PAGES.map((p) => (
            <button
              key={p.id}
              onClick={() => setPage(p.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all relative ${
                page === p.id ? 'text-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {p.label}
              {page === p.id && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full" style={{ background: 'var(--accent)' }} />
              )}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setNotifOpen(!notifOpen)}
            className="relative p-2 rounded-full transition-colors hover:bg-[var(--bg-hover)]"
            style={{ background: toasts.length > 0 ? 'var(--accent-dim)' : 'transparent' }}
          >
            <span className="text-lg">🔔</span>
            {toasts.length > 0 && (
              <span
                className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] font-bold"
                style={{ background: 'var(--accent)', color: 'var(--bg-base)' }}
              >
                {Math.min(toasts.length, 99)}
              </span>
            )}
          </button>
        </div>
      </header>

      {notifOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
          <div
            className="fixed right-6 top-16 w-72 rounded-lg border z-50 overflow-hidden"
            style={{ background: 'var(--bg-card-solid)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-lg)' }}
          >
            <div className="px-4 py-3 border-b flex justify-between items-center" style={{ borderColor: 'var(--border)' }}>
              <span className="font-semibold text-sm">Уведомления</span>
              {toasts.length > 0 && (
                <button type="button" onClick={clearAll} className="text-xs hover:opacity-80" style={{ color: 'var(--accent)' }}>
                  Очистить
                </button>
              )}
            </div>
            <div className="max-h-64 overflow-y-auto">
              {toasts.length === 0 ? (
                <p className="px-5 py-4 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>Нет уведомлений</p>
              ) : (
                toasts.slice().reverse().map((t) => (
                  <div
                    key={t.id}
                    className="px-4 py-3 border-b hover:bg-[var(--bg-hover)] transition-colors"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <p className="font-medium text-sm leading-snug">{t.title}</p>
                    {t.message && <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-muted)' }}>{t.message}</p>}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      <main className="flex-1 min-h-0 overflow-auto py-8 px-8 md:px-12 lg:px-16">
        <div className={page === 'dashboard' ? 'block' : 'hidden'}>
          <Dashboard />
        </div>
        <div className={page === 'signals' ? 'block' : 'hidden'}>
          <SignalFeed />
        </div>
        <div className={page === 'chart' ? 'block' : 'hidden'}>
          {page === 'chart' && <ChartView />}
        </div>
        <div className={page === 'demo' ? 'block' : 'hidden'}>
          <DemoPage />
        </div>
        <div className={page === 'autotrade' ? 'block' : 'hidden'}>
          <AutoTradingPage />
        </div>
        <div className={page === 'pnl' ? 'block' : 'hidden'}>
          <PnlCalculatorPage />
        </div>
        <div className={page === 'settings' ? 'block' : 'hidden'}>
          <SettingsPage />
        </div>
      </main>
    </div>
  );
}
