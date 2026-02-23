/**
 * Onboarding Page — выбор режима после регистрации
 * 1. Авто-Торговля — стандартный доступ к платформе
 * 2. Копитрейдинг — инвестирование, копирование трейдеров
 */

import { useState } from 'react';
import { api } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';

interface ModeOption {
  id: 'auto_trading' | 'copy_trading';
  title: string;
  icon: string;
  description: string;
  features: string[];
  gradient: string;
}

const MODES: ModeOption[] = [
  {
    id: 'auto_trading',
    title: 'Авто-Торговля',
    icon: '🤖',
    description: 'Полный контроль над торговлей с AI-сигналами и автоматическим исполнением',
    features: [
      'AI-сигналы в реальном времени',
      'Автоматическое исполнение ордеров',
      'Настройка стратегий и рисков',
      'Интеграция с Bitget API',
      'Бэктест стратегий',
      'Ручная торговля'
    ],
    gradient: 'from-blue-500 to-purple-600'
  },
  {
    id: 'copy_trading',
    title: 'Копитрейдинг',
    icon: '👥',
    description: 'Копируйте сделки успешных трейдеров и зарабатывайте пассивно',
    features: [
      'Копирование топ трейдеров',
      'Прозрачная статистика провайдеров',
      'Управление капиталом',
      'Пополнение и вывод USDT',
      'История операций',
      'Минимум усилий'
    ],
    gradient: 'from-orange-500 to-red-500'
  }
];

interface OnboardingPageProps {
  onComplete: (mode: 'auto_trading' | 'copy_trading') => void;
}

export default function OnboardingPage({ onComplete }: OnboardingPageProps) {
  const { token } = useAuth();
  const [selectedMode, setSelectedMode] = useState<'auto_trading' | 'copy_trading' | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSelect = async (mode: 'auto_trading' | 'copy_trading') => {
    setSelectedMode(mode);
    setError('');
  };

  const handleConfirm = async () => {
    if (!selectedMode || !token) return;
    
    setLoading(true);
    setError('');
    
    try {
      await api.post('/user/mode', { mode: selectedMode }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      onComplete(selectedMode);
    } catch (e) {
      setError((e as Error).message || 'Ошибка сохранения');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg-base)' }}>
      <div className="w-full max-w-4xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <img src="/logo.svg" alt="CLABX" className="h-12 w-12" />
            <h1 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>CLABX</h1>
          </div>
          <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
            Добро пожаловать!
          </h2>
          <p className="text-base" style={{ color: 'var(--text-muted)' }}>
            Выберите режим работы, который подходит именно вам
          </p>
        </div>

        {/* Mode cards */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {MODES.map((mode) => (
            <button
              key={mode.id}
              onClick={() => handleSelect(mode.id)}
              className={`
                relative overflow-hidden rounded-2xl p-6 text-left transition-all duration-300
                ${selectedMode === mode.id 
                  ? 'ring-2 ring-offset-2 scale-[1.02]' 
                  : 'hover:scale-[1.01]'}
              `}
              style={{
                background: 'var(--bg-card-solid)',
                border: '1px solid var(--border)',
                
                
              }}
            >
              {/* Gradient accent */}
              <div 
                className={`
                  absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${mode.gradient}
                `}
              />
              
              {/* Icon and title */}
              <div className="flex items-center gap-3 mb-4">
                <span className="text-4xl">{mode.icon}</span>
                <div>
                  <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                    {mode.title}
                  </h3>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    {mode.description}
                  </p>
                </div>
              </div>

              {/* Features */}
              <ul className="space-y-2">
                {mode.features.map((feature, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    <svg className="w-4 h-4 shrink-0" style={{ color: 'var(--success)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>

              {/* Selected indicator */}
              {selectedMode === mode.id && (
                <div 
                  className="absolute top-4 right-4 w-6 h-6 rounded-full flex items-center justify-center"
                  style={{ background: mode.id === 'auto_trading' ? '#3B82F6' : '#F97316' }}
                >
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
            </button>
          ))}
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-4 p-3 rounded-lg text-center text-sm" style={{ background: 'var(--danger-dim)', color: 'var(--danger)' }}>
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col items-center gap-4">
          <button
            onClick={handleConfirm}
            disabled={!selectedMode || loading}
            className="
              px-8 py-3 rounded-xl font-semibold text-white text-lg
              transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed
              hover:shadow-lg hover:scale-[1.02]
            "
            style={{
              background: selectedMode 
                ? (selectedMode === 'auto_trading' 
                    ? 'linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%)'
                    : 'linear-gradient(135deg, #F97316 0%, #EF4444 100%)')
                : 'var(--accent)'
            }}
          >
            {loading ? 'Сохранение...' : selectedMode ? `Выбрать «${MODES.find(m => m.id === selectedMode)?.title}»` : 'Выберите режим'}
          </button>
          
          <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
            Можно изменить в любой момент в настройках профиля
          </p>
        </div>

        {/* Skip for now */}
        <div className="text-center mt-6">
          <button
            onClick={() => onComplete('auto_trading')}
            className="text-sm hover:underline"
            style={{ color: 'var(--text-muted)' }}
          >
            Пропустить и использовать Авто-Торговлю
          </button>
        </div>
      </div>
    </div>
  );
}
