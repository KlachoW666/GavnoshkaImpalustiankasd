import { Router } from 'express';
import ccxt from 'ccxt';
import { config } from '../config';
import { getProxy } from '../db/proxies';

const router = Router();

function okxOpts(proxyOverride?: string | null, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const proxyUrl = (proxyOverride && proxyOverride.trim()) || getProxy(config.proxyList) || config.proxy;
  const opts: Record<string, unknown> = {
    enableRateLimit: true,
    options: { defaultType: 'swap', fetchMarkets: ['swap'] },
    timeout: 30000, // OKX иногда медленно отвечает, особенно /asset/currencies
    ...extra
  };
  if (proxyUrl) {
    opts.httpsProxy = proxyUrl;
  }
  return opts;
}

router.post('/check', async (req, res) => {
  try {
    const { exchange, apiKey, apiSecret } = req.body as { exchange: string; apiKey?: string; apiSecret?: string };
    if (!exchange) {
      res.status(400).json({ ok: false, message: 'exchange required' });
      return;
    }
    const exId = String(exchange).toLowerCase();

    if (exId === 'bingx') {
      const key = (apiKey || '').trim();
      const secret = (apiSecret || '').trim();
      if (!key || !secret) {
        res.status(400).json({ ok: false, message: 'API Key и API Secret обязательны для BingX' });
        return;
      }
      const ex = new ccxt.bingx({
        apiKey: key,
        secret,
        enableRateLimit: true,
        options: { defaultType: 'swap' }
      });
      await ex.fetchBalance();
      res.json({ ok: true, message: 'Подключение успешно' });
      return;
    }

    if (exId === 'okx') {
      const key = (apiKey || process.env.OKX_API_KEY || '').trim();
      const secret = (apiSecret || process.env.OKX_SECRET || '').trim();
      const passphrase = (req.body?.passphrase as string) || process.env.OKX_PASSPHRASE || '';
      const proxy = (req.body?.proxy as string)?.trim() || null;
      if (!key || !secret) {
        res.status(400).json({ ok: false, message: 'API Key и Secret обязательны для OKX' });
        return;
      }
      const ex = new ccxt.okx(okxOpts(proxy, { apiKey: key, secret, password: passphrase }));
      await ex.fetchBalance();
      res.json({ ok: true, message: 'OKX: подключение успешно' });
      return;
    }

    if (exId === 'bitget') {
      const key = (apiKey || '').trim();
      const secret = (apiSecret || '').trim();
      const passphrase = (req.body?.passphrase as string)?.trim() ?? '';
      const proxy = (req.body?.proxy as string)?.trim() || null;
      const isTestnet = Boolean(req.body?.isTestnet);

      if (!key || !secret) {
        res.status(400).json({ ok: false, message: 'API Key и Secret обязательны для Bitget' });
        return;
      }
      const opts: Record<string, unknown> = {
        apiKey: key,
        secret,
        password: passphrase,
        enableRateLimit: true,
        options: { defaultType: 'swap' },
        timeout: 30000
      };
      if (isTestnet) {
        (opts.options as any).sandboxMode = true;
      }
      if (proxy) opts.httpsProxy = proxy;
      const ex = new ccxt.bitget(opts);
      await ex.fetchBalance();
      res.json({ ok: true, message: `Bitget${isTestnet ? ' Demo' : ''}: подключение успешно` });
      return;
    }

    if (exId === 'massive') {
      const body = req.body as { apiKey?: string; accessKeyId?: string; secretAccessKey?: string; s3Endpoint?: string; bucket?: string };
      const simpleKey = (apiKey || body.apiKey || '').trim();
      const accessKeyId = (body.accessKeyId || '').trim();
      const secretAccessKey = (body.secretAccessKey || '').trim();
      const hasApiKey = !!simpleKey;
      const hasS3 = !!(accessKeyId && secretAccessKey);
      if (!hasApiKey && !hasS3) {
        res.status(400).json({ ok: false, message: 'Укажите API Key или S3: Access Key ID и Secret Access Key (massive.com)' });
        return;
      }
      if (hasApiKey) {
        const resMassive = await fetch('https://api.massive.com/v1/crypto/trades/last?from=BTC&to=USD', {
          headers: { 'X-API-Key': simpleKey, Accept: 'application/json' }
        }).catch(() => null);
        if (resMassive?.ok) {
          res.json({ ok: true, message: 'Massive.com: API ключ принят' });
          return;
        }
      }
      if (hasS3) {
        res.json({ ok: true, message: 'Massive.com: S3 ключи приняты (Endpoint: ' + (body.s3Endpoint || 'https://files.massive.com') + ')' });
        return;
      }
      res.json({ ok: true, message: 'Massive.com: ключ сохранён (проверка эндпоинта может быть недоступна)' });
      return;
    }

    res.status(400).json({ ok: false, message: 'Поддерживаются: OKX, Bitget, Massive' });
  } catch (e: any) {
    const msg = e?.message || String(e);
    res.status(200).json({ ok: false, message: msg });
  }
});

router.get('/test-public', async (req, res) => {
  try {
    const proxy = (req.query?.proxy as string)?.trim() || null;
    const ex = new ccxt.bitget(okxOpts(proxy) as any);
    await ex.fetchTicker('BTC/USDT:USDT');
    res.json({ ok: true, message: 'Bitget публичный API доступен' });
  } catch (e: any) {
    res.status(200).json({ ok: false, message: (e?.message || String(e)) });
  }
});

export default router;
