// Using native Node 18 fetch, or undici if strictly required.
import { logger } from '../lib/logger';
import { config } from '../config';
import { TtlCache } from '../lib/ttlCache';

/**
 * CoinGlass API Integration for Sniper Mode.
 * We use Personal tier (30 requests/minute).
 * 
 * Strategy:
 * - Global Funding Rate is fetched and cached (TTL: 5 mins).
 * - Symbol specific data (Long/Short ratio, Liquidations) is fetched ONLY when a coin passes local MLFS filters.
 */

const { apiKey, baseUrl } = config.coinglass;

// Cached global funding rate
const fundingCache = new TtlCache<number>(300_000); // 5 minutes

export interface CoinGlassSentiment {
    longShortRatio: number;
    longVolUsd: number;
    shortVolUsd: number;
    fundingRate: number; // For the specific symbol
}

const headers = {
    accept: 'application/json',
    coinglassSecret: apiKey
};

/**
 * Fetches the global funding heatmap or average to determine market sentiment.
 * Currently returns a mock global funding rate if the API restricts global endpoints,
 * or fetches the specific symbol funding rate to decide.
 * Returns positive for bullish (over-leveraged long), negative for bearish (over-leveraged short).
 */
export async function getGlobalFundingRate(): Promise<number> {
    if (!apiKey) return 0;

    const cached = fundingCache.get('global_funding');
    if (cached !== undefined) return cached;

    try {
        // Note: Since getting global funding might require a different endpoint or premium tier,
        // we use BTC funding rate as a proxy for global sentiment in the free/personal tier.
        const res = await fetch(`${baseUrl}/funding?ex=Binance&symbol=BTCUSDT`, { headers });
        if (!res.ok) {
            throw new Error(`CoinGlass API error: ${res.statusText}`);
        }
        const data = await res.json() as any;

        if (data.success && data.data && data.data.length > 0) {
            // Typically data is an array of funding info
            const rate = data.data[0].fundingRate || data.data[0].uMarginFundingRate || 0;
            fundingCache.set('global_funding', rate);
            return rate;
        }

        return 0;
    } catch (err) {
        logger.warn('CoinGlass', 'Failed to fetch global funding rate', { error: (err as Error).message });
        return 0; // Default to neutral on error
    }
}

/**
 * Fetches the Long/Short ratio for a specific symbol on Binance/OKX.
 * ONLY CALL THIS FOR HIGH CONFIDENCE SIGNALS to preserve rate limits.
 * 
 * symbol looks like "BTC-USDT" or "BTC/USDT", needs mapping for CoinGlass.
 */
export async function getSymbolSentiment(symbol: string): Promise<CoinGlassSentiment | null> {
    if (!apiKey) return null;

    // Map "BTC/USDT:USDT" or "BTC-USDT" to "BTC"
    const baseSymbol = symbol.split(/[\/-]/)[0].toUpperCase();

    try {
        // 1. Fetch Long/Short Ratio (using binance accounts account ratio as proxy for sentiment)
        // timeframe: h1 or m15
        const lsRes = await fetch(`${baseUrl}/long_short?time_type=h1&symbol=${baseSymbol}`, { headers });
        let longShortRatio = 1;

        if (lsRes.ok) {
            const lsData = await lsRes.json() as any;
            if (lsData.success && lsData.data && lsData.data.length > 0) {
                // Select Binance by default
                const binanceData = lsData.data.find((d: any) => d.exchangeName === 'Binance') || lsData.data[0];
                longShortRatio = binanceData.longShortRatio || (binanceData.longRate / binanceData.shortRate) || 1;
            }
        } else {
            logger.warn('CoinGlass', `Failed to fetch L/S ratio for ${baseSymbol}`);
        }

        // 2. Fetch specific funding rate (proxy)
        const fhRes = await fetch(`${baseUrl}/funding?ex=Binance&symbol=${baseSymbol}USDT`, { headers });
        let fundingRate = 0;

        if (fhRes.ok) {
            const fhData = await fhRes.json() as any;
            if (fhData.success && fhData.data && fhData.data.length > 0) {
                fundingRate = fhData.data[0].fundingRate || fhData.data[0].uMarginFundingRate || 0;
            }
        }

        return {
            longShortRatio,
            longVolUsd: 0, // Placeholder if liquidation data not pulled
            shortVolUsd: 0,
            fundingRate
        };

    } catch (err) {
        logger.warn('CoinGlass', `Failed to fetch sentiment for ${baseSymbol}`, { error: (err as Error).message });
        return null;
    }
}
