/**
 * Admin Deposit Addresses — управление адресами для пополнения
 */

import { useState, useEffect } from 'react';
import { adminApi } from '../../utils/adminApi';

interface DepositAddress {
  id: number;
  network: string;
  address: string;
  minDeposit: number;
  confirmations: number;
  enabled: boolean;
}

export default function AdminDepositAddresses() {
  const [addresses, setAddresses] = useState<DepositAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newAddr, setNewAddr] = useState({
    network: 'TRC20',
    address: '',
    minDeposit: 10,
    confirmations: 12
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await adminApi.get<{ addresses: DepositAddress[] }>('/copy-trading-api/admin/deposit-addresses');
      setAddresses(res.addresses ?? []);
    } catch (e) {
      console.error('Fetch error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleToggleEnabled = async (addr: DepositAddress) => {
    setSaving(addr.id);
    try {
      await adminApi.put(`/copy-trading-api/admin/deposit-addresses/${addr.id}`, {
        enabled: !addr.enabled
      });
      await fetchData();
    } catch (e) {
      alert('Ошибка: ' + (e as Error).message);
    } finally {
      setSaving(null);
    }
  };

  const handleUpdate = async (addr: DepositAddress, field: string, value: string | number) => {
    setSaving(addr.id);
    try {
      await adminApi.put(`/copy-trading-api/admin/deposit-addresses/${addr.id}`, {
        [field]: value
      });
      await fetchData();
    } catch (e) {
      alert('Ошибка: ' + (e as Error).message);
    } finally {
      setSaving(null);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Удалить этот адрес?')) return;
    try {
      await adminApi.del(`/copy-trading-api/admin/deposit-addresses/${id}`);
      await fetchData();
    } catch (e) {
      alert('Ошибка: ' + (e as Error).message);
    }
  };

  const handleAdd = async () => {
    if (!newAddr.address.trim()) {
      alert('Укажите адрес');
      return;
    }
    setSaving(-1);
    try {
      const res = await adminApi.post<{ ok: boolean; error?: string }>('/copy-trading-api/admin/deposit-addresses', newAddr);
      if (res.ok) {
        setShowAdd(false);
        setNewAddr({ network: 'TRC20', address: '', minDeposit: 10, confirmations: 12 });
        await fetchData();
      } else {
        alert('Ошибка: ' + (res.error || 'Неизвестная ошибка'));
      }
    } catch (e) {
      alert('Ошибка: ' + (e as Error).message);
    } finally {
      setSaving(null);
    }
  };

  const cardStyle = {
    background: 'var(--bg-card-solid)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)'
  };

  const networkColors: Record<string, string> = {
    TRC20: '#26A17B',
    BEP20: '#F0B90B',
    ERC20: '#627EEA'
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Адреса пополнения</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            USDT адреса для приёма депозитов пользователей
          </p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          + Добавить адрес
        </button>
      </div>

      {showAdd && (
        <div className="rounded-lg p-4" style={cardStyle}>
          <h3 className="font-medium mb-4" style={{ color: 'var(--text-primary)' }}>Новый адрес</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-xs" style={{ color: 'var(--text-muted)' }}>Сеть</label>
              <select
                value={newAddr.network}
                onChange={e => setNewAddr({ ...newAddr, network: e.target.value })}
                className="w-full px-2 py-2 rounded text-sm mt-1"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              >
                <option value="TRC20">TRC20 (Tron)</option>
                <option value="BEP20">BEP20 (BSC)</option>
                <option value="ERC20">ERC20 (Ethereum)</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs" style={{ color: 'var(--text-muted)' }}>Адрес кошелька</label>
              <input
                type="text"
                value={newAddr.address}
                onChange={e => setNewAddr({ ...newAddr, address: e.target.value })}
                placeholder="TJx... или 0x..."
                className="w-full px-2 py-2 rounded text-sm mt-1 font-mono"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={handleAdd}
                disabled={saving === -1}
                className="w-full px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                style={{ background: 'var(--success)', color: '#fff' }}
              >
                {saving === -1 ? '...' : 'Добавить'}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div>
              <label className="text-xs" style={{ color: 'var(--text-muted)' }}>Мин. депозит (USDT)</label>
              <input
                type="number"
                value={newAddr.minDeposit}
                onChange={e => setNewAddr({ ...newAddr, minDeposit: parseFloat(e.target.value) || 10 })}
                className="w-full px-2 py-1.5 rounded text-sm mt-1"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              />
            </div>
            <div>
              <label className="text-xs" style={{ color: 'var(--text-muted)' }}>Подтверждений</label>
              <input
                type="number"
                value={newAddr.confirmations}
                onChange={e => setNewAddr({ ...newAddr, confirmations: parseInt(e.target.value) || 12 })}
                className="w-full px-2 py-1.5 rounded text-sm mt-1"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              />
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 rounded-lg" style={cardStyle}>
          <p style={{ color: 'var(--text-muted)' }}>Загрузка...</p>
        </div>
      ) : addresses.length === 0 ? (
        <div className="text-center py-12 rounded-lg" style={cardStyle}>
          <p style={{ color: 'var(--text-muted)' }}>Нет адресов. Добавьте первый!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {addresses.map(addr => (
            <div key={addr.id} className="rounded-lg p-4" style={{ ...cardStyle, opacity: addr.enabled ? 1 : 0.6 }}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div
                    className="px-3 py-1.5 rounded-lg text-xs font-bold"
                    style={{ background: networkColors[addr.network] || '#888', color: '#fff' }}
                  >
                    {addr.network}
                  </div>
                  <div>
                    <code className="text-sm font-mono break-all" style={{ color: 'var(--text-primary)' }}>
                      {addr.address}
                    </code>
                    <div className="flex items-center gap-4 mt-1">
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        Мин: {addr.minDeposit} USDT
                      </span>
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        Подтв: {addr.confirmations}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded ${addr.enabled ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                        {addr.enabled ? 'Активен' : 'Отключён'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggleEnabled(addr)}
                    disabled={saving === addr.id}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity disabled:opacity-50"
                    style={{ 
                      background: addr.enabled ? 'var(--warning)' : 'var(--success)', 
                      color: '#fff' 
                    }}
                  >
                    {saving === addr.id ? '...' : addr.enabled ? 'Отключить' : 'Включить'}
                  </button>
                  <button
                    onClick={() => handleDelete(addr.id)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium"
                    style={{ background: 'var(--danger)', color: '#fff' }}
                  >
                    Удалить
                  </button>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t grid grid-cols-2 sm:grid-cols-4 gap-2" style={{ borderColor: 'var(--border)' }}>
                <div>
                  <label className="text-xs" style={{ color: 'var(--text-secondary)' }}>Адрес</label>
                  <input
                    type="text"
                    value={addr.address}
                    onChange={e => handleUpdate(addr, 'address', e.target.value)}
                    className="w-full px-2 py-1 rounded text-xs mt-0.5 font-mono"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                  />
                </div>
                <div>
                  <label className="text-xs" style={{ color: 'var(--text-secondary)' }}>Мин. депозит</label>
                  <input
                    type="number"
                    value={addr.minDeposit}
                    onChange={e => handleUpdate(addr, 'minDeposit', parseFloat(e.target.value) || 10)}
                    className="w-full px-2 py-1 rounded text-xs mt-0.5"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                  />
                </div>
                <div>
                  <label className="text-xs" style={{ color: 'var(--text-secondary)' }}>Подтверждений</label>
                  <input
                    type="number"
                    value={addr.confirmations}
                    onChange={e => handleUpdate(addr, 'confirmations', parseInt(e.target.value) || 12)}
                    className="w-full px-2 py-1 rounded text-xs mt-0.5"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-lg p-4" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
        <h4 className="text-sm font-semibold mb-2" style={{ color: 'var(--success)' }}>Подсказки</h4>
        <ul className="text-xs space-y-1" style={{ color: 'var(--text-secondary)' }}>
          <li>TRC20 — низкие комиссии, рекомендуются для небольших депозитов</li>
          <li>BEP20 — средние комиссии, быстрые транзакции</li>
          <li>ERC20 — высокие комиссии, для крупных депозитов</li>
          <li>Адреса с одинаковым значением будут отображаться во всех сетях</li>
        </ul>
      </div>
    </div>
  );
}
