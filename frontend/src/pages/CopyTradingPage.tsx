/**
 * Copy Trading Page — одна страница по примеру MEXC: герой, баланс, провайдеры,
 * подбор трейдера, сравнение показателей, как это работает, FAQ.
 * Тексты из infotrade.md.
 */

import { useState, useEffect, useMemo } from 'react';
import { api } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { RiskDisclaimer } from '../components/RiskDisclaimer';
import { PortfolioCard, TransactionHistory, DepositWithdraw, PnlChart } from '../components/CopyTrading';
import CopyTradingTerms from '../components/CopyTrading/CopyTradingTerms';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import type { Provider } from '../components/CopyTrading/ProvidersTable';
import { getDisplayStats as getProviderDisplayStats } from '../components/CopyTrading/ProvidersTable';

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

const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: 'Как копировать сделки?',
    a: '1. Выберите предпочитаемого трейдера на странице Копи-трейдинга и нажмите [Подписаться]\n\n2. Переведите USDT на свой спотовый счёт\n\n3. Заполните такие данные, как сумма копи-трейда и режим копи-трейдинга\n\n4. Отправьте информацию'
  },
  {
    q: 'Каковы требования, чтобы стать подписчиком?',
    a: 'Чтобы подписаться на трейдера, подписчики должны иметь на своём спотовом счёте не менее 30 USDT. Если в результате последующих сделок сумма их активов упадёт ниже 30 USDT, функция копи-трейдинга продолжит работать в обычном режиме, но дальнейшее уменьшение баланса с помощью функции корректировки активов будет невозможно.'
  },
  {
    q: 'Как выбрать подходящего трейдера?',
    a: 'Ключевые показатели, такие как ROI, PNL, ставка PNL и коэффициент выигрыша. Пользователям также предлагается учитывать личные предпочтения, такие как частота торговли, основные торговые пары, среднее время удержания, средняя сумма ордера и другие статистические факторы. При сравнении нескольких трейдеров функция «Сравнение результативности трейдеров» помогает получить подробные показатели с первого взгляда.'
  },
  {
    q: 'Какие меры безопасности существуют для управления рисками подписчика?',
    a: 'Стоп-лосс аккаунта: Может быть установлен в USDT или в процентах. Когда суммарные убытки достигают порогового значения, все позиции закрываются, а следующие отменяются.\n\nТейк-профит/Стоп-лосс: Подписчики могут устанавливать TP/SL для всех ордеров или индивидуально для открытых позиций.\n\nМаксимальный коэффициент на ордер: Ограничивает максимальный процент активов, используемых на ордер.\n\nУведомления в режиме реального времени: Уведомления обо всех операциях копи-трейдинга по электронной почте, через push-уведомления и внутренние сообщения.'
  },
  {
    q: 'Какие дополнительные расходы несут подписчики?',
    a: 'Помимо торговых комиссий, комиссий за финансирование и распределения прибыли, никакие другие комиссии не взимаются. Подписчики также могут воспользоваться текущими промоакциями платформы, предполагающими нулевые торговые комиссии.'
  },
  {
    q: 'Как работает система распределения доли прибыли?',
    a: 'Распределение доли прибыли происходит только в том случае, если активы подписчика превышают контрольный показатель после последнего распределения. Другими словами, совокупный реализованный PNL с момента последнего распределения прибыли должен быть положительным.\n\nПример: Начальная инвестиция: 1 000 USDT, доля прибыли трейдера: 10%.\n\nДень 1: Пользователь A получает прибыль в размере 200 USDT за счёт сделок копи-трейдинга трейдера B. В соответствии с соглашением о разделе 10% прибыли, 20 USDT отчисляется трейдеру B. После распределения прибыли активы пользователя А составляют 1 180 USDT.\n\nДень 2: Дневной убыток составляет 150 USDT. Совокупный PNL с момента последнего распределения прибыли (после дня 1) теперь составляет -150 USDT. Поскольку этот показатель отрицательный, доля прибыли не распределяется. Активы пользователя A снижаются до 1 030 USDT.\n\nДень 3: Зафиксирована прибыль в размере 100 USDT. Совокупный PNL с момента последнего распределения прибыли теперь составляет -50 USDT (-150 + 100). Поскольку он остаётся отрицательным, доля прибыли не распределяется. Активы пользователя A увеличиваются до 1 130 USDT.\n\nДень 4: Снова фиксируется прибыль в размере 100 USDT, в результате чего совокупный PNL достигает +50 USDT. Поскольку этот показатель теперь положительный, трейдеру B выделяется доля 10%, эквивалентная 5 USDT. До распределения прибыли активы пользователя A достигают 1 230 USDT; после вычета итог составляет 1 225 USDT.'
  }
];

