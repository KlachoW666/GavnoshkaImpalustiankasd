import { useState, useEffect } from 'react';
import { adminApi } from '../../utils/adminApi';

interface FinanceSummary {
  wallet: {
    totalBalances: number;
    totalDeposits: number;
    depositsCount: number;
    totalWithdrawals: number;
    withdrawalsSent: number;
    withdrawalsPending: number;
    pendingWithdrawalsAmount: number;
    feeRevenue: number;
  };
  copyTrading: {
    totalBalances: number;
    pendingWithdrawals: number;
  };
  subscriptions: {
    totalRevenue: number;
    activeCount: number;
  };
  today: {
    deposits: number;
    withdrawals: number;
  };
  totals: {
    inSystem: number;
    pendingProcessing: number;
    totalRevenue: number;
  };
}

interface ChartDataPoint {
  date: string;
  deposits: number;
  withdrawals: number;
}

export default function AdminFinance() {
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartDays, setChartDays] = useState(7);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      adminApi.get<FinanceSummary>('/admin/finance/summary'),
      adminApi.get<{ chartData?: ChartDataPoint[] }>(`/admin/finance/chart?days=${chartDays}`)
    ]).then(([summaryData, chartResponse]) => {
      setSummary(summaryData);
      const data = chartResponse?.chartData;
      setChartData(Array.isArray(data) ? data : []);
    }).catch(console.error).finally(() => setLoading(false));
  }, [chartDays]);

  const fmt = (n: number) => {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toFixed(2);
  };

  const safeChartData = Array.isArray(chartData) ? chartData : [];
  const maxChartValue = Math.max(...safeChartData.map(d => Math.max(d.deposits, d.withdrawals)), 1);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Финансовая панель</h2>
        <button
          onClick={() => window.open('/api/admin/transactions/export?format=csv', '_blank')}
          className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
          style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}
        >
          Экспорт CSV
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl p-4" style={{ background: 'var(--bg-card-solid)', border: '1px solid var(--border)' }}>
          <p className="text-xs uppercase mb-1" style={{ color: 'var(--text-muted)' }}>В системе</p>
          <p className="text-2xl font-bold" style={{ color: 'var(--accent)' }}>${fmt(summary?.totals?.inSystem || 0)}</p>
        </div>
        <div className="rounded-xl p-4" style={{ background: 'var(--bg-card-solid)', border: '1px solid var(--border)' }}>
          <p className="text-xs uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Всего депозитов</p>
          <p className="text-2xl font-bold" style={{ color: 'var(--success)' }}>${fmt(summary?.wallet?.totalDeposits || 0)}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{summary?.wallet?.depositsCount || 0} операций</p>
        </div>
        <div className="rounded-xl p-4" style={{ background: 'var(--bg-card-solid)', border: '1px solid var(--border)' }}>
          <p className="text-xs uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Всего выводов</p>
          <p className="text-2xl font-bold" style={{ color: 'var(--danger)' }}>${fmt(summary?.wallet?.totalWithdrawals || 0)}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{summary?.wallet?.withdrawalsSent || 0} отправлено</p>
        </div>
        <div className="rounded-xl p-4" style={{ background: 'var(--bg-card-solid)', border: '1px solid var(--border)' }}>
          <p className="text-xs uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Общий доход</p>
          <p className="text-2xl font-bold" style={{ color: 'var(--accent)' }}>${fmt(summary?.totals?.totalRevenue || 0)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl p-4" style={{ background: 'var(--bg-card-solid)', border: '1px solid var(--border)' }}>
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Ожидают обработки</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span style={{ color: 'var(--text-muted)' }}>Выводы (Main)</span>
              <span className="font-medium" style={{ color: 'var(--warning)' }}>${fmt(summary?.wallet?.pendingWithdrawalsAmount || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: 'var(--text-muted)' }}>Выводы (Copy)</span>
              <span className="font-medium" style={{ color: 'var(--warning)' }}>${fmt(summary?.copyTrading?.pendingWithdrawals || 0)}</span>
            </div>
          </div>
        </div>
        <div className="rounded-xl p-4" style={{ background: 'var(--bg-card-solid)', border: '1px solid var(--border)' }}>
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Сегодня</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span style={{ color: 'var(--text-muted)' }}>Депозиты</span>
              <span className="font-medium" style={{ color: 'var(--success)' }}>${fmt(summary?.today?.deposits || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: 'var(--text-muted)' }}>Выводы</span>
              <span className="font-medium" style={{ color: 'var(--danger)' }}>${fmt(summary?.today?.withdrawals || 0)}</span>
            </div>
          </div>
        </div>
        <div className="rounded-xl p-4" style={{ background: 'var(--bg-card-solid)', border: '1px solid var(--border)' }}>
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Подписки</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span style={{ color: 'var(--text-muted)' }}>Доход</span>
              <span className="font-medium" style={{ color: 'var(--accent)' }}>${fmt(summary?.subscriptions?.totalRevenue || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: 'var(--text-muted)' }}>Активных</span>
              <span className="font-medium">{summary?.subscriptions?.activeCount || 0}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl p-4" style={{ background: 'var(--bg-card-solid)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>График депозитов/выводов</h3>
          <div className="flex gap-2">
            {[7, 14, 30].map(days => (
              <button
                key={days}
                onClick={() => setChartDays(days)}
                className="px-2 py-1 rounded text-xs font-medium transition-colors"
                style={{
                  background: chartDays === days ? 'var(--accent)' : 'var(--bg-hover)',
                  color: chartDays === days ? '#fff' : 'var(--text-secondary)'
                }}
              >
                {days}д
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-end gap-1 h-40">
          {safeChartData.map((d, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full flex flex-col gap-0.5" style={{ height: '120px' }}>
                <div
                  className="w-full rounded-t transition-all"
                  style={{
                    height: `${(d.deposits / maxChartValue) * 100}%`,
                    background: 'var(--success)',
                    minHeight: d.deposits > 0 ? '2px' : '0'
                  }}
                  title={`Депозиты: $${d.deposits.toFixed(2)}`}
                />
                <div
                  className="w-full rounded-b transition-all"
                  style={{
                    height: `${(d.withdrawals / maxChartValue) * 100}%`,
                    background: 'var(--danger)',
                    minHeight: d.withdrawals > 0 ? '2px' : '0'
                  }}
                  title={`Выводы: $${d.withdrawals.toFixed(2)}`}
                />
              </div>
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                {new Date(d.date).toLocaleDateString('ru', { day: '2-digit', month: '2-digit' })}
              </span>
            </div>
          ))}
        </div>
        <div className="flex justify-center gap-6 mt-3">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{ background: 'var(--success)' }} />
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Депозиты</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{ background: 'var(--danger)' }} />
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Выводы</span>
          </div>
        </div>
      </div>
    </div>
  );
}
