/**
 * Аналитика по истории сделок + рекомендации по улучшению
 */

export interface HistoryEntry {
  pair: string;
  direction: 'LONG' | 'SHORT';
  pnl: number;
  pnlPercent: number;
  openPrice: number;
  closePrice: number;
  openTime: Date | string;
  closeTime: Date | string;
  confidenceAtOpen?: number;
  autoOpened?: boolean;
}

export interface AnalyticsResult {
  byDirection: { LONG: { wins: number; losses: number; totalPnl: number; winRate: number; avgPnl: number }; SHORT: { wins: number; losses: number; totalPnl: number; winRate: number; avgPnl: number } };
  byPair: Record<string, { wins: number; losses: number; totalPnl: number; winRate: number }>;
  byConfidenceBand: Record<string, { wins: number; losses: number; totalPnl: number; winRate: number }>;
  byHour: Record<number, { wins: number; losses: number; totalPnl: number }>;
  rrRatio: number;
  profitFactor: number;
  expectancy: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  suggestions: string[];
}

function confidenceBand(c: number | undefined): string {
  if (c == null) return 'unknown';
  const p = c * 100;
  if (p >= 85) return '85%+';
  if (p >= 75) return '75-85%';
  if (p >= 65) return '65-75%';
  return '<65%';
}

