import { useState, useEffect, useRef } from 'react';
import { adminApi } from '../../utils/adminApi';

interface ExternalAiState {
  enabled: boolean;
  provider: 'openai' | 'claude';
  minScore: number;
  openaiKeySet?: boolean;
  anthropicKeySet?: boolean;
  currentProviderKeySet?: boolean;
}

const cardStyle = {
  background: 'linear-gradient(145deg, var(--bg-card-solid) 0%, var(--bg-hover) 100%)',
  border: '1px solid var(--border)',
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
};

export default function AdminExternalAi() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [config, setConfig] = useState<ExternalAiState | null>(null);
  const minScoreRef = useRef<number>(0.6);
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [anthropicApiKey, setAnthropicApiKey] = useState('');
  const [touchedOpenAi, setTouchedOpenAi] = useState(false);
  const [touchedAnthropic, setTouchedAnthropic] = useState(false);

  const fetchConfig = () => {
    adminApi.get<ExternalAiState>('/admin/external-ai').then(setConfig).catch(() => setConfig(null));
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  useEffect(() => {
    if (config) minScoreRef.current = config.minScore;
  }, [config]);

  const save = async (patch: Partial<ExternalAiState> & { openaiApiKey?: string; anthropicApiKey?: string } = {}) => {
    setLoading(true);
    setMessage('');
    try {
      const body: Record<string, unknown> = {
        enabled: patch.enabled ?? config?.enabled,
        provider: patch.provider ?? config?.provider,
        minScore: patch.minScore ?? config?.minScore
      };
      if (touchedOpenAi) body.openaiApiKey = patch.openaiApiKey ?? openaiApiKey;
      if (touchedAnthropic) body.anthropicApiKey = patch.anthropicApiKey ?? anthropicApiKey;
      await adminApi.put('/admin/external-ai', body);
      setMessage('Настройки сохранены.');
      setOpenaiApiKey('');
      setAnthropicApiKey('');
      setTouchedOpenAi(false);
      setTouchedAnthropic(false);
      fetchConfig();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  const saveAll = () => {
    save({
      openaiApiKey: touchedOpenAi ? openaiApiKey : undefined,
      anthropicApiKey: touchedAnthropic ? anthropicApiKey : undefined
    });
  };

  if (config == null) {
    return (
      <div className="rounded-2xl p-6" style={cardStyle}>
        <p style={{ color: 'var(--text-muted)' }}>Загрузка настроек…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <span className="text-2xl">🤖</span>
        <div>
          <h2 className="text-xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Внешний ИИ (OpenAI / Claude)
          </h2>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Дополнительная оценка сигнала перед открытием позиции. Все настройки, включая API-ключи, задаются ниже.
          </p>
        </div>
      </div>

      {message && (
        <div
          className="p-4 rounded-xl border text-sm"
          style={{
            background: message.startsWith('Ошибка') ? 'var(--danger-dim)' : 'var(--accent-dim)',
            borderColor: message.startsWith('Ошибка') ? 'var(--danger)' : 'var(--accent)',
            color: 'var(--text-primary)'
          }}
        >
          {message}
        </div>
      )}

      <section className="rounded-2xl p-6 shadow-lg border-l-4" style={{ ...cardStyle, borderLeftColor: 'var(--accent)' }}>
        <div className="space-y-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => save({ enabled: e.target.checked })}
              className="rounded w-5 h-5 accent-[var(--accent)]"
            />
            <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
              Включить внешний ИИ перед открытием ордера
            </span>
          </label>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Если включено и ключ API задан, каждый кандидат на открытие позиции отправляется выбранной модели. Ордер не откроется, если оценка ниже порога.
          </p>
        </div>

        <div className="mt-6 pt-6 border-t" style={{ borderColor: 'var(--border)' }}>
          <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>Провайдер</p>
          <div className="flex flex-wrap gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="provider"
                checked={config.provider === 'openai'}
                onChange={() => save({ provider: 'openai' })}
                className="accent-[var(--accent)]"
              />
              <span>OpenAI (GPT-4o-mini)</span>
              {config.openaiKeySet !== undefined && (
                <span className="text-xs" style={{ color: config.openaiKeySet ? 'var(--success)' : 'var(--text-muted)' }}>
                  {config.openaiKeySet ? 'ключ задан' : 'ключ не задан'}
                </span>
              )}
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="provider"
                checked={config.provider === 'claude'}
                onChange={() => save({ provider: 'claude' })}
                className="accent-[var(--accent)]"
              />
              <span>Claude (Haiku)</span>
              {config.anthropicKeySet !== undefined && (
                <span className="text-xs" style={{ color: config.anthropicKeySet ? 'var(--success)' : 'var(--text-muted)' }}>
                  {config.anthropicKeySet ? 'ключ задан' : 'ключ не задан'}
                </span>
              )}
            </label>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t" style={{ borderColor: 'var(--border)' }}>
          <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
            Минимальная оценка (0–100%): ордер не откроется, если ИИ вернёт ниже
          </p>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(config.minScore * 100)}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10) / 100;
                minScoreRef.current = v;
                setConfig((c) => (c ? { ...c, minScore: v } : c));
              }}
              onMouseUp={() => save({ minScore: minScoreRef.current })}
              onTouchEnd={() => save({ minScore: minScoreRef.current })}
              className="slider-track max-w-[200px]"
            />
            <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--accent)' }}>
              {Math.round(config.minScore * 100)}%
            </span>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t" style={{ borderColor: 'var(--border)' }}>
          <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>API-ключи (задаются в админке)</p>
          <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
            Введите ключ и нажмите «Сохранить всё». Оставьте пустым, чтобы не менять. Чтобы удалить ключ — очистите поле и сохраните.
          </p>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>OpenAI API Key</label>
              <input
                type="password"
                value={openaiApiKey}
                onChange={(e) => { setOpenaiApiKey(e.target.value); setTouchedOpenAi(true); }}
                placeholder={config.openaiKeySet ? '•••••••• (задан)' : 'sk-proj-…'}
                className="w-full max-w-md px-3 py-2 rounded-lg border text-sm"
                style={{ background: 'var(--bg-card-solid)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                autoComplete="off"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Anthropic (Claude) API Key</label>
              <input
                type="password"
                value={anthropicApiKey}
                onChange={(e) => { setAnthropicApiKey(e.target.value); setTouchedAnthropic(true); }}
                placeholder={config.anthropicKeySet ? '•••••••• (задан)' : 'sk-ant-…'}
                className="w-full max-w-md px-3 py-2 rounded-lg border text-sm"
                style={{ background: 'var(--bg-card-solid)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                autoComplete="off"
              />
            </div>
          </div>
          <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
            Ключи хранятся на сервере в зашифрованном виде (задайте ENCRYPTION_KEY в .env для шифрования).
          </p>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={saveAll}
            disabled={loading}
            className="px-4 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 transition-opacity"
            style={{ background: 'var(--accent)', color: 'white' }}
          >
            {loading ? 'Сохранение…' : 'Сохранить всё'}
          </button>
        </div>
      </section>
    </div>
  );
}
