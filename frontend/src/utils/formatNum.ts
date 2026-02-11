/** Формат числа с 4 знаками после запятой (0,0000) для показателей PnL, win/loss и т.д. */
export function formatNum4(n: number): string {
  return Number(n).toLocaleString('ru-RU', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

/** Со знаком: +0,0000 или -0,0000 */
export function formatNum4Signed(n: number): string {
  const s = formatNum4(Math.abs(n));
  return n >= 0 ? `+${s}` : `-${s}`;
}
