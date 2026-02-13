import { z } from 'zod';

export const autoAnalyzeStartSchema = z.object({
  symbols: z.union([z.array(z.string()), z.string()]).optional(),
  symbol: z.string().optional(),
  timeframe: z.string().optional(),
  mode: z.string().optional(),
  fullAuto: z.boolean().optional(),
  intervalMs: z.number().min(10000).max(300000).optional().catch(undefined),
  useScanner: z.boolean().optional(),
  executeOrders: z.boolean().optional(),
  useTestnet: z.boolean().optional(),
  maxPositions: z.number().min(1).max(10).optional().catch(undefined),
  sizePercent: z.number().min(1).max(50).optional().catch(undefined),
  leverage: z.number().min(1).max(125).optional().catch(undefined),
  tpMultiplier: z.number().min(0.5).max(1).optional().catch(undefined)
}).passthrough();

export type AutoAnalyzeStartBody = z.infer<typeof autoAnalyzeStartSchema>;
