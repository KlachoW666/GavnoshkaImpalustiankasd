/**
 * Subscribes to WebSocket and shows toasts for BREAKOUT_ALERT and signal messages.
 * Uses useWebSocket + NotificationContext + settingsStore.
 */

import { useWebSocket } from './useWebSocket';
import { useNotifications } from '../contexts/NotificationContext';
import { useAuth } from '../contexts/AuthContext';
import { getSettings } from '../store/settingsStore';

export function useSignalToasts(): void {
  const { addToast } = useNotifications();
  const { token } = useAuth();

  useWebSocket({
    token,
    enabled: !!token,
    onMessage(data, type) {
      if (type === 'BREAKOUT_ALERT' && data && typeof data === 'object') {
        const d = data as { symbol?: string; breakout?: { direction?: string; confidence?: number } };
        const conf = ((d.breakout?.confidence ?? 0) * 100).toFixed(0);
        addToast({
          type: 'signal',
          title: `Пробой: ${d.symbol ?? '?'} — ${d.breakout?.direction ?? '?'}`,
          message: `Уверенность ${conf}%`,
          duration: 6000,
        });
        return;
      }
      if (type === 'signal' && data && typeof data === 'object') {
        const payload = data as {
          symbol?: string;
          direction?: string;
          confidence?: number;
          entry_price?: number;
          signal?: { symbol?: string; direction?: string; confidence?: number; entry_price?: number };
        };
        const s = payload.signal ?? payload;
        const conf = (s.confidence ?? 0) * 100;
        const cfg = getSettings().notifications;
        if (conf < (cfg?.minConfidence ?? 75)) return;
        if (s.direction === 'LONG' && !cfg?.long) return;
        if (s.direction === 'SHORT' && !cfg?.short) return;
        addToast({
          type: 'signal',
          title: `${s.symbol ?? '?'} — ${s.direction ?? '?'}`,
          message: `Вход: ${(s.entry_price ?? 0).toLocaleString('ru-RU')} • Уверенность: ${conf.toFixed(0)}%`,
          duration: 6000,
        });
        if (cfg?.sound) {
          try {
            const ac = new AudioContext();
            const o = ac.createOscillator();
            const g = ac.createGain();
            o.connect(g);
            g.connect(ac.destination);
            o.frequency.value = 880;
            g.gain.setValueAtTime(0.1, ac.currentTime);
            g.gain.exponentialRampToValueAtTime(0.01, ac.currentTime + 0.15);
            o.start(ac.currentTime);
            o.stop(ac.currentTime + 0.15);
          } catch {
            // ignore
          }
        }
        if (cfg?.desktop && 'Notification' in window && Notification.permission === 'granted') {
          new Notification(`${s.symbol ?? '?'} ${s.direction ?? '?'}`, {
            body: `Вход: ${(s.entry_price ?? 0).toLocaleString('ru-RU')} • ${conf.toFixed(0)}%`,
            icon: '/logo.png',
          });
        }
      }
    },
  });
}