const ASSET_OPTIONS = ['Все активы', 'Мультиактивы', 'Основные токены', 'Токены средней капитализации', 'Альткоины', 'Новые токены', 'Популярные'];
const TREND_OPTIONS = ['В основном лонг', 'В основном шорт', 'Нейтральный'];
const LEVERAGE_OPTIONS = ['Высокий риск, высокая доходность', 'Сбалансированный', 'Консервативный'];
const FREQUENCY_OPTIONS = ['Записи ~1ч', 'Записи ~8ч', 'Записи ~24ч', 'Записи > 24ч'];

export default function CopyTradingPage() {
  const { token } = useAuth();
  const [balance, setBalance] = useState<Balance | null>(null);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalType>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<number>(2);
  const [selectedTrend, setSelectedTrend] = useState<number | null>(null);
  const [selectedLeverage, setSelectedLeverage] = useState<number | null>(null);
  const [selectedFreq, setSelectedFreq] = useState<number | null>(null);
  /** Применённые фильтры после нажатия «Подобрать» — от них зависит список в таблице и блок рекомендаций */
  const [appliedFilters, setAppliedFilters] = useState<{ asset: number; trend: number | null; leverage: number | null; freq: number | null } | null>(null);
  /** Сортировка таблицы сравнения: колонка и направление */
  const [comparisonSort, setComparisonSort] = useState<{ column: 'pnl' | 'trader' | 'winRate' | 'subscribers'; dir: 'asc' | 'desc' }>({ column: 'pnl', dir: 'desc' });
  const [faqOpen, setFaqOpen] = useState<number | null>(null);
  const [subscribeSize, setSubscribeSize] = useState<Record<string, number>>({});
  const [profitShare, setProfitShare] = useState<Record<string, number>>({});

  const headers = token ? { Authorization: 'Bearer ' + token } : undefined;

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    setLoading(true);
    Promise.all([
      api.get<Balance>('/copy-trading-api/balance', { headers }).then(setBalance).catch(() => setBalance(null)),
      api.get<{ subscriptions: Subscription[] }>('/copy-trading/subscriptions', { headers }).then(r => setSubscriptions(r.subscriptions ?? [])).catch(() => setSubscriptions([]))
    ]).finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    api.get<{ providers: Provider[] }>('/copy-trading-api/providers')
      .then(r => setProviders(r.providers ?? []))
      .catch(() => setProviders([]))
      .finally(() => setProvidersLoading(false));
  }, []);

  const refreshBalance = () => {
    if (!token) return;
    api.get<Balance>('/copy-trading-api/balance', { headers }).then(setBalance).catch(() => { });
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

  const handleViewProfile = (providerId: string) => { document.getElementById('providers')?.scrollIntoView({ behavior: 'smooth' }); };

  const subscribedIds = useMemo(() => new Set(subscriptions.map(s => s.providerId)), [subscriptions]);

  /** Список провайдеров, отфильтрованный и отсортированный по применённым фильтрам подбора */
  const filteredAndSortedProviders = useMemo(() => {
    const list = [...providers];
    const f = appliedFilters;
    if (!f) {
      return list.sort((a, b) => getProviderDisplayStats(b).pnl - getProviderDisplayStats(a).pnl);
    }
    return list.sort((a, b) => {
      const da = getProviderDisplayStats(a);
      const db = getProviderDisplayStats(b);
      // Тренд: 0=лонг (выше PNL лучше), 1=шорт (ниже PNL лучше), 2=нейтральный (winRate)
      if (f.trend !== null) {
        if (f.trend === 0) {
          const pnlDiff = db.pnl - da.pnl;
          if (pnlDiff !== 0) return pnlDiff;
        } else if (f.trend === 1) {
          const pnlDiff = da.pnl - db.pnl;
          if (pnlDiff !== 0) return pnlDiff;
        } else {
          const wrDiff = db.winRate - da.winRate;
          if (wrDiff !== 0) return wrDiff;
        }
      }
      // Риск: 0=высокий (PNL), 1=сбалансированный (pnl + winRate), 2=консервативный (winRate)
      if (f.leverage !== null) {
        if (f.leverage === 0) {
          const pnlDiff = db.pnl - da.pnl;
          if (pnlDiff !== 0) return pnlDiff;
        } else if (f.leverage === 1) {
          const scoreA = da.pnl + da.winRate * 100;
          const scoreB = db.pnl + db.winRate * 100;
          if (scoreB !== scoreA) return scoreB - scoreA;
        } else {
          const wrDiff = db.winRate - da.winRate;
          if (wrDiff !== 0) return wrDiff;
        }
      }
      // Частота: 0,1=чаще сделки выше, 2,3=реже сделки выше
      if (f.freq !== null) {
        const tradesA = da.trades;
        const tradesB = db.trades;
        if (f.freq <= 1) {
          if (tradesB !== tradesA) return tradesB - tradesA;
        } else {
          if (tradesA !== tradesB) return tradesA - tradesB;
        }
      }
      return db.pnl - da.pnl;
    });
  }, [providers, appliedFilters]);

  const topProviders = useMemo(
    () => filteredAndSortedProviders.slice(0, 3),
    [filteredAndSortedProviders]
  );

  /** Список для таблицы с учётом сортировки по заголовкам */
  const tableProviders = useMemo(() => {
    const list = [...filteredAndSortedProviders];
    const { column, dir } = comparisonSort;
    const mult = dir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      const da = getProviderDisplayStats(a);
      const db = getProviderDisplayStats(b);
      let cmp = 0;
      if (column === 'pnl') cmp = da.pnl - db.pnl;
      else if (column === 'trader') cmp = (a.displayName || a.username).localeCompare((b.displayName || b.username));
      else if (column === 'winRate') cmp = da.winRate - db.winRate;
      else if (column === 'subscribers') cmp = da.subscribers - db.subscribers;
      return mult * cmp;
    });
    return list;
  }, [filteredAndSortedProviders, comparisonSort]);

  const handleComparisonSort = (column: typeof comparisonSort.column) => {
    setComparisonSort(prev =>
      prev.column === column ? { column, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { column, dir: column === 'pnl' || column === 'subscribers' ? 'desc' : 'asc' }
    );
  };

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
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-12 pb-16">
      {!termsAccepted && <CopyTradingTerms onAccept={() => setTermsAccepted(true)} />}
      <RiskDisclaimer storageKey="copy-trading" />

      {/* Торговля без лишних усилий — первая секция вместо героя */}
      <Card variant="accent" padding="spacious">
        <h1 className="text-2xl md:text-3xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Торговля без лишних усилий с помощью копи-трейдинга в один клик</h1>
        <a href="#faq" className="text-sm mb-8 inline-block" style={{ color: 'var(--accent)' }}>О Копи-трейдинге →</a>
        <div className="grid md:grid-cols-3 gap-8">
          <div>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style={{ background: 'var(--accent-gradient)', color: '#000' }}>
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
            </div>
            <h2 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Выберите трейдера</h2>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Выберите лучших трейдеров, основываясь на общем рейтинге, ROI и других критериях.</p>
          </div>
          <div>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style={{ background: 'var(--accent-gradient)', color: '#000' }}>
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </div>
            <h2 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Установить параметры копи-трейдинг</h2>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Установите параметры, связанные с копи-трейдингом и контролем риска, такие как режим копирования, маржа и способ размещения ордеров при открытии позиции.</p>
          </div>
          <div>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style={{ background: 'var(--accent-gradient)', color: '#000' }}>
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            </div>
            <h2 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Следовать за открытием/закрытием</h2>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>После установки параметров копи-трейдинга система будет отслеживать сигналы трейдера на открытие и закрытие позиций в режиме реального времени, автоматически открывая и закрывая позиции за вас.</p>
          </div>
        </div>
      </Card>

      {/* Баланс, мои подписки и PnL */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-6">
          <PortfolioCard token={token} onDeposit={() => setModal('deposit')} onWithdraw={() => setModal('withdraw')} onHistory={() => setModal('history')} />
          <PnlChart token={token} />
        </div>
        <section className="rounded-lg p-4 md:p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Мои подписки ({subscriptions.length})</h2>
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
      </div>

      {/* Подбор трейдера */}
      <Card variant="glass" padding="spacious">
        <div className="grid md:grid-cols-2 gap-8 md:gap-10 md:items-start">
          <div className="min-w-0">
            <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Подбор трейдера</h2>
            <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>Умные рекомендации, основанные на ваших торговых предпочтениях</p>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>1. Какими активами вы хотели бы торговать?</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
              {ASSET_OPTIONS.map((opt, i) => (
                <button key={i} type="button" onClick={() => setSelectedAsset(i)} className="px-3 py-1.5 rounded-lg text-sm transition-colors text-left" style={{ background: selectedAsset === i ? 'var(--accent-dim)' : 'var(--bg-hover)', color: selectedAsset === i ? 'var(--accent)' : 'var(--text-secondary)' }}>{opt}</button>
              ))}
            </div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>2. На какой рыночной тенденции сосредоточиться?</p>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {TREND_OPTIONS.map((opt, i) => (
                <button key={i} type="button" onClick={() => setSelectedTrend(selectedTrend === i ? null : i)} className="px-3 py-1.5 rounded-lg text-sm transition-colors" style={{ background: selectedTrend === i ? 'var(--accent-dim)' : 'var(--bg-hover)', color: selectedTrend === i ? 'var(--accent)' : 'var(--text-secondary)' }}>{opt}</button>
              ))}
            </div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>3. Кредитное плечо и соотношение риска и доходности?</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
              {LEVERAGE_OPTIONS.map((opt, i) => (
                <button key={i} type="button" onClick={() => setSelectedLeverage(selectedLeverage === i ? null : i)} className="px-3 py-1.5 rounded-lg text-sm transition-colors text-left" style={{ background: selectedLeverage === i ? 'var(--accent-dim)' : 'var(--bg-hover)', color: selectedLeverage === i ? 'var(--accent)' : 'var(--text-secondary)' }}>{opt}</button>
              ))}
            </div>
            <Button
              variant="primary"
              className="mt-4"
              onClick={() => {
                setAppliedFilters({
                  asset: selectedAsset,
                  trend: selectedTrend ?? null,
                  leverage: selectedLeverage ?? null,
                  freq: selectedFreq ?? null
                });
                document.getElementById('comparison')?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              Подобрать
            </Button>
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Рекомендация ИИ</h2>
            <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>Топ трейдеров по выбранным критериям</p>
            {providersLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="h-24 rounded-lg animate-pulse" style={{ background: 'var(--bg-hover)' }} />)}
              </div>
            ) : topProviders.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Нет доступных провайдеров</p>
            ) : (
              <div className="space-y-4">
                {topProviders.map((p, i) => {
                  const d = getProviderDisplayStats(p);
                  const isSub = subscribedIds.has(p.userId);
                  return (
                    <div key={p.userId} className="p-4 rounded-xl" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)' }}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>{(p.displayName || p.username)[0].toUpperCase()}</div>
                          <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{p.displayName || p.username}</span>
                        </div>
                        <span className="text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>7-дн. ROI {d.pnl >= 0 ? '+' : ''}{(d.pnl / 100).toFixed(1)}%</span>
                      </div>
                      <div className="flex gap-4 text-xs mb-3">
                        <span style={{ color: 'var(--text-muted)' }}>Совпадение {d.winRate.toFixed(0)}%</span>
                        <span className={d.pnl >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}>7-дн. PNL ${d.pnl.toFixed(2)}</span>
                      </div>
                      {isSub ? (
                        <button onClick={() => handleUnsubscribe(p.userId)} className="w-full py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--danger)', color: '#fff' }}>Отписаться</button>
                      ) : (
                        <div className="flex gap-2 items-center">
                          <input type="number" min={5} max={100} value={subscribeSize[p.userId] ?? 25} onChange={e => setSubscribeSize(prev => ({ ...prev, [p.userId]: Number(e.target.value) }))} className="w-14 px-2 py-1.5 rounded text-sm text-right" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>%</span>
                          <input type="number" min={0} max={100} value={profitShare[p.userId] ?? 10} onChange={e => setProfitShare(prev => ({ ...prev, [p.userId]: Number(e.target.value) }))} className="w-12 px-2 py-1.5 rounded text-sm text-right" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
                          <button onClick={() => handleSubscribe(p.userId, subscribeSize[p.userId] ?? 25, profitShare[p.userId] ?? 10)} className="flex-1 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--accent)', color: '#fff' }}>Подписаться</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Сравнение показателей трейдеров */}
      <section id="comparison">
        <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Сравнение показателей трейдеров CLABX ИИ</h2>
        <p className="text-sm mb-2" style={{ color: 'var(--text-muted)' }}>Лучшие криптотрейдеры планеты и передовые ИИ-модели объединились на CLABX Копи-трейдинг</p>
        {appliedFilters && (
          <p className="text-xs mb-4" style={{ color: 'var(--accent)' }}>
            Подбор по: {ASSET_OPTIONS[appliedFilters.asset]}
            {appliedFilters.trend != null && ` · ${TREND_OPTIONS[appliedFilters.trend]}`}
            {appliedFilters.leverage != null && ` · ${LEVERAGE_OPTIONS[appliedFilters.leverage]}`}
            {appliedFilters.freq != null && ` · ${FREQUENCY_OPTIONS[appliedFilters.freq]}`}
          </p>
        )}
        <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid var(--border)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--bg-card-solid)' }}>
                <th className="py-3 px-3 text-left text-xs font-semibold uppercase" style={{ color: 'var(--text-muted)' }}>
                  <button type="button" onClick={() => handleComparisonSort('pnl')} className="flex items-center gap-1 hover:opacity-80 transition-opacity">
                    Место
                    {comparisonSort.column === 'pnl' && <span aria-hidden>{comparisonSort.dir === 'desc' ? '↓' : '↑'}</span>}
                  </button>
                </th>
                <th className="py-3 px-3 text-left text-xs font-semibold uppercase" style={{ color: 'var(--text-muted)' }}>
                  <button type="button" onClick={() => handleComparisonSort('trader')} className="flex items-center gap-1 hover:opacity-80 transition-opacity">
                    Трейдер
                    {comparisonSort.column === 'trader' && <span aria-hidden>{comparisonSort.dir === 'desc' ? '↓' : '↑'}</span>}
                  </button>
                </th>
                <th className="py-3 px-3 text-right text-xs font-semibold uppercase" style={{ color: 'var(--text-muted)' }}>
                  <button type="button" onClick={() => handleComparisonSort('pnl')} className="flex items-center justify-end gap-1 w-full hover:opacity-80 transition-opacity">
                    PNL события
                    {comparisonSort.column === 'pnl' && <span aria-hidden>{comparisonSort.dir === 'desc' ? '↓' : '↑'}</span>}
                  </button>
                </th>
                <th className="py-3 px-3 text-right text-xs font-semibold uppercase" style={{ color: 'var(--text-muted)' }}>
                  <button type="button" onClick={() => handleComparisonSort('pnl')} className="flex items-center justify-end gap-1 w-full hover:opacity-80 transition-opacity">
                    7-дневный PNL
                    {comparisonSort.column === 'pnl' && <span aria-hidden>{comparisonSort.dir === 'desc' ? '↓' : '↑'}</span>}
                  </button>
                </th>
                <th className="py-3 px-3 text-right text-xs font-semibold uppercase" style={{ color: 'var(--text-muted)' }}>Лучшая сделка</th>
                <th className="py-3 px-3 text-right text-xs font-semibold uppercase" style={{ color: 'var(--text-muted)' }}>
                  <button type="button" onClick={() => handleComparisonSort('winRate')} className="flex items-center justify-end gap-1 w-full hover:opacity-80 transition-opacity">
                    7-дн. коэф. успеха
                    {comparisonSort.column === 'winRate' && <span aria-hidden>{comparisonSort.dir === 'desc' ? '↓' : '↑'}</span>}
                  </button>
                </th>
                <th className="py-3 px-3 text-right text-xs font-semibold uppercase" style={{ color: 'var(--text-muted)' }}>
                  <button type="button" onClick={() => handleComparisonSort('subscribers')} className="flex items-center justify-end gap-1 w-full hover:opacity-80 transition-opacity">
                    Подписчики
                    {comparisonSort.column === 'subscribers' && <span aria-hidden>{comparisonSort.dir === 'desc' ? '↓' : '↑'}</span>}
                  </button>
                </th>
                <th className="py-3 px-3 text-right text-xs font-semibold uppercase" style={{ color: 'var(--text-muted)' }}>Действие</th>
              </tr>
            </thead>
            <tbody>
              {providersLoading ? (
                [1, 2, 3].map(i => (
                  <tr key={i}><td colSpan={8} className="py-4"><div className="h-10 rounded animate-pulse" style={{ background: 'var(--bg-hover)' }} /></td></tr>
                ))
              ) : (
                tableProviders.map((p, index) => {
                  const d = getProviderDisplayStats(p);
                  const isSub = subscribedIds.has(p.userId);
                  return (
                    <tr key={p.userId} className="border-b" style={{ borderColor: 'var(--border)' }}>
                      <td className="py-3 px-3" style={{ color: 'var(--text-secondary)' }}>{index + 1}</td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>{(p.displayName || p.username)[0].toUpperCase()}</div>
                          <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{p.displayName || p.username}</span>
                        </div>
                      </td>
                      <td className={"py-3 px-3 text-right font-mono " + (d.pnl >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]')}>{d.pnl >= 0 ? '+' : ''}{d.pnl.toFixed(2)} $</td>
                      <td className={"py-3 px-3 text-right font-mono " + (d.pnl >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]')}>{d.pnl >= 0 ? '+' : ''}{d.pnl.toFixed(2)} $</td>
                      <td className="py-3 px-3 text-right" style={{ color: 'var(--text-muted)' }}>—</td>
                      <td className="py-3 px-3 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>{d.winRate.toFixed(2)}%</td>
                      <td className="py-3 px-3 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>{d.subscribers}/1000</td>
                      <td className="py-3 px-3 text-right">
                        {isSub ? (
                          <button onClick={() => handleUnsubscribe(p.userId)} className="px-3 py-1.5 rounded-lg text-sm font-medium" style={{ background: 'var(--danger)', color: '#fff' }}>Отписаться</button>
                        ) : (
                          <div className="flex justify-end gap-2 items-center flex-wrap">
                            <input type="number" min={5} max={100} value={subscribeSize[p.userId] ?? 25} onChange={e => setSubscribeSize(prev => ({ ...prev, [p.userId]: Number(e.target.value) }))} className="w-14 px-2 py-1 rounded text-right text-sm" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
                            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>%</span>
                            <input type="number" min={0} max={100} value={profitShare[p.userId] ?? 10} onChange={e => setProfitShare(prev => ({ ...prev, [p.userId]: Number(e.target.value) }))} className="w-12 px-2 py-1 rounded text-right text-sm" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
                            <button onClick={() => handleSubscribe(p.userId, subscribeSize[p.userId] ?? 25, profitShare[p.userId] ?? 10)} className="px-3 py-1.5 rounded-lg text-sm font-medium" style={{ background: 'var(--accent)', color: '#fff' }}>Подписаться</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq">
        <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Часто задаваемые вопросы (FAQ)</h2>
        <a href="https://clabx.ru/support" target="_blank" rel="noopener noreferrer" className="text-sm mb-6 inline-block" style={{ color: 'var(--accent)' }}>Руководство →</a>
        <div className="space-y-2">
          {FAQ_ITEMS.map((item, i) => (
            <div key={i} className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--bg-card-solid)' }}>
              <button
                onClick={() => setFaqOpen(faqOpen === i ? null : i)}
                className="w-full flex items-center justify-between gap-4 px-4 py-3 text-left text-sm font-medium"
                style={{ color: 'var(--text-primary)' }}
              >
                <span>{i + 1}. {item.q}</span>
                <span className="text-lg shrink-0" style={{ color: 'var(--text-muted)' }}>{faqOpen === i ? '−' : '+'}</span>
              </button>
              {faqOpen === i && (
                <div className="px-4 pb-4 pt-0 text-sm whitespace-pre-wrap" style={{ color: 'var(--text-secondary)', borderTop: '1px solid var(--border)' }}>{item.a}</div>
              )}
            </div>
          ))}
        </div>
      </section>

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
