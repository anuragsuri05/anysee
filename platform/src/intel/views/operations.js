/** Data Health (sources, lineage, audit) and Time Machine (snapshot replay). */

import { h, replace, ago, utc } from '../dom.js';
import { ciiRow, empty, kpi, panel } from './common.js';

const minutes = (ms) => `${Math.round(ms / 60_000)}m`;

export async function renderHealth(container, ctx) {
  const [{ sources, status }, { events }] = await Promise.all([
    ctx.api.health(),
    ctx.api.audit(),
  ]);
  const ok = sources.filter((source) => source.status === 'ok').length;
  container.replaceChildren(
    h(
      'div',
      { class: 'ax-grid' },
      h(
        'div',
        { class: 'span-12 ax-kpis', style: { marginBottom: 0 } },
        kpi('Sources healthy', `${ok}/${sources.length}`),
        kpi('Items in store', status.items),
        kpi('Story clusters', status.clusters),
        kpi(
          'Claude brief',
          status.brief.provider === 'claude-code'
            ? 'Claude Code'
            : status.brief.provider === 'api'
              ? 'API key'
              : 'off',
          status.brief.claudeCode?.email ??
            status.brief.reason ??
            status.brief.model,
        ),
        kpi(
          'Alert delivery',
          ['discord', 'slack', 'telegram']
            .filter((key) => status.notify[key])
            .join(', ') || 'off',
          `min tier ${status.notify.minTier}`,
        ),
      ),
      panel(
        {
          title: 'Source connectors',
          note: 'status · cadence · lineage',
          span: 'span-8',
          bodyClass: 'tall',
        },
        h(
          'table',
          { class: 'ax-table' },
          h(
            'thead',
            {},
            h(
              'tr',
              {},
              [
                'Source',
                'Status',
                'Last OK',
                'Rows',
                'New',
                'Latency',
                'Every',
                'Fails',
              ].map((label) => h('th', {}, label)),
            ),
          ),
          h(
            'tbody',
            {},
            sources.map((source) =>
              h(
                'tr',
                {},
                h(
                  'td',
                  {},
                  h('div', {}, source.name),
                  h(
                    'div',
                    {
                      class: 'ax-meta',
                      style: {
                        fontFamily: 'var(--ax-mono)',
                        fontSize: '10px',
                        color: 'var(--ax-muted)',
                      },
                    },
                    `${source.domain} · ${source.origin}`,
                  ),
                ),
                h(
                  'td',
                  {},
                  h(
                    'span',
                    {
                      class: `ax-status ${source.status}`,
                      title: source.lastError ?? '',
                    },
                    source.status,
                  ),
                  source.lastError
                    ? h(
                        'div',
                        {
                          style: {
                            color: 'var(--ax-down)',
                            fontSize: '11px',
                            marginTop: '3px',
                          },
                        },
                        source.lastError,
                      )
                    : null,
                ),
                h('td', { class: 'mono' }, ago(source.lastOk)),
                h('td', { class: 'mono' }, source.lastCount),
                h('td', { class: 'mono' }, source.lastNew),
                h(
                  'td',
                  { class: 'mono' },
                  source.latencyMs != null ? `${source.latencyMs}ms` : '—',
                ),
                h('td', { class: 'mono' }, minutes(source.intervalMs)),
                h('td', { class: 'mono' }, source.failures),
              ),
            ),
          ),
        ),
      ),
      panel(
        {
          title: 'Audit log',
          note: 'system and user actions',
          span: 'span-4',
          bodyClass: 'tall',
        },
        events.length
          ? events.map((event) => {
              const { ts, actor, action, ...detail } = event;
              return h(
                'div',
                {
                  class: 'ax-row',
                  style: { cursor: 'default', gridTemplateColumns: '4px 1fr' },
                },
                h('span', {
                  class: `ax-bar ${action.includes('error') ? 'world' : 'ai'}`,
                }),
                h(
                  'div',
                  {},
                  h(
                    'div',
                    {
                      class: 'ax-row-title',
                      style: {
                        fontFamily: 'var(--ax-mono)',
                        fontSize: '11.5px',
                      },
                    },
                    action,
                  ),
                  h(
                    'div',
                    { class: 'ax-meta' },
                    h('span', {}, utc(ts)),
                    h('span', {}, actor),
                    h('span', {}, JSON.stringify(detail).slice(0, 120)),
                  ),
                ),
              );
            })
          : empty('No events yet.'),
      ),
    ),
  );
}

