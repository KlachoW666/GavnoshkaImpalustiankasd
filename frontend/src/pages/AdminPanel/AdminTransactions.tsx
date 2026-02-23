import { useState, useEffect } from 'react';
import { adminApi } from '../../utils/adminApi';

interface Transaction {
  id: string;
  type: 'deposit' | 'withdrawal' | 'copy_deposit' | 'copy_withdrawal' | 'subscription' | 'copy_profit';
  userId: number;
  username?: string;
  amount: number;
  status: string;
  txHash?: string;
  address?: string;
  createdAt: string;
  description?: string;
}

interface TransactionsResponse {
  transactions: Transaction[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const TYPE_LABELS: Record<string, string> = {
  deposit: 'Депозит',
  withdrawal: 'Вывод',
  copy_deposit: 'Депозит (CT)',
  copy_withdrawal: 'Вывод (CT)',
  subscription: 'Подписка',
  copy_profit: 'Прибыль CT'
};

const STATUS_COLORS: Record<string, string> = {
  confirmed: 'var(--success)',
  pending: 'var(--warning)',
  processing: 'var(--warning)',
  sent: 'var(--accent)',
  completed: 'var(--success)',
  failed: 'var(--danger)',
  cancelled: 'var(--text-muted)'
};

export default function AdminTransactions() {
  const [data, setData] = useState<TransactionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    type: '',
    status: '',
    userId: '',
    dateFrom: '',
    dateTo: ''
  });
  const [showFilters, setShowFilters] = useState(false);

  const pageSize = 20;

