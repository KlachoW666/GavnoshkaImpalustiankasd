/**
 * Portfolio Card — карточка портфеля копитрейдинга
 * Баланс, PnL, кнопки пополнения/вывода
 */

import { useState, useEffect, useRef } from 'react';
import { api } from '../../utils/api';

interface PortfolioCardProps {
  token: string;
  onDeposit: () => void;
  onWithdraw: () => void;
  onHistory: () => void;
}

interface Balance {
  balance: number;
  totalPnl: number;
  totalDeposit: number;
  totalWithdraw: number;
}

export default function PortfolioCard({ token, onDeposit, onWithdraw, onHistory }: PortfolioCardProps) {
  const [balance, setBalance] = useState<Balance | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const prevBalanceRef = useRef<Balance | null>(null);

  useEffect(() => {
    if (!token) return;
    
    const fetchBalance = () => {
      const isFirst = !prevBalanceRef.current;
      
      api.get<{ balance: number; totalPnl: number; totalDeposit: number; totalWithdraw: number }>(
        '/copy-trading-api/balance',
        { headers: { Authorization: `Bearer ${token}` } }
      )
        .then((data) => {
          prevBalanceRef.current = data;
          setBalance(data);
          if (!isFirst) setIsRefreshing(true);
        })
        .catch(() => {})
        .finally(() => {
          setLoading(false);
          setIsRefreshing(false);
        });
    };

    fetchBalance();
    const interval = setInterval(fetchBalance, 60000);
    return () => clearInterval(interval);
  }, [token]);

  const pnlPercent = balance && balance.totalDeposit > 0 
    ? ((balance.totalPnl / balance.totalDeposit) * 100).toFixed(1)
    : '0.0';

  return (
    <div
      className="rounded-2xl p-6 text-white relative overflow-hidden transition-opacity duration-300"
      style={{
        background: 'linear-gradient(135deg, #F97316 0%, #EF4444 100%)',
        minHeight: 180,
        opacity: isRefreshing ? 0.7 : 1
      }}
    >
      <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-white/10" />
      <div className="absolute -right-5 -bottom-5 w-32 h-32 rounded-full bg-white/5" />
      
      <div className="relative z-10">
        <p className="text-sm opacity-80 mb-1">Баланс копитрейдинга</p>
        
        {loading ? (
          <div className="h-10 w-32 bg-white/20 rounded animate-pulse mb-4" />
        ) : (
          <div className="flex items-baseline gap-2 mb-4 transition-all duration-300">
            <span className="text-4xl font-bold tabular-nums">
              {balance?.balance.toFixed(2) ?? '0.00'}
            </span>
            <span className="text-lg opacity-80">USDT</span>
          </div>
        )}

        <div className="grid grid-cols-3 gap-4 mb-4 text-sm">
          <div>
            <p className="opacity-70">PnL</p>
            <p className={`font-semibold transition-colors duration-300 ${balance && balance.totalPnl >= 0 ? 'text-green-200' : 'text-red-200'}`}>
              {balance && balance.totalPnl >= 0 ? '+' : ''}{balance?.totalPnl.toFixed(2) ?? '0.00'} $
            </p>
          </div>
          <div>
            <p className="opacity-70">Доходность</p>
            <p className={`font-semibold transition-colors duration-300 ${parseFloat(pnlPercent) >= 0 ? 'text-green-200' : 'text-red-200'}`}>
              {parseFloat(pnlPercent) >= 0 ? '+' : ''}{pnlPercent}%
            </p>
          </div>
          <div>
            <p className="opacity-70">Пополнено</p>
            <p className="font-semibold">{balance?.totalDeposit.toFixed(0) ?? '0'} $</p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onDeposit}
            className="flex-1 py-2.5 rounded-xl font-medium bg-white/20 hover:bg-white/30 transition-colors"
          >
            Пополнить
          </button>
          <button
            onClick={onWithdraw}
            className="flex-1 py-2.5 rounded-xl font-medium bg-white/20 hover:bg-white/30 transition-colors"
          >
            Вывести
          </button>
          <button
            onClick={onHistory}
            className="py-2.5 px-4 rounded-xl font-medium bg-white/20 hover:bg-white/30 transition-colors"
          >
            История
          </button>
        </div>
      </div>
    </div>
  );
}
