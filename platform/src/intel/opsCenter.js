/**
 * The Ops Center: one full-screen dashboard over the globe with a tab per
 * view. Holds the latest overview payload and re-renders the active view
 * when the engine reports an update.
 */

import { h, replace, eyeMark, utc } from './dom.js';
import { renderOverview } from './views/overview.js';
import { renderWorld } from './views/world.js';
import { renderAi } from './views/ai.js';
import { renderCyber, renderMarkets } from './views/cyberMarkets.js';
import { renderOntology, selectEntity } from './views/ontology.js';
import { renderHealth, renderTimeMachine } from './views/operations.js';
import { empty } from './views/common.js';

const TABS = [
  ['overview', 'Overview', renderOverview],
  ['world', 'World', renderWorld],
  ['ai', 'AI sector', renderAi],
  ['cyber', 'Cyber', renderCyber],
  ['markets', 'Markets', renderMarkets],
  ['ontology', 'Ontology', renderOntology],
  ['health', 'Data health', renderHealth],
  ['time', 'Time machine', renderTimeMachine],
];
// Views that read only the overview payload re-render on every update; the
// others fetch their own data and refresh when reopened or on demand.
const LIVE_TABS = new Set(['overview', 'ai']);

/** The header chip: who Claude is connected as, or how to connect. */
function claudeChipLabel(status) {
  if (status?.connected) {
    const who =
      status.claudeCode?.email ??
      (status.provider === 'api' ? 'API key' : 'connected');
    return `Claude · ${who}`;
  }
  if (status?.login?.state === 'running') return 'Signing in…';
  return 'Connect Claude';
}

export function createOpsCenter(ctx) {
  let active = 'overview';
  let rendering = null;
  const view = h('main', { class: 'ax-view' });
  const stats = h('div', { style: { display: 'contents' } });
  const tabButtons = new Map();
  const tabs = h(
    'nav',
    { class: 'ax-tabs', role: 'tablist' },
    TABS.map(([id, label]) => {
      const button = h(
        'button',
        {
          class: 'ax-tab',
          role: 'tab',
          'aria-selected': String(id === active),
          onclick: () => setTab(id),
        },
        label,
      );
      tabButtons.set(id, button);
      return button;
    }),
  );
  const sweepButton = h(
    'button',
    {
      class: 'ax-btn',
      title: 'Run every source now',
      onclick: async () => {
        sweepButton.disabled = true;
        await ctx.api.sweep().catch(() => {});
        setTimeout(() => (sweepButton.disabled = false), 8_000);
      },
    },
    'Sweep now',
  );
  const claudeLabel = h('span', {}, 'Connect Claude');
  const claudeButton = h(
    'button',
    {
      class: 'ax-btn primary ax-claude-chip',
      title: 'Briefs written by Claude on your Claude Code login',
      onclick: () => ctx.connectClaude(),
    },
    claudeLabel,
  );
  ctx.claude.subscribe((status) => {
    const connected = Boolean(status?.connected);
    claudeButton.classList.toggle('ok', connected);
    claudeButton.classList.toggle('primary', !connected);
    claudeLabel.textContent = claudeChipLabel(status);
  });
  const root = h(
    'div',
    {
      class: 'ax-root ax-ops',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': 'Anysee Ops Center',
    },
    h(
      'header',
      { class: 'ax-ops-head' },
      h(
        'div',
        { class: 'ax-title' },
        eyeMark(),
        h('b', {}, 'ANYSEE'),
        h('span', {}, 'OPS CENTER'),
      ),
      stats,
      h('span', { class: 'ax-spacer' }),
      claudeButton,
      sweepButton,
      h(
        'button',
        {
          class: 'ax-btn',
          title: 'Close and show the whole intel layer',
          onclick: () => ctx.flyTo(22, 15, 19_000_000),
        },
        'World view',
      ),
      h(
        'button',
        { class: 'ax-btn primary', onclick: () => ctx.close() },
        'Globe ⟶',
      ),
    ),
    tabs,
    view,
  );
  document.body.append(root);

  function drawStats() {
    const state = ctx.state;
    if (!state) return;
    const healthy =
      state.health?.filter((source) => source.status === 'ok').length ?? 0;
    replace(
      stats,
      h(
        'div',
        { class: 'ax-stat' },
        h('small', {}, 'Posture'),
        h(
          'strong',
          { class: 'ax-posture', dataset: { level: state.posture.level } },
          `${state.posture.level} ${state.posture.value}`,
        ),
      ),
      h(
        'div',
        { class: 'ax-stat' },
        h('small', {}, 'Items 24h'),
        h('strong', {}, state.counts?.last24h ?? 0),
      ),
      h(
        'div',
        { class: 'ax-stat' },
        h('small', {}, 'Flash / priority'),
        h(
          'strong',
          {},
          `${state.counts?.byTier.flash ?? 0} / ${state.counts?.byTier.priority ?? 0}`,
        ),
      ),
      h(
        'div',
        { class: 'ax-stat' },
        h('small', {}, 'Sources'),
        h('strong', {}, `${healthy}/${state.health?.length ?? 0}`),
      ),
      h(
        'div',
        { class: 'ax-stat' },
        h('small', {}, 'Updated'),
        h('strong', {}, utc(state.computedAt)),
      ),
    );
  }

  async function render() {
    if (!root.classList.contains('open')) return;
    drawStats();
    if (!ctx.state) {
      replace(view, empty('Connecting to the intel engine…'));
      return;
    }
    const [, , renderView] = TABS.find(([id]) => id === active);
    const run = (async () => {
      try {
        await renderView(view, ctx);
      } catch (error) {
        replace(view, empty(`This view failed to load: ${error.message}`));
      }
    })();
    rendering = run;
    await run;
  }

  function setTab(id) {
    active = id;
    for (const [tabId, button] of tabButtons)
      button.setAttribute('aria-selected', String(tabId === id));
    view.scrollTop = 0;
    render();
  }

  return {
    open(tab) {
      root.classList.add('open');
      if (tab) setTab(tab);
      else render();
    },
    close() {
      root.classList.remove('open');
    },
    get isOpen() {
      return root.classList.contains('open');
    },
    setTab,
    openEntity(id) {
      selectEntity(id);
      this.open('ontology');
    },
    /** Called when new overview data arrives. */
    refresh() {
      drawStats();
      if (
        root.classList.contains('open') &&
        LIVE_TABS.has(active) &&
        !document.activeElement?.matches?.('input, select')
      )
        render();
    },
    get rendering() {
      return rendering;
    },
  };
}
