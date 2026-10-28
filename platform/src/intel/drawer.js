/** The item drawer: one story with its scoring, links, corroboration and lineage. */

import { h, replace, link, ago, utc, DOMAIN_LABEL } from './dom.js';
import { empty, entityChips } from './views/common.js';

export function createDrawer({ api, onOpenEntity, onShowOnGlobe }) {
  const title = h('span', {}, 'Item');
  const body = h('div', { class: 'ax-drawer-body' });
  const close = () => root.classList.remove('open');
  const root = h(
    'aside',
    { class: 'ax-root ax-drawer', 'aria-label': 'Item detail' },
    h(
      'header',
      { class: 'ax-drawer-head' },
      title,
      h(
        'button',
        { class: 'ax-close', 'aria-label': 'Close', onclick: close },
        '×',
      ),
    ),
    body,
  );
  document.body.append(root);

  async function open(id) {
    root.classList.add('open');
    replace(body, empty('Loading…'));
    let data;
    try {
      data = await api.item(id);
    } catch (error) {
      replace(body, empty(`Could not load this item: ${error.message}`));
      return;
    }
    const { item, cluster, entities, lineage } = data;
    title.textContent = `${DOMAIN_LABEL[item.domain] ?? item.domain} · ${item.kind}`;
    const metrics = Object.entries(item.metrics ?? {}).filter(
      ([, value]) => value != null && value !== '' && typeof value !== 'object',
    );
    replace(
      body,
      h('h2', {}, item.title),
      h(
        'div',
        {
          class: 'ax-meta',
          style: {
            display: 'flex',
            gap: '10px',
            flexWrap: 'wrap',
            fontFamily: 'var(--ax-mono)',
            fontSize: '10.5px',
            color: 'var(--ax-muted)',
          },
        },
        h(
          'span',
          { class: `ax-tier ${item.tier ?? ''}` },
          `SEV ${item.severity}${item.tier ? ` · ${item.tier.toUpperCase()}` : ''}`,
        ),
        h('span', {}, item.publisher),
        h(
          'span',
          {},
          item.time ? `${utc(item.time)} (${ago(item.time)})` : 'time unknown',
        ),
      ),
      item.summary ? h('p', {}, item.summary) : null,
      h(
        'div',
        { class: 'ax-actions' },
        item.url ? link(item.url, 'Open source ↗', 'ax-btn primary') : null,
        Number.isFinite(item.lat)
          ? h(
              'button',
              {
                class: 'ax-btn',
                onclick: () => {
                  close();
                  onShowOnGlobe(item);
                },
              },
              'Show on globe',
            )
          : null,
        item.metrics?.discussion
          ? link(item.metrics.discussion, 'Discussion ↗', 'ax-btn')
          : null,
      ),
      h('div', { class: 'ax-section-label' }, 'Why this score'),
      h(
        'div',
        { class: 'ax-chips' },
        (item.reasons?.length ? item.reasons : ['baseline']).map((reason) =>
          h('span', { class: 'ax-chip', style: { cursor: 'default' } }, reason),
        ),
        item.clusterSize > 2
          ? h(
              'span',
              { class: 'ax-chip', style: { cursor: 'default' } },
              `corroborated by ${item.clusterSize} publishers`,
            )
          : null,
      ),
      entities.length
        ? [
            h('div', { class: 'ax-section-label' }, 'Linked objects'),
            entityChips(entities, (entityId) => {
              close();
              onOpenEntity(entityId);
            }),
          ]
        : null,
      cluster && cluster.items.length > 1
        ? [
            h(
              'div',
              { class: 'ax-section-label' },
              `Same story · ${cluster.publishers.length} publishers`,
            ),
            cluster.items.map((member) =>
              h(
                'div',
                {
                  style: {
                    fontSize: '12px',
                    padding: '4px 0',
                    borderBottom: '1px solid rgba(0,229,255,0.06)',
                  },
                },
                member.url ? link(member.url, member.title) : member.title,
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
                  `${member.publisher} · ${ago(member.time)}`,
                ),
              ),
            ),
          ]
        : null,
      metrics.length
        ? [
            h('div', { class: 'ax-section-label' }, 'Metrics'),
            h(
              'dl',
              { class: 'ax-kv' },
              metrics.flatMap(([key, value]) => [
                h('dt', {}, key),
                h('dd', {}, String(value)),
              ]),
            ),
          ]
        : null,
      h('div', { class: 'ax-section-label' }, 'Lineage'),
      h(
        'dl',
        { class: 'ax-kv' },
        h('dt', {}, 'Connector'),
        h('dd', {}, `${lineage.source} (${lineage.sourceId})`),
        h('dt', {}, 'First seen'),
        h('dd', {}, utc(lineage.firstSeen)),
        h('dt', {}, 'Last seen'),
        h('dd', {}, utc(lineage.lastSeen)),
        h('dt', {}, 'Geolocation'),
        h(
          'dd',
          {},
          item.geoPrecision
            ? `${item.geoPrecision}${Number.isFinite(item.lat) ? ` · ${item.lat.toFixed(2)}, ${item.lon.toFixed(2)}` : ''}`
            : 'none',
        ),
        h('dt', {}, 'Story cluster'),
        h('dd', {}, item.clusterId),
      ),
    );
  }

  return {
    open,
    close,
    get isOpen() {
      return root.classList.contains('open');
    },
  };
}