  const fetchData = () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));
    if (filters.type) params.set('type', filters.type);
    if (filters.status) params.set('status', filters.status);
    if (filters.userId) params.set('userId', filters.userId);
    if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) params.set('dateTo', filters.dateTo);

    adminApi.get<TransactionsResponse>(`/admin/transactions?${params}`)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, [page]);

  useEffect(() => {
    if (page !== 1) setPage(1);
    else fetchData();
  }, [filters.type, filters.status, filters.userId, filters.dateFrom, filters.dateTo]);

  const fmt = (n: number) => n.toFixed(2);
  const formatDate = (d: string) => new Date(d).toLocaleString('ru');

  const handleExport = (format: 'csv' | 'json') => {
    const params = new URLSearchParams();
    params.set('format', format);
    if (filters.type) params.set('type', filters.type);
    if (filters.status) params.set('status', filters.status);
    if (filters.userId) params.set('userId', filters.userId);
    if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) params.set('dateTo', filters.dateTo);
    window.open(`/api/admin/transactions/export?${params}`, '_blank');
  };

  const clearFilters = () => {
    setFilters({ type: '', status: '', userId: '', dateFrom: '', dateTo: '' });
  };

  const hasFilters = filters.type || filters.status || filters.userId || filters.dateFrom || filters.dateTo;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Все транзакции</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1"
            style={{
              background: showFilters || hasFilters ? 'var(--accent-dim)' : 'var(--bg-hover)',
              color: showFilters || hasFilters ? 'var(--accent)' : 'var(--text-secondary)'
            }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            Фильтры
            {hasFilters && <span className="w-2 h-2 rounded-full" style={{ background: 'var(--accent)' }} />}
          </button>
          <button
            onClick={() => handleExport('csv')}
            className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
            style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
          >
            CSV
          </button>
          <button
            onClick={() => handleExport('json')}
            className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
            style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
          >
            JSON
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="rounded-xl p-4" style={{ background: 'var(--bg-card-solid)', border: '1px solid var(--border)' }}>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Тип</label>
              <select
                value={filters.type}
                onChange={e => setFilters({ ...filters, type: e.target.value })}
                className="w-full px-2 py-1.5 rounded-lg text-sm"
                style={{ background: 'var(--bg-base)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
              >
                <option value="">Все</option>
                <option value="deposit">Депозит</option>
                <option value="withdrawal">Вывод</option>
                <option value="copy_deposit">Депозит CT</option>
                <option value="copy_withdrawal">Вывод CT</option>
                <option value="subscription">Подписка</option>
                <option value="copy_profit">Прибыль CT</option>
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Статус</label>
              <select
                value={filters.status}
                onChange={e => setFilters({ ...filters, status: e.target.value })}
                className="w-full px-2 py-1.5 rounded-lg text-sm"
                style={{ background: 'var(--bg-base)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
              >
                <option value="">Все</option>
                <option value="confirmed">Подтверждено</option>
                <option value="pending">Ожидание</option>
                <option value="processing">В обработке</option>
                <option value="sent">Отправлено</option>
                <option value="completed">Завершено</option>
                <option value="failed">Ошибка</option>
                <option value="cancelled">Отменено</option>
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>User ID</label>
              <input
                type="number"
                value={filters.userId}
                onChange={e => setFilters({ ...filters, userId: e.target.value })}
                placeholder="ID пользователя"
                className="w-full px-2 py-1.5 rounded-lg text-sm"
                style={{ background: 'var(--bg-base)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
              />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>От</label>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={e => setFilters({ ...filters, dateFrom: e.target.value })}
                className="w-full px-2 py-1.5 rounded-lg text-sm"
                style={{ background: 'var(--bg-base)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
              />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>До</label>
              <input
                type="date"
                value={filters.dateTo}
                onChange={e => setFilters({ ...filters, dateTo: e.target.value })}
                className="w-full px-2 py-1.5 rounded-lg text-sm"
                style={{ background: 'var(--bg-base)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={clearFilters}
                className="w-full px-2 py-1.5 rounded-lg text-sm font-medium"
                style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}
              >
                Сбросить
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
        </div>
      ) : (
        <>
          <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-card-solid)', border: '1px solid var(--border)' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--text-muted)' }}>Дата</th>
                    <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--text-muted)' }}>Тип</th>
                    <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--text-muted)' }}>Пользователь</th>
                    <th className="px-4 py-3 text-right font-medium" style={{ color: 'var(--text-muted)' }}>Сумма</th>
                    <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--text-muted)' }}>Статус</th>
                    <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--text-muted)' }}>Детали</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.transactions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center" style={{ color: 'var(--text-muted)' }}>
                        Нет транзакций
                      </td>
                    </tr>
                  ) : (
                    data?.transactions.map(tx => (
                      <tr key={tx.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                          {formatDate(tx.createdAt)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="px-2 py-0.5 rounded text-xs font-medium"
                            style={{
                              background: tx.type.includes('deposit') || tx.type === 'copy_profit' ? 'rgba(34,197,94,0.15)' : tx.type.includes('withdrawal') ? 'rgba(239,68,68,0.15)' : 'var(--bg-hover)',
                              color: tx.type.includes('deposit') || tx.type === 'copy_profit' ? 'var(--success)' : tx.type.includes('withdrawal') ? 'var(--danger)' : 'var(--text-secondary)'
                            }}
                          >
                            {TYPE_LABELS[tx.type] || tx.type}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span style={{ color: 'var(--text-primary)' }}>{tx.username || `ID: ${tx.userId}`}</span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-medium" style={{ color: 'var(--text-primary)' }}>
                          ${fmt(tx.amount)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="px-2 py-0.5 rounded text-xs font-medium"
                            style={{ color: STATUS_COLORS[tx.status] || 'var(--text-muted)' }}
                          >
                            {tx.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 max-w-xs truncate" style={{ color: 'var(--text-muted)' }}>
                          {tx.txHash ? (
                            <a
                              href={`https://tronscan.org/#/transaction/${tx.txHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:underline"
                              style={{ color: 'var(--accent)' }}
                            >
                              {tx.txHash.slice(0, 8)}...
                            </a>
                          ) : tx.address ? (
                            <span>{tx.address.slice(0, 8)}...</span>
                          ) : tx.description || '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {data && data.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Показано {((page - 1) * pageSize) + 1}-{Math.min(page * pageSize, data.total)} из {data.total}
              </p>
              <div className="flex gap-1">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50"
                  style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
                >
                  Назад
                </button>
                {Array.from({ length: Math.min(5, data.totalPages) }, (_, i) => {
                  let pageNum;
                  if (data.totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (page <= 3) {
                    pageNum = i + 1;
                  } else if (page >= data.totalPages - 2) {
                    pageNum = data.totalPages - 4 + i;
                  } else {
                    pageNum = page - 2 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className="w-8 h-8 rounded-lg text-sm font-medium"
                      style={{
                        background: page === pageNum ? 'var(--accent)' : 'var(--bg-hover)',
                        color: page === pageNum ? '#fff' : 'var(--text-secondary)'
                      }}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                <button
                  onClick={() => setPage(p => Math.min(data.totalPages, p + 1))}
                  disabled={page === data.totalPages}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50"
                  style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
                >
                  Далее
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
