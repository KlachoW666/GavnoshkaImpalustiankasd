/**
 * Scanner — топ монет по волатильности/объёму, уровни поддержки/сопротивления, пробои
 */

import { useState, useEffect } from 'react';
import { api } from '../utils/api';

interface CoinScore {
  symbol: string;
  score: number;
  rank?: number;
  reasons?: string[];
  metrics?: {
    volume24h: number;
    volatility24h: number;
    priceChange24h: number;
    currentPrice: number;
    [key: string]: unknown;
  };
  volume24h?: number;
  volatility24h?: number;
  [key: string]: unknown;
}

interface LevelRow {
  price: number;
  type: string;
  strength: number;
  touches?: number;
  volume?: number;
  lastTouch?: number;
}

interface LevelsResponse {
  success: boolean;
  symbol: string;
  currentPrice: number;
  levelsCount: number;
  levels: LevelRow[];
  nearestLevel: LevelRow | null;
}

interface FullAnalysisItem {
  coin: CoinScore;
  levelsCount: number;
  topLevels: { price: number; type: string; strength: number }[];
  nearestLevel: { price: number; type: string } | null;
  breakout: {
    direction: string;
    confidence: number;
    level: { price: number };
    entryZone: { optimal: number };
  } | null;
}

const cardStyle = { background: 'var(--bg-card-solid)', border: '1px solid var(--border)', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' };
const sectionTitleStyle = { color: 'var(--text-muted)' };

function normSymbol(s: string): string {
  if (!s) return '';
  return s.replace(/\/USDT:USDT$/i, '').replace(/\//g, '-').trim() + (s.includes('USDT') ? '' : '-USDT');
}

function displaySymbol(s: string): string {
  if (!s) return '';
  const n = s.replace(/\/USDT:USDT$/i, '').replace(/\//g, '-').replace(/-USDT-USDT$/i, '-USDT').trim();
  return n ? (n.endsWith('USDT') ? n : n + '-USDT') : s;
}

function formatPrice(price: number): string {
  if (typeof price !== 'number' || !Number.isFinite(price)) return '—';
  if (price >= 1000) return price.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 1) return price.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  return price.toFixed(6);
}

function formatLevelPrice(price: number): string {
  if (typeof price !== 'number' || !Number.isFinite(price)) return '—';
  if (price >= 1000) return price.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  if (price >= 1) return price.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 6 });
  return price.toFixed(6);
}

function getVolumeStr(c: CoinScore): string {
  const v = (c.metrics?.volume24h ?? (c as any).volume24h) as number | undefined;
  if (v == null) return '—';
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return String(v);
}

function getVolatilityStr(c: CoinScore): string {
  const v = (c.metrics?.volatility24h ?? (c as any).volatility24h) as number | undefined;
  if (v == null) return '—';
  return v.toFixed(2) + '%';
}

function getPrice(c: CoinScore): number | null {
  const p = (c.metrics?.currentPrice as number | undefined);
  return typeof p === 'number' && Number.isFinite(p) ? p : null;
}

function getChange24h(c: CoinScore): number | null {
  const p = (c.metrics?.priceChange24h as number | undefined);
  return typeof p === 'number' && Number.isFinite(p) ? p : null;
}

function levelTypeLabel(type: string): string {
  if (type === 'support') return 'Поддержка';
  if (type === 'resistance') return 'Сопротивление';
  return type;
}

