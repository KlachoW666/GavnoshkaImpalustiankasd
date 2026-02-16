import { useMemo } from 'react';
import { useTableSort } from '../../utils/useTableSort';
import { SortableTh } from '../SortableTh';

export interface HistoryEntry {
  id: string;
  pair: string;
  direction: 'LONG' | 'SHORT';
  size: number;
  leverage: number;
  openPrice: number;
  closePrice: number;
  pnl: number;
  pnlPercent: number;
  openTime: string | Date;
  closeTime: string | Date;
  status?: string;
  autoOpened?: boolean;
  confidenceAtOpen?: number;
  stopLoss?: number;
  takeProfit?: number[];
}

export interface TradeHistoryProps {
  history: HistoryEntry[];
  loading?: boolean;
  /** Заголовок секции */
  title?: string;
  /** Описание под заголовком */
  subtitle?: string;
}

const cardStyle = {
  background: 'var(--bg-card-solid)',
  border: '1px solid var(--border)',
  boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
};

function formatPrice(price: number): string {
  if (typeof price !== 'number' || !Number.isFinite(price)) return '—';
  if (price >= 1000)
    return price.toLocaleString('ru-RU', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 5,
    });
  if (price >= 1)
    return price.toLocaleString('ru-RU', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 7,
    });
  return price.toFixed(7);
}

function validClosePrice(h: { closePrice?: number }): boolean {
  return (
    typeof h.closePrice === 'number' &&
    Number.isFinite(h.closePrice) &&
    h.closePrice > 0
  );
}

function SkeletonRow() {
  return (
    <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
      {Array.from({ length: 8 }).map((_, i) => (
        <td key={i} className="py-3 px-3">
          <div
            className="h-4 rounded animate-pulse"
            style={{
              background: 'var(--border)',
              width: i === 3 ? '6rem' : i === 6 ? '4rem' : '3rem',
            }}
          />
        </td>
      ))}
    </tr>
  );
}

