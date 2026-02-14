/**
 * Вычисление аналитики по ордерам (admin + user)
 */

import { listOrders } from '../db';
import type { OrderRow } from '../db';

export interface AnalyticsResult {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number;
  bestTrade: number;
  worstTrade: number;
  equityCurve: Array<{ date: string; pnl: number; cumulative: number }>;
  maxDrawdownUsdt: number;
  maxDrawdownPct: number;
  sharpeRatio: number;
  sortinoRatio: number;
  byDay: Array<{ date: string; pnl: number; trades: number; wins: number; winRate: number }>;
  avgHoldTimeMinutes: number;
  pairCorrelation?: Array<{ pair: string; pnl: number; trades: number }>;
}

export function computeAnalytics(
  orders: OrderRow[],
  _clientId?: string
): AnalyticsResult {
  const withPnl = orders.filter((o) => o.close_price != null && o.close_price > 0 && o.pnl != null);
  const wins = withPnl.filter((o) => (o.pnl ?? 0) > 0);
  const losses = withPnl.filter((o) => (o.pnl ?? 0) < 0);
  const totalPnl = withPnl.reduce((s, o) => s + (o.pnl ?? 0), 0);
  const totalTrades = withPnl.length;
  const winRate = totalTrades > 0 ? (wins.length / totalTrades) * 100 : 0;
  const grossProfit = wins.reduce((s, o) => s + (o.pnl ?? 0), 0);
  const grossLoss = Math.abs(losses.reduce((s, o) => s + (o.pnl ?? 0), 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;
  const bestTrade = withPnl.length ? Math.max(...withPnl.map((o) => o.pnl ?? 0)) : 0;
  const worstTrade = withPnl.length ? Math.min(...withPnl.map((o) => o.pnl ?? 0)) : 0;

  const sorted = [...withPnl].sort((a, b) => (a.close_time ?? '').localeCompare(b.close_time ?? ''));
  let cumulative = 0;
  const equityCurve: Array<{ date: string; pnl: number; cumulative: number }> = [];
  for (const o of sorted) {
    cumulative += o.pnl ?? 0;
    equityCurve.push({
      date: (o.close_time ?? o.open_time ?? '').slice(0, 10),
      pnl: o.pnl ?? 0,
      cumulative: Math.round(cumulative * 100) / 100
    });
  }

  let peak = 0;
  let maxDrawdownUsdt = 0;
  let maxDrawdownPct = 0;
  for (const p of equityCurve) {
    if (p.cumulative > peak) peak = p.cumulative;
    const dd = peak - p.cumulative;
    if (dd > maxDrawdownUsdt) maxDrawdownUsdt = dd;
    const ddPct = peak > 0 ? (dd / peak) * 100 : 0;
    if (ddPct > maxDrawdownPct) maxDrawdownPct = ddPct;
  }

  const byDayMap = new Map<string, number>();
  for (const o of withPnl) {
    const day = (o.close_time ?? o.open_time ?? '').slice(0, 10);
    if (!day) continue;
    byDayMap.set(day, (byDayMap.get(day) ?? 0) + (o.pnl ?? 0));
  }
  const dailyReturns = Array.from(byDayMap.values());
  const avgReturn = dailyReturns.length > 0 ? dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length : 0;
  const variance = dailyReturns.length > 1
    ? dailyReturns.reduce((s, r) => s + (r - avgReturn) ** 2, 0) / (dailyReturns.length - 1)
    : 0;
  const stdReturn = Math.sqrt(variance);
  const sharpeRatio = stdReturn > 0 ? (avgReturn / stdReturn) * Math.sqrt(365) : 0;
  const negativeReturns = dailyReturns.filter((r) => r < 0);
  const downsideStd = negativeReturns.length > 1
    ? Math.sqrt(negativeReturns.reduce((s, r) => s + r * r, 0) / negativeReturns.length)
    : 0;
  const sortinoRatio = downsideStd > 0 ? (avgReturn / downsideStd) * Math.sqrt(365) : (avgReturn > 0 ? 999 : 0);

  const byDayTrades = new Map<string, typeof withPnl>();
  for (const o of withPnl) {
    const day = (o.close_time ?? o.open_time ?? '').slice(0, 10);
    if (!day) continue;
    const list = byDayTrades.get(day) ?? [];
    list.push(o);
    byDayTrades.set(day, list);
  }
  const byDay: Array<{ date: string; pnl: number; trades: number; wins: number; winRate: number }> = [];
  for (const [day, list] of Array.from(byDayTrades.entries()).sort((a, b) => a[0].localeCompare(b[0])).reverse().slice(0, 30)) {
    const dayPnl = list.reduce((s, o) => s + (o.pnl ?? 0), 0);
    const dayWins = list.filter((o) => (o.pnl ?? 0) > 0).length;
    byDay.push({
      date: day,
      pnl: Math.round(dayPnl * 100) / 100,
      trades: list.length,
      wins: dayWins,
      winRate: list.length > 0 ? (dayWins / list.length) * 100 : 0
    });
  }

  let totalHoldMs = 0;
  let holdCount = 0;
  for (const o of withPnl) {
    const openMs = new Date(o.open_time).getTime();
    const closeMs = o.close_time ? new Date(o.close_time).getTime() : 0;
    if (closeMs > openMs) {
      totalHoldMs += closeMs - openMs;
      holdCount++;
    }
  }
  const avgHoldTimeMinutes = holdCount > 0 ? Math.round(totalHoldMs / holdCount / 60000) : 0;

  // Корреляция по парам: PnL и количество сделок на пару
  const byPair = new Map<string, { pnl: number; trades: number }>();
  for (const o of withPnl) {
    const pair = o.pair || 'unknown';
    const cur = byPair.get(pair) ?? { pnl: 0, trades: 0 };
    cur.pnl += o.pnl ?? 0;
    cur.trades++;
    byPair.set(pair, cur);
  }
  const pairCorrelation = Array.from(byPair.entries())
    .map(([pair, v]) => ({ pair, pnl: Math.round(v.pnl * 100) / 100, trades: v.trades }))
    .sort((a, b) => b.pnl - a.pnl)
    .slice(0, 20);

  return {
    totalTrades,
    wins: wins.length,
    losses: losses.length,
    winRate,
    totalPnl,
    grossProfit,
    grossLoss,
    profitFactor,
    bestTrade,
    worstTrade,
    equityCurve,
    maxDrawdownUsdt: Math.round(maxDrawdownUsdt * 100) / 100,
    maxDrawdownPct: Math.round(maxDrawdownPct * 10) / 10,
    sharpeRatio: Math.round(sharpeRatio * 100) / 100,
    sortinoRatio: Math.round(sortinoRatio * 100) / 100,
    byDay,
    avgHoldTimeMinutes,
    pairCorrelation
  };
}

export function getAnalyticsForClient(clientId: string, limit = 500): AnalyticsResult {
  const orders = listOrders({ status: 'closed', limit: Math.min(limit, 5000), clientId });
  return computeAnalytics(orders, clientId);
}
