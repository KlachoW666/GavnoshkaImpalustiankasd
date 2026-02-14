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
  maxPositions: z.number().min(1).max(20).optional().catch(undefined),
  sizePercent: z.number().min(1).max(50).optional().catch(undefined),
  /** Режим размера: percent | risk. risk = по стопу (размер из riskPct баланса) */
  sizeMode: z.enum(['percent', 'risk']).optional().catch(undefined),
  /** Риск на сделку 0.01–0.03 при sizeMode=risk */
  riskPct: z.number().min(0.01).max(0.03).optional().catch(undefined),
  leverage: z.number().min(1).max(125).optional().catch(undefined),
  tpMultiplier: z.number().min(0.5).max(1).optional().catch(undefined),
  /** AI-фильтр: мин. вероятность выигрыша (0–1). 0 = выкл. Ордер не открывается, если ML-оценка ниже порога. */
  minAiProb: z.number().min(0).max(1).optional().catch(undefined),
  /** Мин. уверенность (0.5–0.95) для Manual+execute — ордер не откроется ниже порога */
  minConfidence: z.number().min(0.5).max(0.95).optional().catch(undefined)
}).passthrough();

export type AutoAnalyzeStartBody = z.infer<typeof autoAnalyzeStartSchema>;
