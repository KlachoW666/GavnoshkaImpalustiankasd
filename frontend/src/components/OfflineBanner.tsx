/**
 * Баннер «Нет связи» при offline. Показывает сообщение и кнопку «Повторить» (обновить страницу).
 */

export function OfflineBanner() {
  return (
    <div
      role="alert"
      className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-sm z-50 rounded-lg border shadow-lg px-4 py-3 flex items-center justify-between gap-3"
      style={{
        background: 'var(--bg-card-solid)',
        borderColor: 'var(--danger)',
        color: 'var(--text-primary)'
      }}
    >
      <span className="text-sm">
        Нет связи. Проверьте интернет и нажмите «Повторить».
      </span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium"
        style={{ background: 'var(--accent)', color: 'var(--bg-base)' }}
      >
        Повторить
      </button>
    </div>
  );
}
