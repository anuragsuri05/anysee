/** Rendering primitives shared by the Ops Center views. */

import { h, ago, usd, compact, pct, sparkline, DOMAIN_LABEL } from '../dom.js';

export function panel(
  { title, note, span = 'span-6', actions = [], bodyClass = '' },
  ...children
) {
  return h(
    'section',
    { class: `ax-panel ${span}` },
    h(
      'header',
      { class: 'ax-panel-head' },
      h('b', {}, title),
      note ? h('span', {}, note) : null,
      h('span', { class: 'ax-spacer' }),
      ...actions,
    ),
    h('div', { class: `ax-panel-body ${bodyClass}` }, ...children),
  );
}

export const empty = (
  text = 'Nothing yet — the first sweep is still running.',
) => h('div', { class: 'ax-empty' }, text);

function metricText(item) {
  const m = item.metrics ?? {};
  if (m.amountUsd)
    return `${usd(m.amountUsd)}${m.round ? ` · ${m.round}` : ''}`;
  if (Number.isFinite(m.magnitude)) return `M${m.magnitude.toFixed(1)}`;
  if (m.alertLevel) return `GDACS ${m.alertLevel}`;
  if (m.stars != null) return `★ ${compact(m.stars)}`;
  if (m.upvotes) return `▲ ${m.upvotes}`;
  if (m.points) return `${m.points} pts`;
  if (m.rank) return `#${m.rank} trending`;
  if (m.changePct != null) return pct(m.changePct);
  if (m.ransomware) return 'ransomware';
  return null;
}

/** One story row. `onOpen` receives the item. */
export function itemRow(item, onOpen, { showDomain = true } = {}) {
  const metric = metricText(item);
  return h(
    'div',
    {
      class: 'ax-row',
      role: 'button',
      tabindex: 0,
      onclick: () => onOpen(item),
      onkeydown: (event) => event.key === 'Enter' && onOpen(item),
    },
    h('span', { class: `ax-bar ${item.domain}` }),
    h(
      'div',
      {},
      h('div', { class: 'ax-row-title' }, item.title),
      h(
        'div',
        { class: 'ax-meta' },
        showDomain
          ? h(
              'span',
              { class: `ax-dom ${item.domain}` },
              DOMAIN_LABEL[item.domain] ?? item.domain,
            )
          : null,
        h('span', {}, item.publisher),
        h('span', {}, ago(item.time ?? item.firstSeen)),
        item.clusterSize > 1
          ? h('span', {}, `${item.clusterSize} sources`)
          : null,
        metric ? h('span', {}, metric) : null,
        item.countries?.length
          ? h('span', {}, item.countries.slice(0, 3).join(' '))
          : null,
      ),
    ),
    h(
      'span',
      {
        class: `ax-sev ${item.tier ?? ''}`,
        title: (item.reasons ?? []).join(', '),
      },
      item.severity ?? '',
    ),
  );
}

export function itemList(items, onOpen, options) {
  if (!items?.length) return empty(options?.emptyText);
  return h(
    'div',
    {},
    items.map((item) => itemRow(item, onOpen, options)),
  );
}

export function ciiRow(row, index, onOpen) {
  return h(
    'div',
    {
      class: 'ax-cii',
      role: 'button',
      tabindex: 0,
      onclick: () => onOpen(row),
      onkeydown: (event) => event.key === 'Enter' && onOpen(row),
      title: row.drivers?.map((driver) => driver.title).join('\n') ?? '',
    },
    h('span', { class: 'ax-rank' }, String(index + 1).padStart(2, '0')),
    h('span', {}, row.name),
    h(
      'span',
      { class: 'ax-gauge' },
      h('i', { class: `band-${row.band}`, style: { width: `${row.score}%` } }),
    ),
    h('span', { class: 'ax-score' }, row.score),
    h(
      'span',
      {
        class: `ax-delta ${row.delta > 0 ? 'up' : row.delta < 0 ? 'down' : ''}`,
      },
      row.delta == null
        ? ''
        : `${row.delta > 0 ? '▲' : row.delta < 0 ? '▼' : '·'}${Math.abs(row.delta)}`,
    ),
  );
}

export function quoteTile(quote) {
  const direction = (quote.changePct ?? 0) >= 0 ? 'ax-up' : 'ax-down';
  const decimals = quote.price >= 1000 ? 0 : 2;
  return h(
    'div',
    { class: 'ax-tile' },
    h('small', {}, `${quote.label} · ${quote.symbol}`),
    h(
      'strong',
      {},
      quote.price.toLocaleString('en', {
        maximumFractionDigits: decimals,
        minimumFractionDigits: decimals,
      }),
    ),
    h('span', { class: `ax-change ${direction}` }, pct(quote.changePct)),
    h('span', { class: direction }, sparkline(quote.spark ?? [])),
  );
}

export function kpi(label, value, sub) {
  return h(
    'div',
    { class: 'ax-tile' },
    h('small', {}, label),
    h('strong', {}, value),
    sub ? h('span', { class: 'ax-change' }, sub) : null,
  );
}

export function entityChips(entities, onOpen) {
  if (!entities?.length) return null;
  return h(
    'div',
    { class: 'ax-chips' },
    entities.map((entity) =>
      h(
        'button',
        {
          class: 'ax-chip',
          dataset: { type: entity.type },
          onclick: () => onOpen(entity.id),
        },
        entity.name,
        entity.weight != null
          ? h('em', {}, entity.weight)
          : entity.count != null
            ? h('em', {}, entity.count)
            : null,
      ),
    ),
  );
}

export function pills(options, selected, onChange) {
  return options.map(([value, label]) =>
    h(
      'button',
      {
        class: 'ax-pill',
        'aria-pressed': String(selected.has(value)),
        onclick: () => {
          if (selected.has(value)) selected.delete(value);
          else selected.add(value);
          onChange();
        },
      },
      label,
    ),
  );
}
