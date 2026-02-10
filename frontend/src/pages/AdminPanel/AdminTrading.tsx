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

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold tracking-tight">Управление торговлей</h2>
      {status != null && (
        <div className="p-4 rounded-xl border text-sm" style={{ background: 'var(--bg-hover)', borderColor: 'var(--border)' }}>
          Статус: <strong>{status.running ? 'Активно (у одного или нескольких пользователей)' : 'Остановлено'}</strong>
        </div>
      )}
      {message && (
        <div className="p-4 rounded-xl border text-sm" style={{ background: 'var(--accent-dim)', borderColor: 'var(--accent)' }}>
          {message}
        </div>
      )}
      <section className="rounded-xl border p-6" style={{ background: 'var(--bg-card-solid)', borderColor: 'var(--border)' }}>
        <h3 className="text-lg font-semibold mb-4">Быстрые действия</h3>
        <div className="flex flex-wrap gap-4">
          <button
            type="button"
            onClick={startTrading}
            disabled={!!loading}
            className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            style={{ background: 'var(--success-dim)', color: 'var(--success)' }}
          >
            {loading === 'start' ? '…' : '▶️ START Auto-Trading'}
          </button>
          <button
            type="button"
            onClick={stopTrading}
            disabled={!!loading}
            className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            style={{ background: 'var(--warning-dim)', color: 'var(--warning)' }}
          >
            {loading === 'stop' ? '…' : '⏸️ PAUSE Trading'}
          </button>
          <button
            type="button"
            onClick={emergencyStop}
            disabled={!!loading}
            className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            style={{ background: 'var(--danger-dim)', color: 'var(--danger)' }}
          >
            {loading === 'emergency' ? '…' : '🛑 EMERGENCY STOP'}
          </button>
        </div>
        <p className="text-xs mt-4" style={{ color: 'var(--text-muted)' }}>
          Полные настройки авто-торговли (символы, плечо, TP/SL) — в разделе «Авто» главного приложения.
        </p>
      </section>
    </div>
  );
}
