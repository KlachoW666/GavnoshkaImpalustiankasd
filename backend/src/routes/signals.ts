import { Router } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { TradingSignal } from '../types/signal';

const router = Router();
const MAX_SIGNALS = 200;

function getDataDir(): string {
  if (process.env.DATA_DIR) return path.join(process.env.DATA_DIR, 'data');
  try {
    if (typeof process !== 'undefined' && (process as NodeJS.Process & { versions?: { electron?: string } }).versions?.electron) {
      const { app } = require('electron');
      return path.join(app.getPath('userData'), 'data');
    }
  } catch {}
  return path.join(process.cwd(), 'data');
}

function getSignalsPath(): string {
  return path.join(getDataDir(), 'signals.json');
}

function loadSignals(): TradingSignal[] {
  try {
    const p = getSignalsPath();
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, 'utf-8');
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    }
  } catch (e) {
    console.error('loadSignals error:', e);
  }
  return [];
}

function saveSignals(arr: TradingSignal[]): void {
  try {
    const dir = getDataDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(getSignalsPath(), JSON.stringify(arr, null, 2), 'utf-8');
  } catch (e) {
    console.error('saveSignals error:', e);
  }
}

let signalsStore: TradingSignal[] = loadSignals();

export function addSignal(signal: TradingSignal) {
  if (signalsStore.some((s) => s.id === signal.id)) return;
  signalsStore.unshift(signal);
  if (signalsStore.length > MAX_SIGNALS) signalsStore = signalsStore.slice(0, MAX_SIGNALS);
  saveSignals(signalsStore);
}

export function getSignals(limit = 50): TradingSignal[] {
  return signalsStore.slice(0, limit);
}

router.get('/', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
  res.json(getSignals(limit));
});

router.get('/:id', (req, res) => {
  const s = signalsStore.find(x => x.id === req.params.id);
  if (!s) return res.status(404).json({ error: 'Signal not found' });
  res.json(s);
});

export default router;
