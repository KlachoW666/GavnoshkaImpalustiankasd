/**
 * Демо-статистика для отображения: растёт автоматически от даты «запуска» на сервере.
 * Не зависит от визитов пользователей. Настройки хранятся в БД (settings).
 */

import { getSetting, setSetting, SETTINGS_KEY_STATS_DISPLAY } from '../db';

export interface StatsDisplayConfig {
  enabled: boolean;
  /** Дата запуска (ISO или YYYY-MM-DD) — от неё считаются дни роста */
  launchDate: string;
  /** Прирост объёма заработанных ($) в день */
  volumePerDay: number;
  /** Прирост ордеров в день */
  ordersPerDay: number;
  /** Доля выигрышных среди прироста ордеров (0.5–0.7) */
  winRateShare: number;
  /** Прирост пользователей в день */
  usersPerDay: number;
  /** Прирост онлайна (доп. к реальному) — макс. значение */
  onlineAddMax: number;
  /** Прирост сигналов в день (для «за сессию» показываем как базу + рост по часам) */
  signalsPerDay: number;
}

const DEFAULT_CONFIG: StatsDisplayConfig = {
  enabled: true,
  launchDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  volumePerDay: 18,
  ordersPerDay: 12,
  winRateShare: 0.56,
  usersPerDay: 2.5,
  onlineAddMax: 4,
  signalsPerDay: 45
};

function parseConfig(raw: string | null): StatsDisplayConfig {
  if (!raw) return { ...DEFAULT_CONFIG };
  try {
    const parsed = JSON.parse(raw) as Partial<StatsDisplayConfig>;
    return {
      enabled: parsed.enabled ?? DEFAULT_CONFIG.enabled,
      launchDate: parsed.launchDate ?? DEFAULT_CONFIG.launchDate,
      volumePerDay: Number(parsed.volumePerDay) || DEFAULT_CONFIG.volumePerDay,
      ordersPerDay: Number(parsed.ordersPerDay) || DEFAULT_CONFIG.ordersPerDay,
      winRateShare: Math.max(0.4, Math.min(0.8, Number(parsed.winRateShare) || DEFAULT_CONFIG.winRateShare)),
      usersPerDay: Number(parsed.usersPerDay) || DEFAULT_CONFIG.usersPerDay,
      onlineAddMax: Math.max(0, Math.min(20, Number(parsed.onlineAddMax) ?? DEFAULT_CONFIG.onlineAddMax)),
      signalsPerDay: Number(parsed.signalsPerDay) || DEFAULT_CONFIG.signalsPerDay
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

  const addVolume = days * cfg.volumePerDay + (hoursToday / 24) * cfg.volumePerDay;
  const addOrders = Math.floor(days * cfg.ordersPerDay + (hoursToday / 24) * cfg.ordersPerDay);
  const addWins = Math.floor(addOrders * cfg.winRateShare);
  const addLosses = Math.max(0, addOrders - addWins);
  const addUsers = Math.floor(days * cfg.usersPerDay + (hoursToday / 24) * cfg.usersPerDay);
  const addOnline = Math.min(cfg.onlineAddMax, Math.floor(hoursToday * 0.15) + 1);
  const addSignals = Math.floor(days * cfg.signalsPerDay + (hoursToday / 24) * cfg.signalsPerDay);

  const volumeEarned = real.volumeEarned + addVolume;
  const ordersTotal = real.orders.total + addOrders;
  const ordersWins = real.orders.wins + addWins;
  const ordersLosses = real.orders.losses + addLosses;
  const ordersWinRate = ordersTotal > 0 ? (ordersWins / ordersTotal) * 100 : real.orders.winRate;
  const usersCount = Math.max(real.usersCount, real.usersCount + addUsers);
  const onlineUsersCount = real.onlineUsersCount + addOnline;
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
