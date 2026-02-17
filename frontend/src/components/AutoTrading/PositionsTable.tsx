import { normSymbol } from '../../utils/fetchPrice';

export interface PositionItem {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  size: number;
  leverage: number;
  openPrice: number;
  currentPrice?: number;
  pnl?: number;
  pnlPercent?: number;
  stopLoss?: number;
  takeProfit?: number[];
  openTime: string;
  /** Bitget: количество контрактов */
  contracts?: number;
  /** Bitget: номинал позиции */
  notional?: number;
  /** Источник: Bitget (реальный счёт) или демо */
  source?: 'bitget' | 'demo';
}

export interface PositionsTableProps {
  positions: PositionItem[];
  onClose: (positionId: string) => void;
  loading?: boolean;
  /** Заголовок/описание секции */
  title?: string;
  subtitle?: string;
}

const cardStyle = {
  background: 'var(--bg-card-solid)',
  border: '1px solid var(--border)',
  boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
};

function SkeletonCard() {
  return (
    <div
      className="rounded-lg border p-4 flex flex-col gap-2 animate-pulse"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-hover)' }}
    >
      <div className="flex items-center justify-between">
        <div className="h-5 w-28 rounded" style={{ background: 'var(--border)' }} />
        <div className="h-5 w-14 rounded" style={{ background: 'var(--border)' }} />
      </div>
      <div className="h-4 w-36 rounded" style={{ background: 'var(--border)' }} />
      <div className="h-4 w-32 rounded" style={{ background: 'var(--border)' }} />
      <div className="h-4 w-24 rounded" style={{ background: 'var(--border)' }} />
      <div className="h-4 w-20 rounded" style={{ background: 'var(--border)' }} />
    </div>
  );
}

