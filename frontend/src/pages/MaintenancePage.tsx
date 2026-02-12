/**
 * Страница «Сайт на техническом обслуживании» — показывается всем, кроме группы admin.
 */

export default function MaintenancePage() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6 text-center"
      style={{ background: 'var(--bg-base)', color: 'var(--text-primary)' }}
    >
      <div className="max-w-md w-full">
        <div
          className="w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center text-4xl"
          style={{ background: 'var(--bg-hover)' }}
        >
          🔧
        </div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-3">
          Сайт на техническом обслуживании
        </h1>
        <p className="text-base mb-6" style={{ color: 'var(--text-secondary)' }}>
          Мы обновляем сервис. Скоро всё заработает.
        </p>
        <p className="text-sm mb-8" style={{ color: 'var(--text-muted)' }}>
          Новости, обновления и сроки смотрите в нашем Telegram.
        </p>
        <a
          href="https://t.me/clabx_bot"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-white transition-opacity hover:opacity-95"
          style={{ background: 'var(--accent)' }}
        >
          Telegram: @clabx_bot
        </a>
        <p className="text-xs mt-6" style={{ color: 'var(--text-muted)' }}>
          Поддержка:{' '}
          <a href="https://t.me/clabxartur" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
            @clabxartur
          </a>
          ,{' '}
          <a href="https://t.me/clabxsupport" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
            @clabxsupport
          </a>
        </p>
      </div>
    </div>
  );
}
