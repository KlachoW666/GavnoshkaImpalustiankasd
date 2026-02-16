import { useNavigation } from '../contexts/NavigationContext';

const cardStyle: React.CSSProperties = {
  background: 'linear-gradient(145deg, var(--bg-card-solid) 0%, var(--bg-hover) 100%)',
  border: '1px solid var(--border)',
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
};

const miniCardStyle: React.CSSProperties = { background: 'var(--bg-hover)' };

function NavLink({
  children,
  page,
  label
}: {
  children: React.ReactNode;
  page: string;
  label?: string;
}) {
  const { navigateTo } = useNavigation();
  const go = () => navigateTo(page as any);
  return (
    <button
      type="button"
      onClick={go}
      className="inline-flex items-center gap-1 text-sm font-medium underline decoration-2 underline-offset-2 hover:opacity-90 transition-opacity"
      style={{ color: 'var(--accent)' }}
      aria-label={label ?? String(children)}
    >
      {children}
    </button>
  );
}

export default function HelpPage() {
  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex items-center gap-3">
        <span className="text-3xl">📖</span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Помощь
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Полное описание разделов приложения и быстрые переходы
          </p>
        </div>
      </div>

      <section className="rounded-2xl p-6 shadow-lg" style={{ ...cardStyle, borderLeft: '4px solid var(--accent)' }}>
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl">🚀</span>
          <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
            Начало работы
          </h2>
        </div>
        <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--text-secondary)' }}>
          После входа в систему откройте <NavLink page="dashboard" label="Главная">Главную</NavLink> — там сводка по счёту и быстрые действия.
          Для торговли через биржу нужно подключить API в <NavLink page="settings" label="Настройки">Настройках</NavLink> и при необходимости
          активировать подписку в <NavLink page="activate" label="Активация">Активации</NavLink>.
        </p>
        <ul className="list-disc list-inside text-sm space-y-1" style={{ color: 'var(--text-muted)' }}>
          <li>Подключите OKX в разделе «Подключения» (Настройки)</li>
          <li>Используйте только права «Trading», без вывода средств</li>
          <li>Введите ключ активации в Профиле или на странице Активации</li>
        </ul>
      </section>

      <section className="rounded-2xl p-6 shadow-lg" style={{ ...cardStyle, borderLeft: '4px solid var(--success)' }}>
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl">📊</span>
          <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
            Главная и дашборд
          </h2>
        </div>
        <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--text-secondary)' }}>
          На <NavLink page="dashboard" label="Главная">главной странице</NavLink> отображаются баланс, открытые позиции и последние сигналы.
          Отсюда удобно переходить к <NavLink page="signals" label="Сигналы">Сигналам</NavLink>, <NavLink page="chart" label="График">Графику</NavLink> и
          <NavLink page="autotrade" label="Авто">Авто-торговле</NavLink>.
        </p>
        <div className="rounded-xl p-3 mt-3" style={miniCardStyle}>
          <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Горячие клавиши</p>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Ctrl+1 — Главная, Ctrl+2 — Сигналы, Ctrl+3 — График, Ctrl+4 — Демо, Ctrl+5 — Авто, Ctrl+7 — PnL, Ctrl+, — Настройки
          </p>
        </div>
      </section>

      <section className="rounded-2xl p-6 shadow-lg" style={{ ...cardStyle, borderLeft: '4px solid var(--warning)' }}>
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl">📈</span>
          <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
            График и анализ
          </h2>
        </div>
        <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--text-secondary)' }}>
          В разделе <NavLink page="chart" label="График">График</NavLink> можно смотреть свечи, индикаторы и зоны. Раздел
          <NavLink page="signals" label="Сигналы">Сигналы</NavLink> показывает ленту торговых идей. Для расчёта прибыли и рисков
          используйте <NavLink page="pnl" label="PnL">PnL-калькулятор</NavLink>.
        </p>
        <ul className="list-disc list-inside text-sm space-y-1" style={{ color: 'var(--text-muted)' }}>
          <li>График — выбор таймфрейма и инструмента</li>
          <li>Сигналы — входящие идеи от системы анализа</li>
          <li>Scanner — поиск инструментов по заданным критериям</li>
        </ul>
      </section>

      <section className="rounded-2xl p-6 shadow-lg" style={{ ...cardStyle, borderLeft: '4px solid var(--accent)' }}>
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl">🤖</span>
          <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
            Авто-торговля и демо
          </h2>
        </div>
        <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--text-secondary)' }}>
          <NavLink page="autotrade" label="Авто">Авто-торговля</NavLink> позволяет запускать алгоритмическое исполнение по сигналам
          с настраиваемым риском. Перед этим можно потренироваться в <NavLink page="demo" label="Демо">Демо</NavLink> без реальных сделок.
        </p>
        <ul className="list-disc list-inside text-sm space-y-1" style={{ color: 'var(--text-muted)' }}>
          <li>В Настройках задайте лимиты риска и размер позиции</li>
          <li>Включите уведомления в Telegram для контроля сделок</li>
        </ul>
      </section>

      <section className="rounded-2xl p-6 shadow-lg" style={{ ...cardStyle, borderLeft: '4px solid var(--text-secondary)' }}>
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl">⚙️</span>
          <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
            Настройки
          </h2>
        </div>
        <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--text-secondary)' }}>
          В <NavLink page="settings" label="Настройки">Настройках</NavLink> настраиваются: подключение к OKX (API ключи и прокси),
          параметры анализа, уведомления (в т.ч. Telegram), отображение интерфейса и лимиты риска для авто-торговли.
        </p>
        <ul className="list-disc list-inside text-sm space-y-1" style={{ color: 'var(--text-muted)' }}>
          <li>Подключения — API OKX, проверка соединения</li>
          <li>Анализ — пороги и таймфреймы</li>
          <li>Уведомления — Telegram (бот и Chat ID)</li>
          <li>Риски — максимальный риск на сделку, стоп-лосс</li>
        </ul>
      </section>

      <section className="rounded-2xl p-6 shadow-lg" style={{ ...cardStyle, borderLeft: '4px solid var(--success)' }}>
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl">👤</span>
          <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
            Профиль и подписка
          </h2>
        </div>
        <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--text-secondary)' }}>
          В <NavLink page="profile" label="Профиль">Профиле</NavLink> отображаются данные аккаунта, статистика и срок подписки.
          Ключ активации можно ввести здесь или на отдельной странице <NavLink page="activate" label="Активация">Активация</NavLink>.
        </p>
        <ul className="list-disc list-inside text-sm space-y-1" style={{ color: 'var(--text-muted)' }}>
          <li>Покупка ключа — через бота (контакт указан в подвале сайта)</li>
          <li>После активации полный доступ к разделам по вашей подписке</li>
        </ul>
      </section>

      <section className="rounded-2xl p-6 shadow-lg" style={{ ...cardStyle, borderLeft: '4px solid var(--text-muted)' }}>
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl">📜</span>
          <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
            Конфиденциальность и условия
          </h2>
        </div>
        <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--text-secondary)' }}>
          Обработка персональных данных описана в <NavLink page="privacy" label="Политика конфиденциальности">Политике конфиденциальности</NavLink>,
          условия использования — в <NavLink page="terms" label="Пользовательское соглашение">Пользовательском соглашении</NavLink>.
        </p>
      </section>

      <div className="rounded-2xl p-4 shadow-sm flex flex-wrap items-center gap-3" style={{ ...miniCardStyle, borderLeft: '4px solid var(--accent)' }}>
        <span className="text-lg">💬</span>
        <div>
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Нужна помощь?</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Support: <a href="https://t.me/clabxartur" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>@clabxartur</a>,{' '}
            <a href="https://t.me/clabxsupport" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>@clabxsupport</a>
          </p>
        </div>
      </div>
    </div>
  );
}