export default function PositionsTable({
  positions,
  onClose,
  loading = false,
  title = 'Открытые позиции',
  subtitle,
}: PositionsTableProps) {
  if (loading) {
    return (
      <section
        className="rounded-lg overflow-hidden p-6 md:p-8"
        style={{ ...cardStyle, borderLeft: '4px solid var(--accent)' }}
      >
        <h3 className="text-lg font-semibold mb-0.5" style={{ color: 'var(--text-primary)' }}>
          {title}
        </h3>
        {subtitle && (
          <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>
            {subtitle}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </section>
    );
  }

  if (positions.length === 0) {
    return (
      <section
        className="rounded-lg overflow-hidden p-6 md:p-8"
        style={{ ...cardStyle, borderLeft: '4px solid var(--accent)' }}
      >
        <h3 className="text-lg font-semibold mb-0.5" style={{ color: 'var(--text-primary)' }}>
          {title}
        </h3>
        {subtitle && (
          <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>
            {subtitle}
          </p>
        )}
        <div
          className="py-10 px-4 rounded-lg text-center"
          style={{
            background: 'var(--bg-hover)',
            color: 'var(--text-muted)',
            border: '1px dashed var(--border)',
          }}
        >
          <p className="text-sm font-medium">Нет открытых позиций</p>
          <p className="text-xs mt-1">Позиции появятся здесь после исполнения ордеров</p>
        </div>
      </section>
    );
  }

  const bitgetPositions = positions.filter((p) => p.source === 'bitget');
  const demoPositions = positions.filter((p) => p.source === 'demo');

  return (
    <section
      className="rounded-lg overflow-hidden p-6 md:p-8"
      style={{ ...cardStyle, borderLeft: '4px solid var(--accent)' }}
    >
      <h3 className="text-lg font-semibold mb-0.5" style={{ color: 'var(--text-primary)' }}>
        {title}
      </h3>
      {subtitle && (
        <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>
          {subtitle}
        </p>
      )}

      {bitgetPositions.length > 0 && (
        <div className="space-y-4 mb-6">
          <p
            className="text-xs font-semibold uppercase tracking-wider mb-2"
            style={{ color: 'var(--text-muted)' }}
          >
            Bitget (реальный счёт) — ордера бота
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {bitgetPositions.map((pos: PositionItem) => {
              const symNorm = normSymbol(pos.symbol.replace(/:.*$/, ''));
              const base = symNorm
                ? symNorm.split('-')[0]
                : pos.symbol.split(/[/:-]/)[0] || '';
              const amountStr =
                pos.contracts != null
                  ? `${Math.abs(pos.contracts).toLocaleString('ru-RU', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 4,
                    })} ${base}`
                  : '—';

              const lev = Math.max(1, pos.leverage || 1);
              const stake =
                pos.notional != null ? pos.notional / lev : undefined;

              return (
                <div
                  key={pos.id}
                  className="rounded-lg border p-4 flex flex-col gap-1"
                  style={{
                    borderColor: 'var(--accent)',
                    background: 'var(--accent-dim)',
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold">
                      {symNorm || pos.symbol || '—'} {pos.direction}
                    </span>
                    <span
                      className="text-xs px-2 py-0.5 rounded"
                      style={{ background: 'var(--accent)', color: 'white' }}
                    >
                      Bitget Реал
                    </span>
                  </div>
                  <p className="text-sm">
                    <span style={{ color: 'var(--text-muted)' }}>Количество: </span>
                    {amountStr}
                  </p>
                  <p className="text-sm">
                    <span style={{ color: 'var(--text-muted)' }}>Вход: </span>
                    {pos.openPrice != null
                      ? Number(pos.openPrice).toLocaleString('ru-RU')
                      : '—'}
                  </p>
                  {stake != null && (
                    <>
                      <p className="text-sm">
                        <span style={{ color: 'var(--text-muted)' }}>Ставка: </span>$
                        {stake.toFixed(2)}
                      </p>
                      <p className="text-sm">
                        <span style={{ color: 'var(--text-muted)' }}>
                          Ставка с плечом {lev}x:{' '}
                        </span>
                        ${Number(pos.notional).toFixed(2)}
                      </p>
                    </>
                  )}
                  {pos.stopLoss != null && pos.stopLoss > 0 && (
                    <p className="text-sm">
                      <span style={{ color: 'var(--danger)' }}>SL: </span>
                      {Number(pos.stopLoss).toLocaleString('ru-RU')}
                    </p>
                  )}
                  {pos.takeProfit != null && pos.takeProfit.length > 0 && (
                    <p className="text-sm">
                      <span style={{ color: 'var(--success)' }}>TP: </span>
                      {pos.takeProfit.map((t: number) => Number(t).toLocaleString('ru-RU')).join(' / ')}
                    </p>
                  )}
                  <p
                    className={`text-sm font-medium ${
                      (pos.pnl ?? 0) >= 0
                        ? 'text-[var(--success)]'
                        : 'text-[var(--danger)]'
                    }`}
                  >
                    P&L:{' '}
                    {pos.pnl != null
                      ? (pos.pnl >= 0 ? '+' : '') + pos.pnl.toFixed(2)
                      : '—'}
                  </p>
                  <button
                    type="button"
                    onClick={() => onClose(pos.id)}
                    className="mt-2 px-3 py-1.5 rounded-lg text-xs font-medium transition hover:brightness-110"
                    style={{
                      background: 'var(--danger)',
                      color: 'white',
                    }}
                  >
                    Закрыть позицию
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {demoPositions.length > 0 && (
        <div className="space-y-4">
          <p
            className="text-xs font-semibold uppercase tracking-wider mb-2"
            style={{ color: 'var(--text-muted)' }}
          >
            Локальные позиции (демо) · {demoPositions.length}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {demoPositions.map((pos) => {
              const pnl =
                pos.pnl ??
                ((pos.currentPrice ?? pos.openPrice) - pos.openPrice) *
                  (pos.direction === 'SHORT' ? -1 : 1) *
                  (pos.size / pos.openPrice);

              return (
                <div
                  key={pos.id}
                  className="rounded-lg border p-4 flex flex-col gap-1"
                  style={{
                    borderColor: 'var(--border)',
                    background: 'var(--bg-hover)',
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold">
                      {pos.symbol} {pos.direction}
                    </span>
                    <span
                      className="text-xs px-2 py-0.5 rounded"
                      style={{
                        background: 'var(--bg-card-solid)',
                        color: 'var(--text-muted)',
                      }}
                    >
                      Демо
                    </span>
                  </div>
                  <p className="text-sm">
                    <span style={{ color: 'var(--text-muted)' }}>Вход: </span>
                    {pos.openPrice?.toLocaleString('ru-RU') ?? '—'}
                  </p>
                  <p className="text-sm">
                    <span style={{ color: 'var(--text-muted)' }}>Текущая: </span>
                    {pos.currentPrice?.toLocaleString('ru-RU') ?? '—'}
                  </p>
                  <p className="text-sm">
                    <span style={{ color: 'var(--text-muted)' }}>Ставка: </span>$
                    {(pos.size ?? 0).toFixed(2)}
                  </p>
                  <p
                    className={`text-sm font-medium ${
                      pnl >= 0
                        ? 'text-[var(--success)]'
                        : 'text-[var(--danger)]'
                    }`}
                  >
                    P&L: {pnl >= 0 ? '+' : ''}
                    {pnl.toFixed(2)}
                  </p>
                  <button
                    type="button"
                    onClick={() => onClose(pos.id)}
                    className="mt-2 px-3 py-1.5 rounded-lg text-xs font-medium transition hover:brightness-110"
                    style={{
                      background: 'var(--danger)',
                      color: 'white',
                    }}
                  >
                    Закрыть позицию
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
