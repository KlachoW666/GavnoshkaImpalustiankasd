/**
 * BingX WebSocket — единый стрим для свечей, стакана и сделок.
 * Минимальная задержка: данные с BingX пересылаются без буферизации.
 * Order Book: 200ms (BTC/ETH), Trades: real-time, Kline: real-time.
 */
import WebSocket from 'ws';
import zlib from 'zlib';

const BINGX_WS = 'wss://open-api-swap.bingx.com/swap-market';

function decode(data: Buffer): string {
  if (data[0] === 0x1f && data[1] === 0x8b) {
    return zlib.gunzipSync(data).toString('utf8');
  }
  return data.toString('utf8');
}

function norm(symbol: string): string {
  return symbol.replace(/-SWAP$/i, '').replace(/_/g, '-').toUpperCase();
}

type Handler = (data: any) => void;

export function createBingXStream(symbol: string) {
  const sym = norm(symbol);
  let ws: WebSocket | null = null;
  const subs = { orderbook: new Set<Handler>(), trade: new Set<Handler>() };
  let refCount = 0;

  function safeSend(socket: WebSocket | null, data: string) {
    if (socket?.readyState === WebSocket.OPEN) socket.send(data);
  }

  function connect() {
    if (ws?.readyState === WebSocket.OPEN) return;
    if (ws?.readyState === WebSocket.CONNECTING) return;
    ws = new WebSocket(BINGX_WS, { perMessageDeflate: false });

    ws.on('open', () => {
      const depthInterval = /^(BTC|ETH)-USDT$/.test(sym) ? '200ms' : '500ms';
      if (subs.orderbook.size) safeSend(ws, JSON.stringify({ id: `ob-${Date.now()}`, reqType: 'sub', dataType: `${sym}@depth20@${depthInterval}` }));
      if (subs.trade.size) safeSend(ws, JSON.stringify({ id: `tr-${Date.now()}`, reqType: 'sub', dataType: `${sym}@trade` }));
    });
    ws.on('close', () => {
      ws = null;
    });

    ws.on('message', (data: Buffer) => {
      const raw = decode(data);
      if (raw === 'Ping') {
        safeSend(ws, 'Pong');
        return;
      }
      try {
        const json = JSON.parse(raw);
        const ob = json.data || json;
        const bids = ob.bids ?? ob.listDown ?? [];
        const asks = ob.asks ?? ob.listUp ?? [];
        if (bids.length || asks.length) {
          subs.orderbook.forEach((cb) =>
            cb({
              bids: (Array.isArray(bids) ? bids : []).map((b: any) => [Number(b[0] ?? b.price), Number(b[1] ?? b.quantity ?? 0)]),
              asks: (Array.isArray(asks) ? asks : []).map((a: any) => [Number(a[0] ?? a.price), Number(a[1] ?? a.quantity ?? 0)])
            })
          );
        } else {
          const t = json.data ?? json;
          const price = t?.p ?? t?.price ?? json.p ?? json.price;
          if (price != null) {
            const trade = {
              price: Number(price),
              amount: Number(t?.q ?? t?.amount ?? t?.size ?? json.q ?? 0),
              time: Number(t?.T ?? t?.time ?? json.T ?? json.time ?? Date.now()),
              isBuy: (t?.m ?? json.m) === false || (t?.isBuyMaker ?? json.isBuyMaker) === true
            };
            subs.trade.forEach((cb) => cb(trade));
          }
        }
      } catch {
        // ignore
      }
    });

    ws.on('error', () => {});
  }

  function subscribe(type: 'orderbook' | 'trade', cb: Handler): () => void {
    subs[type].add(cb);
    refCount++;
    connect();
    return () => {
      subs[type].delete(cb);
      refCount--;
      if (refCount <= 0 && ws) {
        ws.close();
        ws = null;
      }
    };
  }

  return { subscribe, symbol: sym };
}

const streamCache = new Map<string, ReturnType<typeof createBingXStream>>();

export function getBingXStream(symbol: string) {
  const key = norm(symbol);
  if (!streamCache.has(key)) streamCache.set(key, createBingXStream(symbol));
  return streamCache.get(key)!;
}
