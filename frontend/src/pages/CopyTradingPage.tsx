/**
 * Copy Trading Page — страница копитрейдинга
 */

import { useState, useEffect, useMemo } from 'react';
import { api } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { RiskDisclaimer } from '../components/RiskDisclaimer';
import { PortfolioCard, ProvidersTable, TransactionHistory, DepositWithdraw } from '../components/CopyTrading';
import CopyTradingTerms from '../components/CopyTrading/CopyTradingTerms';

interface Subscription {
  providerId: string;
  username: string;
  sizePercent: number;
  profitSharePercent: number;
  createdAt: string;
}

interface Balance {
  balance: number;
  totalPnl: number;
  totalDeposit: number;
  totalWithdraw: number;
}

type ModalType = 'deposit' | 'withdraw' | 'history' | null;

export default function CopyTradingPage() {
  const { token } = useAuth();
  const [balance, setBalance] = useState<Balance | null>(null);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalType>(null);
  const [activeTab, setActiveTab] = useState<'providers' | 'subscriptions'>('providers');
  const [termsAccepted, setTermsAccepted] = useState(false);

  const headers = token ? { Authorization: 'Bearer ' + token } : undefined;

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    setLoading(true);
    Promise.all([
      api.get<Balance>('/copy-trading-api/balance', { headers }).then(setBalance).catch(() => setBalance(null)),
      api.get<{ subscriptions: Subscription[] }>('/copy-trading/subscriptions', { headers }).then(r => setSubscriptions(r.subscriptions ?? [])).catch(() => setSubscriptions([]))
    ]).finally(() => setLoading(false));
  }, [token]);

  const refreshBalance = () => {
    if (!token) return;
    api.get<Balance>('/copy-trading-api/balance', { headers }).then(setBalance).catch(() => {});
  };

  const handleSubscribe = async (providerId: string, sizePercent: number, profitSharePercent: number) => {
    try {
      await api.post('/copy-trading/subscribe', { providerId, sizePercent, profitSharePercent }, { headers });
      const r = await api.get<{ subscriptions: Subscription[] }>('/copy-trading/subscriptions', { headers });
      setSubscriptions(r.subscriptions ?? []);
    } catch (e) { alert((e as Error).message || 'Ошибка подписки'); }
  };

  const handleUnsubscribe = async (providerId: string) => {
    try {
      await api.post('/copy-trading/unsubscribe', { providerId }, { headers });
      setSubscriptions(prev => prev.filter(s => s.providerId !== providerId));
    } catch (e) { alert((e as Error).message || 'Ошибка отписки'); }
  };

  const handleViewProfile = (providerId: string) => { console.log('View:', providerId); };

  const subscribedIds = useMemo(() => new Set(subscriptions.map(s => s.providerId)), [subscriptions]);

  if (!token) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Копитрейдинг</h1>
        <div className="rounded-lg p-8 text-center" style={{ background: 'var(--bg-card-solid)', border: '1px solid var(--border)' }}>
          <p style={{ color: 'var(--text-muted)' }}>Войдите, чтобы использовать копитрейдинг</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
      {!termsAccepted && <CopyTradingTerms onAccept={() => setTermsAccepted(true)} />}
      <RiskDisclaimer storageKey="copy-trading" />
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Копитрейдинг</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Копируйте сделки успешных трейдеров</p>
        </div>
      </div>
      <PortfolioCard token={token} onDeposit={() => setModal('deposit')} onWithdraw={() => setModal('withdraw')} onHistory={() => setModal('history')} />
      <div className="flex gap-2 border-b" style={{ borderColor: 'var(--border)' }}>
        <button onClick={() => setActiveTab('providers')} className={"px-4 py-2 text-sm font-medium border-b-2 " + (activeTab === 'providers' ? '' : 'border-transparent')} style={{ color: activeTab === 'providers' ? 'var(--accent)' : 'var(--text-muted)', borderColor: activeTab === 'providers' ? 'var(--accent)' : 'transparent' }}>Провайдеры</button>
        <button onClick={() => setActiveTab('subscriptions')} className={"px-4 py-2 text-sm font-medium border-b-2 " + (activeTab === 'subscriptions' ? '' : 'border-transparent')} style={{ color: activeTab === 'subscriptions' ? 'var(--accent)' : 'var(--text-muted)', borderColor: activeTab === 'subscriptions' ? 'var(--accent)' : 'transparent' }}>Мои подписки ({subscriptions.length})</button>
      </div>
      {activeTab === 'providers' && (
        <section className="rounded-lg p-4 md:p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Рейтинг провайдеров</h2>
          <ProvidersTable token={token} subscribedIds={subscribedIds} onSubscribe={handleSubscribe} onUnsubscribe={handleUnsubscribe} onViewProfile={handleViewProfile} />
        </section>
      )}
      {activeTab === 'subscriptions' && (
        <section className="rounded-lg p-4 md:p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Мои подписки</h2>
          {subscriptions.length === 0 ? (
            <div className="text-center py-8"><p style={{ color: 'var(--text-muted)' }}>Нет активных подписок</p></div>
          ) : (
            <div className="space-y-3">
              {subscriptions.map(sub => (
                <div key={sub.providerId} className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'var(--bg-hover)' }}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>{sub.username[0].toUpperCase()}</div>
                    <div>
                      <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{sub.username}</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Доля: {sub.sizePercent}%</p>
                    </div>
                  </div>
                  <button onClick={() => handleUnsubscribe(sub.providerId)} className="px-3 py-1.5 rounded-lg text-sm font-medium" style={{ background: 'var(--danger)', color: '#fff' }}>Отписаться</button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
      {modal === 'deposit' && <DepositWithdraw token={token} type="deposit" balance={balance?.balance ?? 0} onClose={() => setModal(null)} onSuccess={refreshBalance} />}
      {modal === 'withdraw' && <DepositWithdraw token={token} type="withdraw" balance={balance?.balance ?? 0} onClose={() => setModal(null)} onSuccess={refreshBalance} />}
      {modal === 'history' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setModal(null)} />
          <div className="relative w-full max-w-lg"><TransactionHistory token={token} onClose={() => setModal(null)} /></div>
        </div>
      )}
    </div>
  );
}