function computeAnalytics(history: HistoryEntry[], minConfidence?: number): AnalyticsResult {
  const byDirection = {
    LONG: { wins: 0, losses: 0, totalPnl: 0, pnls: [] as number[] },
    SHORT: { wins: 0, losses: 0, totalPnl: 0, pnls: [] as number[] }
  };
  const byPair: Record<string, { wins: number; losses: number; totalPnl: number }> = {};
  const byConfidenceBand: Record<string, { wins: number; losses: number; totalPnl: number }> = {};
  const byHour: Record<number, { wins: number; losses: number; totalPnl: number }> = {};
  let maxConsecutiveWins = 0;
  let maxConsecutiveLosses = 0;
  let cw = 0;
  let cl = 0;
  let grossProfit = 0;
  let grossLoss = 0;

  for (const h of history) {
    const pair = (h.pair || 'BTC/USDT').replace(/-/g, '/');
    if (!byPair[pair]) byPair[pair] = { wins: 0, losses: 0, totalPnl: 0 };
    byPair[pair].totalPnl += h.pnl;
    const band = confidenceBand(h.confidenceAtOpen);
    if (!byConfidenceBand[band]) byConfidenceBand[band] = { wins: 0, losses: 0, totalPnl: 0 };
    byConfidenceBand[band].totalPnl += h.pnl;
    const closeTime = typeof h.closeTime === 'string' ? new Date(h.closeTime) : h.closeTime;
    const hour = closeTime.getHours();
    if (!byHour[hour]) byHour[hour] = { wins: 0, losses: 0, totalPnl: 0 };
    byHour[hour].totalPnl += h.pnl;
    if (h.pnl > 0) {
      byPair[pair].wins++;
      byConfidenceBand[band].wins++;
      byHour[hour].wins++;
      byDirection[h.direction].wins++;
      byDirection[h.direction].totalPnl += h.pnl;
      byDirection[h.direction].pnls.push(h.pnl);
      grossProfit += h.pnl;
      cw++;
      cl = 0;
      maxConsecutiveWins = Math.max(maxConsecutiveWins, cw);
    } else {
      byPair[pair].losses++;
      byConfidenceBand[band].losses++;
      byHour[hour].losses++;
      byDirection[h.direction].losses++;
      byDirection[h.direction].totalPnl += h.pnl;
      byDirection[h.direction].pnls.push(h.pnl);
      grossLoss += Math.abs(h.pnl);
      cl++;
      cw = 0;
      maxConsecutiveLosses = Math.max(maxConsecutiveLosses, cl);
    }
  }

  const suggestions: string[] = [];
  const totalTrades = history.length;
  const winTrades = history.filter((h) => h.pnl > 0).length;
  const lossTrades = history.filter((h) => h.pnl < 0).length;
  const avgWin = winTrades > 0 ? grossProfit / winTrades : 0;
  const avgLoss = lossTrades > 0 ? grossLoss / lossTrades : 0;
  const rrRatio = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? 999 : 0;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;
  const winRatePct = totalTrades > 0 ? (winTrades / totalTrades) * 100 : 0;
  const expectancy = totalTrades > 0 ? (winRatePct / 100) * avgWin - ((100 - winRatePct) / 100) * avgLoss : 0;

  const longTotal = byDirection.LONG.wins + byDirection.LONG.losses;
  const shortTotal = byDirection.SHORT.wins + byDirection.SHORT.losses;
  const longWinRate = longTotal > 0 ? (byDirection.LONG.wins / longTotal) * 100 : 0;
  const shortWinRate = shortTotal > 0 ? (byDirection.SHORT.wins / shortTotal) * 100 : 0;

  if (totalTrades >= 5) {
    if (longWinRate > shortWinRate + 15 && longTotal >= 5) {
      suggestions.push(`LONG показывает лучший Win Rate (${longWinRate.toFixed(0)}% vs ${shortWinRate.toFixed(0)}%). Рассмотрите приоритет LONG при конфликте сигналов.`);
    }
    if (shortWinRate > longWinRate + 15 && shortTotal >= 5) {
      suggestions.push(`SHORT показывает лучший Win Rate (${shortWinRate.toFixed(0)}% vs ${longWinRate.toFixed(0)}%). Рассмотрите приоритет SHORT.`);
    }
    if (rrRatio >= 2) {
      suggestions.push(`R:R отличный (${rrRatio.toFixed(1)}:1). Средний выигрыш >> среднего убытка. Стратегия TP/SL работает.`);
    } else if (rrRatio < 1.2 && totalTrades >= 10) {
      suggestions.push(`R:R низкий (${rrRatio.toFixed(1)}:1). Увеличьте TP или ужесточите SL для улучшения соотношения.`);
    }
    if (maxConsecutiveLosses >= 4) {
      suggestions.push(`Было ${maxConsecutiveLosses} убытков подряд. Рекомендуется увеличить кулдаун после 2–3 убытков или снизить размер позиции.`);
    }
    if (minConfidence != null && minConfidence >= 90) {
      suggestions.push(`Мин. уверенность ${minConfidence}% может блокировать много сигналов. При PF ${profitFactor.toFixed(1)} и Win Rate ${winRatePct.toFixed(0)}% попробуйте 80–85%.`);
    }
    if (byDirection.LONG.totalPnl > 0 && byDirection.SHORT.totalPnl < 0 && shortTotal >= 5) {
      suggestions.push(`LONG в плюсе, SHORT в минусе. Возможно, ограничить SHORT или повысить мин. уверенность для SHORT.`);
    }
    if (byDirection.SHORT.totalPnl > 0 && byDirection.LONG.totalPnl < 0 && longTotal >= 5) {
      suggestions.push(`SHORT в плюсе, LONG в минусе. Возможно, ограничить LONG или повысить мин. уверенность для LONG.`);
    }
    const highConfBand = byConfidenceBand['85%+'] || { wins: 0, losses: 0, totalPnl: 0 };
    const highConfTotal = highConfBand.wins + highConfBand.losses;
    if (highConfTotal >= 5 && highConfBand.totalPnl > 0) {
      suggestions.push(`Сигналы с уверенностью 85%+ дают лучший результат. Поднимите мин. порог до 80–85%.`);
    }
    const lowConf65 = byConfidenceBand['<65%'] || { wins: 0, losses: 0, totalPnl: 0 };
    const lowConf75 = byConfidenceBand['65-75%'] || { wins: 0, losses: 0, totalPnl: 0 };
    const lowConfTotal = lowConf65.wins + lowConf65.losses + lowConf75.wins + lowConf75.losses;
    if (lowConfTotal >= 5 && (lowConf65.totalPnl + lowConf75.totalPnl) < 0) {
      suggestions.push('Низкая уверенность (&lt;75%) даёт убытки. Повысьте мин. confidence до 75%+.');
    }
  }
  if (totalTrades >= 3 && totalTrades < 10) {
    suggestions.push('Накопите 15+ сделок для более надёжной аналитики.');
  }

  const res: AnalyticsResult = {
    byDirection: {
      LONG: {
        wins: byDirection.LONG.wins,
        losses: byDirection.LONG.losses,
        totalPnl: byDirection.LONG.totalPnl,
        winRate: longTotal > 0 ? (byDirection.LONG.wins / longTotal) * 100 : 0,
        avgPnl: longTotal > 0 ? byDirection.LONG.totalPnl / longTotal : 0
      },
      SHORT: {
        wins: byDirection.SHORT.wins,
        losses: byDirection.SHORT.losses,
        totalPnl: byDirection.SHORT.totalPnl,
        winRate: shortTotal > 0 ? (byDirection.SHORT.wins / shortTotal) * 100 : 0,
        avgPnl: shortTotal > 0 ? byDirection.SHORT.totalPnl / shortTotal : 0
      }
    },
    byPair: Object.fromEntries(
      Object.entries(byPair).map(([p, v]) => [
        p,
        {
          ...v,
          winRate: v.wins + v.losses > 0 ? (v.wins / (v.wins + v.losses)) * 100 : 0
        }
      ])
    ),
    byConfidenceBand: Object.fromEntries(
      Object.entries(byConfidenceBand).map(([k, v]) => [
        k,
        { ...v, winRate: v.wins + v.losses > 0 ? (v.wins / (v.wins + v.losses)) * 100 : 0 }
      ])
    ),
    byHour,
    rrRatio,
    profitFactor,
    expectancy,
    maxConsecutiveWins,
    maxConsecutiveLosses,
    suggestions: suggestions.slice(0, 8)
  };
  return res;
}

