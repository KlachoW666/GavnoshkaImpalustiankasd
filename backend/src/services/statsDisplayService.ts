/**
 * Демо-статистика для отображения: растёт автоматически от даты «запуска» на сервере.
 * Не зависит от визитов пользователей. Настройки хранятся в БД (settings).
 */

import { getSetting, setSetting, SETTINGS_KEY_STATS_DISPLAY } from '../db';

export interface StatsDisplayConfig {
  enabled: boolean;
  /** Дата запуска (ISO или YYYY-MM-DD) — от неё считаются дни роста */
  launchDate: string;
  /** Прирост объёма ($) в день — от (или единственное значение) */
  volumePerDay: number;
  /** Прирост объёма ($) в день — до (если задано, берётся случайное в [volumePerDay, volumePerDayTo] за день) */
  volumePerDayTo?: number;
  /** Прирост ордеров в день — от */
  ordersPerDay: number;
  ordersPerDayTo?: number;
  /** Доля выигрышных ордеров (0.4–0.8) — от */
  winRateShare: number;
  winRateShareTo?: number;
  /** Прирост пользователей в день — от */
  usersPerDay: number;
  usersPerDayTo?: number;
  /** Прирост сигналов в день — от */
  signalsPerDay: number;
  signalsPerDayTo?: number;
  /** @deprecated Онлайн теперь считается как 75% от числа пользователей */
  onlineAddMax?: number;
}

const DEFAULT_CONFIG: StatsDisplayConfig = {
  enabled: true,
  launchDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  volumePerDay: 18,
  ordersPerDay: 12,
  winRateShare: 0.56,
  usersPerDay: 2.5,
  signalsPerDay: 45
};

