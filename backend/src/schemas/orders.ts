import { z } from 'zod';

export const orderInsertSchema = z.object({
  id: z.string().min(1, 'id обязателен'),
  pair: z.string(),
  direction: z.enum(['LONG', 'SHORT']),
  size: z.number().min(0),
  leverage: z.number().min(1).max(125),
  openPrice: z.number().positive(),
  stopLoss: z.number().optional().nullable(),
  takeProfit: z.array(z.number()).optional().nullable(),
  openTime: z.string(),
  status: z.enum(['open', 'closed']).optional(),
  autoOpened: z.boolean().optional(),
  confidenceAtOpen: z.number().optional().nullable(),
  closePrice: z.number().optional(),
  pnl: z.number().optional(),
  pnlPercent: z.number().optional(),
  closeTime: z.string().optional()
});

export const orderCloseSchema = z.object({
  closePrice: z.number().finite(),
  pnl: z.number().optional(),
  pnlPercent: z.number().optional(),
  closeTime: z.string().optional()
});

export type OrderInsert = z.infer<typeof orderInsertSchema>;
export type OrderClose = z.infer<typeof orderCloseSchema>;