interface TradingAnalyticsProps {
  history: HistoryEntry[];
  minConfidence?: number;
  /** Скрыть блок «Рекомендации по улучшению» (например при полном автомате) */
  hideSuggestions?: boolean;
}

export default function TradingAnalytics({ history, minConfidence, hideSuggestions }: TradingAnalyticsProps) {
  if (!history.length) {
    return (
      <section className="glass-strong rounded-lg border border-[var(--border)] shadow-[var(--shadow-md)] p-6 md:p-8">
        <h3 className="text-lg font-bold mb-4 tracking-tight">Аналитика и улучшения</h3>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Нет сделок для анализа. Совершите несколько сделок, чтобы получить рекомендации.</p>
      </section>
    );
  }

  const a = computeAnalytics(history, minConfidence);

  return (
    <section className="glass-strong rounded-lg border border-[var(--border)] shadow-[var(--shadow-md)] p-6 md:p-8">
      <h3 className="text-lg font-bold mb-4 tracking-tight">Аналитика и улучшения</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>По направлению</p>
          <div className="space-y-3">
            {(['LONG', 'SHORT'] as const).map((d) => (
              <div key={d} className="p-3 rounded-lg flex justify-between items-center" style={{ background: 'var(--bg-card-solid)' }}>
                <span className="font-medium">{d}</span>
                <div className="text-right text-sm">
                  <span className={a.byDirection[d].totalPnl >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}>
                    {a.byDirection[d].totalPnl >= 0 ? '+' : ''}${a.byDirection[d].totalPnl.toFixed(2)}
                  </span>
                  <span className="ml-2" style={{ color: 'var(--text-muted)' }}>
                    Win {a.byDirection[d].winRate.toFixed(0)}% ({a.byDirection[d].wins}W / {a.byDirection[d].losses}L)
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>Метрики</p>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span style={{ color: 'var(--text-muted)' }}>R:R (сред.выигр/сред.убыт)</span>
              <span className="font-semibold">{a.rrRatio.toFixed(1)}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: 'var(--text-muted)' }}>Profit Factor</span>
              <span className="font-semibold">{a.profitFactor.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: 'var(--text-muted)' }}>Ожидаемая доходность/сделку</span>
              <span className={a.expectancy >= 0 ? 'text-[var(--success)] font-semibold' : 'text-[var(--danger)] font-semibold'}>
                {a.expectancy >= 0 ? '+' : ''}${a.expectancy.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: 'var(--text-muted)' }}>Макс. выигрышей подряд</span>
              <span className="text-[var(--success)]">{a.maxConsecutiveWins}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: 'var(--text-muted)' }}>Макс. убытков подряд</span>
              <span className="text-[var(--danger)]">{a.maxConsecutiveLosses}</span>
            </div>
          </div>
        </div>
      </div>

      {Object.keys(a.byPair).length > 1 && (
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>По парам</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(a.byPair).map(([pair, v]) => (
              <div key={pair} className="px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--bg-card-solid)' }}>
                <span className="font-medium">{pair}</span>
                <span className={`ml-2 ${v.totalPnl >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                  {v.totalPnl >= 0 ? '+' : ''}${v.totalPnl.toFixed(2)}
                </span>
                <span className="ml-1 text-xs" style={{ color: 'var(--text-muted)' }}>({v.winRate.toFixed(0)}%)</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {Object.keys(a.byConfidenceBand).length > 1 && (
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>По уверенности сигнала при входе</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(a.byConfidenceBand).map(([k, v]) => (
              <div key={k} className="px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--bg-card-solid)' }}>
                <span className="font-medium">{k}</span>
                <span className={`ml-2 ${v.totalPnl >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                  {v.totalPnl >= 0 ? '+' : ''}${v.totalPnl.toFixed(2)}
                </span>
                <span className="ml-1 text-xs" style={{ color: 'var(--text-muted)' }}>({v.winRate.toFixed(0)}% WR)</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!hideSuggestions && a.suggestions.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--accent)' }}>Рекомендации по улучшению</p>
          <ul className="space-y-2">
            {a.suggestions.map((s, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <span className="text-[var(--accent)] shrink-0">•</span>
                <span style={{ color: 'var(--text-muted)' }}>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
