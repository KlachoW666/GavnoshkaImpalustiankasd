import { useState, useMemo } from 'react';
import { api } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useTableSort } from '../utils/useTableSort';
import { SortableTh } from '../components/SortableTh';

interface BacktestResult {
  symbol: string;
  timeframe: string;
  bars: number;
  initialBalance: number;
  finalBalance: number;
  totalPnl: number;
  totalPnlPct: number;
  trades: Array<{ entryPrice: number; exitPrice: number; direction: string; pnl: number; win: boolean }>;
  totalTrades: number;
  wins: number;
  losses: number;
  winrate: number;
  profitFactor: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
}

const cardStyle = { background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' };

export default function BacktestPage() {
  const { token } = useAuth();
  const [symbol, setSymbol] = useState('BTC-USDT');
  const [timeframe, setTimeframe] = useState('15m');
  const [limit, setLimit] = useState(500);
  const [initialBalance, setInitialBalance] = useState(100);
  const [minConfidence, setMinConfidence] = useState(85);
  const [riskRewardRatio, setRiskRewardRatio] = useState(2);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tradesCompare = useMemo(() => ({
    direction: (a: { direction: string }, b: { direction: string }) => a.direction.localeCompare(b.direction),
    entryPrice: (a: { entryPrice: number }, b: { entryPrice: number }) => a.entryPrice - b.entryPrice,
    exitPrice: (a: { exitPrice: number }, b: { exitPrice: number }) => a.exitPrice - b.exitPrice,
    pnl: (a: { pnl: number }, b: { pnl: number }) => a.pnl - b.pnl
  }), []);
  const { sortedItems: sortedTrades, sortKey, sortDir, toggleSort } = useTableSort(
    result?.trades ?? [],
    tradesCompare,
    'pnl',
    'desc'
  );

  const run = () => {
    setLoading(true);
    setError(null);
    setResult(null);
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
    api
      .post<BacktestResult>('/backtest/run', {
        symbol,
        timeframe,
        limit,
        initialBalance,
        minConfidence: minConfidence / 100,
        riskRewardRatio
      }, { headers })
      .then(setResult)
      .catch((e) => setError((e as Error).message || 'Ошибка бэктеста'))
      .finally(() => setLoading(false));
  };

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
      <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Бэктест стратегии</h1>
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
        Проверка стратегии (RSI + направление свечи) на исторических данных. Метрики: winrate, profit factor, max drawdown.
      </p>

      <section className="rounded-2xl p-6" style={cardStyle}>
        <h2 className="text-lg font-semibold mb-4">Параметры</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Пара</label>
            <input
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border bg-black/20"
              style={{ borderColor: 'var(--border)' }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Таймфрейм</label>
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border bg-black/20"
              style={{ borderColor: 'var(--border)' }}
            >
              <option value="5m">5m</option>
              <option value="15m">15m</option>
              <option value="1h">1h</option>
              <option value="4h">4h</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Свечей</label>
            <input
              type="number"
              min={100}
              max={2000}
              value={limit}
              onChange={(e) => setLimit(Math.min(2000, Math.max(100, Number(e.target.value) || 100)))}
              className="w-full px-3 py-2 rounded-lg border bg-black/20"
              style={{ borderColor: 'var(--border)' }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Начальный баланс $</label>
            <input
              type="number"
              min={10}
              value={initialBalance}
              onChange={(e) => setInitialBalance(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border bg-black/20"
              style={{ borderColor: 'var(--border)' }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Мин. уверенность %</label>
            <input
              type="number"
              min={50}
              max={90}
              value={minConfidence}
              onChange={(e) => setMinConfidence(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border bg-black/20"
              style={{ borderColor: 'var(--border)' }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Risk:Reward</label>
            <input
              type="number"
              min={1}
              max={5}
              step={0.5}
              value={riskRewardRatio}
              onChange={(e) => setRiskRewardRatio(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border bg-black/20"
              style={{ borderColor: 'var(--border)' }}
            />
          </div>
        </div>
        <button
          onClick={run}
          disabled={loading}
          className="mt-4 px-6 py-2.5 rounded-xl font-semibold transition disabled:opacity-50"
          style={{ background: 'var(--accent)', color: 'white' }}
        >
          {loading ? 'Запуск…' : 'Запустить бэктест'}
        </button>
      </section>

      {error && (
        <div className="p-4 rounded-xl" style={{ background: 'var(--danger)', color: 'white', opacity: 0.9 }}>
          {error}
        </div>
      )}

      {result && (
        <section className="rounded-2xl p-6" style={cardStyle}>
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <h2 className="text-lg font-semibold">Результаты: {result.symbol} {result.timeframe}</h2>
            <button
              type="button"
              onClick={() => {
                const headers = ['Пара', 'Таймфрейм', 'Свечей', 'Нач. баланс', 'Итог. баланс', 'PnL $', 'PnL %', 'Сделок', 'Плюс', 'Минус', 'Winrate %', 'Profit Factor', 'Max DD %'];
                const row1 = [result.symbol, result.timeframe, result.bars, result.initialBalance, result.finalBalance, result.totalPnl.toFixed(2), result.totalPnlPct.toFixed(1), result.totalTrades, result.wins, result.losses, result.winrate.toFixed(1), result.profitFactor.toFixed(2), result.maxDrawdownPct.toFixed(1)];
                const tradeHeaders = ['Направление', 'Вход', 'Выход', 'PnL', 'Результат'];
                const rows = [headers.join(','), row1.join(','), '', tradeHeaders.join(',')];
                result.trades.forEach((t) => rows.push([t.direction, t.entryPrice, t.exitPrice, t.pnl.toFixed(2), t.win ? 'win' : 'loss'].join(',')));
                const csv = rows.map((r) => r).join('\r\n');
                const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `backtest_${result.symbol}_${result.timeframe}_${Date.now()}.csv`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="px-4 py-2 rounded-xl text-sm font-medium"
              style={{ background: 'var(--accent)', color: 'white' }}
            >
              Экспорт CSV
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div className="p-3 rounded-lg" style={{ background: 'var(--bg-hover)' }}>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Итог PnL</p>
              <p className={`font-bold ${result.totalPnl >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                {result.totalPnl >= 0 ? '+' : ''}{result.totalPnl.toFixed(2)} $ ({result.totalPnlPct >= 0 ? '+' : ''}{result.totalPnlPct.toFixed(1)}%)
              </p>
            </div>
            <div className="p-3 rounded-lg" style={{ background: 'var(--bg-hover)' }}>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Winrate</p>
              <p className="font-bold">{result.winrate.toFixed(1)}%</p>
            </div>
            <div className="p-3 rounded-lg" style={{ background: 'var(--bg-hover)' }}>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Profit Factor</p>
              <p className="font-bold">{result.profitFactor.toFixed(2)}</p>
            </div>
            <div className="p-3 rounded-lg" style={{ background: 'var(--bg-hover)' }}>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Max Drawdown</p>
              <p className="font-bold text-[var(--danger)]">{result.maxDrawdownPct.toFixed(1)}%</p>
            </div>
          </div>
          <p className="text-sm mb-2" style={{ color: 'var(--text-muted)' }}>
            Сделок: {result.totalTrades} (плюс: {result.wins}, минус: {result.losses}). Баров: {result.bars}.
          </p>
          {result.trades.length > 0 && (
            <div className="overflow-x-auto rounded-xl border mt-4" style={{ borderColor: 'var(--border)' }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderColor: 'var(--border)', background: 'var(--bg-card-solid)' }}>
                    <SortableTh label="Направление" sortKey="direction" currentKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortableTh label="Вход" sortKey="entryPrice" currentKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                    <SortableTh label="Выход" sortKey="exitPrice" currentKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                    <SortableTh label="PnL" sortKey="pnl" currentKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                    <th className="text-center py-2 px-2 text-xs font-semibold uppercase" style={{ color: 'var(--text-muted)' }}>Результат</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTrades.slice(0, 20).map((t, i) => (
                    <tr key={i} className="border-t" style={{ borderColor: 'var(--border)' }}>
                      <td className="py-2 px-2">{t.direction}</td>
                      <td className="text-right py-2 px-2 tabular-nums">{t.entryPrice.toLocaleString('ru-RU')}</td>
                      <td className="text-right py-2 px-2 tabular-nums">{t.exitPrice.toLocaleString('ru-RU')}</td>
                      <td className={`text-right py-2 px-2 ${t.pnl >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>{t.pnl >= 0 ? '+' : ''}{t.pnl.toFixed(2)}</td>
                      <td className="text-center py-2 px-2">{t.win ? '✓' : '✗'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {result.trades.length > 20 && <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>Показаны первые 20 из {result.trades.length}</p>}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