function parseConfig(raw: string | null): StatsDisplayConfig {
  if (!raw) return { ...DEFAULT_CONFIG };
  try {
    const parsed = JSON.parse(raw) as Partial<StatsDisplayConfig>;
    const vol = Number(parsed.volumePerDay) || DEFAULT_CONFIG.volumePerDay;
    const ord = Number(parsed.ordersPerDay) || DEFAULT_CONFIG.ordersPerDay;
    const win = Math.max(0.4, Math.min(0.8, Number(parsed.winRateShare) || DEFAULT_CONFIG.winRateShare));
    const usr = Number(parsed.usersPerDay) || DEFAULT_CONFIG.usersPerDay;
    const sig = Number(parsed.signalsPerDay) || DEFAULT_CONFIG.signalsPerDay;
    return {
      enabled: parsed.enabled ?? DEFAULT_CONFIG.enabled,
      launchDate: parsed.launchDate ?? DEFAULT_CONFIG.launchDate,
      volumePerDay: vol,
      volumePerDayTo: parsed.volumePerDayTo != null ? Number(parsed.volumePerDayTo) : undefined,
      ordersPerDay: ord,
      ordersPerDayTo: parsed.ordersPerDayTo != null ? Number(parsed.ordersPerDayTo) : undefined,
      winRateShare: win,
      winRateShareTo: parsed.winRateShareTo != null ? Math.max(0.4, Math.min(0.8, Number(parsed.winRateShareTo))) : undefined,
      usersPerDay: usr,
      usersPerDayTo: parsed.usersPerDayTo != null ? Number(parsed.usersPerDayTo) : undefined,
      signalsPerDay: sig,
      signalsPerDayTo: parsed.signalsPerDayTo != null ? Number(parsed.signalsPerDayTo) : undefined
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function getStatsDisplayConfig(): StatsDisplayConfig {
  const raw = getSetting(SETTINGS_KEY_STATS_DISPLAY);
  return parseConfig(raw);
}

export function setStatsDisplayConfig(config: Partial<StatsDisplayConfig>): StatsDisplayConfig {
  const current = getStatsDisplayConfig();
  const next: StatsDisplayConfig = { ...current, ...config };
  setSetting(SETTINGS_KEY_STATS_DISPLAY, JSON.stringify(next));
  return next;
}

/** Дней с полуночи launchDate до текущей полуночи (серверное время) */
function getDaysSinceLaunch(launchDate: string): number {
  const launch = new Date(launchDate.slice(0, 10));
  const now = new Date();
  launch.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  const ms = now.getTime() - launch.getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

/** Часов с полуночи сегодня (для плавного роста в течение дня) */
function getHoursToday(): number {
  const now = new Date();
  return now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
}

/** Детерминированное псевдо-случайное [0, 1) по seed (один и тот же день — одно значение) */
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9999) * 10000;
  return x - Math.floor(x);
}

/** Значение за день: если задан to >= from — случайное в [from, to], иначе from */
function getDayValue(from: number, to: number | undefined, daySeed: number): number {
  if (to != null && to >= from) {
    return from + seededRandom(daySeed) * (to - from);
  }
  return from;
}

export interface RealStats {
  orders: { total: number; wins: number; losses: number; winRate: number };
  usersCount: number;
  onlineUsersCount: number;
  volumeEarned: number;
}

export interface DisplayStats {
  volumeEarned: number;
  ordersTotal: number;
  ordersWins: number;
  ordersLosses: number;
  ordersWinRate: number;
  usersCount: number;
  onlineUsersCount: number;
  signalsCount: number;
}

/**
 * Вычислить отображаемую статистику: реальная + прирост от времени (независимо от визитов).
 */
export function computeDisplayStats(
  real: RealStats,
  realSignalsCount: number,
  config?: StatsDisplayConfig | null
): DisplayStats {
  const cfg = config ?? getStatsDisplayConfig();
  if (!cfg.enabled) {
    return {
      volumeEarned: real.volumeEarned,
      ordersTotal: real.orders.total,
      ordersWins: real.orders.wins,
      ordersLosses: real.orders.losses,
      ordersWinRate: real.orders.winRate,
      usersCount: real.usersCount,
      onlineUsersCount: real.onlineUsersCount,
      signalsCount: realSignalsCount
    };
  }

  const days = getDaysSinceLaunch(cfg.launchDate);
  const hoursToday = getHoursToday();
  const daySeed = days * 1000; // разный seed для каждого поля ниже

  const volPerDay = getDayValue(cfg.volumePerDay, cfg.volumePerDayTo, daySeed + 1);
  const ordPerDay = getDayValue(cfg.ordersPerDay, cfg.ordersPerDayTo, daySeed + 2);
  const usrPerDay = getDayValue(cfg.usersPerDay, cfg.usersPerDayTo, daySeed + 3);
  const sigPerDay = getDayValue(cfg.signalsPerDay, cfg.signalsPerDayTo, daySeed + 4);
  const winShare = getDayValue(cfg.winRateShare, cfg.winRateShareTo, daySeed + 5);

  const addVolume = days * volPerDay + (hoursToday / 24) * volPerDay;
  const addOrders = Math.floor(days * ordPerDay + (hoursToday / 24) * ordPerDay);
  const addWins = Math.floor(addOrders * winShare);
  const addLosses = Math.max(0, addOrders - addWins);
  const addUsers = Math.floor(days * usrPerDay + (hoursToday / 24) * usrPerDay);
  const addSignals = Math.floor(days * sigPerDay + (hoursToday / 24) * sigPerDay);

  const volumeEarned = real.volumeEarned + addVolume;
  const ordersTotal = real.orders.total + addOrders;
  const ordersWins = real.orders.wins + addWins;
  const ordersLosses = real.orders.losses + addLosses;
  const ordersWinRate = ordersTotal > 0 ? (ordersWins / ordersTotal) * 100 : real.orders.winRate;
  const usersCount = Math.max(real.usersCount, real.usersCount + addUsers);
  /** Онлайн = 75% от числа пользователей (на 25% меньше) */
  const onlineUsersCount = Math.floor(usersCount * 0.75);
  const signalsCount = realSignalsCount + addSignals;

  return {
    volumeEarned,
    ordersTotal,
    ordersWins,
    ordersLosses,
    ordersWinRate,
    usersCount,
    onlineUsersCount,
    signalsCount
  };
}
