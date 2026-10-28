/** Cyber and Markets views. */

import { h } from '../dom.js';
import { empty, itemList, panel } from './common.js';
import { marketsStrip } from './overview.js';

export async function renderCyber(container, ctx) {
  const kev = panel(
    {
      title: 'Actively exploited vulnerabilities',
      note: 'CISA KEV · 30 days',
      span: 'span-6',
      bodyClass: 'tall',
    },
    empty('Loading…'),
  );
  const news = panel(
    {
      title: 'Security reporting',
      note: 'news + GDELT',
      span: 'span-6',
      bodyClass: 'tall',
    },
    empty('Loading…'),
  );
  container.replaceChildren(h('div', { class: 'ax-grid' }, kev, news));
  const open = (item) => ctx.openItem(item.id);
  const [vulns, stories] = await Promise.all([
    ctx.api.feed({ domain: 'cyber', kind: 'vulnerability', limit: 60 }),
    ctx.api.feed({ domain: 'cyber', kind: 'news', limit: 80 }),
  ]);
  kev
    .querySelector('.ax-panel-body')
    .replaceChildren(itemList(vulns.items, open, { showDomain: false }));
  news
    .querySelector('.ax-panel-body')
    .replaceChildren(itemList(stories.items, open, { showDomain: false }));
}

export async function renderMarkets(container, ctx) {
  const events = panel(
    {
      title: 'Unusual moves',
      note: 'index ≥2.5% · macro ≥5% · AI equities ≥7%',
      span: 'span-6',
      bodyClass: 'scroll',
    },
    empty('Loading…'),
  );
  const economy = panel(
    {
      title: 'Economy & energy reporting',
      note: '24h',
      span: 'span-6',
      bodyClass: 'scroll',
    },
    empty('Loading…'),
  );
  container.replaceChildren(
    h('div', { class: 'ax-grid' }, marketsStrip(ctx), events, economy),
  );
  const open = (item) => ctx.openItem(item.id);
  const since = Date.now() - 24 * 3_600_000;
  const [moves, econ, energy] = await Promise.all([
    ctx.api.feed({ domain: 'markets', limit: 40 }),
    ctx.api.feed({ entity: 'topic:economy', since, limit: 30 }),
    ctx.api.feed({ entity: 'topic:energy', since, limit: 20 }),
  ]);
  events
    .querySelector('.ax-panel-body')
    .replaceChildren(
      itemList(moves.items, open, { emptyText: 'No unusual moves today.' }),
    );
  const merged = [...econ.items, ...energy.items]
    .filter(
      (item, index, all) =>
        all.findIndex((other) => other.id === item.id) === index,
    )
    .sort((a, b) => (b.time ?? b.firstSeen) - (a.time ?? a.firstSeen));
  economy
    .querySelector('.ax-panel-body')
    .replaceChildren(itemList(merged, open));
}
