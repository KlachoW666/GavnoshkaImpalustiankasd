/**
 * Одноразовый дисклеймер рисков для Авто-торговли и Копитрейдинга.
 * При первом посещении показывает текст + чекбокс «Понял риски»; после подтверждения пишет в localStorage и больше не показывается.
 */

import { useState } from 'react';

export const RISK_DISCLAIMER_KEY = 'risk_disclaimer_seen';

const DISCLAIMER_TEXT = `
Торговля криптовалютами и использование авто-торговли / копитрейдинга сопряжены с высокими рисками. Возможна полная или частичная потеря средств. Прошлые результаты не гарантируют будущих. Вы действуете на свой страх и риск.
`;

interface RiskDisclaimerProps {
  /** Уникальный ключ страницы (например 'auto' или 'copy'), чтобы один раз принятый дисклеймер работал для обеих страниц или по отдельности */
  storageKey?: string;
  onAccept?: () => void;
}

export function RiskDisclaimer({ storageKey = 'default', onAccept }: RiskDisclaimerProps) {
  const key = `${RISK_DISCLAIMER_KEY}_${storageKey}`;
  const [accepted, setAccepted] = useState(() => {
    try {
      return !!localStorage.getItem(key);
    } catch {
      return false;
    }
  });
  const [checked, setChecked] = useState(false);

  if (accepted) return null;

  const handleAccept = () => {
    if (!checked) return;
    try {
      localStorage.setItem(key, '1');
    } catch {}
    setAccepted(true);
    onAccept?.();
  };

  return (
    <div
      className="rounded-lg border-2 p-6 mb-6"
      style={{
        borderColor: 'var(--warning)',
        background: 'var(--bg-card-solid)',
        boxShadow: '0 0 0 1px var(--border)'
      }}
    >
      <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--warning)' }}>
        Предупреждение о рисках
      </h3>
      <p className="text-sm whitespace-pre-wrap mb-4" style={{ color: 'var(--text-secondary)' }}>
        {DISCLAIMER_TEXT.trim()}
      </p>
      <label className="flex items-start gap-2 cursor-pointer mb-4">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          className="rounded mt-1 accent-[var(--accent)]"
        />
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Я понимаю риски и принимаю ответственность за свои решения
        </span>
      </label>
      <button
        type="button"
        onClick={handleAccept}
        disabled={!checked}
        className="px-4 py-2 rounded-lg font-medium disabled:opacity-50"
        style={{ background: 'var(--accent)', color: 'white' }}
      >
        Понял риски
      </button>
    </div>
  );
}
