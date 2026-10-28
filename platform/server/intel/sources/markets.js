/**
 * Market radar: daily moves for broad indices, macro gauges and AI-exposed
 * equities. Returns quotes as source data, plus an item for unusual moves.
 */

import { fetchJson } from '../http.js';
import { MINUTE } from './common.js';

export const WATCHLIST = [
  { symbol: '^GSPC', label: 'S&P 500', group: 'index' },
  { symbol: '^IXIC', label: 'Nasdaq', group: 'index' },
  { symbol: '^VIX', label: 'VIX', group: 'macro' },
  { symbol: 'CL=F', label: 'WTI crude', group: 'macro' },
  { symbol: 'GC=F', label: 'Gold', group: 'macro' },
  { symbol: 'BTC-USD', label: 'Bitcoin', group: 'macro' },
  { symbol: 'NVDA', label: 'Nvidia', group: 'ai', org: 'org:nvidia' },
  { symbol: 'MSFT', label: 'Microsoft', group: 'ai', org: 'org:microsoft' },
  { symbol: 'GOOGL', label: 'Alphabet', group: 'ai', org: 'org:google' },
  { symbol: 'META', label: 'Meta', group: 'ai', org: 'org:meta' },
  { symbol: 'AMZN', label: 'Amazon', group: 'ai', org: 'org:amazon' },
  { symbol: 'AAPL', label: 'Apple', group: 'ai', org: 'org:apple' },
  { symbol: 'AMD', label: 'AMD', group: 'ai', org: 'org:amd' },
  { symbol: 'TSM', label: 'TSMC', group: 'ai', org: 'org:tsmc' },
  { symbol: 'AVGO', label: 'Broadcom', group: 'ai', org: 'org:broadcom' },
  { symbol: 'PLTR', label: 'Palantir', group: 'ai', org: 'org:palantir' },
  { symbol: 'ORCL', label: 'Oracle', group: 'ai', org: 'org:oracle' },
  { symbol: 'CRWV', label: 'CoreWeave', group: 'ai', org: 'org:coreweave' },
];

const MOVE_THRESHOLD = { index: 2.5, macro: 5, ai: 7 };

export const markets = {
  id: 'markets',
  name: 'Market radar (Yahoo Finance)',
  domain: 'markets',
  kind: 'quote',
  intervalMs: 10 * MINUTE,
  origin: 'query2.finance.yahoo.com',
  async fetch({ signal }) {
    const quotes = [];
    for (const entry of WATCHLIST) {
      try {
        const body = await fetchJson(
          `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(entry.symbol)}?range=1mo&interval=1d`,
          { signal },
        );
        const result = body.chart?.result?.[0];
        const closes = (result?.indicators?.quote?.[0]?.close ?? []).filter(
          Number.isFinite,
        );
        const price = result?.meta?.regularMarketPrice ?? closes.at(-1);
        const previous =
          result?.meta?.chartPreviousClose && closes.length < 2
            ? result.meta.chartPreviousClose
            : closes.at(-2);
        if (!Number.isFinite(price)) continue;
        quotes.push({
          ...entry,
          price,
          changePct:
            Number.isFinite(previous) && previous
              ? ((price - previous) / previous) * 100
              : null,
          spark: closes.slice(-22),
          time: (result?.meta?.regularMarketTime ?? 0) * 1000 || Date.now(),
        });
      } catch (error) {
        if (signal?.aborted) throw error;
      }
    }
    if (!quotes.length) throw new Error('No quotes returned');
    const items = quotes
      .filter(
        (quote) =>
          Math.abs(quote.changePct ?? 0) >= MOVE_THRESHOLD[quote.group],
      )
      .map((quote) => ({
        title: `${quote.label} ${quote.changePct > 0 ? 'jumps' : 'falls'} ${Math.abs(quote.changePct).toFixed(1)}%`,
        url: `https://finance.yahoo.com/quote/${encodeURIComponent(quote.symbol)}`,
        summary: `${quote.symbol} at ${quote.price.toFixed(2)}.`,
        time: quote.time,
        publisher: 'Market radar',
        kind: 'event',
        entityHints: quote.org ? [quote.org] : [],
        metrics: {
          changePct: quote.changePct,
          symbol: quote.symbol,
          group: quote.group,
        },
        // One item per symbol per day.
        idKey: `${quote.symbol}:${new Date(quote.time).toISOString().slice(0, 10)}`,
      }));
    return { items, data: { quotes, updatedAt: Date.now() } };
  },
};
