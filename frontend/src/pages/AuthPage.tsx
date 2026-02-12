import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

const USERNAME_KEY = 'clabx-username';

type Tab = 'login' | 'register';
type AuthMode = 'default' | 'register-telegram' | 'reset-password';

function getAuthModeFromUrl(): { mode: AuthMode; registerToken?: string; resetToken?: string; usernamePrefill?: string } {
  if (typeof window === 'undefined') return { mode: 'default' };
  const path = (window.location.pathname || '').trim();
  const params = new URLSearchParams(window.location.search);
  const registerToken = params.get('token') || undefined;
  const usernamePrefill = params.get('username') || undefined;
  if (path === '/reset-password' && registerToken) return { mode: 'reset-password', resetToken: registerToken };
  if ((path === '/register' || path === '/') && registerToken) return { mode: 'register-telegram', registerToken, usernamePrefill: usernamePrefill || undefined };
  return { mode: 'default' };
}

const TERMS_TEXT = `
ПРАВИЛА ИСПОЛЬЗОВАНИЯ И ПОЛИТИКА КОНФИДЕНЦИАЛЬНОСТИ

1. ОБЩИЕ ПОЛОЖЕНИЯ
CLABX 🚀 Crypto Trading Soft — программный продукт для анализа рынков и информационной поддержки решений. Использование приложения означает принятие настоящих правил.

2. ОТСУТСТВИЕ ОТВЕТСТВЕННОСТИ
• Администрация и разработчики НЕ НЕСУТ ОТВЕТСТВЕННОСТИ за любые финансовые потери, убытки или упущенную выгоду пользователей.
• Все торговые и инвестиционные решения пользователь принимает самостоятельно и на свой риск.
• Результаты анализа, сигналы и рекомендации носят исключительно информационный характер и не являются финансовой консультацией или призывом к действию.
• Пользователь самостоятельно отвечает за сохранность своих учётных данных, API-ключей и средств на биржевых счётах.

3. РИСКИ
• Торговля криптовалютами и использование автоматизированных решений сопряжены с высокими рисками. Возможна полная потеря вложенных средств.
• Пользователь подтверждает, что осознаёт риски и использует приложение по собственной воле.

4. КОНФИДЕНЦИАЛЬНОСТЬ
• Мы храним только необходимые данные для работы сервиса (логин, хэш пароля, настройки доступа).
• API-ключи и персональные данные бирж пользователь вводит на свой риск; рекомендуем не передавать ключи с правами вывода средств.

5. ИЗМЕНЕНИЕ ПРАВИЛ
Администрация вправе изменять правила. Продолжение использования приложения после изменений означает согласие с новой редакцией.
`;

