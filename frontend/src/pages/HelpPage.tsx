import { useState } from 'react';
import { useAppNavigate } from '../hooks/useAppNavigate';

const cardStyle: React.CSSProperties = {
  background: 'linear-gradient(145deg, var(--bg-card-solid) 0%, var(--bg-hover) 100%)',
  border: '1px solid var(--border)',
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
};

const miniCardStyle: React.CSSProperties = { background: 'var(--bg-hover)' };

const FAQ_ITEMS: { q: string; a: string }[] = [
  { q: 'Как копировать сделки?', a: '1. Выберите предпочитаемого трейдера на странице Копи-трейдинга и нажмите [Подписаться]\n\n2. Переведите USDT на свой спотовый счёт\n\n3. Заполните такие данные, как сумма копи-трейда и режим копи-трейдинга\n\n4. Отправьте информацию' },
  { q: 'Каковы требования, чтобы стать подписчиком?', a: 'Чтобы подписаться на трейдера, подписчики должны иметь на своём спотовом счёте не менее 30 USDT. Если в результате последующих сделок сумма их активов упадёт ниже 30 USDT, функция копи-трейдинга продолжит работать в обычном режиме, но дальнейшее уменьшение баланса с помощью функции корректировки активов будет невозможно.' },
  { q: 'Как выбрать подходящего трейдера?', a: 'Ключевые показатели, такие как ROI, PNL, ставка PNL и коэффициент выигрыша. Пользователям также предлагается учитывать личные предпочтения, такие как частота торговли, основные торговые пары, среднее время удержания, средняя сумма ордера и другие статистические факторы. При сравнении нескольких трейдеров функция «Сравнение результативности трейдеров» помогает получить подробные показатели с первого взгляда.' },
  { q: 'Какие меры безопасности существуют для управления рисками подписчика?', a: 'Стоп-лосс аккаунта: Может быть установлен в USDT или в процентах. Когда суммарные убытки достигают порогового значения, все позиции закрываются, а следующие отменяются.\n\nТейк-профит/Стоп-лосс: Подписчики могут устанавливать TP/SL для всех ордеров или индивидуально для открытых позиций.\n\nМаксимальный коэффициент на ордер: Ограничивает максимальный процент активов, используемых на ордер.\n\nУведомления в режиме реального времени: Уведомления обо всех операциях копи-трейдинга по электронной почте, через push-уведомления и внутренние сообщения.' },
  { q: 'Какие дополнительные расходы несут подписчики?', a: 'Помимо торговых комиссий, комиссий за финансирование и распределения прибыли, никакие другие комиссии не взимаются. Подписчики также могут воспользоваться текущими промоакциями платформы, предполагающими нулевые торговые комиссии.' },
  { q: 'Как работает система распределения доли прибыли?', a: 'Распределение доли прибыли происходит только в том случае, если активы подписчика превышают контрольный показатель после последнего распределения. Другими словами, совокупный реализованный PNL с момента последнего распределения прибыли должен быть положительным.\n\nПример: Начальная инвестиция: 1 000 USDT, доля прибыли трейдера: 10%.\n\nДень 1: Пользователь A получает прибыль в размере 200 USDT за счёт сделок копи-трейдинга трейдера B. В соответствии с соглашением о разделе 10% прибыли, 20 USDT отчисляется трейдеру B. После распределения прибыли активы пользователя А составляют 1 180 USDT.\n\nДень 2: Дневной убыток составляет 150 USDT. Совокупный PNL с момента последнего распределения прибыли (после дня 1) теперь составляет -150 USDT. Поскольку этот показатель отрицательный, доля прибыли не распределяется. Активы пользователя A снижаются до 1 030 USDT.\n\nДень 3: Зафиксирована прибыль в размере 100 USDT. Совокупный PNL с момента последнего распределения прибыли теперь составляет -50 USDT (-150 + 100). Поскольку он остаётся отрицательным, доля прибыли не распределяется. Активы пользователя A увеличиваются до 1 130 USDT.\n\nДень 4: Снова фиксируется прибыль в размере 100 USDT, в результате чего совокупный PNL достигает +50 USDT. Поскольку этот показатель теперь положительный, трейдеру B выделяется доля 10%, эквивалентная 5 USDT. До распределения прибыли активы пользователя A достигают 1 230 USDT; после вычета итог составляет 1 225 USDT.' }
];

