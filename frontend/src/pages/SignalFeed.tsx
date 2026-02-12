import { useState, useEffect, useMemo } from 'react';
import { TradingSignal } from '../types/signal';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../utils/api';
import { SkeletonCard } from '../components/Skeleton';

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

function goToChart(symbol: string, timeframe: string) {
  const sym = (symbol || '').replace(/\//g, '-').trim() || 'BTC-USDT';
  const tf = (timeframe || '5m').toLowerCase();
  if (typeof window !== 'undefined') {
    const path = `/chart?symbol=${encodeURIComponent(sym)}&timeframe=${encodeURIComponent(tf)}`;
    window.history.pushState({}, '', path);
    (window as any).__navigateTo?.('chart');
  }
}

export default function SignalFeed() {
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

  useEffect(() => {
    fetchSignals();
  }, []);

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
      } catch {}
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
      if (sortBy === 'time') {
        const ta = new Date(a.timestamp || 0).getTime();
        const tb = new Date(b.timestamp || 0).getTime();
        return tb - ta;
      }
      if (sortBy === 'confidence') {
        const ca = a.confidence ?? 0;
        const cb = b.confidence ?? 0;
        return cb - ca;
      }
      if (sortBy === 'rr') {
        const ra = a.risk_reward ?? 0;
        const rb = b.risk_reward ?? 0;
        return rb - ra;
      }
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
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">◈</span>
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              Сигналы
            </h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Торговые идеи по инструментам OKX. Новые сигналы приходят в реальном времени.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={fetchSignals}
          disabled={loading}
          className="px-4 py-2 rounded-xl text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
        >
          {loading ? 'Загрузка…' : 'Обновить'}
        </button>
      </div>

      {/* Stats */}
      <div className="flex flex-wrap gap-3">
        <div
          className="rounded-xl px-4 py-2 border flex items-center gap-2"
          style={{ background: 'var(--bg-card-solid)', borderColor: 'var(--border)' }}
        >
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Всего</span>
          <span className="font-bold" style={{ color: 'var(--accent)' }}>{stats.total}</span>
        </div>
        <div
          className="rounded-xl px-4 py-2 border flex items-center gap-2"
          style={{ background: 'var(--success-dim)', borderColor: 'var(--success)' }}
        >
          <span className="text-sm" style={{ color: 'var(--success)' }}>LONG</span>
          <span className="font-bold" style={{ color: 'var(--success)' }}>{stats.long}</span>
        </div>
        <div
          className="rounded-xl px-4 py-2 border flex items-center gap-2"
          style={{ background: 'var(--danger-dim)', borderColor: 'var(--danger)' }}
        >
          <span className="text-sm" style={{ color: 'var(--danger)' }}>SHORT</span>
          <span className="font-bold" style={{ color: 'var(--danger)' }}>{stats.short}</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-2">
          {(['all', 'LONG', 'SHORT'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
              style={{
                background: filter === f ? 'var(--accent)' : 'var(--bg-hover)',
                color: filter === f ? 'white' : 'var(--text-secondary)'
              }}
            >
              {f === 'all' ? 'Все' : f}
            </button>
          ))}
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          className="rounded-xl px-3 py-2 text-sm border bg-transparent"
          style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        >
          <option value="time">Сначала новые</option>
          <option value="confidence">По уверенности</option>
          <option value="rr">По R:R</option>
        </select>
        <input
          type="text"
          placeholder="Поиск по символу..."
          value={searchSymbol}
          onChange={(e) => setSearchSymbol(e.target.value)}
          className="rounded-xl px-3 py-2 text-sm border w-40 md:w-52 bg-transparent placeholder:opacity-60"
          style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        />
        <div className="flex items-center gap-2">
          <label className="text-xs" style={{ color: 'var(--text-muted)' }}>Мин. уверенность</label>
          <input
            type="number"
            min={0}
            max={100}
            value={minConfidence || ''}
            onChange={(e) => setMinConfidence(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
            placeholder="0"
            className="rounded-lg px-2 py-1.5 text-sm w-14 border bg-transparent"
            style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          />
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>%</span>
        </div>
      </div>

      {/* List */}
      {loading && signals.length === 0 ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <SkeletonCard key={i} lines={4} />
          ))}
        </div>
      ) : filteredAndSorted.length === 0 ? (
        <div
          className="rounded-2xl p-8 text-center"
          style={{
            background: 'var(--bg-card-solid)',
            border: '1px solid var(--border)',
            borderLeft: '4px solid var(--warning)'
          }}
        >
          <p className="text-lg font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
            Нет сигналов
          </p>
          <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
            {signals.length === 0
              ? 'Сигналы появятся после анализа рынка. Откройте График или Авто-торговлю для настройки.'
              : 'Попробуйте ослабить фильтры (направление, поиск, минимальная уверенность).'}
          </p>
          <button
            type="button"
            onClick={() => (window as any).__navigateTo?.('chart')}
            className="px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: 'var(--accent)', color: 'white' }}
          >
            Перейти к Графику
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredAndSorted.map((s, idx) => (
            <article
              key={s.id ?? `sig-${idx}`}
              className="rounded-2xl overflow-hidden transition-all duration-200 hover:shadow-lg"
              style={{
                background: 'linear-gradient(145deg, var(--bg-card-solid) 0%, var(--bg-hover) 100%)',
                border: '1px solid var(--border)',
                borderLeft: `4px solid ${s.direction === 'LONG' ? 'var(--success)' : 'var(--danger)'}`,
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
              }}
            >
              <div className="p-5 md:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>
                      {s.symbol}
                    </h2>
                    <span
                      className="px-3 py-1 rounded-lg text-xs font-semibold"
                      style={{
                        background: s.direction === 'LONG' ? 'var(--success-dim)' : 'var(--danger-dim)',
                        color: s.direction === 'LONG' ? 'var(--success)' : 'var(--danger)'
                      }}
                    >
                      {s.direction === 'LONG' ? 'LONG' : 'SHORT'}
                    </span>
                    <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                      {s.exchange} • {s.timeframe}
                    </span>
                    {s.aiWinProbability != null && (
                      <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }} title="AI: вероятность выигрыша">
                        AI {(s.aiWinProbability * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => goToChart(s.symbol, s.timeframe)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-90"
                    style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}
                  >
                    На график
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  <div className="rounded-xl px-4 py-3" style={{ background: 'var(--bg-hover)' }}>
                    <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Вход</p>
                    <p className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {formatPrice(s.entry_price)}
                    </p>
                  </div>
                  <div className="rounded-xl px-4 py-3" style={{ background: 'var(--danger-dim)' }}>
                    <p className="text-xs mb-1" style={{ color: 'var(--danger)' }}>Стоп-лосс</p>
                    <p className="font-mono font-semibold" style={{ color: 'var(--danger)' }}>
                      {formatPrice(s.stop_loss)}
                    </p>
                  </div>
                  <div className="rounded-xl px-4 py-3" style={{ background: 'var(--success-dim)' }}>
                    <p className="text-xs mb-1" style={{ color: 'var(--success)' }}>Тейк-профит</p>
                    <p className="font-mono text-sm" style={{ color: 'var(--success)' }}>
                      {(Array.isArray(s.take_profit) ? s.take_profit : [])
                        .map((t) => formatPrice(t))
                        .join(' / ') || '—'}
                    </p>
                  </div>
                  <div className="rounded-xl px-4 py-3" style={{ background: 'var(--bg-hover)' }}>
                    <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>R:R / Уверенность</p>
                    <p className="font-mono font-semibold" style={{ color: 'var(--warning)' }}>
                      {typeof s.risk_reward === 'number' ? s.risk_reward.toFixed(1) : '—'} /{' '}
                      {((s.confidence ?? 0) * 100).toFixed(0)}%
                    </p>
                    <div
                      className="mt-1 h-1.5 rounded-full overflow-hidden"
                      style={{ background: 'var(--border)' }}
                    >
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(100, (s.confidence ?? 0) * 100)}%`,
                          background: (s.confidence ?? 0) >= 0.8 ? 'var(--success)' : (s.confidence ?? 0) >= 0.6 ? 'var(--warning)' : 'var(--danger)'
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {formatDate(s.timestamp)}
                  </span>
                  {Array.isArray(s.triggers) && s.triggers.length > 0 && (
                    <>
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>•</span>
                      <div className="flex flex-wrap gap-1.5">
                        {s.triggers.map((t) => (
                          <span
                            key={t}
                            className="px-2 py-0.5 rounded text-xs"
                            style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
