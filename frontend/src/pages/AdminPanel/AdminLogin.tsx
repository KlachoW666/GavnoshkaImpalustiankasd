import { useState, useEffect } from 'react';
import { api } from '../../utils/api';
import { setAdminToken } from '../../utils/adminApi';

const SAVED_CREDENTIALS_KEY = 'admin_saved_credentials';

interface AdminLoginProps {
  onSuccess: () => void;
}

export default function AdminLogin({ onSuccess }: AdminLoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVED_CREDENTIALS_KEY);
      if (raw) {
        const data = JSON.parse(raw) as { username?: string; password?: string };
        if (data.username) setUsername(data.username);
        if (data.password) {
          setPassword(data.password);
          setRemember(true);
        }
      }
    } catch {}
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post<{ ok?: boolean; token?: string; error?: string }>('/admin/login', {
        username: username.trim() || undefined,
        password
      });
      if (res.ok && res.token) {
        setAdminToken(res.token, remember);
        if (remember) {
          try {
            localStorage.setItem(SAVED_CREDENTIALS_KEY, JSON.stringify({
              username: username.trim(),
              password
            }));
          } catch {}
        } else {
          try {
            localStorage.removeItem(SAVED_CREDENTIALS_KEY);
          } catch {}
        }
        onSuccess();
      } else {
        setError((res as { error?: string }).error || 'Ошибка входа');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--bg-base)' }}>
      <div
        className="w-full max-w-md rounded-2xl border p-8"
        style={{ background: 'var(--bg-card-solid)', borderColor: 'var(--border)' }}
      >
        <h1 className="text-2xl font-bold tracking-tight mb-2">Админ-панель</h1>
        <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
          Вход по логину и паролю администратора или по общему паролю
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
              Логин (необязательно — для входа по общему паролю оставьте пустым)
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2"
              style={{
                background: 'var(--bg-base)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)'
              }}
              placeholder="Логин администратора"
              autoComplete="username"
              disabled={loading}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
              Пароль
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2"
              style={{
                background: 'var(--bg-base)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)'
              }}
              placeholder="Введите пароль"
              autoComplete="current-password"
              autoFocus={!!username}
              disabled={loading}
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="rounded accent-[var(--accent)]"
            />
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Сохранить данные входа</span>
          </label>
          {error && (
            <p className="text-sm" style={{ color: 'var(--danger)' }}>
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl font-semibold text-white transition-opacity disabled:opacity-50"
            style={{ background: 'var(--accent)' }}
          >
            {loading ? 'Вход…' : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  );
}
