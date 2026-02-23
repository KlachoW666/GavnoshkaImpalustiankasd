/**
 * Deposit/Withdraw Modal — пополнение и вывод средств копитрейдинга
 */

import { useState, useEffect } from 'react';
import { api } from '../../utils/api';

interface DepositAddress {
  network: string;
  address: string;
  minDeposit: number;
  confirmations: number;
}

interface DepositWithdrawProps {
  token: string;
  type: 'deposit' | 'withdraw';
  balance: number;
  onClose: () => void;
  onSuccess: () => void;
}

export default function DepositWithdraw({ token, type, balance, onClose, onSuccess }: DepositWithdrawProps) {
  const [amount, setAmount] = useState('');
  const [txHash, setTxHash] = useState('');
  const [withdrawAddress, setWithdrawAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [depositAddresses, setDepositAddresses] = useState<DepositAddress[]>([]);
  const [selectedNetwork, setSelectedNetwork] = useState<string>('TRC20');
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  useEffect(() => {
    if (type === 'deposit') {
      api.get<{ addresses: DepositAddress[] }>('/copy-trading-api/deposit-addresses')
        .then(r => {
          setDepositAddresses(r.addresses || []);
          if (r.addresses?.length > 0) {
            setSelectedNetwork(r.addresses[0].network);
          }
        })
        .catch(() => {});
    }
  }, [type]);

  const selectedAddress = depositAddresses.find(a => a.network === selectedNetwork);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedAddress(text);
      setTimeout(() => setCopiedAddress(null), 2000);
    } catch {}
  };

  const handleSubmit = async () => {
    const amountNum = parseFloat(amount);
    
    if (!amountNum || amountNum <= 0) {
      setError('Введите корректную сумму');
      return;
    }

    if (type === 'deposit') {
      if (amountNum < 10) {
        setError('Минимальная сумма пополнения: 10 USDT');
        return;
      }
      if (!txHash.trim()) {
        setError('Укажите хэш транзакции');
        return;
      }
    }

    if (type === 'withdraw') {
      if (amountNum < 10) {
        setError('Минимальная сумма вывода: 10 USDT');
        return;
      }
      if (amountNum > balance) {
        setError('Недостаточно средств');
        return;
      }
      if (!withdrawAddress.trim() || withdrawAddress.trim().length < 20) {
        setError('Укажите корректный адрес кошелька для вывода (TRC20/BEP20/ERC20)');
        return;
      }
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const endpoint = type === 'deposit' ? '/copy-trading-api/deposit' : '/copy-trading-api/withdraw';
      const body = type === 'deposit' 
        ? { amount: amountNum, txHash: txHash.trim(), network: selectedNetwork } 
        : { amount: amountNum, address: withdrawAddress.trim() };

      const result = await api.post<{ ok: boolean; txId?: number; message?: string; error?: string }>(
        endpoint,
        body,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (result.ok) {
        setSuccess(result.message || 'Заявка создана успешно');
        setAmount('');
        setTxHash('');
        setWithdrawAddress('');
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 2000);
      } else {
        setError(result.error || 'Ошибка');
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const isDeposit = type === 'deposit';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      <div 
        className="relative w-full max-w-lg rounded-2xl p-6 animate-fade-in-scale"
        style={{ background: 'var(--bg-card-solid)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-xl)' }}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-lg transition-colors"
          style={{ color: 'var(--text-muted)', background: 'transparent' }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div 
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ 
              background: isDeposit ? 'linear-gradient(135deg, #10B981 0%, #059669 100%)' : 'linear-gradient(135deg, #F97316 0%, #EF4444 100%)',
              boxShadow: isDeposit ? '0 4px 14px rgba(16, 185, 129, 0.3)' : '0 4px 14px rgba(249, 115, 22, 0.3)'
            }}
          >
            <span className="text-xl text-white">{isDeposit ? '↓' : '↑'}</span>
          </div>
          <div>
            <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              {isDeposit ? 'Пополнить счёт' : 'Вывести средства'}
            </h3>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {isDeposit ? 'Выберите сеть и отправьте USDT' : `Доступно: ${balance.toFixed(2)} USDT`}
            </p>
          </div>
        </div>

        {isDeposit && (
          <div className="mb-4 p-4 rounded-xl" style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
            <h4 className="text-sm font-semibold mb-2 flex items-center gap-2" style={{ color: 'var(--success)' }}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Инструкция по пополнению
            </h4>
            <ol className="text-xs space-y-1.5" style={{ color: 'var(--text-secondary)' }}>
              <li className="flex gap-2"><span className="font-bold" style={{ color: 'var(--accent)' }}>1.</span> Выберите сеть (TRC20 — самая быстрая и дешёвая)</li>
              <li className="flex gap-2"><span className="font-bold" style={{ color: 'var(--accent)' }}>2.</span> Скопируйте адрес и отправьте USDT с биржи или кошелька</li>
              <li className="flex gap-2"><span className="font-bold" style={{ color: 'var(--accent)' }}>3.</span> После отправки скопируйте хэш транзакции (TX Hash)</li>
              <li className="flex gap-2"><span className="font-bold" style={{ color: 'var(--accent)' }}>4.</span> Укажите сумму и хэш, отправьте заявку</li>
            </ol>
            <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>Минимальная сумма: 10 USDT • Зачисление: 1-30 минут</p>
          </div>
        )}

        {!isDeposit && (
          <div className="mb-4 p-4 rounded-xl" style={{ background: 'rgba(249, 115, 22, 0.08)', border: '1px solid rgba(249, 115, 22, 0.2)' }}>
            <h4 className="text-sm font-semibold mb-2 flex items-center gap-2" style={{ color: 'var(--warning)' }}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Инструкция по выводу
            </h4>
            <ol className="text-xs space-y-1.5" style={{ color: 'var(--text-secondary)' }}>
              <li className="flex gap-2"><span className="font-bold" style={{ color: 'var(--accent)' }}>1.</span> Укажите сумму для вывода (минимум 10 USDT)</li>
              <li className="flex gap-2"><span className="font-bold" style={{ color: 'var(--accent)' }}>2.</span> Отправьте заявку — средства будут заблокированы</li>
              <li className="flex gap-2"><span className="font-bold" style={{ color: 'var(--accent)' }}>3.</span> Администратор обработает заявку в течение 24 часов</li>
              <li className="flex gap-2"><span className="font-bold" style={{ color: 'var(--accent)' }}>4.</span> После перевода вы получите уведомление</li>
            </ol>
            <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>Комиссия: 0% • Вывод на ваш кошелёк TRC20</p>
          </div>
        )}

        <div className="space-y-4">
          {isDeposit && depositAddresses.length > 0 && (
            <>
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                  Сеть
                </label>
                <div className="flex gap-2">
                  {depositAddresses.map(addr => (
                    <button
                      key={addr.network}
                      onClick={() => setSelectedNetwork(addr.network)}
                      className="flex-1 py-2.5 px-3 rounded-xl text-sm font-medium transition-all"
                      style={{
                        background: selectedNetwork === addr.network ? 'var(--accent-gradient)' : 'var(--bg-hover)',
                        color: selectedNetwork === addr.network ? '#000' : 'var(--text-secondary)',
                        boxShadow: selectedNetwork === addr.network ? '0 4px 14px var(--accent-glow)' : 'none'
                      }}
                    >
                      {addr.network}
                    </button>
                  ))}
                </div>
              </div>

              {selectedAddress && (
                <div className="p-4 rounded-xl" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                      Адрес для пополнения
                    </span>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      Мин. {selectedAddress.minDeposit} USDT
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <code 
                      className="flex-1 px-3 py-2 rounded-lg text-sm font-mono break-all"
                      style={{ background: 'var(--bg)', color: 'var(--text-primary)' }}
                    >
                      {selectedAddress.address}
                    </code>
                    <button
                      onClick={() => copyToClipboard(selectedAddress.address)}
                      className="p-2 rounded-lg transition-all"
                      style={{ background: 'var(--bg)', color: copiedAddress === selectedAddress.address ? 'var(--success)' : 'var(--text-muted)' }}
                    >
                      {copiedAddress === selectedAddress.address ? (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      )}
                    </button>
                  </div>
                  <p className="text-xs mt-2" style={{ color: 'var(--warning)' }}>
                    ⚠️ Отправляйте только USDT по сети {selectedAddress.network}. Другие активы будут потеряны!
                  </p>
                </div>
              )}
            </>
          )}

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              Сумма (USDT)
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              min={10}
              step="0.01"
              className="w-full px-4 py-3 rounded-xl text-lg font-medium outline-none transition-all"
              style={{ 
                background: 'var(--bg-hover)', 
                border: '1px solid var(--border)', 
                color: 'var(--text-primary)' 
              }}
              onFocus={(e) => e.target.style.borderColor = 'var(--accent)'}
              onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
            />
            {!isDeposit && (
              <div className="flex gap-2 mt-2">
                {[25, 50, 75, 100].map(pct => (
                  <button
                    key={pct}
                    onClick={() => setAmount((balance * pct / 100).toFixed(2))}
                    className="flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            )}
          </div>

          {!isDeposit && (
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                Адрес для вывода *
              </label>
              <input
                type="text"
                value={withdrawAddress}
                onChange={(e) => setWithdrawAddress(e.target.value)}
                placeholder="TRC20 / BEP20 / ERC20 адрес"
                className="w-full px-4 py-3 rounded-xl text-sm font-mono outline-none transition-all"
                style={{ 
                  background: 'var(--bg-hover)', 
                  border: '1px solid var(--border)', 
                  color: 'var(--text-primary)' 
                }}
                onFocus={(e) => e.target.style.borderColor = 'var(--accent)'}
                onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
              />
              <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
                Укажите ваш кошелёк USDT (TRC20 рекомендуется — низкая комиссия)
              </p>
            </div>
          )}

          {isDeposit && (
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                Хэш транзакции *
              </label>
              <input
                type="text"
                value={txHash}
                onChange={(e) => setTxHash(e.target.value)}
                placeholder="0x... или хэш транзакции"
                className="w-full px-4 py-3 rounded-xl text-sm font-mono outline-none transition-all"
                style={{ 
                  background: 'var(--bg-hover)', 
                  border: '1px solid var(--border)', 
                  color: 'var(--text-primary)' 
                }}
                onFocus={(e) => e.target.style.borderColor = 'var(--accent)'}
                onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
              />
              <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
                Вставьте хэш транзакции после отправки средств
              </p>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-lg text-sm flex items-center gap-2" style={{ background: 'var(--danger-dim)', color: 'var(--danger)' }}>
              <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          )}

          {success && (
            <div className="p-3 rounded-lg text-sm flex items-center gap-2" style={{ background: 'var(--success-dim)', color: 'var(--success)' }}>
              <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              {success}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading || !amount || (isDeposit && !txHash.trim()) || (!isDeposit && !withdrawAddress.trim())}
            className="w-full py-3 rounded-xl font-semibold text-white transition-all disabled:opacity-50"
            style={{ 
              background: isDeposit 
                ? 'var(--gradient-success)'
                : 'linear-gradient(135deg, #F97316 0%, #EF4444 100%)',
              boxShadow: isDeposit ? '0 4px 14px var(--success-glow)' : '0 4px 14px var(--danger-glow)'
            }}
          >
            {loading ? 'Обработка...' : isDeposit ? 'Отправить заявку' : 'Запросить вывод'}
          </button>

          <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
            {isDeposit 
              ? 'После подтверждения транзакции на блокчейне средства будут зачислены'
              : 'Вывод обрабатывается администратором в течение 24 часов'}
          </p>
        </div>
      </div>
    </div>
  );
}
