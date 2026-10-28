/**
 * AI sector: lab and industry news, funding, models, research, open source,
 * policy and which organisations are gaining attention.
 */

import { h, usd, compact } from '../dom.js';
import { empty, itemList, kpi, panel } from './common.js';

export async function renderAi(container, ctx) {
  const pulse = ctx.state.pulse;
  if (!pulse) {
    container.replaceChildren(empty());
    return;
  }
  const open = (item) => ctx.openItem(item.id);
  const news = panel(
    {
      title: 'Labs & industry',
      note: 'newest',
      span: 'span-6',
      bodyClass: 'tall',
    },
    empty('Loading…'),
  );
  const c = pulse.counts;
  container.replaceChildren(
    h(
      'div',
      { class: 'ax-grid' },
      h(
        'div',
        { class: 'span-12 ax-kpis', style: { marginBottom: 0 } },
        kpi('AI items 24h', c.items24h),
        kpi('Announcements', c.announcements),
        kpi('Funding rounds 3d', c.funding3d, usd(c.fundingTotalUsd3d)),
        kpi('Papers today', c.papers),
        kpi('Models tracked', c.models),
        kpi('Rising repos', c.repos),
        kpi('Policy items 3d', c.policy),
      ),
      news,
      panel(
        {
          title: 'Funding rounds',
          note: '3 days · largest first',
          span: 'span-6',
          bodyClass: 'tall',
        },
        itemList(pulse.funding, open, {
          showDomain: false,
          emptyText: 'No rounds with a stated amount yet.',
        }),
      ),
      panel(
        {
          title: 'Attention leaderboard',
          note: 'mentions 24h · Δ vs prior day',
          span: 'span-4',
          bodyClass: 'scroll',
        },
        pulse.organizations.length
          ? [
              h(
                'div',
                {
                  class: 'ax-org',
                  style: {
                    cursor: 'default',
                    color: 'var(--ax-muted)',
                    fontSize: '10px',
                  },
                },
                h('span', {}, 'ORGANISATION'),
                h('span', { class: 'ax-num' }, '24H'),
                h('span', { class: 'ax-num' }, 'Δ'),
              ),
              pulse.organizations.map((org) =>
                h(
                  'div',
                  {
                    class: 'ax-org',
                    role: 'button',
                    tabindex: 0,
                    onclick: () => ctx.openEntity(org.id),
                  },
                  h(
                    'span',
                    {},
                    org.name,
                    org.ticker
                      ? h(
                          'small',
                          {
                            style: {
                              color: 'var(--ax-muted)',
                              marginLeft: '6px',
                            },
                          },
                          org.ticker,
                        )
                      : null,
                  ),
                  h('span', { class: 'ax-num' }, org.mentions),
                  h(
                    'span',
                    {
                      class: `ax-num ${org.momentum >= 0 ? 'ax-up' : 'ax-down'}`,
                    },
                    `${org.momentum >= 0 ? '+' : ''}${org.momentum}`,
                  ),
                ),
              ),
            ]
          : empty(),
      ),
      panel(
        {
          title: 'Trending models',
          note: 'Hugging Face',
          span: 'span-4',
          bodyClass: 'scroll',
        },
        itemList(pulse.models, open, { showDomain: false }),
      ),
      panel(
        {
          title: 'New API models',
          note: 'OpenRouter · 21 days',
          span: 'span-4',
          bodyClass: 'scroll',
        },
        itemList(pulse.newModels, open, { showDomain: false }),
      ),
      panel(
        {
          title: 'Research',
          note: 'HF Daily Papers + arXiv',
          span: 'span-4',
          bodyClass: 'scroll',
        },
        itemList(pulse.papers, open, { showDomain: false }),
      ),
      panel(
        {
          title: 'Rising open source',
          note: 'GitHub · created ≤30d',
          span: 'span-4',
          bodyClass: 'scroll',
        },
        pulse.repos.length
          ? pulse.repos.map((repo) =>
              h(
                'div',
                {
                  class: 'ax-row',
                  role: 'button',
                  tabindex: 0,
                  onclick: () => open(repo),
                },
                h('span', { class: 'ax-bar ai' }),
                h(
                  'div',
                  {},
                  h('div', { class: 'ax-row-title' }, repo.title),
                  h(
                    'div',
                    { class: 'ax-meta' },
                    h('span', {}, `★ ${compact(repo.metrics.stars)}`),
                    h('span', {}, repo.metrics.language ?? ''),
                    h('span', {}, `#${repo.metrics.topic}`),
                  ),
                ),
                h('span', { class: 'ax-sev' }, repo.severity),
              ),
            )
          : empty(),
      ),
      panel(
        {
          title: 'Policy & regulation',
          note: 'news + Federal Register',
          span: 'span-4',
          bodyClass: 'scroll',
        },
        itemList(pulse.policy, open, { showDomain: false }),
      ),
      panel(
        {
          title: 'Community',
          note: 'Hacker News front page',
          span: 'span-4',
          bodyClass: 'scroll',
        },
        itemList(pulse.discussion, open, {
          showDomain: false,
          emptyText: 'No AI stories on the front page right now.',
        }),
      ),
    ),
  );
  const feed = await ctx.api.feed({
    domain: 'ai',
    kind: 'announcement,news',
    limit: 80,
  });
  news
    .querySelector('.ax-panel-body')
    .replaceChildren(itemList(feed.items, open, { showDomain: false }));
}
