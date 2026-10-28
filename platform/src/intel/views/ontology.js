/**
 * Ontology explorer: every linked object (country, organisation, topic) with
 * a search-around view — the items that mention it and the objects that
 * co-occur with it, drawn as a radial link graph.
 */

import { h, replace, svg, pct } from '../dom.js';
import { empty, entityChips, itemList, kpi, panel } from './common.js';

const TYPE_LABEL = {
  country: 'Countries',
  organization: 'Organisations',
  topic: 'Topics',
};
const TYPE_COLOR = {
  country: '#ff6b6b',
  organization: '#3de0c8',
  topic: '#b48cff',
};

const state = { selected: null, filter: '' };

/** Select an object to open when the Ontology tab next renders. */
export function selectEntity(id) {
  state.selected = id;
}

function radialGraph(center, related, onOpen) {
  const width = 780;
  const height = 360;
  const cx = width / 2;
  const cy = height / 2;
  const nodes = related.slice(0, 18);
  const maxWeight = Math.max(1, ...nodes.map((node) => node.weight));
  const root = svg('svg', {
    class: 'ax-graph',
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label': `Objects linked to ${center.name}`,
  });
  nodes.forEach((node, index) => {
    const angle = (index / nodes.length) * Math.PI * 2 - Math.PI / 2;
    // Alternate two rings so neighbouring labels don't collide.
    const radius = index % 2 ? 140 : 100;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const x = cx + cos * radius * 1.6;
    const y = cy + sin * radius;
    const anchor = Math.abs(cos) < 0.3 ? 'middle' : cos > 0 ? 'start' : 'end';
    const labelX = x + cos * 14;
    const labelY =
      y + sin * 14 + (Math.abs(cos) < 0.3 ? (sin > 0 ? 10 : -4) : 4);
    const color = TYPE_COLOR[node.type] ?? '#00e5ff';
    root.append(
      svg('line', {
        x1: cx,
        y1: cy,
        x2: x,
        y2: y,
        stroke: color,
        'stroke-opacity': 0.25 + (node.weight / maxWeight) * 0.5,
        'stroke-width': 1 + (node.weight / maxWeight) * 3,
      }),
    );
    const group = svg('g', {
      class: 'node',
      tabindex: 0,
      onclick: () => onOpen(node.id),
    });
    group.append(
      svg('circle', {
        cx: x,
        cy: y,
        r: 5 + (node.weight / maxWeight) * 8,
        fill: color,
        'fill-opacity': 0.85,
      }),
      svg(
        'text',
        { x: labelX, y: labelY, 'text-anchor': anchor },
        `${node.name} (${node.weight})`,
      ),
    );
    root.append(group);
  });
  root.append(
    svg('circle', {
      cx,
      cy,
      r: 22,
      fill: '#04080d',
      stroke: TYPE_COLOR[center.type] ?? '#00e5ff',
      'stroke-width': 2,
    }),
    svg(
      'text',
      {
        x: cx,
        y: cy + 40,
        'text-anchor': 'middle',
        style: 'font-size: 13px; font-weight: 600',
      },
      center.name,
    ),
  );
  return root;
}

async function renderDetail(target, id, ctx, redraw) {
  replace(target, empty('Loading…'));
  const data = await ctx.api.entity(id, 80);
  const { object } = data;
  const openEntity = (next) => {
    state.selected = next;
    redraw();
  };
  const kpis = [kpi('Linked items', data.total)];
  for (const [domain, count] of Object.entries(data.byDomain))
    kpis.push(kpi(domain, count));
  if (data.instability)
    kpis.push(
      kpi('Instability', data.instability.score, data.instability.band),
    );
  if (data.quote)
    kpis.push(
      kpi(
        data.quote.symbol,
        data.quote.price.toFixed(2),
        pct(data.quote.changePct),
      ),
    );
  const canFly = Number.isFinite(object.lat);
  replace(
    target,
    h(
      'div',
      { class: 'ax-grid' },
      h(
        'div',
        { class: 'span-12' },
        h(
          'div',
          { class: 'ax-object-card' },
          h('h2', {}, object.name),
          h(
            'span',
            { class: 'ax-type' },
            `${object.type}${object.kind ? ` · ${object.kind}` : ''}${object.iso ? ` · ${object.iso}` : ''}`,
          ),
          canFly
            ? h(
                'button',
                {
                  class: 'ax-btn',
                  onclick: () =>
                    ctx.flyTo(
                      object.lat,
                      object.lon,
                      object.type === 'country' ? 4_000_000 : 900_000,
                    ),
                },
                'Show on globe',
              )
            : null,
        ),
        h('div', { class: 'ax-kpis' }, kpis),
      ),
      panel(
        { title: 'Link graph', note: 'co-mentioned objects', span: 'span-7' },
        data.related.length
          ? radialGraph(object, data.related, openEntity)
          : empty('No linked objects yet.'),
      ),
      panel(
        {
          title: 'Search around',
          note: 'pivot to a linked object',
          span: 'span-5',
          bodyClass: 'scroll',
        },
        entityChips(data.related, openEntity) ??
          empty('No linked objects yet.'),
      ),
      panel(
        {
          title: 'Linked items',
          note: 'newest first',
          span: 'span-12',
          bodyClass: 'tall',
        },
        itemList(data.items, (item) => ctx.openItem(item.id)),
      ),
    ),
  );
}

export async function renderOntology(container, ctx) {
  const list = h('div', { class: 'ax-entity-list' }, empty('Loading…'));
  const detail = h('div', {}, empty('Select an object to search around it.'));
  const redraw = () => renderOntology(container, ctx);
  const filterInput = h('input', {
    class: 'ax-input',
    type: 'search',
    placeholder: 'Filter objects…',
    value: state.filter,
    style: { width: '100%', marginBottom: '8px' },
    oninput: (event) => {
      state.filter = event.target.value;
      drawList();
    },
  });
  container.replaceChildren(
    h(
      'div',
      { class: 'ax-ontology' },
      h(
        'section',
        { class: 'ax-panel' },
        h('header', { class: 'ax-panel-head' }, h('b', {}, 'Objects')),
        h('div', { class: 'ax-panel-body' }, filterInput, list),
      ),
      detail,
    ),
  );
  const { entities } = await ctx.api.entities({ limit: 400 });
  function drawList() {
    const needle = state.filter.trim().toLowerCase();
    const groups = {};
    for (const entity of entities) {
      if (needle && !entity.name.toLowerCase().includes(needle)) continue;
      (groups[entity.type] ??= []).push(entity);
    }
    replace(
      list,
      Object.entries(TYPE_LABEL).map(([type, label]) =>
        groups[type]?.length
          ? [
              h(
                'div',
                { class: 'ax-entity-type' },
                `${label} · ${groups[type].length}`,
              ),
              groups[type].map((entity) =>
                h(
                  'div',
                  {
                    class: 'ax-entity-row',
                    role: 'button',
                    tabindex: 0,
                    'aria-selected': String(state.selected === entity.id),
                    onclick: () => {
                      state.selected = entity.id;
                      drawList();
                      renderDetail(detail, entity.id, ctx, redraw);
                    },
                  },
                  h('span', {}, entity.name),
                  h('small', {}, entity.count),
                ),
              ),
            ]
          : null,
      ),
    );
  }
  drawList();
  // Open on the most unstable country until the analyst picks something.
  const hottest = ctx.state.instability?.[0];
  state.selected ??= hottest
    ? `country:${hottest.iso}`
    : (entities[0]?.id ?? null);
  if (state.selected) await renderDetail(detail, state.selected, ctx, redraw);
}
