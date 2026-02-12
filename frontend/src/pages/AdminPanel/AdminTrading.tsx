import { useState, useEffect } from 'react';
import { adminApi } from '../../utils/adminApi';

export default function AdminTrading() {
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<{ running: boolean } | null>(null);

  const fetchStatus = () => {
    adminApi.get<{ running: boolean }>('/admin/trading/status').then(setStatus).catch(() => setStatus(null));
  };

  useEffect(() => {
    fetchStatus();
    const t = setInterval(fetchStatus, 10000);
    return () => clearInterval(t);
  }, []);

  const stopTrading = async () => {
    setLoading('stop');
    setMessage('');
    try {
      await adminApi.post('/admin/trading/stop');
      setMessage('Авто-торговля остановлена у всех пользователей.');
      fetchStatus();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setLoading(null);
    }
  };

  const emergencyStop = async () => {
    setLoading('emergency');
    setMessage('');
    try {
      await adminApi.post('/admin/trading/emergency');
      setMessage('Экстренная остановка выполнена у всех.');
      fetchStatus();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setLoading(null);
    }
  };

  const startTrading = async () => {
    setLoading('start');
    setMessage('');
    try {
      await adminApi.post('/admin/trading/start', {
        symbols: ['BTC-USDT', 'ETH-USDT'],
        fullAuto: true,
        useScanner: true,
        intervalMs: 60000,
        executeOrders: false,
        useTestnet: true
      });
      setMessage('Авто-торговля запущена (админ). Остановка — кнопками ниже.');
      fetchStatus();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setLoading(null);
    }
  };

  const cardStyle = {
  background: 'linear-gradient(145deg, var(--bg-card-solid) 0%, var(--bg-hover) 100%)',
  border: '1px solid var(--border)',
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
};

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <span className="text-2xl">📈</span>
        <div>
          <h2 className="text-xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>Управление торговлей</h2>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Запуск, пауза и экстренная остановка авто-торговли</p>
        </div>
      </div>

      {status != null && (
        <section className="rounded-2xl p-4 shadow-lg border-l-4" style={{ ...cardStyle, borderLeftColor: status.running ? 'var(--success)' : 'var(--text-muted)' }}>
          <p className="text-sm">
            Статус: <strong style={{ color: status.running ? 'var(--success)' : 'var(--text-secondary)' }}>
              {status.running ? 'Активно (у одного или нескольких пользователей)' : 'Остановлено'}
            </strong>
          </p>
        </section>
      )}
      {message && (
        <div className="p-4 rounded-xl border text-sm" style={{ background: 'var(--accent-dim)', borderColor: 'var(--accent)', color: 'var(--text-primary)' }}>
          {message}
        </div>
      )}
      <section className="rounded-2xl p-6 shadow-lg" style={{ ...cardStyle, borderLeft: '4px solid var(--accent)' }}>
        <div className="flex items-center gap-3 mb-5">
          <span className="text-2xl">⚡</span>
          <div>
            <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Быстрые действия</h3>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Полные настройки — в разделе «Авто» главного приложения</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={startTrading}
            disabled={!!loading}
            className="px-4 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 transition-opacity"
            style={{ background: 'var(--success-dim)', color: 'var(--success)' }}
          >
            {loading === 'start' ? '…' : '▶ Запуск'}
          </button>
          <button
            type="button"
            onClick={stopTrading}
            disabled={!!loading}
            className="px-4 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 transition-opacity"
            style={{ background: 'var(--warning)', color: 'white' }}
          >
            {loading === 'stop' ? '…' : '⏸ Пауза'}
          </button>
          <button
            type="button"
            onClick={emergencyStop}
            disabled={!!loading}
            className="px-4 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 transition-opacity"
            style={{ background: 'var(--danger)', color: 'white' }}
          >
            {loading === 'emergency' ? '…' : '🛑 Стоп'}
          </button>
        </div>
      </section>
    </div>
  );
}
