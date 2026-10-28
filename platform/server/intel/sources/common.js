/** Helpers shared by source connectors. */

import { fetchText } from '../http.js';
import { parseFeed } from '../rss.js';

export const MINUTE = 60_000;
// Search feeds return up to 100 entries; the newest carry the signal.
const PER_FEED_LIMIT = 60;

/** A source backed by one or more RSS/Atom feeds. */
export function rssSource({
  id,
  name,
  domain,
  kind = 'news',
  urls,
  intervalMs = 10 * MINUTE,
  maxAgeMs = 3 * 24 * 60 * MINUTE,
  map,
}) {
  const list = Array.isArray(urls) ? urls : [urls];
  return {
    id,
    name,
    domain,
    kind,
    intervalMs,
    origin: list.map((url) => new URL(url).host).join(', '),
    async fetch({ signal }) {
      const rows = [];
      const failures = [];
      for (const url of list) {
        try {
          const entries = parseFeed(await fetchText(url, { signal }))
            .sort((a, b) => (b.time ?? 0) - (a.time ?? 0))
            .slice(0, PER_FEED_LIMIT);
          for (const entry of entries)
            rows.push({ ...entry, publisher: entry.source || name });
        } catch (error) {
          failures.push(error);
        }
      }
      if (!rows.length && failures.length) throw failures[0];
      const now = Date.now();
      return rows
        .filter((row) => row.title && (!row.time || now - row.time < maxAgeMs))
        .map((row) => {
          const { raw, ...item } = row;
          return map ? map(item, raw) : item;
        })
        .filter(Boolean);
    },
  };
}

/** Google News appends " - Publisher" to titles; split it off. */
export function splitGoogleNewsTitle(item) {
  const match = item.title.match(/^(.*) - ([^-]{2,60})$/);
  if (!match) return item;
  return {
    ...item,
    title: match[1].trim(),
    publisher: match[2].trim(),
    summary: '',
  };
}

export function googleNewsUrl(query) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
}

const UNITS = { billion: 1e9, bn: 1e9, b: 1e9, million: 1e6, m: 1e6, mn: 1e6 };
const AMOUNT = String.raw`\$\s?(\d+(?:[.,]\d+)?)\s?(billion|bn|million|mn|m|b)\b(?!\s+(?:post-money\s+|pre-money\s+)?valuation)`;
const RAISE_VERBS = String.raw`raises?|raised|raising|secures?|secured|lands?|landed|closes?|closed|bags?|nabs?|wraps? up|seeks? to raise|in talks to raise|fundraising of`;
// A raise verb shortly before the amount, or a round noun right after it.
// Valuations ("at a $50B valuation", "cuts valuation by $150B") don't match.
const RAISE_BEFORE = new RegExp(
  String.raw`\b(${RAISE_VERBS})\b[^$]{0,30}` + AMOUNT,
  'i',
);
const ROUND_AFTER = new RegExp(
  AMOUNT +
    String.raw`\s+(seed|pre-seed|series [a-h]|funding|round|investment|raise|fundraise)`,
  'i',
);
// The capitalised words just before the verb name the company.
const COMPANY = new RegExp(
  String.raw`([A-Z][\w.&'-]*(?:\s+[A-Z][\w.&'-]*){0,4})\s+(?:${RAISE_VERBS}|is raising)\b`,
);

/** The amount of a funding round named in a headline, in USD, or null. */
export function parseUsdAmount(text) {
  const before = text.match(RAISE_BEFORE);
  const after = text.match(ROUND_AFTER);
  // The earlier phrase wins: "$15B raise, $70B valuation" is a $15B round.
  const useAfter = after && (!before || after.index < before.index);
  const [number, unitWord] = useAfter
    ? [after[1], after[2]]
    : before
      ? [before[2], before[3]]
      : [];
  if (!number) return null;
  const value = Number(number.replace(',', '.'));
  const unit = UNITS[unitWord.toLowerCase()];
  return Number.isFinite(value) && unit ? value * unit : null;
}

/** The company a funding headline is about: the last capitalised word before the raise verb. */
export function parseCompany(text) {
  // Headline case ("Legora Raises") would otherwise read as part of the name.
  const lowered = text.replace(
    new RegExp(String.raw`\b(${RAISE_VERBS})\b`, 'gi'),
    (verb) => verb.toLowerCase(),
  );
  const words = lowered.match(COMPANY)?.[1]?.split(/\s+/);
  return words ? words.at(-1).replace(/['’]s$/, '') : null;
}

export function parseRound(text) {
  return (
    text.match(/\b(pre-seed|seed|series [a-h]\+?|growth round|ipo)\b/i)?.[1] ??
    null
  );
}

export const daysAgoIso = (days) =>
  new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