const tm = { selected: null };

export async function renderTimeMachine(container, ctx) {
  const { snapshots } = await ctx.api.snapshots();
  if (!snapshots.length) {
    container.replaceChildren(
      panel(
        { title: 'Time machine', span: 'span-12' },
        empty(
          'The first snapshot is written 15 minutes after the first full sweep; one follows every 15 minutes and is kept for 7 days.',
        ),
      ),
    );
    return;
  }
  const detail = h('div', { class: 'span-12' });
  const maxValue = Math.max(
    10,
    ...snapshots.map((row) => row.posture?.value ?? 0),
  );
  const timeline = h(
    'div',
    { class: 'ax-timeline', role: 'listbox', 'aria-label': 'Snapshots' },
    snapshots.map((row) =>
      h('button', {
        title: `${utc(row.ts)} · ${row.posture?.level ?? ''} ${row.posture?.value ?? ''}`,
        'aria-pressed': String(tm.selected === row.ts),
        style: {
          height: `${12 + ((row.posture?.value ?? 0) / maxValue) * 72}px`,
        },
        onclick: () => {
          tm.selected = row.ts;
          for (const button of timeline.children)
            button.setAttribute(
              'aria-pressed',
              String(button === timeline.children[snapshots.indexOf(row)]),
            );
          show(row.ts);
        },
      }),
    ),
  );
  async function show(ts) {
    replace(detail, empty('Loading snapshot…'));
    const snapshot = await ctx.api.snapshot(ts);
    replace(
      detail,
      h(
        'div',
        { class: 'ax-grid' },
        h(
          'div',
          {
            class: 'span-12',
            style: {
              display: 'flex',
              gap: '12px',
              alignItems: 'center',
              flexWrap: 'wrap',
            },
          },
          h(
            'div',
            { class: 'ax-kpis', style: { flex: 1, margin: 0 } },
            kpi('Snapshot', utc(snapshot.ts)),
            kpi(
              'Posture',
              snapshot.posture?.level ?? '—',
              snapshot.posture?.value,
            ),
            kpi('Items', snapshot.counts?.total ?? '—'),
            kpi('Geolocated', snapshot.geo.length),
          ),
          h(
            'button',
            { class: 'ax-btn primary', onclick: () => ctx.replay(snapshot) },
            'Replay on globe',
          ),
        ),
        panel(
          { title: 'Instability then', span: 'span-5', bodyClass: 'scroll' },
          snapshot.cii
            .slice(0, 20)
            .map((row, index) =>
              ciiRow(row, index, (selected) =>
                ctx.openEntity(`country:${selected.iso}`),
              ),
            ),
        ),
        panel(
          {
            title: 'Alerts then',
            note: 'previous 24h',
            span: 'span-7',
            bodyClass: 'scroll',
          },
          snapshot.alerts.length
            ? snapshot.alerts
                .slice()
                .reverse()
                .map((alert) =>
                  h(
                    'div',
                    { class: 'ax-row', style: { cursor: 'default' } },
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
                          alert.tier.toUpperCase(),
                        ),
                        h('span', {}, utc(alert.ts)),
                      ),
                    ),
                    h(
                      'span',
                      { class: `ax-sev ${alert.tier}` },
                      alert.severity,
                    ),
                  ),
                )
            : empty('No alerts in that window.'),
        ),
      ),
    );
  }
  container.replaceChildren(
    h(
      'div',
      { class: 'ax-grid' },
      panel(
        {
          title: 'Time machine',
          note: `${snapshots.length} snapshots · 15 min · 7 days · bar height = posture`,
          span: 'span-12',
        },
        timeline,
        h(
          'div',
          { class: 'ax-legend' },
          `${utc(snapshots[0].ts)} → ${utc(snapshots.at(-1).ts)}`,
        ),
      ),
      detail,
    ),
  );
  await show(tm.selected ?? snapshots.at(-1).ts);
}