export default function TradeHistory({
  history,
  loading = false,
  title = 'История сделок',
  subtitle,
}: TradeHistoryProps) {
  const historyCompare = useMemo(
    () => ({
      pair: (a: HistoryEntry, b: HistoryEntry) =>
        (a.pair || '').localeCompare(b.pair || ''),
      direction: (a: HistoryEntry, b: HistoryEntry) =>
        (a.direction || '').localeCompare(b.direction || ''),
      size: (a: HistoryEntry, b: HistoryEntry) =>
        (a.size ?? 0) - (b.size ?? 0),
      pnl: (a: HistoryEntry, b: HistoryEntry) =>
        (a.pnl ?? 0) - (b.pnl ?? 0),
      closeTime: (a: HistoryEntry, b: HistoryEntry) =>
        new Date(a.closeTime).getTime() - new Date(b.closeTime).getTime(),
    }),
    []
  );

  const {
    sortedItems: sortedHistory,
    sortKey: historySortKey,
    sortDir: historySortDir,
    toggleSort: historyToggleSort,
  } = useTableSort(history, historyCompare, 'closeTime', 'desc');

  const effectiveSubtitle =
    subtitle ??
    `${history.length} записей`;

  return (
    <section
      className="rounded-2xl overflow-hidden p-6 md:p-8"
      style={{ ...cardStyle, borderLeft: '4px solid var(--accent)' }}
    >
      <h3
        className="text-lg font-semibold mb-0.5"
        style={{ color: 'var(--text-primary)' }}
      >
        {title}
      </h3>
      <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>
        {effectiveSubtitle}
      </p>

      {loading ? (
        <div
          className="overflow-x-auto rounded-xl border"
          style={{ borderColor: 'var(--border)' }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr
                className="border-b text-xs font-semibold uppercase tracking-wider"
                style={{
                  borderColor: 'var(--border)',
                  background: 'var(--bg-hover)',
                }}
              >
                <th className="py-3 px-3 text-left" style={{ color: 'var(--text-muted)' }}>Пара</th>
                <th className="py-3 px-3 text-left" style={{ color: 'var(--text-muted)' }}>Направление</th>
                <th className="py-3 px-3 text-right" style={{ color: 'var(--text-muted)' }}>Сумма</th>
                <th className="py-3 px-3 text-right" style={{ color: 'var(--text-muted)' }}>Вход / Выход</th>
                <th className="py-3 px-3 text-right" style={{ color: 'var(--text-muted)' }}>SL</th>
                <th className="py-3 px-3 text-right" style={{ color: 'var(--text-muted)' }}>TP</th>
                <th className="py-3 px-3 text-right" style={{ color: 'var(--text-muted)' }}>P&L</th>
                <th className="py-3 px-3 text-left" style={{ color: 'var(--text-muted)' }}>Время</th>
              </tr>
            </thead>
            <tbody>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </tbody>
          </table>
        </div>
      ) : history.length === 0 ? (
        <div
          className="py-10 px-4 rounded-xl text-center"
          style={{
            background: 'var(--bg-hover)',
            color: 'var(--text-muted)',
            border: '1px dashed var(--border)',
          }}
        >
          <p className="text-sm font-medium">История пуста</p>
          <p className="text-xs mt-1">
            Закрытые сделки появятся здесь
          </p>
        </div>
      ) : (
        <div
          className="overflow-x-auto rounded-xl border"
          style={{ borderColor: 'var(--border)' }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr
                className="border-b text-xs font-semibold uppercase tracking-wider"
                style={{
                  borderColor: 'var(--border)',
                  background: 'var(--bg-hover)',
                }}
              >
                <SortableTh
                  label="Пара"
                  sortKey="pair"
                  currentKey={historySortKey}
                  sortDir={historySortDir}
                  onSort={historyToggleSort}
                />
                <SortableTh
                  label="Направление"
                  sortKey="direction"
                  currentKey={historySortKey}
                  sortDir={historySortDir}
                  onSort={historyToggleSort}
                />
                <SortableTh
                  label="Сумма"
                  sortKey="size"
                  currentKey={historySortKey}
                  sortDir={historySortDir}
                  onSort={historyToggleSort}
                  align="right"
                />
                <th
                  className="text-right py-3 px-3"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Вход / Выход
                </th>
                <th
                  className="text-right py-3 px-3"
                  style={{ color: 'var(--text-muted)' }}
                >
                  SL
                </th>
                <th
                  className="text-right py-3 px-3"
                  style={{ color: 'var(--text-muted)' }}
                >
                  TP
                </th>
                <SortableTh
                  label="P&L"
                  sortKey="pnl"
                  currentKey={historySortKey}
                  sortDir={historySortDir}
                  onSort={historyToggleSort}
                  align="right"
                />
                <SortableTh
                  label="Время"
                  sortKey="closeTime"
                  currentKey={historySortKey}
                  sortDir={historySortDir}
                  onSort={historyToggleSort}
                />
              </tr>
            </thead>
            <tbody>
              {sortedHistory.slice(0, 20).map((h) => (
                <tr
                  key={h.id}
                  className="border-b hover:bg-[var(--bg-hover)]/50 transition-colors"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <td className="py-3 px-3 font-medium">{h.pair}</td>
                  <td className="py-3 px-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                        h.direction === 'LONG'
                          ? 'badge-long'
                          : 'badge-short'
                      }`}
                      style={
                        h.direction === 'LONG'
                          ? {
                              background: 'rgba(34,197,94,0.15)',
                              color: 'var(--success)',
                            }
                          : {
                              background: 'rgba(239,68,68,0.15)',
                              color: 'var(--danger)',
                            }
                      }
                    >
                      {h.direction}
                    </span>
                  </td>
                  <td className="text-right py-3 px-3 tabular-nums">
                    $
                    {(h.size ?? 0).toLocaleString('ru-RU', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td className="text-right py-3 px-3 tabular-nums text-xs">
                    {formatPrice(h.openPrice)} /{' '}
                    {validClosePrice(h) ? formatPrice(h.closePrice) : '—'}
                  </td>
                  <td
                    className="text-right py-3 px-3 tabular-nums text-xs"
                    style={{ color: 'var(--danger)' }}
                  >
                    {h.stopLoss != null && h.stopLoss > 0
                      ? formatPrice(h.stopLoss)
                      : '—'}
                  </td>
                  <td
                    className="text-right py-3 px-3 tabular-nums text-xs"
                    style={{ color: 'var(--success)' }}
                  >
                    {Array.isArray(h.takeProfit) && h.takeProfit.length
                      ? h.takeProfit.map(formatPrice).join(' / ')
                      : '—'}
                  </td>
                  <td
                    className={`text-right py-3 px-3 font-semibold tabular-nums ${
                      validClosePrice(h)
                        ? h.pnl >= 0
                          ? 'text-[var(--success)]'
                          : 'text-[var(--danger)]'
                        : ''
                    }`}
                  >
                    {validClosePrice(h)
                      ? (h.pnl >= 0 ? '+' : '') + h.pnl.toFixed(2)
                      : '—'}
                  </td>
                  <td
                    className="py-3 px-3 text-xs"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {new Date(h.closeTime).toLocaleString('ru-RU')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
