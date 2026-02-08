import { useState, useEffect, useCallback } from 'react';

const API = '/api';

interface PnlResult {
  pnlUsd: number;
  pnlRub: number;
  roe: number;
  positionVolume: number;
  liquidationPrice: number;
  status: 'PROFIT' | 'LOSS';
  direction: string;
  currency: string;
}

export default function PnlCalculatorPage() {
  const [currency, setCurrency] = useState<'USD' | 'RUB'>('USD');
  const [direction, setDirection] = useState<'LONG' | 'SHORT'>('SHORT');
  const [entryPrice, setEntryPrice] = useState('70605');
  const [exitPrice, setExitPrice] = useState('69722');
  const [margin, setMargin] = useState('500');
  const [leverage, setLeverage] = useState(20);
  const [usdRubRate, setUsdRubRate] = useState(100);
  const [result, setResult] = useState<PnlResult | null>(null);
  const [loading, setLoading] = useState(false);

  const calc = useCallback(async () => {
    const entry = parseFloat(entryPrice) || 0;
    const exit = parseFloat(exitPrice) || 0;
    const marg = parseFloat(margin) || 0;
    if (entry <= 0 || marg <= 0) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/market/pnl-calc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          direction,
          entryPrice: entry,
          exitPrice: exit,
          margin: marg,
          leverage,
          usdRubRate: currency === 'RUB' ? usdRubRate : 100
        })
      });
      const data = (await res.json()) as PnlResult;
      setResult(res.ok ? data : null);
    } catch {
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [direction, entryPrice, exitPrice, margin, leverage, currency, usdRubRate]);

  useEffect(() => {
    calc();
  }, [calc]);

  const fetchCurrentPrice = async () => {
    try {
      const res = await fetch(`${API}/market/price/BTC-USDT`);
      const data = (await res.json()) as { price?: number };
      if (data?.price) {
        setEntryPrice(String(Math.round(data.price)));
        setExitPrice(String(Math.round(data.price * 0.98)));
      }
    } catch {}
  };

  const isProfit = result?.status === 'PROFIT';
  const pnlDisplay = currency === 'RUB' ? result?.pnlRub : result?.pnlUsd;
  const pnlPrefix = (pnlDisplay ?? 0) >= 0 ? '+' : '';

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-xl font-semibold mb-6" style={{ color: 'var(--text-primary)' }}>
        Калькулятор PNL
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* ПАРАМЕТРЫ СДЕЛКИ */}
        <div
          className="rounded-xl border p-6"
          style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}
        >
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-semibold text-sm uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Параметры сделки
            </h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrency('RUB')}
                className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                  currency === 'RUB' ? 'opacity-100' : 'opacity-50'
                }`}
                style={{
                  background: currency === 'RUB' ? 'var(--bg-hover)' : 'transparent',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border)'
                }}
              >
                RUB
              </button>
              <button
                type="button"
                onClick={() => setCurrency('USD')}
                className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                  currency === 'USD' ? 'opacity-100' : 'opacity-50'
                }`}
                style={{
                  background: currency === 'USD' ? 'var(--accent-dim)' : 'transparent',
                  color: currency === 'USD' ? 'var(--accent)' : 'var(--text-secondary)',
                  border: `1px solid ${currency === 'USD' ? 'var(--accent)' : 'var(--border)'}`
                }}
              >
                USD
              </button>
              <button
                type="button"
                onClick={fetchCurrentPrice}
                className="p-1.5 rounded hover:bg-[var(--bg-hover)] transition-colors"
                title="Подставить текущую цену BTC"
              >
                <span className="text-base">🔄</span>
              </button>
            </div>
          </div>

          <div className="flex gap-2 mb-5">
            <button
              type="button"
              onClick={() => setDirection('LONG')}
              className={`flex-1 py-3 rounded-lg font-semibold text-sm transition-all ${
                direction === 'LONG'
                  ? 'bg-[var(--success-dim)] text-[var(--success)] border-2 border-[var(--success)]'
                  : 'bg-[var(--bg-hover)] text-[var(--text-muted)] border-2 border-transparent'
              }`}
            >
              LONG
            </button>
            <button
              type="button"
              onClick={() => setDirection('SHORT')}
              className={`flex-1 py-3 rounded-lg font-semibold text-sm transition-all ${
                direction === 'SHORT'
                  ? 'bg-[var(--danger-dim)] text-[var(--danger)] border-2 border-[var(--danger)]'
                  : 'bg-[var(--bg-hover)] text-[var(--text-muted)] border-2 border-transparent'
              }`}
            >
              SHORT
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>
                Входная цена ($)
              </label>
              <input
                type="number"
                value={entryPrice}
                onChange={(e) => setEntryPrice(e.target.value)}
                className="input-field w-full"
                placeholder="70605"
                min={0}
                step={1}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>
                Цена выхода ($)
              </label>
              <input
                type="number"
                value={exitPrice}
                onChange={(e) => setExitPrice(e.target.value)}
                className="input-field w-full"
                placeholder="69722"
                min={0}
                step={1}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>
                Маржа ($)
              </label>
              <input
                type="number"
                value={margin}
                onChange={(e) => setMargin(e.target.value)}
                className="input-field w-full"
                placeholder="500"
                min={0}
                step={10}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>
                Кредитное плечо: <span style={{ color: 'var(--accent)' }}>{leverage}x</span>
              </label>
              <input
                type="range"
                min={1}
                max={125}
                value={leverage}
                onChange={(e) => setLeverage(Number(e.target.value))}
                className="w-full h-2 rounded-lg cursor-pointer accent-[var(--accent)]"
                style={{ background: 'var(--bg-hover)' }}
              />
              <div className="flex justify-between text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                <span>1x</span>
                <span>25x</span>
                <span>50x</span>
                <span>75x</span>
                <span>100x</span>
                <span>125x</span>
              </div>
            </div>
            {currency === 'RUB' && (
              <div>
                <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>
                  Курс USD/RUB
                </label>
                <input
                  type="number"
                  value={usdRubRate}
                  onChange={(e) => setUsdRubRate(Number(e.target.value) || 100)}
                  className="input-field w-full"
                  min={1}
                  step={0.5}
                />
              </div>
            )}
          </div>
        </div>

        {/* РЕЗУЛЬТАТ PNL */}
        <div
          className="rounded-xl border p-6 flex flex-col justify-center"
          style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}
        >
          <div className="flex justify-between items-start mb-6">
            <h3 className="font-semibold text-sm uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Результат PNL
            </h3>
            {result && (
              <span
                className={`text-xs font-bold uppercase px-3 py-1 rounded-full ${
                  isProfit ? 'bg-[var(--success-dim)] text-[var(--success)]' : 'bg-[var(--danger-dim)] text-[var(--danger)]'
                }`}
              >
                {result.status}
              </span>
            )}
          </div>

          {loading ? (
            <p style={{ color: 'var(--text-muted)' }}>Расчёт...</p>
          ) : result ? (
            <>
              <div
                className={`text-3xl font-bold mb-2 ${
                  isProfit ? 'text-[var(--success)]' : 'text-[var(--danger)]'
                }`}
              >
                {pnlPrefix}
                {typeof pnlDisplay === 'number' ? pnlDisplay.toLocaleString('ru-RU', { minimumFractionDigits: 2 }) : '0.00'}{' '}
                {currency === 'RUB' ? '₽' : '$'}
              </div>
              <div
                className={`text-lg mb-6 ${
                  isProfit ? 'text-[var(--success)]' : 'text-[var(--danger)]'
                }`}
              >
                ROE: {pnlPrefix}{result.roe.toFixed(2)}%
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2" style={{ borderBottom: '1px solid var(--border)' }}>
                  <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Объём позиции</span>
                  <span className="font-medium">
                    {result.positionVolume.toLocaleString('ru-RU', { minimumFractionDigits: 0 })} $
                  </span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
                    <span>💀</span> Ликвидация
                  </span>
                  <span className="font-medium">
                    {result.liquidationPrice.toLocaleString('ru-RU', { minimumFractionDigits: 2 })} $
                  </span>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Введите входную цену и маржу для расчёта
            </p>
          )}
        </div>
      </div>
      <p className="mt-4 text-xs" style={{ color: 'var(--text-muted)' }}>
        Анализ стакана и свечей использует данные за последние 48 часов для более точного прогноза при открытии сделки.
      </p>
    </div>
  );
}
