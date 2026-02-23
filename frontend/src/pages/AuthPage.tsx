import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../utils/api';
import { formatNum4, formatNum4Signed } from '../utils/formatNum';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card } from '../components/ui/Card';
import { Tabs } from '../components/ui/Tabs';

const USERNAME_KEY = 'clabx-username';

interface DisplayStats {
  volumeEarned: number;
  ordersTotal: number;
  ordersWins: number;
  ordersLosses: number;
  ordersWinRate: number;
  usersCount: number;
  onlineUsersCount: number;
  signalsCount: number;
}

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
CLABX — программный продукт для анализа рынков и информационной поддержки решений. Использование приложения означает принятие настоящих правил.

2. ОТСУТСТВИЕ ОТВЕТСТВЕННОСТИ
• Администрация НЕ НЕСУТ ОТВЕТСТВЕННОСТИ за любые финансовые потери.
• Все торговые решения пользователь принимает самостоятельно.

3. РИСКИ
• Торговля криптовалютами сопряжена с высокими рисками.
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
  const [displayStats, setDisplayStats] = useState<DisplayStats | null>(null);

  useEffect(() => {
    api.get<{ displayEnabled?: boolean; display?: DisplayStats }>('/stats')
      .then((data) => {
        if (data.displayEnabled && data.display) setDisplayStats(data.display);
      })
      .catch(() => {});
  }, []);

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
      if (!agreedToTerms) { setError('Необходимо согласиться с правилами'); return; }
      if (password !== confirmPassword) { setError('Пароли не совпадают'); return; }
      if (password.length < 4) { setError('Пароль от 4 символов'); return; }
      if (username.trim().length < 2) { setError('Логин от 2 символов'); return; }
      if (!urlMode.registerToken) { setError('Ссылка недействительна'); return; }
      setLoading(true);
      try {
        const result = await registerByTelegram(urlMode.registerToken, username.trim(), password);
        if (result.ok) {
          try { localStorage.setItem(USERNAME_KEY, username.trim()); window.history.replaceState({}, '', '/'); } catch {}
        } else { setError(result.error || 'Ошибка'); }
      } finally { setLoading(false); }
      return;
    }
    if (urlMode.mode === 'reset-password') {
      if (password.length < 4) { setError('Пароль от 4 символов'); return; }
      if (password !== confirmPassword) { setError('Пароли не совпадают'); return; }
      if (!urlMode.resetToken) { setError('Ссылка недействительна'); return; }
      setLoading(true);
      try {
        const result = await resetPassword(urlMode.resetToken, password);
        if (result.ok) { setResetSuccess(true); setPassword(''); setConfirmPassword(''); window.history.replaceState({}, '', '/'); }
        else { setError(result.error || 'Ошибка'); }
      } finally { setLoading(false); }
      return;
    }
    if (tab === 'register') {
      if (!agreedToTerms) { setError('Необходимо согласиться с правилами'); return; }
      if (password !== confirmPassword) { setError('Пароли не совпадают'); return; }
      if (password.length < 4) { setError('Пароль от 4 символов'); return; }
      if (username.trim().length < 2) { setError('Логин от 2 символов'); return; }
    }
    setLoading(true);
    try {
      const result = tab === 'login' ? await login(username, password) : await register(username, password);
      if (result.ok) { try { localStorage.setItem(USERNAME_KEY, username.trim()); } catch {} }
      else { setError(result.error || 'Ошибка'); }
    } finally { setLoading(false); }
  };

  const containerStyle: React.CSSProperties = {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    background: 'var(--bg-base)',
    position: 'relative',
    overflow: 'hidden',
  };

  const gradientOrbStyle = (delay: number): React.CSSProperties => ({
    position: 'absolute',
    width: '500px',
    height: '500px',
    borderRadius: '50%',
    filter: 'blur(100px)',
    opacity: 0.3,
    animation: `float ${6 + delay}s ease-in-out infinite`,
    animationDelay: `${delay}s`,
  });

  const glassCardStyle: React.CSSProperties = {
    background: 'rgba(18, 18, 28, 0.7)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-2xl)',
    boxShadow: 'var(--shadow-xl)',
  };

  const authCard = (title: string, subtitle: string, children: React.ReactNode) => (
    <div style={containerStyle}>
      <div style={{ ...gradientOrbStyle(0), background: 'var(--accent)', top: '-200px', left: '-200px' }} />
      <div style={{ ...gradientOrbStyle(2), background: 'var(--success)', bottom: '-200px', right: '-200px' }} />
      <div style={{ ...gradientOrbStyle(4), background: 'var(--info)', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '300px', height: '300px' }} />
      
      <div className="animate-fade-in-up" style={{ ...glassCardStyle, padding: '32px', width: '100%', maxWidth: '400px', position: 'relative', zIndex: 1 }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '8px' }}>
            <img src="/logo.svg" alt="CLABX" style={{ width: '40px', height: '40px' }} />
            <span className="text-gradient" style={{ fontSize: '24px', fontWeight: 700 }}>CLABX</span>
          </div>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>{title}</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{subtitle}</p>
        </div>
        {children}
      </div>
    </div>
  );

  if (urlMode.mode === 'register-telegram') {
    return authCard('Регистрация', 'Аккаунт будет привязан к Telegram',
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Логин" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="От 2 символов" autoComplete="username" />
        <Input label="Пароль" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="От 4 символов" autoComplete="new-password" />
        <Input label="Повторите пароль" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Повторите пароль" autoComplete="new-password" />
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '13px', color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={agreedToTerms} onChange={(e) => setAgreedToTerms(e.target.checked)} style={{ marginTop: '3px', accentColor: 'var(--accent)' }} />
          <span>Я согласен с <button type="button" onClick={() => setShowTerms(true)} style={{ color: 'var(--accent)' }}>правилами</button></span>
        </label>
        {error && <p style={{ color: 'var(--danger)', fontSize: '13px' }}>{error}</p>}
        <Button type="submit" variant="primary" fullWidth loading={loading}>Зарегистрироваться</Button>
      </form>
    );
  }

  if (urlMode.mode === 'reset-password') {
    return authCard('Новый пароль', resetSuccess ? 'Пароль изменён' : 'Задайте новый пароль',
      resetSuccess ? (
        <Button variant="primary" fullWidth onClick={() => window.location.reload()}>Войти</Button>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="Новый пароль" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="От 4 символов" autoComplete="new-password" />
          <Input label="Повторите пароль" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Повторите пароль" autoComplete="new-password" />
          {error && <p style={{ color: 'var(--danger)', fontSize: '13px' }}>{error}</p>}
          <Button type="submit" variant="primary" fullWidth loading={loading}>Сохранить</Button>
        </form>
      )
    );
  }

  return (
    <div style={containerStyle}>
      <div style={{ ...gradientOrbStyle(0), background: 'var(--accent)', top: '-200px', left: '-200px' }} />
      <div style={{ ...gradientOrbStyle(2), background: 'var(--success)', bottom: '-200px', right: '-200px' }} />
      
      <div className="animate-fade-in-up" style={{ width: '100%', maxWidth: '420px', position: 'relative', zIndex: 1 }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '8px' }}>
            <img src="/logo.svg" alt="CLABX" style={{ width: '48px', height: '48px' }} />
            <span className="text-gradient" style={{ fontSize: '28px', fontWeight: 700 }}>CLABX</span>
          </div>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Crypto Trading Platform</p>
        </div>

        {displayStats && (
          <div style={{ ...glassCardStyle, padding: '16px', marginBottom: '20px' }}>
            <div className="grid grid-cols-4 gap-3 text-center">
              <div>
                <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '2px' }}>PnL</p>
                <p className="text-gradient-success" style={{ fontSize: '14px', fontWeight: 700 }}>{formatNum4Signed(displayStats.volumeEarned)}$</p>
              </div>
              <div>
                <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '2px' }}>Win</p>
                <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--accent)' }}>{formatNum4(displayStats.ordersWinRate)}%</p>
              </div>
              <div>
                <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '2px' }}>Ордера</p>
                <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{displayStats.ordersTotal}</p>
              </div>
              <div>
                <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '2px' }}>Юзеров</p>
                <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{displayStats.usersCount}</p>
              </div>
            </div>
          </div>
        )}

        <div style={{ ...glassCardStyle, padding: '24px' }}>
          <div style={{ marginBottom: '24px' }}>
            <Tabs tabs={[{ id: 'login', label: 'Вход' }, { id: 'register', label: 'Регистрация' }]} active={tab} onChange={(id) => { setTab(id as Tab); setError(''); }} size="sm" />
          </div>

          {tab === 'login' ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input label="Логин" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Введите логин" autoComplete="username" />
              <Input label="Пароль" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Введите пароль" autoComplete="current-password" />
              <a href="https://t.me/clabx_bot" target="_blank" rel="noreferrer" style={{ fontSize: '12px', color: 'var(--accent)' }}>Забыли пароль? Восстановить через бота</a>
              {error && <p style={{ color: 'var(--danger)', fontSize: '13px' }}>{error}</p>}
              <Button type="submit" variant="primary" fullWidth loading={loading} size="lg">Войти</Button>
            </form>
          ) : (
            <div style={{ background: 'var(--bg-hover)', borderRadius: 'var(--radius-lg)', padding: '20px' }}>
              <p style={{ fontSize: '15px', fontWeight: 600, marginBottom: '8px', color: 'var(--text-primary)' }}>Регистрация через Telegram</p>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>Откройте бота @clabx_bot и нажмите «Зарегистрироваться»</p>
              <a href="https://t.me/clabx_bot" target="_blank" rel="noreferrer" style={{ display: 'block' }}>
                <Button variant="primary" fullWidth size="lg">Открыть бота @clabx_bot</Button>
              </a>
            </div>
          )}
        </div>
      </div>

      {showTerms && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }} onClick={() => setShowTerms(false)} />
          <div style={{ ...glassCardStyle, maxWidth: '600px', width: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 1 }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Правила и конфиденциальность</h3>
              <button onClick={() => setShowTerms(false)} style={{ padding: '8px', color: 'var(--text-muted)' }}>✕</button>
            </div>
            <div style={{ padding: '20px', overflow: 'auto', whiteSpace: 'pre-wrap', fontSize: '13px', color: 'var(--text-secondary)' }}>{TERMS_TEXT}</div>
          </div>
        </div>
      )}
    </div>
  );
}
