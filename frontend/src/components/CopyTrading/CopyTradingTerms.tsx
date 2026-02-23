/**
 * Copy Trading Terms of Service Modal
 */

import { useState, useEffect } from 'react';

interface CopyTradingTermsProps {
  onAccept: () => void;
}

const TERMS_CONTENT = `
## УСЛОВИЯ ИСПОЛЬЗОВАНИЯ УСЛУГ КОПИТРЕЙДИНГА

Настоящее Соглашение является договором между вами и CLABX. Используя услуги копи-трейдинга, вы соглашаетесь с условиями, изложенными ниже.

### 1. КВАЛИФИКАЦИЯ ПОЛЬЗОВАТЕЛЯ
• Вам должно быть не менее 18 лет
• Вы должны иметь достаточные знания и опыт для понимания рисков
• Вы являетесь законным владельцем средств на вашем счёте

### 2. ПРАВИЛА ИСПОЛЬЗОВАНИЯ
• Вы можете подписаться на одного или нескольких провайдеров
• После подписки сделки провайдера будут копироваться на ваш счёт автоматически
• Вы можете закрыть любую скопированную сделку вручную в любое время
• Вы несете полную ответственность за риски

### 3. ПРЕДУПРЕЖДЕНИЕ О РИСКАХ
• Копи-трейдинг не гарантирует прибыль
• Вы можете потерять все средства
• Автоматическое копирование может привести к убыткам, превышающим убытки провайдера
• Прошлые результаты не гарантируют будущую прибыль

### 4. ОГРАНИЧЕНИЕ ОТВЕТСТВЕННОСТИ
• CLABX не несет ответственности за убытки, возникшие в результате использования услуг
• Вы используете услуги на свой страх и риск
• Мы не предоставляем инвестиционных консультаций

### 5. ПРАВА И ОБЯЗАННОСТИ
• Вы обязаны предоставлять достоверную информацию
• Вы несете ответственность за сохранность ваших данных
• Мы оставляем за собой право приостановить услуги при нарушении правил

### 6. ПЕРСОНАЛЬНЫЕ ДАННЫЕ
• Мы обрабатываем ваши данные в соответствии с Политикой конфиденциальности
• При возникновении споров мы можем предоставить данные по запросу госорганов

Используя услуги копитрейдинга, вы подтверждаете, что прочитали, поняли и согласны с условиями настоящего Соглашения.
`.trim();

export default function CopyTradingTerms({ onAccept }: CopyTradingTermsProps) {
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('copy-trading-terms-accepted');
    if (saved) {
      onAccept();
    }
  }, [onAccept]);

  const handleAccept = () => {
    localStorage.setItem('copy-trading-terms-accepted', 'true');
    setAccepted(true);
    onAccept();
  };

  const shortText = TERMS_CONTENT.split('###')[0].trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      
      <div 
        className="relative w-full max-w-2xl rounded-2xl max-h-[80vh] overflow-hidden flex flex-col"
        style={{ background: 'var(--bg-card-solid)', border: '1px solid var(--border)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }}
      >
        <div className="p-6 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-3">
            <div 
              className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ background: 'var(--accent-dim)' }}
            >
              <span className="text-2xl">📋</span>
            </div>
            <div>
              <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                Условия использования
              </h2>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Копитрейдинг
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-4">
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {shortText}
            </p>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Вы можете ознакомиться с полными условиями в <a href="/terms" onClick={(e) => { e.preventDefault(); window.location.hash = '#/terms'; }} style={{ color: 'var(--accent)' }}>Пользовательском соглашении</a>
            </p>
          </div>
        </div>

        <div className="p-6 border-t flex flex-col sm:flex-row gap-3" style={{ borderColor: 'var(--border)' }}>
          <label className="flex items-start gap-3 cursor-pointer flex-1">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-1 accent-[var(--accent)]"
            />
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Я прочитал(а) и согласен(на) с условиями использования услуг копитрейдинга
            </span>
          </label>
          <button
            onClick={handleAccept}
            disabled={!accepted}
            className="px-6 py-2.5 rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ 
              background: accepted ? 'var(--accent-gradient)' : 'var(--bg-hover)',
              color: accepted ? '#000' : 'var(--text-muted)'
            }}
          >
            Принять и продолжить
          </button>
        </div>
      </div>
    </div>
  );
}