export default function ScannerPage() {
  const [topCoins, setTopCoins] = useState<CoinScore[]>([]);
  const [analysis, setAnalysis] = useState<FullAnalysisItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [limit, setLimit] = useState(10);
  const [levelsModal, setLevelsModal] = useState<{ symbol: string; data: LevelsResponse } | null>(null);
  const [levelsLoading, setLevelsLoading] = useState(false);

  const fetchTop = () => {
    setLoading(true);
    api
      .get<{ coins: CoinScore[] }>(`/scanner/top?limit=${limit}`)
      .then((data) => setTopCoins(data.coins || []))
      .catch(() => setTopCoins([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchTop();
    const t = setInterval(fetchTop, 60_000);
    return () => clearInterval(t);
  }, [limit]);

  const runFullAnalysis = () => {
    setAnalyzing(true);
    setAnalysis([]);
    api
      .post<{ analysis: FullAnalysisItem[] }>('/scanner/full-analysis', { topN: Math.min(limit, 5) })
      .then((data) => setAnalysis(data.analysis || []))
      .catch(() => {})
      .finally(() => setAnalyzing(false));
  };

  const symbolForChart = (s: string) => {
    const raw = (s || '').replace(/\//g, '-').trim();
    if (!raw) return 'BTC-USDT';
    if (/^[A-Z0-9]+-USDT$/i.test(raw)) return raw;
    const base = raw.replace(/-USDT$/i, '');
    return base ? base + '-USDT' : 'BTC-USDT';
  };

  const goToChart = (symbol: string) => {
    const p = symbolForChart(symbol);
    if ((window as any).__navigateTo) {
      (window as any).__navigateTo('chart');
      const path = `/chart?symbol=${encodeURIComponent(p)}`;
      if (typeof window !== 'undefined' && window.history) {
        window.history.pushState({}, '', path);
      }
    }
  };

  const openLevels = (symbol: string) => {
    const sym = symbolForChart(symbol);
    setLevelsLoading(true);
    setLevelsModal(null);
    api
      .get<LevelsResponse>(`/scanner/levels/${encodeURIComponent(sym)}`)
      .then((data) => setLevelsModal({ symbol: sym, data }))
      .catch(() => setLevelsModal(null))
      .finally(() => setLevelsLoading(false));
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto px-4 sm:px-6 pb-12">
      {/* Hero */}
      <header className="rounded-2xl overflow-hidden" style={{ ...cardStyle, borderLeft: '4px solid var(--accent)' }}>
        <div className="p-6 md:p-8">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl shrink-0" style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent)' }}>
              ▤
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>Скринер — топ монет</h1>
              <p className="text-sm mt-1 max-w-xl" style={{ color: 'var(--text-muted)' }}>
                Отбор по волатильности и объёму, уровни поддержки/сопротивления и быстрый переход к графику
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Таблица топ монет */}
      <section className="rounded-2xl overflow-hidden p-6 md:p-8" style={{ ...cardStyle, borderLeft: '4px solid var(--success)' }}>
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-lg font-semibold mb-0.5" style={{ color: 'var(--text-primary)' }}>Топ по скорингу</h2>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Монеты с высокой волатильностью и объёмом за 24ч</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider" style={sectionTitleStyle}>Топ</span>
              <select
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="rounded-xl border px-3 py-2 text-sm font-medium transition-colors min-w-[72px]"
                style={{ background: 'var(--bg-hover)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              >
                {[5, 10, 15, 20].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={fetchTop}
              disabled={loading}
              className="px-4 py-2.5 rounded-xl text-sm font-medium transition-opacity disabled:opacity-50"
              style={{ background: 'var(--bg-hover)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
            >
              Обновить
            </button>
            <button
              type="button"
              onClick={runFullAnalysis}
              disabled={analyzing}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-50"
              style={{ background: 'var(--accent)', color: 'white' }}
            >
              {analyzing ? 'Анализ…' : 'Полный анализ (топ 5)'}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="py-12 rounded-xl text-center" style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
            Загрузка…
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs font-semibold uppercase tracking-wider" style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                  <th className="text-left py-3 px-4">Символ</th>
                  <th className="text-right py-3 px-4">Цена</th>
                  <th className="text-right py-3 px-4">Счёт</th>
                  <th className="text-right py-3 px-4">Объём 24h</th>
                  <th className="text-right py-3 px-4">Изм 24h</th>
                  <th className="text-right py-3 px-4">Волатильность</th>
                  <th className="text-left py-3 px-4">Действия</th>
                </tr>
              </thead>
              <tbody>
                {topCoins.map((c) => {
                  const price = getPrice(c);
                  const change = getChange24h(c);
                  return (
                    <tr key={c.symbol} className="border-b transition-colors hover:bg-[var(--bg-hover)]/50" style={{ borderColor: 'var(--border)' }}>
                      <td className="py-3 px-4 font-medium" style={{ color: 'var(--text-primary)' }}>{displaySymbol(c.symbol)}</td>
                      <td className="text-right py-3 px-4 tabular-nums" style={{ color: 'var(--accent)' }}>{price != null ? formatPrice(price) : '—'}</td>
                      <td className="text-right py-3 px-4 tabular-nums">{typeof c.score === 'number' ? c.score.toFixed(1) : '—'}</td>
                      <td className="text-right py-3 px-4 tabular-nums">{getVolumeStr(c)}</td>
                      <td className={`text-right py-3 px-4 tabular-nums ${change != null ? (change >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]') : ''}`}>
                        {change != null ? (change >= 0 ? '+' : '') + change.toFixed(2) + '%' : '—'}
                      </td>
                      <td className="text-right py-3 px-4 tabular-nums">{getVolatilityStr(c)}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => openLevels(c.symbol)}
                            disabled={levelsLoading}
                            className="text-sm font-medium transition-opacity disabled:opacity-50 hover:underline"
                            style={{ color: 'var(--accent)' }}
                          >
                            Уровни
                          </button>
                          <button
                            type="button"
                            onClick={() => goToChart(c.symbol)}
                            className="text-sm font-medium transition-opacity hover:underline"
                            style={{ color: 'var(--accent)' }}
                          >
                            График
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!loading && topCoins.length === 0 && (
          <div className="py-10 rounded-xl text-center" style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)', border: '1px dashed var(--border)' }}>
            Нет данных. Проверьте подключение к API.
          </div>
        )}
      </section>

      {/* Модальное окно уровней */}
      {levelsModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setLevelsModal(null)}
        >
          <div
            className="rounded-2xl overflow-hidden w-full max-w-lg max-h-[85vh] flex flex-col"
            style={{ ...cardStyle, borderLeft: '4px solid var(--accent)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b flex items-center justify-between shrink-0" style={{ borderColor: 'var(--border)' }}>
              <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Уровни {displaySymbol(levelsModal.symbol)}</h3>
              <button
                type="button"
                onClick={() => setLevelsModal(null)}
                className="w-9 h-9 flex items-center justify-center rounded-xl opacity-80 hover:opacity-100 transition-opacity"
                style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}
                aria-label="Закрыть"
              >
                ×
              </button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                <div className="p-3 rounded-xl" style={{ background: 'var(--accent-dim)', borderLeft: '3px solid var(--accent)' }}>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-0.5" style={sectionTitleStyle}>Цена</p>
                  <p className="font-bold tabular-nums" style={{ color: 'var(--accent)' }}>{formatPrice(levelsModal.data.currentPrice)}</p>
                </div>
                <div className="p-3 rounded-xl" style={{ background: 'var(--bg-hover)' }}>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-0.5" style={sectionTitleStyle}>Уровней</p>
                  <p className="font-semibold tabular-nums">{levelsModal.data.levelsCount}</p>
                </div>
                {levelsModal.data.nearestLevel && (
                  <div className="p-3 rounded-xl sm:col-span-1" style={{ background: 'var(--bg-hover)' }}>
                    <p className="text-xs font-semibold uppercase tracking-wider mb-0.5" style={sectionTitleStyle}>Ближайший</p>
                    <p className="text-xs font-medium tabular-nums">
                      {formatLevelPrice(levelsModal.data.nearestLevel.price)} ({levelTypeLabel(levelsModal.data.nearestLevel.type).toLowerCase()})
                    </p>
                  </div>
                )}
              </div>

              <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs font-semibold uppercase tracking-wider" style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                      <th className="text-left py-2.5 px-3">Цена</th>
                      <th className="text-left py-2.5 px-3">Тип</th>
                      <th className="text-right py-2.5 px-3">Сила</th>
                      <th className="text-right py-2.5 px-3">Касания</th>
                      <th className="text-left py-2.5 px-3">Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(levelsModal.data.levels || []).map((l, i) => (
                      <tr key={i} className="border-b last:border-b-0" style={{ borderColor: 'var(--border)' }}>
                        <td className="py-2.5 px-3 font-mono text-xs tabular-nums">{formatLevelPrice(l.price)}</td>
                        <td className="py-2.5 px-3">{levelTypeLabel(l.type)}</td>
                        <td className="text-right py-2.5 px-3 tabular-nums">{l.strength}</td>
                        <td className="text-right py-2.5 px-3 tabular-nums">{l.touches ?? '—'}</td>
                        <td className="py-2.5 px-3">
                          <button
                            type="button"
                            onClick={() => goToChart(levelsModal.symbol)}
                            className="text-xs font-medium hover:underline"
                            style={{ color: 'var(--accent)' }}
                          >
                            График
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="p-6 border-t shrink-0" style={{ borderColor: 'var(--border)' }}>
              <button
                type="button"
                onClick={() => goToChart(levelsModal.symbol)}
                className="w-full py-3 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90"
                style={{ background: 'var(--accent)', color: 'white' }}
              >
                Открыть график
              </button>
            </div>
          </div>
        </div>
      )}

      {levelsLoading && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="px-6 py-3 rounded-xl text-sm font-medium" style={{ background: 'var(--bg-card-solid)', color: 'var(--text-primary)' }}>
            Загрузка уровней…
          </div>
        </div>
      )}

      {/* Результаты полного анализа */}
      {analysis.length > 0 && (
        <section className="rounded-2xl overflow-hidden p-6 md:p-8" style={{ ...cardStyle, borderLeft: '4px solid var(--accent)' }}>
          <h3 className="text-lg font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Результаты полного анализа</h3>
          <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>Уровни и пробои для топ-5 монет</p>
          <div className="space-y-4">
            {analysis.map((item) => (
              <div
                key={item.coin?.symbol}
                className="rounded-xl border p-4 transition-colors hover:border-[var(--border-hover)]"
                style={{ borderColor: 'var(--border)', background: 'var(--bg-hover)' }}
              >
                <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                  <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{displaySymbol(item.coin?.symbol || '')}</span>
                  <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    Уровней: {item.levelsCount} · Ближайший: {item.nearestLevel ? formatLevelPrice(item.nearestLevel.price) : '—'}
                  </span>
                </div>
                {item.breakout && (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className={item.breakout.direction === 'LONG' ? 'text-[var(--success)]' : 'text-[var(--danger)]'}>
                      Пробой {item.breakout.direction} ({(item.breakout.confidence * 100).toFixed(0)}%)
                    </span>
                    <span style={{ color: 'var(--text-muted)' }}>
                      Уровень {item.breakout.level?.price != null ? formatLevelPrice(item.breakout.level.price) : '—'} → вход {item.breakout.entryZone?.optimal != null ? formatLevelPrice(item.breakout.entryZone.optimal) : '—'}
                    </span>
                  </div>
                )}
                {!item.breakout && item.nearestLevel && (
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    Пробой не обнаружен у ближайшего уровня {formatLevelPrice(item.nearestLevel.price)}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => goToChart(item.coin?.symbol || '')}
                  className="mt-3 text-sm font-medium hover:underline"
                  style={{ color: 'var(--accent)' }}
                >
                  Открыть график / анализ
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
