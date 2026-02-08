import { useNotifications } from '../contexts/NotificationContext';
import type { ToastType } from '../contexts/NotificationContext';

const STYLES: Record<ToastType, { border: string; icon: string }> = {
  signal: { border: 'var(--accent)', icon: '◆' },
  success: { border: 'var(--success)', icon: '✓' },
  error: { border: 'var(--danger)', icon: '✕' },
  info: { border: 'var(--accent)', icon: 'ℹ' },
  warning: { border: 'var(--warning)', icon: '!' }
};

export default function ToastContainer() {
  const { toasts, removeToast } = useNotifications();

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none">
      <div className="flex flex-col gap-2 pointer-events-auto">
        {toasts.map((t) => {
          const style = STYLES[t.type];
          return (
            <div
              key={t.id}
              className="toast cursor-pointer hover:opacity-90 transition-opacity"
              style={{
                borderLeftWidth: '4px',
                borderLeftColor: style.border
              }}
              onClick={() => removeToast(t.id)}
              role="button"
              tabIndex={0}
            >
              <span className="text-lg opacity-90">{style.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-white">{t.title}</p>
                {t.message && <p className="text-xs text-[var(--text-secondary)] mt-0.5">{t.message}</p>}
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); removeToast(t.id); }}
                className="text-[var(--text-muted)] hover:text-white text-lg leading-none"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