export default function AuthPage() {
  const { login, register, registerByTelegram, resetPassword } = useAuth();
  const [urlMode] = useState(() => getAuthModeFromUrl());
  const [tab, setTab] = useState<Tab>('login');
  const [username, setUsername] = useState(() => urlMode.usernamePrefill || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  useEffect(() => {
    if (urlMode.mode === 'default') {
      try {
        const saved = localStorage.getItem(USERNAME_KEY);
        if (saved) setUsername((prev) => prev || saved);
      } catch {}
    } else if (urlMode.usernamePrefill) {
      setUsername(urlMode.usernamePrefill);
    }
  }, [urlMode.mode, urlMode.usernamePrefill]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (urlMode.mode === 'register-telegram') {
      if (!agreedToTerms) {
        setError('Необходимо ознакомиться с правилами и поставить галочку согласия');
        return;
      }
      if (password !== confirmPassword) {
        setError('Пароли не совпадают');
        return;
      }
      if (password.length < 4) {
        setError('Пароль от 4 символов');
        return;
      }
      if (username.trim().length < 2) {
        setError('Логин от 2 символов');
        return;
      }
      if (!urlMode.registerToken) {
        setError('Ссылка недействительна. Получите новую в боте @clabx_bot.');
        return;
      }
      setLoading(true);
      try {
        const result = await registerByTelegram(urlMode.registerToken, username.trim(), password);
        if (result.ok) {
          try {
            localStorage.setItem(USERNAME_KEY, username.trim());
            window.history.replaceState({}, '', '/');
          } catch {}
        } else {
          setError(result.error || 'Ошибка');
        }
      } finally {
        setLoading(false);
      }
      return;
    }
    if (urlMode.mode === 'reset-password') {
      if (password.length < 4) {
        setError('Пароль от 4 символов');
        return;
      }
      if (password !== confirmPassword) {
        setError('Пароли не совпадают');
        return;
      }
      if (!urlMode.resetToken) {
        setError('Ссылка недействительна. Получите новую в боте @clabx_bot.');
        return;
      }
      setLoading(true);
      try {
        const result = await resetPassword(urlMode.resetToken, password);
        if (result.ok) {
          setResetSuccess(true);
          setPassword('');
          setConfirmPassword('');
          window.history.replaceState({}, '', '/');
        } else {
          setError(result.error || 'Ошибка');
        }
      } finally {
        setLoading(false);
      }
      return;
    }
    if (tab === 'register') {
      if (!agreedToTerms) {
        setError('Необходимо ознакомиться с правилами и поставить галочку согласия');
        return;
      }
      if (password !== confirmPassword) {
        setError('Пароли не совпадают');
        return;
      }
      if (password.length < 4) {
        setError('Пароль от 4 символов');
        return;
      }
      if (username.trim().length < 2) {
        setError('Логин от 2 символов');
        return;
      }
    }
    setLoading(true);
    try {
      const result = tab === 'login'
        ? await login(username, password)
        : await register(username, password);
      if (result.ok) {
        try {
          localStorage.setItem(USERNAME_KEY, username.trim());
        } catch {}
      } else {
        setError(result.error || 'Ошибка');
      }
    } finally {
      setLoading(false);
    }
  };

  // Регистрация по ссылке из Telegram-бота
  if (urlMode.mode === 'register-telegram') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--bg-base)' }}>
        <div className="w-full max-w-sm rounded-2xl border p-8" style={{ background: 'var(--bg-card-solid)', borderColor: 'var(--border)' }}>
          <h2 className="text-lg font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Регистрация через Telegram</h2>
          <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>Аккаунт будет привязан к вашему Telegram. Синхронизация с покупкой ключей.</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Логин</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Логин (от 2 символов)"
                className="input-field w-full"
                autoComplete="username"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Пароль</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Пароль (от 4 символов)"
                className="input-field w-full"
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Повторите пароль</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Повторите пароль"
                className="input-field w-full"
                autoComplete="new-password"
              />
            </div>
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                id="terms-tg"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="rounded mt-1 accent-[var(--accent)]"
              />
              <label htmlFor="terms-tg" className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Я ознакомлен(а) с{' '}
                <button type="button" onClick={() => setShowTerms(true)} className="underline hover:no-underline" style={{ color: 'var(--accent)' }}>
                  правилами и политикой конфиденциальности
                </button>
                , соглашаюсь с условиями.
              </label>
            </div>
            {error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
            <button
              type="submit"
              disabled={loading || !agreedToTerms}
              className="w-full py-2.5 rounded-lg font-medium text-white disabled:opacity-50"
              style={{ background: 'var(--accent)' }}
            >
              {loading ? '…' : 'Зарегистрироваться'}
            </button>
          </form>
          <p className="text-xs mt-4 text-center" style={{ color: 'var(--text-muted)' }}>
            Ссылку выдал бот <a href="https://t.me/clabx_bot" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>@clabx_bot</a>
          </p>
        </div>
        {showTerms && (
          <>
            <div className="fixed inset-0 z-40 bg-black/60" onClick={() => setShowTerms(false)} />
            <div className="fixed inset-4 md:inset-10 z-50 rounded-2xl border overflow-hidden flex flex-col" style={{ background: 'var(--bg-card-solid)', borderColor: 'var(--border)' }}>
              <div className="p-4 border-b flex justify-between items-center shrink-0" style={{ borderColor: 'var(--border)' }}>
                <h3 className="text-lg font-semibold">Правила и конфиденциальность</h3>
                <button type="button" onClick={() => setShowTerms(false)} className="px-3 py-1.5 rounded-lg text-sm" style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>Закрыть</button>
              </div>
              <div className="flex-1 overflow-auto p-6 text-sm whitespace-pre-wrap" style={{ color: 'var(--text-secondary)' }}>{TERMS_TEXT}</div>
            </div>
          </>
        )}
      </div>
    );
  }

  // Сброс пароля по ссылке из бота
  if (urlMode.mode === 'reset-password') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--bg-base)' }}>
        <div className="w-full max-w-sm rounded-2xl border p-8" style={{ background: 'var(--bg-card-solid)', borderColor: 'var(--border)' }}>
          <h2 className="text-lg font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Новый пароль</h2>
          <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>Задайте новый пароль для входа на clabx.ru</p>
          {resetSuccess ? (
            <p className="text-sm mb-4" style={{ color: 'var(--success)' }}>Пароль изменён. Войдите с новым паролем.</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Новый пароль</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Пароль (от 4 символов)"
                  className="input-field w-full"
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Повторите пароль</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Повторите пароль"
                  className="input-field w-full"
                  autoComplete="new-password"
                />
              </div>
              {error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-lg font-medium text-white disabled:opacity-50"
                style={{ background: 'var(--accent)' }}
              >
                {loading ? '…' : 'Сохранить пароль'}
              </button>
            </form>
          )}
          <p className="text-xs mt-4 text-center" style={{ color: 'var(--text-muted)' }}>
            <a href="/" style={{ color: 'var(--accent)' }}>Войти</a> · Ссылку выдал <a href="https://t.me/clabx_bot" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>@clabx_bot</a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--bg-base)' }}>
      <div className="w-full max-w-sm rounded-2xl border p-8" style={{ background: 'var(--bg-card-solid)', borderColor: 'var(--border)' }}>
        <div className="flex justify-center gap-2 mb-6">
          <button
            type="button"
            onClick={() => { setTab('login'); setError(''); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === 'login' ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-hover)] text-[var(--text-muted)]'}`}
          >
            Вход
          </button>
          <button
            type="button"
            onClick={() => { setTab('register'); setError(''); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === 'register' ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-hover)] text-[var(--text-muted)]'}`}
          >
            Регистрация
          </button>
        </div>
        {tab === 'login' ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Логин</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Логин"
                className="input-field w-full"
                autoComplete="username"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Пароль</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Пароль"
                className="input-field w-full"
                autoComplete="current-password"
              />
              <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
                <a href="https://t.me/clabx_bot" target="_blank" rel="noreferrer" className="underline hover:no-underline" style={{ color: 'var(--accent)' }}>
                  Забыли пароль?
                </a>{' '}
                Восстановление через Telegram-бот @clabx_bot.
              </p>
            </div>
            {error && (
              <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg font-medium text-white disabled:opacity-50"
              style={{ background: 'var(--accent)' }}
            >
              {loading ? '…' : 'Войти'}
            </button>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl p-5 border" style={{ background: 'var(--bg-hover)', borderColor: 'var(--border)' }}>
              <p className="text-base font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                Регистрация только через Telegram-бота
              </p>
              <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                Чтобы создать аккаунт на clabx.ru, откройте бота @clabx_bot в Telegram. В боте нажмите «Зарегистрироваться на сайте», введите желаемый логин — бот пришлёт ссылку. По ссылке задайте пароль и примите правила. Аккаунт будет привязан к вашему Telegram (синхронизация с покупкой ключей).
              </p>
              <a
                href="https://t.me/clabx_bot"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 w-full py-3 rounded-lg font-medium text-white"
                style={{ background: 'var(--accent)' }}
              >
                Перейти в бот @clabx_bot
              </a>
            </div>
            <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
              Восстановление пароля — тоже через бота @clabx_bot.
            </p>
          </div>
        )}
        {tab === 'login' && (
          <p className="text-xs mt-4 text-center" style={{ color: 'var(--text-muted)' }}>
            Данные для входа сохраняются (логин).
          </p>
        )}
      </div>

      {showTerms && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60"
            onClick={() => setShowTerms(false)}
          />
          <div
            className="fixed inset-4 md:inset-10 z-50 rounded-2xl border overflow-hidden flex flex-col"
            style={{ background: 'var(--bg-card-solid)', borderColor: 'var(--border)' }}
          >
            <div className="p-4 border-b flex justify-between items-center shrink-0" style={{ borderColor: 'var(--border)' }}>
              <h3 className="text-lg font-semibold">Правила и конфиденциальность</h3>
              <button
                type="button"
                onClick={() => setShowTerms(false)}
                className="px-3 py-1.5 rounded-lg text-sm"
                style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
              >
                Закрыть
              </button>
            </div>
            <div className="flex-1 overflow-auto p-6 text-sm whitespace-pre-wrap" style={{ color: 'var(--text-secondary)' }}>
              {TERMS_TEXT}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
