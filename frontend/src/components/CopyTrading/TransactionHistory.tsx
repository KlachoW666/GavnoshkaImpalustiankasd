/**
 * Transaction History — история операций копитрейдинга
 * Пополнения, выводы, статусы
 */

import { useState, useEffect } from 'react';
import { api } from '../../utils/api';

interface Transaction {
  id: number;
  user_id: string;
  type: 'deposit' | 'withdraw' | 'pnl_credit' | 'pnl_debit' | 'fee';
  amount_usdt: number;
  status: 'pending' | 'processing' | 'completed' | 'rejected';
  tx_hash: string | null;
  admin_note: string | null;
  provider_id: string | null;
  created_at: string;
  processed_at: string | null;
}

interface TransactionHistoryProps {
  token: string;
  onClose?: () => void;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: 'Ожидание', color: '#F59E0B' },
  processing: { label: 'В обработке', color: '#3B82F6' },
  completed: { label: 'Выполнено', color: '#10B981' },
  rejected: { label: 'Отклонено', color: '#EF4444' }
};

const TYPE_LABELS: Record<string, { label: string; icon: string }> = {
  deposit: { label: 'Пополнение', icon: '↓' },
  withdraw: { label: 'Вывод', icon: '↑' },
  pnl_credit: { label: 'PnL +', icon: '✓' },
  pnl_debit: { label: 'PnL -', icon: '✗' },
  fee: { label: 'Комиссия', icon: '%' }
};

export default function TransactionHistory({ token, onClose }: TransactionHistoryProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    
    setLoading(true);
    setError(null);
    
    const params = statusFilter ? `?status=${statusFilter}` : '';
    
    api.get<{ transactions: Transaction[] }>(`/copy-trading-api/transactions${params}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => {
        setTransactions(r.transactions ?? []);
      })
      .catch((err) => {
        console.error('Transaction history error:', err);
        setError('Не удалось загрузить историю операций');
        setTransactions([]);
      })
      .finally(() => setLoading(false));
  }, [token, statusFilter]);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' }) + 
             ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--bg-card-solid)' }}>
      <div className="p-4 border-b flex justify-between items-center" style={{ borderColor: 'var(--border)' }}>
        <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>История операций</h3>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2 py-1 rounded-lg text-sm outline-none"
            style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          >
            <option value="">Все статусы</option>
            <option value="pending">Ожидание</option>
            <option value="processing">В обработке</option>
            <option value="completed">Выполнено</option>
            <option value="rejected">Отклонено</option>
          </select>
          {onClose && (
            <button onClick={onClose} className="p-1.5 rounded-lg transition-colors" style={{ color: 'var(--text-muted)' }}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="max-h-96 overflow-y-auto custom-scrollbar">
        {loading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-12 rounded-lg animate-pulse" style={{ background: 'var(--bg-hover)' }} />
            ))}
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>
          </div>
        ) : transactions.length === 0 ? (
          <div className="p-8 text-center">
            <svg className="w-10 h-10 mx-auto mb-2 opacity-50" style={{ color: 'var(--text-muted)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Нет операций</p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {transactions.map(tx => {
              const typeInfo = TYPE_LABELS[tx.type] || { label: tx.type, icon: '?' };
              const statusInfo = STATUS_LABELS[tx.status] || { label: tx.status, color: '#888' };
              
              const isPositive = tx.type === 'deposit' || tx.type === 'pnl_credit';
              
              return (
                <div key={tx.id} className="p-3 flex items-center gap-3 hover:bg-[var(--bg-hover)] transition-colors">
                  <div 
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold"
                    style={{ 
                      background: isPositive ? 'var(--success-dim)' : tx.type === 'withdraw' ? 'var(--danger-dim)' : 'var(--bg-hover)',
                      color: isPositive ? 'var(--success)' : tx.type === 'withdraw' ? 'var(--danger)' : 'var(--text-muted)'
                    }}
                  >
                    {typeInfo.icon}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
                        {typeInfo.label}
                      </span>
                      <span 
                        className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ background: statusInfo.color + '20', color: statusInfo.color }}
                      >
                        {statusInfo.label}
                      </span>
                    </div>
                    <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
                      {formatDate(tx.created_at)}
                      {tx.tx_hash && <span className="ml-2">• TX: {tx.tx_hash.slice(0, 10)}...</span>}
                    </p>
                    {tx.admin_note && (
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {tx.admin_note}
                      </p>
                    )}
                  </div>

                  <div className="text-right shrink-0">
                    <p className={`font-bold font-mono ${isPositive ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                      {isPositive ? '+' : '-'}{tx.amount_usdt.toFixed(2)}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>USDT</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
