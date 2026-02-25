/**
 * Кошелёк — баланс USDT, пополнение, вывод.
 * Торговля (открытие/закрытие позиций) на странице «Торговля».
 * BIP44/HD: Trust Wallet с seed-фразой видит все средства.
 */

import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../utils/api';
import { useNavigation } from '../contexts/NavigationContext';

export default function WalletPage() {
  const { token } = useAuth();
  const { navigateTo } = useNavigation();
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

  const goToTrade = () => {
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', '/trade');
    }
    navigateTo('trade');
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
        className="rounded-lg p-6 mb-6 flex flex-col items-center justify-center"
        style={{ background: 'linear-gradient(135deg, var(--accent) 0%, #EA580C 100%)', color: '#fff', minHeight: 120 }}
      >
        <span className="text-sm opacity-90">Баланс</span>
        <span className="text-3xl font-bold mt-1">
          {balance != null ? `${balance.toFixed(2)}` : '—'} <span className="text-lg font-normal">USDT</span>
        </span>
        {!walletEnabled && (
          <p className="text-xs mt-3 opacity-90">HD-кошелёк не настроен. Обратитесь к администратору.</p>
        )}
        <button
          type="button"
          onClick={goToTrade}
          className="mt-4 px-4 py-2 rounded-lg font-medium bg-white/20 hover:bg-white/30 transition-colors text-sm"
        >
          Перейти к торговле →
        </button>
      </div>

      {/* Пополнить */}
      <section
        className="rounded-lg p-5 mb-6"
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

      {/* Вывести */}
      <section
        className="rounded-lg p-5"
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
