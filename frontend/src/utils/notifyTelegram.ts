import { getSettings } from '../store/settingsStore';

const API = typeof window !== 'undefined' ? (window.location.origin || '') + '/api' : '/api';

export function notifyTelegram(message: string) {
  const { notifications } = getSettings();
  const tg = notifications?.telegram;
  if (!tg?.enabled || !tg.botToken?.trim() || !tg.chatId?.trim()) return;
  fetch(`${API}/notify/telegram`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      botToken: tg.botToken,
      chatId: tg.chatId,
      message
    })
  }).catch(() => {});
}
