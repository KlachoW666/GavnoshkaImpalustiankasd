import { useState, useEffect, useRef } from 'react';
import { adminApi } from '../../utils/adminApi';

interface ExternalAiState {
  enabled: boolean;
  provider: 'openai' | 'claude' | 'glm';
  useAllProviders: boolean;
  minScore: number;
  openaiModel?: string;
  claudeModel?: string;
  glmModel?: string;
  openaiKeySet?: boolean;
  anthropicKeySet?: boolean;
  glmKeySet?: boolean;
  cryptopanicKeySet?: boolean;
  currentProviderKeySet?: boolean;
}

const cardStyle = {
  background: 'linear-gradient(145deg, var(--bg-card-solid) 0%, var(--bg-hover) 100%)',
  border: '1px solid var(--border)',
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
};

const DEFAULT_OPENAI = 'gpt-5.2';
const DEFAULT_CLAUDE = 'claude-3-5-sonnet-20241022';
const DEFAULT_GLM = 'glm-5';

export default function AdminExternalAi() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [config, setConfig] = useState<ExternalAiState | null>(null);
  const minScoreRef = useRef<number>(0.6);
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [anthropicApiKey, setAnthropicApiKey] = useState('');
  const [glmApiKey, setGlmApiKey] = useState('');
  const [cryptoPanicApiKey, setCryptoPanicApiKey] = useState('');
  const [touchedOpenAi, setTouchedOpenAi] = useState(false);
  const [touchedAnthropic, setTouchedAnthropic] = useState(false);
  const [touchedGlm, setTouchedGlm] = useState(false);
  const [touchedCryptoPanic, setTouchedCryptoPanic] = useState(false);

  const fetchConfig = () => {
    adminApi.get<ExternalAiState>('/admin/external-ai').then(setConfig).catch(() => setConfig(null));
  };

  useEffect(() => { fetchConfig(); }, []);
  useEffect(() => { if (config) minScoreRef.current = config.minScore; }, [config]);

  const save = async (patch: Partial<ExternalAiState> & { openaiApiKey?: string; anthropicApiKey?: string; glmApiKey?: string; cryptoPanicApiKey?: string } = {}) => {
    setLoading(true);
    setMessage('');
    try {
      const body: Record<string, unknown> = {
        enabled: patch.enabled ?? config?.enabled,
        provider: patch.provider ?? config?.provider,
        useAllProviders: patch.useAllProviders ?? config?.useAllProviders,
        minScore: patch.minScore ?? config?.minScore,
        openaiModel: patch.openaiModel ?? config?.openaiModel ?? DEFAULT_OPENAI,
        claudeModel: patch.claudeModel ?? config?.claudeModel ?? DEFAULT_CLAUDE,
        glmModel: patch.glmModel ?? config?.glmModel ?? DEFAULT_GLM
      };
      if (touchedOpenAi) body.openaiApiKey = patch.openaiApiKey ?? openaiApiKey;
      if (touchedAnthropic) body.anthropicApiKey = patch.anthropicApiKey ?? anthropicApiKey;
      if (touchedGlm) body.glmApiKey = patch.glmApiKey ?? glmApiKey;
      if (touchedCryptoPanic) body.cryptoPanicApiKey = patch.cryptoPanicApiKey ?? cryptoPanicApiKey;
      await adminApi.put('/admin/external-ai', body);
      setMessage('Настройки сохранены.');
      setOpenaiApiKey('');
      setAnthropicApiKey('');
      setGlmApiKey('');
      setCryptoPanicApiKey('');
      setTouchedOpenAi(false);
      setTouchedAnthropic(false);
      setTouchedGlm(false);
      setTouchedCryptoPanic(false);
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
      anthropicApiKey: touchedAnthropic ? anthropicApiKey : undefined,
      glmApiKey: touchedGlm ? glmApiKey : undefined,
      cryptoPanicApiKey: touchedCryptoPanic ? cryptoPanicApiKey : undefined
    });
  };

  if (config == null) {
    return (
      <div className="rounded-2xl p-6" style={cardStyle}>
        <p style={{ color: 'var(--text-muted)' }}>Загрузка настроек…</p>
      </div>
    );
  }

  const openaiModel = config.openaiModel || DEFAULT_OPENAI;
  const claudeModel = config.claudeModel || DEFAULT_CLAUDE;
  const glmModel = config.glmModel || DEFAULT_GLM;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <span className="text-2xl">🤖</span>
        <div>
          <h2 className="text-xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Внешний ИИ (OpenAI / Claude / GLM)
          </h2>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Модели могут работать вместе: при «Все провайдеры» вызываются все с ключами и усредняется оценка. CryptoPanic — новости для контекста перед ордером.
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
          <label className="flex items-center gap-3 cursor-pointer ml-6">
            <input
              type="checkbox"
              checked={config.useAllProviders === true}
              onChange={(e) => save({ useAllProviders: e.target.checked })}
              className="rounded w-5 h-5 accent-[var(--accent)]"
            />
            <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
              Все провайдеры вместе (усреднять оценки)
            </span>
          </label>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Если «Все провайдеры» выкл — используется один выбранный. Иначе вызываются OpenAI, Claude и GLM (у кого есть ключи) и берётся средняя оценка.
          </p>
        </div>

        {!config.useAllProviders && (
          <div className="mt-6 pt-6 border-t" style={{ borderColor: 'var(--border)' }}>
            <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>Провайдер (при «Все провайдеры» выкл)</p>
            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="provider" checked={config.provider === 'openai'} onChange={() => save({ provider: 'openai' })} className="accent-[var(--accent)]" />
                <span>OpenAI</span>
                {config.openaiKeySet !== undefined && <span className="text-xs" style={{ color: config.openaiKeySet ? 'var(--success)' : 'var(--text-muted)' }}>{config.openaiKeySet ? 'ключ задан' : ''}</span>}
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="provider" checked={config.provider === 'claude'} onChange={() => save({ provider: 'claude' })} className="accent-[var(--accent)]" />
                <span>Claude</span>
                {config.anthropicKeySet !== undefined && <span className="text-xs" style={{ color: config.anthropicKeySet ? 'var(--success)' : 'var(--text-muted)' }}>{config.anthropicKeySet ? 'ключ задан' : ''}</span>}
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="provider" checked={config.provider === 'glm'} onChange={() => save({ provider: 'glm' })} className="accent-[var(--accent)]" />
                <span>GLM</span>
                {config.glmKeySet !== undefined && <span className="text-xs" style={{ color: config.glmKeySet ? 'var(--success)' : 'var(--text-muted)' }}>{config.glmKeySet ? 'ключ задан' : ''}</span>}
              </label>
            </div>
          </div>
        )}

        <div className="mt-6 pt-6 border-t" style={{ borderColor: 'var(--border)' }}>
          <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>Модели (ID для API)</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>OpenAI</label>
              <input
                type="text"
                value={openaiModel}
                onChange={(e) => setConfig((c) => c ? { ...c, openaiModel: e.target.value } : c)}
                onBlur={() => save({ openaiModel })}
                placeholder="gpt-4o, gpt-5, gpt-4o-mini"
                className="w-full px-3 py-2 rounded-lg border text-sm"
                style={{ background: 'var(--bg-card-solid)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Claude</label>
              <input
                type="text"
                value={claudeModel}
                onChange={(e) => setConfig((c) => c ? { ...c, claudeModel: e.target.value } : c)}
                onBlur={() => save({ claudeModel })}
                placeholder="claude-3-5-sonnet"
                className="w-full px-3 py-2 rounded-lg border text-sm"
                style={{ background: 'var(--bg-card-solid)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>GLM</label>
              <input
                type="text"
                value={glmModel}
                onChange={(e) => setConfig((c) => c ? { ...c, glmModel: e.target.value } : c)}
                onBlur={() => save({ glmModel })}
                placeholder="glm-5, glm-4"
                className="w-full px-3 py-2 rounded-lg border text-sm"
                style={{ background: 'var(--bg-card-solid)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
            </div>
          </div>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            gpt-5.2, gpt-5, gpt-4o — OpenAI; claude-3-5-sonnet — Claude; glm-5 — Zhipu GLM.
          </p>
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
              onChange={(e) => { const v = parseInt(e.target.value, 10) / 100; minScoreRef.current = v; setConfig((c) => (c ? { ...c, minScore: v } : c)); }}
              onMouseUp={() => save({ minScore: minScoreRef.current })}
              onTouchEnd={() => save({ minScore: minScoreRef.current })}
              className="slider-track max-w-[200px]"
            />
            <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--accent)' }}>{Math.round(config.minScore * 100)}%</span>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t" style={{ borderColor: 'var(--border)' }}>
          <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>API-ключи</p>
          <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
            Введите ключ и нажмите «Сохранить всё». Оставьте пустым, чтобы не менять.
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
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Zhipu (GLM) API Key</label>
              <input
                type="password"
                value={glmApiKey}
                onChange={(e) => { setGlmApiKey(e.target.value); setTouchedGlm(true); }}
                placeholder={config.glmKeySet ? '•••••••• (задан)' : 'Ключ с open.bigmodel.cn'}
                className="w-full max-w-md px-3 py-2 rounded-lg border text-sm"
                style={{ background: 'var(--bg-card-solid)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                autoComplete="off"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>CryptoPanic API Key</label>
              <input
                type="password"
                value={cryptoPanicApiKey}
                onChange={(e) => { setCryptoPanicApiKey(e.target.value); setTouchedCryptoPanic(true); }}
                placeholder={config.cryptopanicKeySet ? '•••••••• (задан)' : 'auth_token с cryptopanic.com/developers'}
                className="w-full max-w-md px-3 py-2 rounded-lg border text-sm"
                style={{ background: 'var(--bg-card-solid)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                autoComplete="off"
              />
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                Новости для анализа перед открытием ордера. Бесплатный ключ: cryptopanic.com/developers/api/dashboard
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" onClick={saveAll} disabled={loading} className="px-4 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50" style={{ background: 'var(--accent)', color: 'white' }}>
            {loading ? 'Сохранение…' : 'Сохранить всё'}
          </button>
        </div>
      </section>
    </div>
  );
}
