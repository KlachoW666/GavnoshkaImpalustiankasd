import { useState, useEffect, useMemo } from 'react';
import { TradingSignal } from '../types/signal';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../utils/api';
import { useNavigation, type Page } from '../contexts/NavigationContext';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Tabs } from '../components/ui/Tabs';

type DirectionFilter = 'all' | 'LONG' | 'SHORT';
type SortBy = 'time' | 'confidence' | 'rr';

function formatDate(ts: string | undefined): string {
  if (!ts) return '—';
  const d = new Date(ts);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
}

function formatPrice(n: number | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n >= 1000) return n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 1) return n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  return n.toFixed(6);
}

function goToChart(symbol: string, timeframe: string, navigateTo: (page: Page) => void) {
  const sym = (symbol || '').replace(/\//g, '-').trim() || 'BTC-USDT';
  const tf = (timeframe || '5m').toLowerCase();
  if (typeof window !== 'undefined') {
    const path = `/chart?symbol=${encodeURIComponent(sym)}&timeframe=${encodeURIComponent(tf)}`;
    window.history.pushState({}, '', path);
    navigateTo('chart');
  }
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.min(100, value * 100);
  const color = value >= 0.8 ? 'var(--success)' : value >= 0.6 ? 'var(--warning)' : 'var(--danger)';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
        <div
          className="h-full rounded-full transition-all duration-500 shadow-glow"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="text-xs font-bold tabular-nums" style={{ color }}>{pct.toFixed(0)}%</span>
    </div>
  );
}

function SignalSkeleton() {
  return (
    <Card variant="default" padding="compact">
      <div className="flex items-center gap-3 mb-3">
        <div className="animate-shimmer h-4 w-24 rounded" />
        <div className="animate-shimmer h-4 w-14 rounded" />
      </div>
      <div className="grid grid-cols-4 gap-2 mb-2">
        <div className="animate-shimmer h-10 rounded" />
        <div className="animate-shimmer h-10 rounded" />
        <div className="animate-shimmer h-10 rounded" />
        <div className="animate-shimmer h-10 rounded" />
      </div>
      <div className="animate-shimmer h-1.5 w-full rounded" />
    </Card>
  );
}

