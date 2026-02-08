import { Router } from 'express';

const router = Router();

router.post('/telegram', async (req, res) => {
  try {
    const { botToken, chatId, message } = req.body as { botToken?: string; chatId?: string; message?: string };
    if (!botToken?.trim() || !chatId?.trim() || !message?.trim()) {
      res.status(400).json({ ok: false, error: 'botToken, chatId and message required' });
      return;
    }
    const url = `https://api.telegram.org/bot${botToken.trim()}/sendMessage`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId.trim(),
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    });
    const data = (await resp.json().catch(() => ({}))) as { ok?: boolean; description?: string };
    if (!data?.ok) {
      let err = data?.description || 'Telegram API error';
      if (err.includes('bots can\'t send messages to bots')) {
        err = 'Chat ID должен быть вашим личным ID или ID группы. Напишите боту /start и используйте @userinfobot для получения своего ID.';
      }
      res.status(200).json({ ok: false, error: err });
      return;
    }
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || 'Request failed' });
  }
});

export default router;
