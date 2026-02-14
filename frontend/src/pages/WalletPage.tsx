/**
 * Кошелёк — баланс USDT, пополнение, вывод, внутренняя торговля
 * BIP44/HD: Trust Wallet с seed-фразой видит все средства.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../utils/api';

type InternalPosition = {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  size_usdt: number;
  leverage: number;
  open_price: number;
  status: string;
  close_price?: number;
  pnl_usdt?: number;
  pnl_percent?: number;
};

const TRADE_PAIRS = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'XRP-USDT', 'DOGE-USDT'];

export default function WalletPage() {
  const { token } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [walletEnabled, setWalletEnabled] = useState(false);
  const [depositAddresses, setDepositAddresses] = useState<Array<{ network: string; label: string; address: string }>>([]);
  const [loadingDeposit, setLoadingDeposit] = useState(false);
  const [loadingWithdraw, setLoadingWithdraw] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawAddress, setWithdrawAddress] = useState('');
  const [withdrawError, setWithdrawError] = useState('');
  const [withdrawSuccess, setWithdrawSuccess] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);

  const [positions, setPositions] = useState<{ open: InternalPosition[]; closed: InternalPosition[] }>({ open: [], closed: [] });
  const [loadingPositions, setLoadingPositions] = useState(false);
  const [tradeSymbol, setTradeSymbol] = useState(TRADE_PAIRS[0]);
  const [tradeDirection, setTradeDirection] = useState<'LONG' | 'SHORT'>('LONG');
  const [tradeSize, setTradeSize] = useState('');
  const [tradeLeverage, setTradeLeverage] = useState(5);
  const [loadingOpen, setLoadingOpen] = useState(false);
  const [loadingClose, setLoadingClose] = useState<string | null>(null);
  const [tradeError, setTradeError] = useState('');

  const apiOpts = token ? { headers: { Authorization: `Bearer ${token}` } as HeadersInit } : {};

  useEffect(() => {
    if (!token) return;
    api.get<{ balance: number; walletEnabled: boolean }>('/wallet/balance', apiOpts)
      .then((r) => {
        setBalance(r.balance);
        setWalletEnabled(r.walletEnabled ?? false);
      })
      .catch(() => setBalance(0));
    const id = setInterval(() => {
      api.get<{ balance: number }>('/wallet/balance', apiOpts)
        .then((r) => setBalance(r.balance))
        .catch(() => {});
    }, 15000);
    return () => clearInterval(id);
  }, [token]);

  const fetchPositions = useCallback(async () => {
    if (!token) return;
    setLoadingPositions(true);
    try {
      const r = await api.get<{ open: InternalPosition[]; closed: InternalPosition[] }>('/wallet/positions', apiOpts);
      setPositions({ open: r.open || [], closed: r.closed || [] });
    } catch {
      setPositions({ open: [], closed: [] });
    } finally {
      setLoadingPositions(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    fetchPositions();
    const id = setInterval(fetchPositions, 10000);
    return () => clearInterval(id);
  }, [token, fetchPositions]);

  const fetchDepositAddress = async () => {
    if (!token) return;
    setLoadingDeposit(true);
    try {
      const r = await api.get<{ addresses: Array<{ network: string; label: string; address: string }> }>('/wallet/deposit-address', apiOpts);
      setDepositAddresses(r.addresses || []);
    } catch (e) {
      setDepositAddresses([]);
    } finally {
      setLoadingDeposit(false);
    }
  };

  const copyAddress = (addr: string) => {
    if (!addr) return;
    navigator.clipboard?.writeText(addr).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    });
  };

  const handleWithdraw = async () => {
    const amount = parseFloat(withdrawAmount);
    const addr = withdrawAddress.trim();
    setWithdrawError('');
    setWithdrawSuccess('');
    if (!amount || amount < 1) {
      setWithdrawError('Минимум 1 USDT');
      return;
    }
    if (!addr || addr.length < 30 || !addr.startsWith('T')) {
      setWithdrawError('Укажите корректный Tron (TRC20) адрес (начинается с T, 34 символа)');
      return;
    }
    if (!token) return;
    setLoadingWithdraw(true);
    try {
      const r = await api.post<{ ok: boolean; id?: string; message?: string; error?: string }>(
        '/wallet/withdraw',
        { amount, toAddress: addr },
        apiOpts
      );
      if ((r as any).ok) {
        setWithdrawSuccess((r as any).message || 'Заявка создана. Ожидайте подтверждения администратором.');
        setWithdrawAmount('');
        setWithdrawAddress('');
        setBalance((prev) => (prev != null ? prev - amount : null));
      } else {
        setWithdrawError((r as any).error || 'Ошибка вывода');
      }
    } catch (e) {
      setWithdrawError((e as Error).message);
    } finally {
      setLoadingWithdraw(false);
    }
  };

  const handleOpenPosition = async () => {
    const sizeUsdt = parseFloat(tradeSize);
    setTradeError('');
    if (!sizeUsdt || sizeUsdt < 1) {
      setTradeError('Минимум 1 USDT');
      return;
    }
    const margin = sizeUsdt / tradeLeverage;
    if (balance != null && balance < margin) {
      setTradeError(`Недостаточно средств. Маржа: ${margin.toFixed(2)} USDT`);
      return;
    }
    if (!token) return;
    setLoadingOpen(true);
    try {
      const r = await api.post<{ ok: boolean; id?: string; openPrice?: number; error?: string }>(
        '/wallet/open-position',
        { symbol: tradeSymbol, direction: tradeDirection, sizeUsdt, leverage: tradeLeverage },
        apiOpts
      );
      if ((r as any).ok) {
        setTradeSize('');
        setBalance((prev) => (prev != null ? prev - margin : null));
        await fetchPositions();
      } else {
        setTradeError((r as any).error || 'Ошибка открытия');
      }
    } catch (e) {
      setTradeError((e as Error).message);
    } finally {
      setLoadingOpen(false);
    }
  };

  const handleClosePosition = async (pos: InternalPosition) => {
    if (!token) return;
    setLoadingClose(pos.id);
    try {
      const r = await api.post<{ ok: boolean; pnl?: number; pnlPercent?: number; error?: string }>(
        '/wallet/close-position',
        { id: pos.id },
        apiOpts
      );
      if ((r as any).ok) {
        const margin = pos.size_usdt / pos.leverage;
        const pnl = (r as any).pnl ?? 0;
        setBalance((prev) => (prev != null ? prev + margin + pnl : null));
        await fetchPositions();
      } else {
        setTradeError((r as any).error || 'Ошибка закрытия');
      }
    } catch (e) {
      setTradeError((e as Error).message);
    } finally {
      setLoadingClose(null);
    }
  };

  if (!token) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <h1 className="text-xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Кошелёк</h1>
        <p style={{ color: 'var(--text-muted)' }}>Войдите, чтобы видеть баланс и управлять средствами.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold mb-6" style={{ color: 'var(--text-primary)' }}>Кошелёк USDT</h1>

      {/* Баланс */}
      <div
        className="rounded-2xl p-6 mb-6 flex flex-col items-center justify-center"
        style={{ background: 'linear-gradient(135deg, var(--accent) 0%, #EA580C 100%)', color: '#fff', minHeight: 120 }}
      >
        <span className="text-sm opacity-90">Баланс</span>
        <span className="text-3xl font-bold mt-1">
          {balance != null ? `${balance.toFixed(2)}` : '—'} <span className="text-lg font-normal">USDT</span>
        </span>
        {!walletEnabled && (
          <p className="text-xs mt-3 opacity-90">HD-кошелёк не настроен. Обратитесь к администратору.</p>
        )}
      </div>

      {/* Пополнить */}
      <section
        className="rounded-xl p-5 mb-6"
        style={{ border: '1px solid var(--border)', background: 'var(--bg-card-solid)' }}
      >
        <h2 className="font-medium mb-4" style={{ color: 'var(--text-primary)' }}>Пополнить</h2>
        {!walletEnabled ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Пополнение временно недоступно.</p>
        ) : (
          <>
            {!depositAddresses.length ? (
              <button
                onClick={fetchDepositAddress}
                disabled={loadingDeposit}
                className="px-4 py-2 rounded-lg font-medium transition"
                style={{ background: 'var(--accent)', color: '#fff' }}
              >
                {loadingDeposit ? 'Загрузка…' : 'Показать адреса'}
              </button>
            ) : (
              <div className="space-y-4">
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  Отправьте только <strong>USDT</strong>. Выберите сеть:
                </p>
                {depositAddresses.map((a) => (
                  <div key={a.network} className="p-3 rounded-lg" style={{ background: 'var(--bg)' }}>
                    <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>{a.label}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <code className="flex-1 min-w-0 break-all text-sm">{a.address}</code>
                      <button onClick={() => copyAddress(a.address)} className="px-3 py-1.5 rounded-lg text-sm" style={{ background: 'var(--accent)', color: '#fff' }}>
                        {copySuccess ? 'Скопировано!' : 'Копировать'}
                      </button>
                    </div>
                    <div className="mt-2">
                      <img src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(a.address)}`} alt="QR" className="rounded" />
                    </div>
                  </div>
                ))}
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Подтверждение: 1–5 мин. Только USDT/TRC20.
                </p>
              </div>
            )}
          </>
        )}
      </section>

      {/* Внутренняя торговля */}
      <section
        className="rounded-xl p-5 mb-6"
        style={{ border: '1px solid var(--border)', background: 'var(--bg-card-solid)' }}
      >
        <h2 className="font-medium mb-4" style={{ color: 'var(--text-primary)' }}>Торговля</h2>
        <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
          Открытие и закрытие ордеров только на сайте. Маржа списывается с баланса.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm mb-1" style={{ color: 'var(--text-muted)' }}>Пара</label>
            <select
              value={tradeSymbol}
              onChange={(e) => setTradeSymbol(e.target.value)}
              className="input-field w-full rounded-lg"
            >
              {TRADE_PAIRS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm mb-1" style={{ color: 'var(--text-muted)' }}>Плечо</label>
            <select
              value={tradeLeverage}
              onChange={(e) => setTradeLeverage(parseInt(e.target.value, 10))}
              className="input-field w-full rounded-lg"
            >
              {[1, 2, 3, 5, 10, 20, 50].map((x) => (
                <option key={x} value={x}>{x}x</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setTradeDirection('LONG')}
            className="flex-1 py-2 rounded-lg font-medium"
            style={{
              background: tradeDirection === 'LONG' ? 'var(--success)' : 'var(--bg)',
              color: tradeDirection === 'LONG' ? '#fff' : 'var(--text-muted)',
              border: `1px solid ${tradeDirection === 'LONG' ? 'var(--success)' : 'var(--border)'}`,
            }}
          >
            Long
          </button>
          <button
            onClick={() => setTradeDirection('SHORT')}
            className="flex-1 py-2 rounded-lg font-medium"
            style={{
              background: tradeDirection === 'SHORT' ? 'var(--danger)' : 'var(--bg)',
              color: tradeDirection === 'SHORT' ? '#fff' : 'var(--text-muted)',
              border: `1px solid ${tradeDirection === 'SHORT' ? 'var(--danger)' : 'var(--border)'}`,
            }}
          >
            Short
          </button>
        </div>
        <div className="mb-4">
          <label className="block text-sm mb-1" style={{ color: 'var(--text-muted)' }}>Размер (USDT)</label>
          <input
            type="number"
            value={tradeSize}
            onChange={(e) => setTradeSize(e.target.value)}
            placeholder="10"
            min={1}
            max={10000}
            step={1}
            className="input-field w-full rounded-lg"
          />
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            Маржа: {tradeSize && parseFloat(tradeSize) ? (parseFloat(tradeSize) / tradeLeverage).toFixed(2) : '—'} USDT
          </p>
        </div>
        {tradeError && <p className="text-sm mb-3" style={{ color: 'var(--danger)' }}>{tradeError}</p>}
        <button
          onClick={handleOpenPosition}
          disabled={loadingOpen || !tradeSize || balance == null || balance < 1}
          className="w-full py-2.5 rounded-lg font-medium disabled:opacity-50"
          style={{ background: tradeDirection === 'LONG' ? 'var(--success)' : 'var(--danger)', color: '#fff' }}
        >
          {loadingOpen ? 'Открытие…' : `Открыть ${tradeDirection}`}
        </button>

        {loadingPositions ? (
          <p className="text-sm mt-4" style={{ color: 'var(--text-muted)' }}>Загрузка позиций…</p>
        ) : positions.open.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Открытые позиции</h3>
            <div className="space-y-2">
              {positions.open.map((pos) => (
                <div
                  key={pos.id}
                  className="p-3 rounded-lg flex flex-wrap items-center justify-between gap-2"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                >
                  <div>
                    <span className="font-medium">{pos.symbol}</span>
                    <span className={`ml-2 text-sm ${pos.direction === 'LONG' ? 'text-green-500' : 'text-red-500'}`}>
                      {pos.direction}
                    </span>
                    <span className="ml-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                      {pos.size_usdt} USDT · {pos.leverage}x · вход {pos.open_price.toFixed(2)}
                    </span>
                  </div>
                  <button
                    onClick={() => handleClosePosition(pos)}
                    disabled={loadingClose === pos.id}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium"
                    style={{ background: 'var(--accent)', color: '#fff' }}
                  >
                    {loadingClose === pos.id ? '…' : 'Закрыть'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {positions.closed.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>История</h3>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {positions.closed.map((pos) => (
                <div
                  key={pos.id}
                  className="p-2 rounded text-sm"
                  style={{ background: 'var(--bg)', color: 'var(--text-muted)' }}
                >
                  {pos.symbol} {pos.direction} · PnL: {(pos.pnl_usdt ?? 0) >= 0 ? '+' : ''}{(pos.pnl_usdt ?? 0).toFixed(2)} USDT
                  ({(pos.pnl_percent ?? 0) >= 0 ? '+' : ''}{(pos.pnl_percent ?? 0).toFixed(1)}%)
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Вывести */}
      <section
        className="rounded-xl p-5"
        style={{ border: '1px solid var(--border)', background: 'var(--bg-card-solid)' }}
      >
        <h2 className="font-medium mb-4" style={{ color: 'var(--text-primary)' }}>Вывести</h2>
        {!walletEnabled ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Вывод временно недоступен.</p>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm mb-1" style={{ color: 'var(--text-muted)' }}>Сумма (USDT)</label>
              <input
                type="number"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                placeholder="1"
                min={1}
                max={10000}
                step={0.01}
                className="input-field w-full rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm mb-1" style={{ color: 'var(--text-muted)' }}>Адрес кошелька</label>
              <input
                type="text"
                value={withdrawAddress}
                onChange={(e) => setWithdrawAddress(e.target.value)}
                placeholder="0x..."
                className="input-field w-full rounded-lg font-mono text-sm"
              />
            </div>
            {withdrawError && (
              <p className="text-sm" style={{ color: 'var(--danger)' }}>{withdrawError}</p>
            )}
            {withdrawSuccess && (
              <p className="text-sm" style={{ color: 'var(--success)' }}>{withdrawSuccess}</p>
            )}
            <button
              onClick={handleWithdraw}
              disabled={loadingWithdraw || !withdrawAmount || !withdrawAddress}
              className="px-5 py-2.5 rounded-lg font-medium transition disabled:opacity-50"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              {loadingWithdraw ? 'Отправка…' : 'Вывести'}
            </button>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Комиссия: 0.5%. Мин. 1 USDT. Вывод после подтверждения администратором.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