function NavLink({
  children,
  page,
  label
}: {
  children: React.ReactNode;
  page: string;
  label?: string;
}) {
  const { navigateTo } = useAppNavigate();
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
  const [faqOpen, setFaqOpen] = useState<number | null>(null);

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

      <section className="rounded-lg p-6 shadow-lg" style={{ ...cardStyle, borderLeft: '4px solid var(--accent)' }}>
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
          <li>Подключите Bitget в разделе «Подключения» (Настройки)</li>
          <li>Используйте только права «Trading», без вывода средств</li>
          <li>Введите ключ активации в Профиле или на странице Активации</li>
        </ul>
      </section>

      <section className="rounded-lg p-6 shadow-lg" style={{ ...cardStyle, borderLeft: '4px solid var(--success)' }}>
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
        <div className="rounded-lg p-3 mt-3" style={miniCardStyle}>
          <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Горячие клавиши</p>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Ctrl+1 — Главная, Ctrl+2 — Сигналы, Ctrl+3 — График, Ctrl+4 — Демо, Ctrl+5 — Авто, Ctrl+7 — PnL, Ctrl+, — Настройки
          </p>
        </div>
      </section>

      <section className="rounded-lg p-6 shadow-lg" style={{ ...cardStyle, borderLeft: '4px solid var(--warning)' }}>
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

      <section className="rounded-lg p-6 shadow-lg" style={{ ...cardStyle, borderLeft: '4px solid var(--accent)' }}>
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl">🤖</span>
          <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
            Авто-торговля
          </h2>
        </div>
        <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--text-secondary)' }}>
          <NavLink page="autotrade" label="Авто">Авто-торговля</NavLink> позволяет запускать алгоритмическое исполнение по сигналам
          с настраиваемым риском.
        </p>
        <ul className="list-disc list-inside text-sm space-y-1" style={{ color: 'var(--text-muted)' }}>
          <li>В Настройках задайте лимиты риска и размер позиции</li>
          <li>Включите уведомления в Telegram для контроля сделок</li>
        </ul>
      </section>

      <section className="rounded-lg p-6 shadow-lg" style={{ ...cardStyle, borderLeft: '4px solid var(--text-secondary)' }}>
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl">⚙️</span>
          <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
            Настройки
          </h2>
        </div>
        <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--text-secondary)' }}>
          В <NavLink page="settings" label="Настройки">Настройках</NavLink> настраиваются: подключение к Bitget (API ключи и прокси),
          параметры анализа, уведомления (в т.ч. Telegram), отображение интерфейса и лимиты риска для авто-торговли.
        </p>
        <ul className="list-disc list-inside text-sm space-y-1" style={{ color: 'var(--text-muted)' }}>
          <li>Подключения — API Bitget и Massive.com, проверка соединения</li>
          <li>Анализ — пороги и таймфреймы</li>
          <li>Уведомления — Telegram (бот и Chat ID)</li>
          <li>Риски — максимальный риск на сделку, стоп-лосс</li>
        </ul>
      </section>

      <section className="rounded-lg p-6 shadow-lg" style={{ ...cardStyle, borderLeft: '4px solid var(--success)' }}>
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

      <section className="rounded-lg p-6 shadow-lg" style={{ ...cardStyle, borderLeft: '4px solid var(--text-muted)' }}>
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

      <div className="rounded-lg p-4 shadow-sm flex flex-wrap items-center gap-3" style={{ ...miniCardStyle, borderLeft: '4px solid var(--accent)' }}>
        <span className="text-lg">💬</span>
        <div>
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Нужна помощь?</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Support: <a href="https://t.me/clabxartur" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>@clabxartur</a>,{' '}
            <a href="https://t.me/clabxsupport" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>@clabxsupport</a>
          </p>
        </div>
      </div>

      {/* Часто задаваемые вопросы (FAQ) — внизу страницы */}
      <section className="rounded-lg p-6 shadow-lg" style={{ ...cardStyle, borderLeft: '4px solid var(--accent)' }}>
        <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Часто задаваемые вопросы (FAQ)</h2>
        <a href="https://clabx.ru/support" target="_blank" rel="noopener noreferrer" className="text-sm mb-6 inline-block" style={{ color: 'var(--accent)' }}>Руководство →</a>
        <div className="space-y-2">
          {FAQ_ITEMS.map((item, i) => (
            <div key={i} className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--bg-card-solid)' }}>
              <button
                onClick={() => setFaqOpen(faqOpen === i ? null : i)}
                className="w-full flex items-center justify-between gap-4 px-4 py-3 text-left text-sm font-medium"
                style={{ color: 'var(--text-primary)' }}
              >
                <span>{i + 1}. {item.q}</span>
                <span className="text-lg shrink-0" style={{ color: 'var(--text-muted)' }}>{faqOpen === i ? '−' : '+'}</span>
              </button>
              {faqOpen === i && (
                <div className="px-4 pb-4 pt-0 text-sm whitespace-pre-wrap" style={{ color: 'var(--text-secondary)', borderTop: '1px solid var(--border)' }}>{item.a}</div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
