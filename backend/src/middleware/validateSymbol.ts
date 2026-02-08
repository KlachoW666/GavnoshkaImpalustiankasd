import { Request, Response, NextFunction } from 'express';
import { isValidSymbol, normalizeSymbol } from '../lib/symbol';

/**
 * Validates symbol param and attaches normalized value.
 */
export function validateSymbolParam(paramName = 'symbol') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const raw = req.params[paramName] ?? req.query[paramName];
    const symbol = typeof raw === 'string' ? decodeURIComponent(raw).replace(/_/g, '-') : '';

    if (!symbol) {
      res.status(400).json({ error: `Missing or invalid ${paramName}` });
      return;
    }

    const normalized = normalizeSymbol(symbol);
    if (!isValidSymbol(normalized)) {
      res.status(400).json({ error: `Invalid symbol format: ${symbol}. Use format like BTC-USDT` });
      return;
    }

    (req as any).symbol = normalized;
    next();
  };
}
