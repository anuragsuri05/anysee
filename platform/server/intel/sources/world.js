/** World news: wire-style RSS feeds and GDELT's global news index. */

import { fetchText } from '../http.js';
import { MINUTE, rssSource } from './common.js';

export const worldFeeds = [
  rssSource({
    id: 'bbc-world',
    name: 'BBC World',
    domain: 'world',
    urls: 'https://feeds.bbci.co.uk/news/world/rss.xml',
  }),
  rssSource({
    id: 'aljazeera',
    name: 'Al Jazeera',
    domain: 'world',
    urls: 'https://www.aljazeera.com/xml/rss/all.xml',
  }),
  rssSource({
    id: 'guardian-world',
    name: 'The Guardian',
    domain: 'world',
    urls: 'https://www.theguardian.com/world/rss',
  }),
  rssSource({
    id: 'dw-world',
    name: 'DW',
    domain: 'world',
    urls: 'https://rss.dw.com/rdf/rss-en-world',
  }),
  rssSource({
    id: 'npr-world',
    name: 'NPR',
    domain: 'world',
    urls: 'https://feeds.npr.org/1004/rss.xml',
  }),
  rssSource({
    id: 'france24',
    name: 'France 24',
    domain: 'world',
    urls: 'https://www.france24.com/en/rss',
  }),
  rssSource({
    id: 'un-sg',
    name: 'UN Secretary-General',
    domain: 'world',
    urls: 'https://www.un.org/sg/en/rss.xml',
    intervalMs: 30 * MINUTE,
    maxAgeMs: 10 * 24 * 60 * MINUTE,
  }),
];

// GDELT is queried one theme per run so the 5 s rate limit is never pressed.
const GDELT_THEMES = [
  {
    label: 'conflict',
    query:
      '(airstrike OR missile OR shelling OR "armed clashes" OR insurgents OR ceasefire)',
  },
  {
    label: 'unrest',
    query: '(protest OR riot OR coup OR "state of emergency" OR curfew)',
  },
  {
    label: 'cyber',
    query: '(ransomware OR cyberattack OR "data breach" OR "zero-day")',
  },
  {
    label: 'ai',
    query:
      '("artificial intelligence" OR "AI model" OR OpenAI OR Anthropic OR Nvidia)',
  },
];

function gdeltTime(seen) {
  // 20261025T101500Z
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(
    seen ?? '',
  );
  return match
    ? Date.UTC(match[1], match[2] - 1, match[3], match[4], match[5], match[6])
    : null;
}

let gdeltTurn = 0;
export const gdelt = {
  id: 'gdelt',
  name: 'GDELT 2.0 DOC',
  domain: 'world',
  kind: 'news',
  intervalMs: 4 * MINUTE,
  origin: 'api.gdeltproject.org',
  async fetch({ signal }) {
    const theme = GDELT_THEMES[gdeltTurn++ % GDELT_THEMES.length];
    const url =
      'https://api.gdeltproject.org/api/v2/doc/doc?format=json&mode=artlist&sort=datedesc' +
      `&maxrecords=75&timespan=3h&query=${encodeURIComponent(`${theme.query} sourcelang:english`)}`;
    const text = await fetchText(url, { signal, timeoutMs: 30_000 });
    // Over the limit, GDELT answers 200 with a plain-text notice.
    if (!text.trimStart().startsWith('{'))
      throw new Error('GDELT rate limited');
    const body = JSON.parse(text);
    return (body.articles ?? []).map((article) => ({
      title: article.title,
      url: article.url,
      summary: '',
      time: gdeltTime(article.seendate),
      publisher: article.domain,
      domain:
        theme.label === 'ai'
          ? 'ai'
          : theme.label === 'cyber'
            ? 'cyber'
            : 'world',
      tags: [`gdelt:${theme.label}`],
    }));
  },
};