export default function SignalFeed() {
  const { navigateTo } = useNavigation();
  const [signals, setSignals] = useState<TradingSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<DirectionFilter>('all');
  const [sortBy, setSortBy] = useState<SortBy>('time');
  const [searchSymbol, setSearchSymbol] = useState('');
  const [minConfidence, setMinConfidence] = useState(0);
  const { token } = useAuth();

  const fetchSignals = () => {
    setLoading(true);
    api
      .get<TradingSignal[]>('/signals?limit=100')
      .then((arr) => setSignals(Array.isArray(arr) ? arr : []))
      .catch(() => setSignals([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchSignals(); }, []);

  useEffect(() => {
    const wsUrl = (location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host + '/ws';
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => {
      if (token) ws.send(JSON.stringify({ type: 'auth', token }));
    };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'signal' && msg.data) {
          const payload = msg.data as { signal?: TradingSignal } & TradingSignal;
          const sig = payload.signal ?? payload;
          if (sig?.symbol != null) setSignals((prev) => [sig as TradingSignal, ...prev]);
        }
      } catch { }
    };
    return () => ws.close();
  }, [token]);

  const filteredAndSorted = useMemo(() => {
    let list = signals;
    if (filter !== 'all') list = list.filter((s) => s.direction === filter);
    const search = searchSymbol.trim().toUpperCase();
    if (search) list = list.filter((s) => (s.symbol || '').toUpperCase().includes(search));
    const minConf = minConfidence / 100;
    if (minConf > 0) list = list.filter((s) => (s.confidence ?? 0) >= minConf);
    const sorted = [...list].sort((a, b) => {
      if (sortBy === 'time') return new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime();
      if (sortBy === 'confidence') return (b.confidence ?? 0) - (a.confidence ?? 0);
      if (sortBy === 'rr') return (b.risk_reward ?? 0) - (a.risk_reward ?? 0);
      return 0;
    });
    return sorted;
  }, [signals, filter, searchSymbol, minConfidence, sortBy]);

  const stats = useMemo(() => {
    const long = signals.filter((s) => s.direction === 'LONG').length;
    const short = signals.filter((s) => s.direction === 'SHORT').length;
    return { total: signals.length, long, short };
  }, [signals]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Сигналы</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Торговые идеи в реальном времени
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={fetchSignals} loading={loading}>
          Обновить
        </Button>
      </div>

      {/* Stats + Filters */}
      <Card variant="default" padding="none" className="p-2 border-none" style={{ background: 'var(--bg-surface)' }}>
        <div className="flex flex-wrap items-center gap-3">
          {/* Direction tabs */}
          <Tabs
            tabs={[
              { id: 'all', label: 'Все', count: stats.total },
              { id: 'LONG', label: 'LONG', count: stats.long },
              { id: 'SHORT', label: 'SHORT', count: stats.short },
            ]}
            active={filter}
            onChange={(id) => setFilter(id as DirectionFilter)}
            size="sm"
          />

          <div className="h-6 w-px mx-1 hidden sm:block" style={{ background: 'var(--border)' }} />

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="input-field w-auto text-xs py-1.5 px-3"
          >
            <option value="time">Новые</option>
            <option value="confidence">Уверенность</option>
            <option value="rr">R:R</option>
          </select>

          <input
            type="text"
            placeholder="Поиск..."
            value={searchSymbol}
            onChange={(e) => setSearchSymbol(e.target.value)}
            className="input-field w-32 text-xs py-1.5 px-3"
          />

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Мин</span>
            <input
              type="range"
              min={0}
              max={95}
              step={5}
              value={minConfidence}
              onChange={(e) => setMinConfidence(Number(e.target.value))}
              className="slider-track w-20"
            />
            <span className="text-xs font-bold tabular-nums w-8" style={{ color: 'var(--accent)' }}>
              {minConfidence > 0 ? `${minConfidence}%` : 'Все'}
            </span>
          </div>
        </div>
      </Card>

      {/* Signal list */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <SignalSkeleton key={`skel-${i}`} />)}
        </div>
      ) : filteredAndSorted.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="font-medium" style={{ color: 'var(--text-primary)' }}>Нет активных сигналов</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Измените фильтры или подождите новые идеи</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAndSorted.map((s, idx) => {
            const isLong = s.direction === 'LONG';
            return (
              <Card
                key={s.id ?? `sig-${idx}`}
                variant="default"
                padding="none"
                hoverable
                className="overflow-hidden border-b last:border-b-0 rounded-none sm:rounded"
                style={{ border: 'none', borderBottom: '1px solid var(--border)' }}
              >
                <div
                  className="absolute left-0 top-0 bottom-0 w-1 opacity-100"
                  style={{ background: isLong ? 'var(--success)' : 'var(--danger)' }}
                />
                <div className="p-3 sm:p-4 pl-4">
                  {/* Top row */}
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-base">{s.symbol}</span>
                      <Badge variant={isLong ? 'long' : 'short'}>
                        {isLong ? 'LONG' : 'SHORT'}
                      </Badge>
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {s.exchange} · {s.timeframe}
                      </span>
                      {s.aiWinProbability != null && (
                        <Badge variant="info">
                          AI {(s.aiWinProbability * 100).toFixed(0)}%
                        </Badge>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => goToChart(s.symbol, s.timeframe, navigateTo)}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors hover:bg-[var(--bg-hover)]"
                      style={{ color: 'var(--accent)' }}
                    >
                      На график →
                    </button>
                  </div>

                  {/* Price grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3 mt-1">
                    <div className="rounded px-3 py-2 border" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
                      <p className="text-[10px] uppercase tracking-wider mb-0.5 font-semibold" style={{ color: 'var(--text-muted)' }}>Вход</p>
                      <p className="font-mono text-sm font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{formatPrice(s.entry_price)}</p>
                    </div>
                    <div className="rounded px-3 py-2 border" style={{ background: 'var(--bg-base)', border: '1px solid rgba(246, 70, 93, 0.2)' }}>
                      <p className="text-[10px] uppercase tracking-wider mb-0.5 font-semibold" style={{ color: 'var(--danger)' }}>Stop Loss</p>
                      <p className="font-mono text-sm font-bold tabular-nums" style={{ color: 'var(--danger)' }}>{formatPrice(s.stop_loss)}</p>
                    </div>
                    <div className="rounded px-3 py-2 border" style={{ background: 'var(--bg-base)', border: '1px solid rgba(14, 203, 129, 0.2)' }}>
                      <p className="text-[10px] uppercase tracking-wider mb-0.5 font-semibold" style={{ color: 'var(--success)' }}>Take Profit</p>
                      <p className="font-mono text-sm font-medium tabular-nums" style={{ color: 'var(--success)' }}>
                        {(Array.isArray(s.take_profit) ? s.take_profit : []).map((t) => formatPrice(t)).join(' / ') || '—'}
                      </p>
                    </div>
                    <div className="rounded px-3 py-2 border" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
                      <p className="text-[10px] uppercase tracking-wider mb-0.5 font-semibold" style={{ color: 'var(--text-muted)' }}>Risk:Reward</p>
                      <p className="font-mono text-sm font-bold tabular-nums" style={{ color: 'var(--accent)' }}>
                        {typeof s.risk_reward === 'number' ? s.risk_reward.toFixed(1) : '—'}
                      </p>
                    </div>
                  </div>

                  {/* Confidence bar */}
                  <ConfidenceBar value={s.confidence ?? 0} />

                  {/* Footer */}
                  <div className="flex flex-wrap items-center gap-2 mt-2.5">
                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{formatDate(s.timestamp)}</span>
                    {Array.isArray(s.triggers) && s.triggers.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {s.triggers.map((t) => (
                          <span
                            key={t}
                            className="px-1.5 py-0.5 rounded text-[10px]"
                            style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
