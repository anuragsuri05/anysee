/** Overview: the one-screen picture — brief, alerts, instability, top stories, AI pulse, markets. */

import { h, usd, ago, utc } from '../dom.js';
import { ciiRow, empty, itemList, kpi, panel, quoteTile } from './common.js';

const DOMAIN_TITLE = {
  world: 'World',
  hazard: 'Hazards',
  cyber: 'Cyber',
  ai: 'AI sector',
  markets: 'Markets',
};

export function briefPanel(ctx, span = 'span-8') {
  const brief = ctx.state.brief;
  const llm = ctx.state.status?.brief?.llm;
  const regenerate = h(
    'button',
    {
      class: 'ax-btn primary',
      onclick: async (event) => {
        event.currentTarget.disabled = true;
        await ctx.regenerateBrief();
      },
    },
    llm ? 'Regenerate' : 'Rebuild',
  );
  if (!brief)
    return panel(
      { title: 'Intelligence brief', span, actions: [regenerate] },
      empty(),
    );
  const note =
    brief.generator === 'rules'
      ? llm
        ? 'Rule-based brief while Claude writes the next one.'
        : h(
            'span',
            {},
            'Rule-based brief. ',
            h(
              'button',
              { class: 'ax-btn primary', onclick: () => ctx.connectClaude() },
              'Connect Claude',
            ),
            ' to have Claude write it with your Claude Code login.',
          )
      : `Written by ${brief.generator}${brief.via ? ` via ${brief.via}` : ''}${brief.account ? ` (${brief.account})` : ''} · ${utc(brief.generatedAt)}`;
  return panel(
    {
      title: 'Intelligence brief',
      note: brief.threat_level,
      span,
      actions: [regenerate],
    },
    h(
      'div',
      { class: 'ax-brief' },
      h('h2', {}, brief.headline),
      h('p', { class: 'ax-summary' }, brief.summary),
      h(
        'div',
        { class: 'ax-brief-sections' },
        (brief.sections ?? []).map((section) =>
          h(
            'div',
            { class: 'ax-brief-section' },
            h(
              'h3',
              { class: `ax-dom ${section.domain}` },
              section.title || DOMAIN_TITLE[section.domain],
            ),
            h(
              'ul',
              {},
              section.bullets.map((bullet) => h('li', {}, bullet)),
            ),
          ),
        ),
      ),
      brief.watchlist?.length
        ? h(
            'div',
            { class: 'ax-watch' },
            h('h3', {}, 'Watchlist'),
            h(
              'ul',
              {},
              brief.watchlist.map((entry) => h('li', {}, entry)),
            ),
          )
        : null,
      h('div', { class: 'ax-note' }, note),
      brief.error
        ? h(
            'div',
            { class: 'ax-note warn' },
            `Claude brief unavailable: ${brief.error}`,
          )
        : null,
    ),
  );
}

export function alertsPanel(ctx, { span = 'span-4', limit = 30 } = {}) {
  const live = (ctx.state.alerts ?? []).slice(0, limit);
  return panel(
    {
      title: 'Alerts',
      note: `${live.filter((alert) => alert.tier === 'flash').length} flash`,
      span,
      bodyClass: 'scroll',
    },
    live.length
      ? live.map((alert) =>
          h(
            'div',
            {
              class: 'ax-row',
              role: 'button',
              tabindex: 0,
              onclick: () => ctx.openItem(alert.itemId),
            },
            h('span', { class: `ax-bar ${alert.domain}` }),
            h(
              'div',
              {},
              h('div', { class: 'ax-row-title' }, alert.title),
              h(
                'div',
                { class: 'ax-meta' },
                h(
                  'span',
                  { class: `ax-tier ${alert.tier}` },
                  `${alert.escalation ? '↑ ' : ''}${alert.tier.toUpperCase()}`,
                ),
                h('span', { class: `ax-dom ${alert.domain}` }, alert.domain),
                h('span', {}, ago(alert.ts)),
                alert.publishers > 1
                  ? h('span', {}, `${alert.publishers} sources`)
                  : null,
                alert.baseline ? h('span', {}, 'baseline') : null,
              ),
            ),
            h('span', { class: `ax-sev ${alert.tier}` }, alert.severity),
          ),
        )
      : empty('No alerts above PRIORITY yet.'),
  );
}

export function instabilityPanel(
  ctx,
  { span = 'span-4', limit = 15, tall = false } = {},
) {
  const rows = (ctx.state.instability ?? []).slice(0, limit);
  return panel(
    {
      title: 'Country instability',
      note: '24h · d/d',
      span,
      bodyClass: tall ? 'tall' : 'scroll',
    },
    rows.length
      ? rows.map((row, index) =>
          ciiRow(row, index, (selected) =>
            ctx.openEntity(`country:${selected.iso}`),
          ),
        )
      : empty(),
  );
}

export function marketsStrip(ctx, span = 'span-12') {
  const quotes = ctx.state.quotes ?? [];
  return panel(
    { title: 'Market radar', note: 'day change', span },
    quotes.length
      ? h('div', { class: 'ax-tiles' }, quotes.map(quoteTile))
      : empty('Quotes arrive with the first market sweep.'),
  );
}

export async function renderOverview(container, ctx) {
  const pulse = ctx.state.pulse;
  const top = panel(
    {
      title: 'Top stories',
      note: 'by severity · 24h',
      span: 'span-5',
      bodyClass: 'scroll',
    },
    empty('Loading…'),
  );
  const aiPanel = panel(
    {
      title: 'AI pulse',
      note: '24h',
      span: 'span-3',
      actions: [
        h(
          'button',
          { class: 'ax-btn', onclick: () => ctx.setTab('ai') },
          'Open',
        ),
      ],
    },
    pulse
      ? [
          h(
            'div',
            { class: 'ax-kpis' },
            kpi('Items', pulse.counts.items24h),
            kpi(
              'Rounds 3d',
              pulse.counts.funding3d,
              usd(pulse.counts.fundingTotalUsd3d),
            ),
          ),
          pulse.organizations.slice(0, 8).map((org) =>
            h(
              'div',
              {
                class: 'ax-org',
                role: 'button',
                tabindex: 0,
                onclick: () => ctx.openEntity(org.id),
              },
              h('span', {}, org.name),
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
  );
  container.replaceChildren(
    h(
      'div',
      { class: 'ax-grid' },
      briefPanel(ctx),
      alertsPanel(ctx),
      instabilityPanel(ctx),
      top,
      aiPanel,
      marketsStrip(ctx),
    ),
  );
  const since = Date.now() - 24 * 3_600_000;
  const feed = await ctx.api.feed({ sort: 'severity', since, limit: 25 });
  top
    .querySelector('.ax-panel-body')
    .replaceChildren(itemList(feed.items, (item) => ctx.openItem(item.id)));
}
