/**
 * Режим технического обслуживания: только группа admin имеет доступ к сайту.
 * Состояние хранится в файле для сохранения после перезапуска сервера.
 */

import * as fs from 'fs';
import * as path from 'path';

const FILENAME = 'maintenance.json';

function getDataDir(): string {
  const envDir = (process.env.DATA_DIR || '').trim();
  if (envDir) return path.join(envDir, 'data');
  return path.join(process.cwd(), 'data');
}

function getFilePath(): string {
  const dir = getDataDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, FILENAME);
}

export function getMaintenanceMode(): boolean {
  try {
    const filePath = getFilePath();
    if (!fs.existsSync(filePath)) return false;
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw) as { enabled?: boolean };
    return !!data.enabled;
  } catch {
    return false;
  }
}

export function setMaintenanceMode(enabled: boolean): void {
  const filePath = getFilePath();
  fs.writeFileSync(filePath, JSON.stringify({ enabled }, null, 2), 'utf-8');
}
