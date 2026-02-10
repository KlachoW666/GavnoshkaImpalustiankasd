import { useState, useEffect } from 'react';
import { getSettings, updateSettings, type Settings } from '../store/settingsStore';
import { useAuth } from '../contexts/AuthContext';

type SettingsTab = 'connections' | 'analysis' | 'notifications' | 'display' | 'risk';

const TABS: { id: SettingsTab; label: string; icon: string }[] = [
  { id: 'connections', label: 'Подключения', icon: '🔌' },
  { id: 'analysis', label: 'Анализ', icon: '📊' },
  { id: 'notifications', label: 'Уведомления', icon: '🔔' },
  { id: 'display', label: 'Отображение', icon: '🎨' },
  { id: 'risk', label: 'Риски', icon: '⚠️' }
];

const API = '/api';

export default function SettingsPage() {
  const { user, updateProxy, token } = useAuth();
  const [activeTab, setActiveTab] = useState<SettingsTab>('connections');
  const [settings, setSettings] = useState<Settings>(getSettings);
  const [connStatus, setConnStatus] = useState<Record<string, { ok?: boolean; msg?: string; checking?: boolean }>>({});
  const [tgTestStatus, setTgTestStatus] = useState<{ ok?: boolean; msg?: string; testing?: boolean }>({});

  useEffect(() => {
    const s = getSettings();
    if (user?.proxyUrl !== undefined && s.connections.proxy !== user.proxyUrl) {
      updateSettings({ connections: { ...s.connections, proxy: user.proxyUrl ?? '' } });
    }
    setSettings(getSettings());
  }, [user?.proxyUrl]);

  const update = (partial: Partial<Settings>) => {
    updateSettings(partial);
    setSettings(getSettings());
  };

  const save = () => {
    updateSettings(settings);
  };

  const reset = () => {
    setSettings(getSettings());
  };

  const checkConnection = async () => {
    setConnStatus((s) => ({ ...s, okx: { checking: true } }));
    try {
      const conn = settings.connections.okx;
      const proxy = (settings.connections.proxy ?? user?.proxyUrl ?? '').trim() || undefined;
      const res = await fetch(`${API}/connections/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exchange: 'OKX',
          apiKey: conn.apiKey,
          apiSecret: conn.apiSecret,
          passphrase: conn.passphrase,
          proxy
        })
      });
      const data = await res.json();
      setConnStatus((s) => ({ ...s, okx: { ok: data.ok, msg: data.message } }));
      if (data.ok && token && conn.apiKey?.trim() && conn.apiSecret?.trim()) {
        fetch(`${API}/auth/me/okx-connection`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            apiKey: conn.apiKey.trim(),
            secret: conn.apiSecret.trim(),
            passphrase: (conn.passphrase ?? '').trim()
          })
        }).catch(() => {});
      }
    } catch (e: any) {
      setConnStatus((s) => ({ ...s, okx: { ok: false, msg: e?.message || 'Ошибка сети' } }));
    }
  };

  const testTelegram = async () => {
    const tg = settings.notifications.telegram;
    if (!tg?.botToken?.trim() || !tg?.chatId?.trim()) {
      setTgTestStatus({ ok: false, msg: 'Введите токен и Chat ID' });
      return;
    }
    setTgTestStatus({ testing: true });
    try {
      const res = await fetch(`${API}/notify/telegram`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botToken: tg.botToken,
          chatId: tg.chatId,
          message: '✅ <b>CLABX 🚀 Crypto Trading Soft</b>\nТестовое уведомление — всё работает!'
        })
      });
      const data = await res.json().catch(() => ({}));
      setTgTestStatus({ ok: data?.ok, msg: data?.ok ? 'Отправлено!' : (data?.error || 'Ошибка') });
    } catch (e: any) {
      setTgTestStatus({ ok: false, msg: e?.message || 'Ошибка сети' });
    }
  };

  const testPublicApi = async () => {
    setConnStatus((s) => ({ ...s, public_okx: { checking: true } }));
    try {
      const res = await fetch(`${API}/connections/test-public`);
      const data = await res.json();
      setConnStatus((s) => ({ ...s, public_okx: { ok: data.ok, msg: data.message } }));
    } catch (e: any) {
      setConnStatus((s) => ({ ...s, public_okx: { ok: false, msg: e?.message || 'Ошибка' } }));
    }
  };

  const cardStyle = {
    background: 'linear-gradient(145deg, var(--bg-card-solid) 0%, var(--bg-hover) 100%)',
    border: '1px solid var(--border)',
    boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
  };
  const miniCardStyle = { background: 'var(--bg-hover)' };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <span className="text-2xl">⚙️</span>
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>Настройки</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Подключения, анализ, уведомления и риски</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
              activeTab === t.id ? 'text-white' : 'hover:opacity-90'
            }`}
            style={{
              background: activeTab === t.id ? 'var(--accent)' : 'var(--bg-hover)',
              color: activeTab === t.id ? 'white' : 'var(--text-secondary)'
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div className="flex gap-4 flex-wrap">
        <button
          type="button"
          onClick={save}
          className="px-4 py-2 rounded-xl text-sm font-medium"
          style={{ background: 'var(--success)', color: 'white' }}
        >
          Сохранить
        </button>
        <button
          type="button"
          onClick={reset}
          className="px-4 py-2 rounded-xl text-sm font-medium"
          style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
        >
          Отмена
        </button>
      </div>

      <div className="space-y-6">
        {activeTab === 'connections' && (
          <>
            <div className="rounded-2xl p-4 shadow-sm" style={{ ...miniCardStyle, borderLeft: '4px solid var(--warning)' }}>
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>🔐 Безопасность</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                Используйте только права «Trading». Отключите «Withdraw» на бирже.
              </p>
            </div>
            <section className="rounded-2xl p-6 shadow-lg" style={{ ...cardStyle, borderLeft: '4px solid var(--accent)' }}>
              <div className="flex items-center gap-3 mb-5">
                <span className="text-2xl">📈</span>
                <div>
                  <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>OKX</h2>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Ключи из .env или переопределите здесь</p>
                </div>
                <label className="flex items-center gap-2 ml-auto">
                  <input
                    type="checkbox"
                    checked={settings.connections.okx.enabled}
                    onChange={(e) => update({ connections: { ...settings.connections, okx: { ...settings.connections.okx, enabled: e.target.checked } } })}
                    className="rounded"
                  />
                  <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Включено</span>
                </label>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-xl p-3" style={miniCardStyle}>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>API Key</label>
                  <input
                    type="password"
                    value={settings.connections.okx.apiKey}
                    onChange={(e) => update({ connections: { ...settings.connections, okx: { ...settings.connections.okx, apiKey: e.target.value } } })}
                    placeholder="Или из .env"
                    className="input-field w-full rounded-lg"
                  />
                </div>
                <div className="rounded-xl p-3" style={miniCardStyle}>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Secret</label>
                  <input
                    type="password"
                    value={settings.connections.okx.apiSecret}
                    onChange={(e) => update({ connections: { ...settings.connections, okx: { ...settings.connections.okx, apiSecret: e.target.value } } })}
                    placeholder="Или из .env"
                    className="input-field w-full rounded-lg"
                  />
                </div>
                <div className="rounded-xl p-3 sm:col-span-2" style={miniCardStyle}>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Passphrase</label>
                  <input
                    type="password"
                    value={settings.connections.okx.passphrase}
                    onChange={(e) => update({ connections: { ...settings.connections, okx: { ...settings.connections.okx, passphrase: e.target.value } } })}
                    placeholder="Задаётся при создании ключа"
                    className="input-field w-full rounded-lg"
                  />
                </div>
                <div className="rounded-xl p-3 sm:col-span-2" style={miniCardStyle}>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Прокси</label>
                  <input
                    type="text"
                    value={settings.connections.proxy ?? ''}
                    onChange={(e) => update({ connections: { ...settings.connections, proxy: e.target.value } })}
                    onBlur={() => { const v = (settings.connections.proxy ?? '').trim(); updateProxy(v || null); }}
                    placeholder="http://user:pass@ip:port"
                    className="input-field w-full rounded-lg"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 mt-4">
                <button
                  onClick={checkConnection}
                  disabled={connStatus.okx?.checking}
                  className="px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50"
                  style={{ background: 'var(--accent)', color: 'white' }}
                >
                  {connStatus.okx?.checking ? 'Проверка…' : 'Проверить подключение'}
                </button>
                <button
                  onClick={testPublicApi}
                  disabled={connStatus.public_okx?.checking}
                  className="px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50"
                  style={{ background: 'var(--bg-card-solid)', color: 'var(--text-secondary)' }}
                >
                  {connStatus.public_okx?.checking ? '…' : 'Тест публичного API'}
                </button>
              </div>
              {connStatus.okx?.msg && (
                <p className={`mt-2 text-sm ${connStatus.okx.ok ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>{connStatus.okx.msg}</p>
              )}
              {connStatus.public_okx?.msg && (
                <p className={`mt-1 text-sm ${connStatus.public_okx.ok ? 'text-[var(--success)]' : 'text-[var(--warning)]'}`}>Публичный API: {connStatus.public_okx.msg}</p>
              )}
            </section>
            <section className="rounded-2xl p-6 shadow-lg" style={{ ...cardStyle, borderLeft: '4px solid var(--success)' }}>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">📊</span>
                <div className="flex-1">
                  <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>TradingView</h2>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Виджеты используют данные OKX</p>
                </div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.connections.tradingview.enabled}
                    onChange={(e) => update({ connections: { ...settings.connections, tradingview: { ...settings.connections.tradingview, enabled: e.target.checked } } })}
                    className="rounded"
                  />
                  <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Включено</span>
                </label>
              </div>
            </section>
            <section className="rounded-2xl p-6 shadow-lg" style={{ ...cardStyle, borderLeft: '4px solid var(--accent)' }}>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-2xl">🔗</span>
                <div className="flex-1">
                  <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Scalpboard</h2>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Интеграция со scalpboard.io</p>
                </div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.connections.scalpboard.enabled}
                    onChange={(e) => update({ connections: { ...settings.connections, scalpboard: { ...settings.connections.scalpboard, enabled: e.target.checked } } })}
                    className="rounded"
                  />
                  <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Включено</span>
                </label>
              </div>
              <div className="rounded-xl p-3" style={miniCardStyle}>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>API Key</label>
                <input
                  type="text"
                  value={settings.connections.scalpboard.apiKey}
                  onChange={(e) => update({ connections: { ...settings.connections, scalpboard: { ...settings.connections.scalpboard, apiKey: e.target.value } } })}
                  placeholder="Вставьте ключ с scalpboard.io"
                  className="input-field w-full rounded-lg"
                />
                <a href="https://scalpboard.io" target="_blank" rel="noopener noreferrer" className="text-xs mt-2 inline-block" style={{ color: 'var(--accent)' }}>Получить API ключ</a>
              </div>
            </section>
          </>
        )}

        {activeTab === 'analysis' && (
          <section className="rounded-2xl p-6 shadow-lg" style={{ ...cardStyle, borderLeft: '4px solid var(--accent)' }}>
            <div className="flex items-center gap-3 mb-5">
              <span className="text-2xl">📊</span>
              <div>
                <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Настройки анализа</h2>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Таймфрейм, паттерны и пороги</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-xl p-3" style={miniCardStyle}>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Таймфрейм</label>
                <select
                  value={settings.analysis.timeframe}
                  onChange={(e) => update({ analysis: { ...settings.analysis, timeframe: e.target.value } })}
                  className="input-field w-full rounded-lg"
                >
                  <option value="1m">1m</option>
                  <option value="5m">5m</option>
                  <option value="15m">15m</option>
                  <option value="1h">1h</option>
                  <option value="4h">4h</option>
                  <option value="1d">1d</option>
                </select>
              </div>
              <div className="rounded-xl p-3" style={miniCardStyle}>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Мин. уверенность (%)</label>
                <input
                  type="number"
                  value={settings.analysis.minConfidence}
                  onChange={(e) => update({ analysis: { ...settings.analysis, minConfidence: Number(e.target.value) } })}
                  min={50}
                  max={95}
                  className="input-field w-full rounded-lg"
                />
              </div>
              <div className="rounded-xl p-3" style={miniCardStyle}>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Минимальный R:R</label>
                <input
                  type="number"
                  value={settings.analysis.minRR}
                  onChange={(e) => update({ analysis: { ...settings.analysis, minRR: Number(e.target.value) } })}
                  step={0.5}
                  min={1}
                  className="input-field w-full rounded-lg"
                />
              </div>
            </div>
            <div className="mt-4 space-y-2">
              {[
                { key: 'candlePatterns' as const, label: 'Паттерны свечей' },
                { key: 'orderbookAnalysis' as const, label: 'Анализ стакана ордеров' },
                { key: 'volumeAnalysis' as const, label: 'Анализ объёма' }
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center gap-3 py-2 px-3 rounded-xl cursor-pointer" style={miniCardStyle}>
                  <input
                    type="checkbox"
                    checked={settings.analysis[key]}
                    onChange={(e) => update({ analysis: { ...settings.analysis, [key]: e.target.checked } })}
                    className="rounded"
                  />
                  <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{label}</span>
                </label>
              ))}
            </div>
          </section>
        )}

        {activeTab === 'notifications' && (
          <>
            <section className="rounded-2xl p-6 shadow-lg" style={{ ...cardStyle, borderLeft: '4px solid var(--accent)' }}>
              <div className="flex items-center gap-3 mb-5">
                <span className="text-2xl">🔔</span>
                <div>
                  <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Уведомления</h2>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Рабочий стол, звук и типы сигналов</p>
                </div>
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-3 py-2 px-3 rounded-xl cursor-pointer" style={miniCardStyle}>
                  <input
                    type="checkbox"
                    checked={settings.notifications.desktop}
                    onChange={(e) => {
                      const enabled = e.target.checked;
                      update({ notifications: { ...settings.notifications, desktop: enabled } });
                      if (enabled && typeof Notification !== 'undefined' && Notification.permission === 'default') {
                        Notification.requestPermission().catch(() => {});
                      }
                    }}
                    className="rounded"
                  />
                  <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Уведомления на рабочем столе</span>
                  {settings.notifications.desktop && typeof Notification !== 'undefined' && Notification.permission !== 'granted' && (
                    <button type="button" onClick={() => Notification.requestPermission().catch(() => {})} className="text-xs ml-auto" style={{ color: 'var(--accent)' }}>Разрешить</button>
                  )}
                </label>
                <label className="flex items-center gap-3 py-2 px-3 rounded-xl cursor-pointer" style={miniCardStyle}>
                  <input
                    type="checkbox"
                    checked={settings.notifications.sound}
                    onChange={(e) => update({ notifications: { ...settings.notifications, sound: e.target.checked } })}
                    className="rounded"
                  />
                  <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Звук</span>
                </label>
              </div>
              <div className="mt-4 rounded-xl p-3" style={miniCardStyle}>
                <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>Типы сигналов</p>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={settings.notifications.long} onChange={(e) => update({ notifications: { ...settings.notifications, long: e.target.checked } })} className="rounded" />
                    <span className="text-sm" style={{ color: 'var(--text-primary)' }}>LONG</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={settings.notifications.short} onChange={(e) => update({ notifications: { ...settings.notifications, short: e.target.checked } })} className="rounded" />
                    <span className="text-sm" style={{ color: 'var(--text-primary)' }}>SHORT</span>
                  </label>
                </div>
              </div>
              <div className="mt-4 rounded-xl p-3" style={miniCardStyle}>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Мин. уверенность (%)</label>
                <input
                  type="number"
                  value={settings.notifications.minConfidence}
                  onChange={(e) => update({ notifications: { ...settings.notifications, minConfidence: Number(e.target.value) } })}
                  min={50}
                  max={95}
                  className="input-field w-full rounded-lg"
                />
              </div>
            </section>
            <section className="rounded-2xl p-6 shadow-lg" style={{ ...cardStyle, borderLeft: '4px solid var(--success)' }}>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-2xl">📱</span>
                <div>
                  <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Telegram</h2>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Бот для уведомлений — @BotFather, Chat ID: @userinfobot</p>
                </div>
                <label className="flex items-center gap-2 ml-auto">
                  <input
                    type="checkbox"
                    checked={settings.notifications.telegram?.enabled ?? false}
                    onChange={(e) => update({
                      notifications: {
                        ...settings.notifications,
                        telegram: { ...(settings.notifications.telegram || { enabled: false, botToken: '', chatId: '' }), enabled: e.target.checked }
                      }
                    })}
                    className="rounded"
                  />
                  <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Включить</span>
                </label>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-xl p-3" style={miniCardStyle}>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Токен бота</label>
                  <input
                    type="password"
                    value={settings.notifications.telegram?.botToken ?? ''}
                    onChange={(e) => update({
                      notifications: {
                        ...settings.notifications,
                        telegram: { ...(settings.notifications.telegram || { enabled: false, botToken: '', chatId: '' }), botToken: e.target.value }
                      }
                    })}
                    placeholder="1234567890:ABCdef..."
                    className="input-field w-full rounded-lg"
                  />
                </div>
                <div className="rounded-xl p-3" style={miniCardStyle}>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Chat ID</label>
                  <input
                    type="text"
                    value={settings.notifications.telegram?.chatId ?? ''}
                    onChange={(e) => update({
                      notifications: {
                        ...settings.notifications,
                        telegram: { ...(settings.notifications.telegram || { enabled: false, botToken: '', chatId: '' }), chatId: e.target.value }
                      }
                    })}
                    placeholder="123456789 или -100..."
                    className="input-field w-full rounded-lg"
                  />
                </div>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={testTelegram}
                  disabled={tgTestStatus.testing || !settings.notifications.telegram?.botToken?.trim() || !settings.notifications.telegram?.chatId?.trim()}
                  className="px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50"
                  style={{ background: 'var(--accent)', color: 'white' }}
                >
                  {tgTestStatus.testing ? 'Отправка…' : 'Отправить тест'}
                </button>
                {tgTestStatus.msg && (
                  <span className={`text-sm ${tgTestStatus.ok ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>{tgTestStatus.msg}</span>
                )}
              </div>
            </section>
          </>
        )}

        {activeTab === 'display' && (
          <section className="rounded-2xl p-6 shadow-lg" style={{ ...cardStyle, borderLeft: '4px solid var(--accent)' }}>
            <div className="flex items-center gap-3 mb-5">
              <span className="text-2xl">🎨</span>
              <div>
                <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Отображение</h2>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Тема, язык и стили графика</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-xl p-3" style={miniCardStyle}>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Тема</label>
                <select
                  value={settings.display.theme}
                  onChange={(e) => update({ display: { ...settings.display, theme: e.target.value as 'dark' | 'light' } })}
                  className="input-field w-full rounded-lg"
                >
                  <option value="dark">Тёмная</option>
                  <option value="light">Светлая</option>
                </select>
              </div>
              <div className="rounded-xl p-3" style={miniCardStyle}>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Язык</label>
                <select
                  value={settings.display.language}
                  onChange={(e) => update({ display: { ...settings.display, language: e.target.value as 'ru' | 'en' } })}
                  className="input-field w-full rounded-lg"
                >
                  <option value="ru">Русский</option>
                  <option value="en">English</option>
                </select>
              </div>
              <div className="rounded-xl p-3" style={miniCardStyle}>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Стиль графика</label>
                <select
                  value={settings.display.chartStyle}
                  onChange={(e) => update({ display: { ...settings.display, chartStyle: e.target.value as 'candles' | 'heikin-ashi' | 'line' } })}
                  className="input-field w-full rounded-lg"
                >
                  <option value="candles">Свечи</option>
                  <option value="heikin-ashi">Heikin-Ashi</option>
                  <option value="line">Линия</option>
                </select>
              </div>
              <div className="rounded-xl p-3" style={miniCardStyle}>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Стиль стакана</label>
                <select
                  value={settings.display.orderbookStyle}
                  onChange={(e) => update({ display: { ...settings.display, orderbookStyle: e.target.value as 'default' | 'grouped' | 'heatmap' } })}
                  className="input-field w-full rounded-lg"
                >
                  <option value="default">По умолчанию</option>
                  <option value="grouped">Группированный</option>
                  <option value="heatmap">Тепловая карта</option>
                </select>
              </div>
            </div>
          </section>
        )}

        {activeTab === 'risk' && (
          <section className="rounded-2xl p-6 shadow-lg" style={{ ...cardStyle, borderLeft: '4px solid var(--warning)' }}>
            <div className="flex items-center gap-3 mb-5">
              <span className="text-2xl">🛡️</span>
              <div>
                <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Риск-менеджмент</h2>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Размер позиций, стоп-лосс и тейк-профит</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-xl p-3" style={miniCardStyle}>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Макс. размер позиции (%)</label>
                <input
                  type="number"
                  value={settings.risk.maxPositionPercent}
                  onChange={(e) => update({ risk: { ...settings.risk, maxPositionPercent: Number(e.target.value) } })}
                  min={1}
                  max={100}
                  className="input-field w-full rounded-lg"
                />
              </div>
              <div className="rounded-xl p-3" style={miniCardStyle}>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Стоп-лосс по умолчанию (%)</label>
                <input
                  type="number"
                  value={settings.risk.defaultStopLoss}
                  onChange={(e) => update({ risk: { ...settings.risk, defaultStopLoss: Number(e.target.value) } })}
                  step={0.1}
                  min={0.5}
                  className="input-field w-full rounded-lg"
                />
              </div>
              <div className="rounded-xl p-3" style={miniCardStyle}>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Уровни тейк-профита (%)</label>
                <input
                  type="text"
                  value={settings.risk.takeProfitLevels}
                  onChange={(e) => update({ risk: { ...settings.risk, takeProfitLevels: e.target.value } })}
                  placeholder="1, 2, 3"
                  className="input-field w-full rounded-lg"
                />
              </div>
              <div className="rounded-xl p-3 sm:col-span-2 flex items-center gap-4 flex-wrap" style={miniCardStyle}>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.risk.trailingStop}
                    onChange={(e) => update({ risk: { ...settings.risk, trailingStop: e.target.checked } })}
                    className="rounded"
                  />
                  <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Трейлинг-стоп</span>
                </label>
                <div className="flex items-center gap-2">
                  <label className="text-xs" style={{ color: 'var(--text-muted)' }}>Трейлинг (%)</label>
                  <input
                    type="number"
                    value={settings.risk.trailingStopPercent}
                    onChange={(e) => update({ risk: { ...settings.risk, trailingStopPercent: Number(e.target.value) } })}
                    disabled={!settings.risk.trailingStop}
                    className="input-field w-24 rounded-lg"
                  />
                </div>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
