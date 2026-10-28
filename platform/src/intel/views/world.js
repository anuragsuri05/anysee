/** World: the filterable all-source feed beside the instability index. */

import { h, replace } from '../dom.js';
import { empty, itemList, panel, pills } from './common.js';
import { instabilityPanel } from './overview.js';

const filters = {
  domains: new Set(['world', 'hazard']),
  q: '',
  minSeverity: 0,
  sort: 'time',
};

export async function renderWorld(container, ctx) {
  const body = h('div', { class: 'ax-panel-body tall' }, empty('Loading…'));
  const count = h('span', {});
  const load = async () => {
    const feed = await ctx.api.feed({
      domain: [...filters.domains].join(',') || 'none',
      q: filters.q,
      min_severity: filters.minSeverity || null,
      sort: filters.sort,
      limit: 200,
    });
    count.textContent = `${feed.total} stories`;
    replace(
      body,
      itemList(feed.items, (item) => ctx.openItem(item.id), {
        emptyText: 'No stories match these filters.',
      }),
    );
  };
  const search = h('input', {
    class: 'ax-input',
    type: 'search',
    placeholder: 'Search titles, publishers…',
    value: filters.q,
    oninput: (event) => {
      filters.q = event.target.value;
      clearTimeout(search.timer);
      search.timer = setTimeout(load, 250);
    },
  });
  const pillBox = h('span', { class: 'ax-filters', style: { margin: 0 } });
  const drawPills = () =>
    replace(
      pillBox,
      pills(
        [
          ['world', 'World'],
          ['hazard', 'Hazards'],
          ['cyber', 'Cyber'],
          ['ai', 'AI'],
          ['markets', 'Markets'],
        ],
        filters.domains,
        () => {
          drawPills();
          load();
        },
      ),
    );
  drawPills();
  const severity = h(
    'select',
    {
      class: 'ax-input',
      style: { minWidth: '140px' },
      onchange: (event) => {
        filters.minSeverity = Number(event.target.value);
        load();
      },
    },
    [
      [0, 'All severities'],
      [40, 'Routine+ (40)'],
      [60, 'Priority+ (60)'],
      [80, 'Flash (80)'],
    ].map(([value, label]) =>
      h('option', { value, selected: filters.minSeverity === value }, label),
    ),
  );
  const sort = h(
    'select',
    {
      class: 'ax-input',
      style: { minWidth: '140px' },
      onchange: (event) => {
        filters.sort = event.target.value;
        load();
      },
    },
    h(
      'option',
      { value: 'time', selected: filters.sort === 'time' },
      'Newest first',
    ),
    h(
      'option',
      { value: 'severity', selected: filters.sort === 'severity' },
      'Most severe first',
    ),
  );
  container.replaceChildren(
    h(
      'div',
      { class: 'ax-grid' },
      h(
        'section',
        { class: 'ax-panel span-8' },
        h(
          'header',
          { class: 'ax-panel-head' },
          h('b', {}, 'All-source feed'),
          count,
        ),
        h(
          'div',
          { class: 'ax-panel-body', style: { paddingBottom: 0 } },
          h('div', { class: 'ax-filters' }, search, pillBox, severity, sort),
        ),
        body,
      ),
      instabilityPanel(ctx, { limit: 60, tall: true }),
    ),
  );
  await load();
}
