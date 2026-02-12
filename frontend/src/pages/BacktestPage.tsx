import { useState } from 'react';
import { api } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';

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
  const [minConfidence, setMinConfidence] = useState(60);
  const [riskRewardRatio, setRiskRewardRatio] = useState(2);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

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
              onChange={(e) => setLimit(Number(e.target.value))}
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
          <h2 className="text-lg font-semibold mb-4">Результаты: {result.symbol} {result.timeframe}</h2>
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
                  <tr style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'var(--bg-card-solid)' }}>
                    <th className="text-left py-2 px-2">Направление</th>
                    <th className="text-right py-2 px-2">Вход</th>
                    <th className="text-right py-2 px-2">Выход</th>
                    <th className="text-right py-2 px-2">PnL</th>
                    <th className="text-center py-2 px-2">Результат</th>
                  </tr>
                </thead>
                <tbody>
                  {result.trades.slice(0, 20).map((t, i) => (
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
