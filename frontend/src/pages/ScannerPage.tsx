/**
 * Scanner Dashboard — топ монет по волатильности/объёму, уровни, пробои
 */

import { useState, useEffect } from 'react';
import { api } from '../utils/api';

interface CoinScore {
  symbol: string;
  score: number;
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
    const base = (s || '').replace(/[-:\/]USDT$/i, '').replace(/\//g, '-');
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
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="panel p-6">
        <h2 className="text-xl font-semibold mb-5" style={{ color: 'var(--text-primary)' }}>
          Скринер — топ монет
        </h2>
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <label className="flex items-center gap-2">
            <span className="section-title">Топ</span>
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="rounded-lg border px-3 py-2 text-sm font-medium transition-colors"
              style={{ background: 'var(--bg-hover)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            >
              {[5, 10, 15, 20].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <button type="button" onClick={fetchTop} disabled={loading} className="btn-secondary text-sm px-4 py-2">
            Обновить
          </button>
          <button type="button" onClick={runFullAnalysis} disabled={analyzing} className="btn-primary text-sm px-4 py-2">
            {analyzing ? 'Анализ…' : 'Полный анализ (топ 5)'}
          </button>
        </div>
        {loading ? (
          <p className="text-sm py-4" style={{ color: 'var(--text-muted)' }}>Загрузка…</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--border)' }}>
            <table className="table-panel w-full">
              <thead>
                <tr>
                  <th className="text-left">Символ</th>
                  <th className="text-right">Счёт</th>
                  <th className="text-right">Объём 24h</th>
                  <th className="text-right">Волатильность</th>
                  <th className="text-left">Действия</th>
                </tr>
              </thead>
              <tbody>
                {topCoins.map((c) => (
                  <tr key={c.symbol}>
                    <td className="font-medium">{c.symbol}</td>
                    <td className="text-right">{typeof c.score === 'number' ? c.score.toFixed(1) : '—'}</td>
                    <td className="text-right">
                      {(c as any).metrics?.volume24h != null ? ((c as any).metrics.volume24h / 1e6).toFixed(1) + 'M' : (c as any).volume24h != null ? ((c as any).volume24h / 1e6).toFixed(1) + 'M' : '—'}
                    </td>
                    <td className="text-right">
                      {(c as any).metrics?.volatility24h != null ? (c as any).metrics.volatility24h.toFixed(2) + '%' : (c as any).volatility24h != null ? (c as any).volatility24h.toFixed(2) + '%' : '—'}
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => openLevels(c.symbol)}
                        disabled={levelsLoading}
                        className="action-link mr-3 disabled:opacity-50"
                      >
                        Уровни
                      </button>
                      <button
                        type="button"
                        onClick={() => goToChart(c.symbol)}
                        className="action-link"
                      >
                        График
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {levelsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setLevelsModal(null)}>
          <div
            className="panel p-6 max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Уровни {levelsModal.symbol}</h3>
              <button type="button" onClick={() => setLevelsModal(null)} className="w-8 h-8 flex items-center justify-center rounded-lg opacity-70 hover:opacity-100 transition-opacity" style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }} aria-label="Закрыть">×</button>
            </div>
            <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
              Цена: {levelsModal.data.currentPrice} • Уровней: {levelsModal.data.levelsCount}
              {levelsModal.data.nearestLevel && (
                <> • Ближайший: {levelsModal.data.nearestLevel.price} ({levelsModal.data.nearestLevel.type})</>
              )}
            </p>
            <div className="overflow-y-auto flex-1 rounded-lg border mb-4" style={{ borderColor: 'var(--border)' }}>
              <table className="table-panel w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left">Цена</th>
                    <th className="text-left">Тип</th>
                    <th className="text-right">Сила</th>
                    <th className="text-right">Касания</th>
                  </tr>
                </thead>
                <tbody>
                  {(levelsModal.data.levels || []).slice(0, 15).map((l, i) => (
                    <tr key={i}>
                      <td className="font-mono">{l.price}</td>
                      <td>{l.type === 'support' ? 'Поддержка' : 'Сопротивление'}</td>
                      <td className="text-right">{l.strength}</td>
                      <td className="text-right">{l.touches ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="button" onClick={() => goToChart(levelsModal.symbol)} className="btn-primary text-sm w-full">
              Открыть график
            </button>
          </div>
        </div>
      )}

      {analysis.length > 0 && (
        <div className="panel p-6">
          <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Результаты полного анализа</h3>
          <div className="space-y-4">
            {analysis.map((item) => (
              <div
                key={item.coin?.symbol}
                className="rounded-xl border p-4 transition-colors hover:border-[var(--border-hover)]"
                style={{ borderColor: 'var(--border)', background: 'var(--bg-hover)' }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">{item.coin?.symbol}</span>
                  <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    Уровней: {item.levelsCount} • Ближайший: {item.nearestLevel ? item.nearestLevel.price : '—'}
                  </span>
                </div>
                {item.breakout && (
                  <div className="flex items-center gap-2 text-sm">
                    <span
                      className={
                        item.breakout.direction === 'LONG'
                          ? 'text-green-500'
                          : 'text-red-500'
                      }
                    >
                      Пробой {item.breakout.direction} ({(item.breakout.confidence * 100).toFixed(0)}%)
                    </span>
                    <span style={{ color: 'var(--text-muted)' }}>
                      Уровень {item.breakout.level?.price} → вход {item.breakout.entryZone?.optimal}
                    </span>
                  </div>
                )}
                {!item.breakout && item.nearestLevel && (
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    Пробой не обнаружен у ближайшего уровня {item.nearestLevel.price}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => goToChart(item.coin?.symbol || '')}
                  className="mt-2 text-sm action-link"
                >
                  Открыть график / анализ
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
