import { useState, useEffect, useCallback } from 'react';
import { adminApi } from '../../utils/adminApi';

interface WalletData {
  enabled: boolean;
  deposits: { count: number; total_usdt: number };
  withdrawals: { pending: number; sent: number; total_sent_usdt: number };
  pendingWithdrawals: Array<{ id: number; user_id: string; amount_usdt: number; to_address: string; created_at: string }>;
  customAddresses: Array<{ derivation_index: number; network: string; address: string }>;
}

const cardStyle = { background: 'var(--bg-card-solid)', border: '1px solid var(--border)', borderRadius: 12 };

export default function AdminWallet() {
  const [data, setData] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mnemonic, setMnemonic] = useState('');
  const [saving, setSaving] = useState(false);
  const [customIdx, setCustomIdx] = useState(0);
  const [customNetwork, setCustomNetwork] = useState('trc20');
  const [customAddr, setCustomAddr] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const d = await adminApi.get<WalletData>('/admin/wallet');
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSaveSeed = async () => {
    const words = mnemonic.trim().split(/\s+/);
    if (words.length < 12) {
      setError('Seed-фраза: 12 или 24 слова');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await adminApi.post('/admin/wallet/config', { mnemonic: mnemonic.trim() });
      setMnemonic('');
      await fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const handleAddCustomAddress = async () => {
    const addr = customAddr.trim();
    if (!addr || addr.length < 20) {
      setError('Укажите адрес (TRC20 и т.д.)');
      return;
    }
    setError('');
    try {
      await adminApi.post('/admin/wallet/custom-address', { derivationIndex: customIdx, network: customNetwork, address: addr });
      setCustomAddr('');
      await fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    }
  };

  const handleApprove = async (id: number) => {
    if (!window.confirm('Подтвердить и отправить вывод?')) return;
    setError('');
    try {
      await adminApi.post(`/admin/wallet/withdrawals/${id}/approve`);
      await fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка отправки');
    }
  };

  const handleReject = async (id: number) => {
    if (!window.confirm('Отклонить вывод? Средства вернутся на баланс пользователя.')) return;
    setError('');
    try {
      await adminApi.post(`/admin/wallet/withdrawals/${id}/reject`);
      await fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <p style={{ color: 'var(--text-muted)' }}>Загрузка…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto p-6">
      <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>Кошелёк</h2>
      {error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}

      {/* Статистика */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl" style={cardStyle}>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Пополнения</p>
          <p className="text-lg font-bold">{data?.deposits?.count ?? 0}</p>
          <p className="text-sm">{Number(data?.deposits?.total_usdt ?? 0).toFixed(2)} USDT</p>
        </div>
        <div className="p-4 rounded-xl" style={cardStyle}>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>На вывод</p>
          <p className="text-lg font-bold">{data?.withdrawals?.pending ?? 0}</p>
        </div>
        <div className="p-4 rounded-xl" style={cardStyle}>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Выведено</p>
          <p className="text-lg font-bold">{data?.withdrawals?.sent ?? 0}</p>
          <p className="text-sm">{Number(data?.withdrawals?.total_sent_usdt ?? 0).toFixed(2)} USDT</p>
        </div>
        <div className="p-4 rounded-xl" style={cardStyle}>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>TRC20 кошелёк</p>
          <p className="text-lg font-bold">{data?.enabled ? '✓' : '—'}</p>
        </div>
      </div>

      {/* Seed-фраза — только USDT/TRC20 */}
      <section className="p-5 rounded-xl" style={cardStyle}>
        <h3 className="font-medium mb-3">Seed-фраза (шифруется)</h3>
        <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>12 или 24 слова. Зачисления и выводы только по USDT/TRC20.</p>
        <textarea
          value={mnemonic}
          onChange={(e) => setMnemonic(e.target.value)}
          placeholder="word1 word2 ..."
          className="w-full rounded-lg p-3 text-sm font-mono"
          style={{ background: 'var(--bg)', color: 'var(--text-primary)', minHeight: 60 }}
          rows={2}
        />
        <div className="flex flex-wrap gap-3 mt-3">
          <button onClick={handleSaveSeed} disabled={saving} className="px-4 py-2 rounded-lg font-medium" style={{ background: 'var(--accent)', color: '#fff' }}>
            {saving ? '…' : 'Сохранить'}
          </button>
        </div>
      </section>

      {/* Кастомные адреса TRC20 (опц.) */}
      <section className="p-5 rounded-xl" style={cardStyle}>
        <h3 className="font-medium mb-3">Кастомные TRC20 адреса (опционально)</h3>
        <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>Аккаунт 0–4. Адрес должен начинаться с T, 34 символа (напр. TYDzsYUEpvnYmQk4zGP9gZhgxw4jv3mD7A).</p>
        <div className="flex flex-wrap gap-2 mb-3">
          <select value={customIdx} onChange={(e) => setCustomIdx(Number(e.target.value))} className="rounded-lg px-3 py-2" style={{ background: 'var(--bg)' }}>
            {[0, 1, 2, 3, 4].map((i) => <option key={i} value={i}>Аккаунт {i}</option>)}
          </select>
          <input type="text" value={customNetwork} onChange={(e) => setCustomNetwork(e.target.value)} placeholder="trc20" className="rounded-lg px-3 py-2 w-24" style={{ background: 'var(--bg)' }} />
          <input type="text" value={customAddr} onChange={(e) => setCustomAddr(e.target.value)} placeholder="2PUVwnJNmMakymdyXk7S71K9GC2CFR5PuFjeXfi2m5vf" className="rounded-lg px-3 py-2 flex-1 min-w-48 font-mono text-sm" style={{ background: 'var(--bg)' }} />
          <button onClick={handleAddCustomAddress} className="px-4 py-2 rounded-lg font-medium" style={{ background: 'var(--accent)', color: '#fff' }}>Добавить</button>
        </div>
        {data?.customAddresses?.length ? (
          <ul className="text-sm space-y-1" style={{ color: 'var(--text-muted)' }}>
            {data.customAddresses.map((c, i) => (
              <li key={i}>Акк.{c.derivation_index} {c.network}: {c.address.slice(0, 12)}…{c.address.slice(-6)}</li>
            ))}
          </ul>
        ) : null}
      </section>

      {/* Заявки на вывод */}
      <section className="p-5 rounded-xl" style={cardStyle}>
        <h3 className="font-medium mb-3">Заявки на вывод ({data?.pendingWithdrawals?.length ?? 0})</h3>
        {data?.pendingWithdrawals?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th className="text-left py-2">ID</th>
                  <th className="text-left py-2">User</th>
                  <th className="text-left py-2">Сумма</th>
                  <th className="text-left py-2">Адрес</th>
                  <th className="text-left py-2">Дата</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.pendingWithdrawals.map((w) => (
                  <tr key={w.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="py-2">{w.id}</td>
                    <td className="py-2 font-mono text-xs">{w.user_id.slice(0, 12)}…</td>
                    <td className="py-2">{w.amount_usdt.toFixed(2)} USDT</td>
                    <td className="py-2 font-mono text-xs">{w.to_address.slice(0, 10)}…{w.to_address.slice(-6)}</td>
                    <td className="py-2">{new Date(w.created_at).toLocaleString('ru')}</td>
                    <td className="py-2">
                      <button onClick={() => handleApprove(w.id)} className="mr-2 px-2 py-1 rounded text-xs font-medium" style={{ background: 'var(--success)', color: '#fff' }}>✓</button>
                      <button onClick={() => handleReject(w.id)} className="px-2 py-1 rounded text-xs font-medium" style={{ background: 'var(--danger)', color: '#fff' }}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Нет заявок</p>
        )}
      </section>
    </div>
  );
}
