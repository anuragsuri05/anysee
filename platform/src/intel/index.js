/**
 * Anysee: mounts the intel platform on the running God's Eye View globe —
 * the launcher, live alert toasts, the globe layer, the item drawer and the
 * Ops Center — and keeps them fed from /api/intel.
 */

import './intel.css';
import { intelApi, subscribeIntel } from './api.js';
import { h, replace, eyeMark, utc } from './dom.js';
import { createIntelGlobeLayer } from './globeLayer.js';
import { createDrawer } from './drawer.js';
import { createOpsCenter } from './opsCenter.js';
import { createClaudeConnect } from './claudeConnect.js';

const OVERVIEW_MIN_GAP_MS = 4_000;
const OVERVIEW_POLL_MS = 60_000;
const GEO_REFRESH_MS = 30_000;
const TOAST_MS = 14_000;

export function mountIntel({ viewer }) {
  let overviewAt = 0;
  let overviewTimer = null;
  let geoAt = 0;
  let replaying = null;

  const ctx = {
    api: intelApi,
    state: null,
    openItem: (id) => drawer.open(id),
    openEntity: (id) => ops.openEntity(id),
    setTab: (tab) => ops.setTab(tab),
    close: () => ops.close(),
    flyTo(lat, lon, altitude) {
      ops.close();
      layer.flyTo(lat, lon, altitude);
    },
    async regenerateBrief() {
      await intelApi.regenerateBrief().catch(() => {});
      await loadOverview(true);
    },
    replay(snapshot) {
      replaying = snapshot;
      layer.setData({ items: snapshot.geo, instability: snapshot.cii });
      replace(
        replayBadge,
        `REPLAY · ${utc(snapshot.ts)}`,
        h('button', { onclick: endReplay }, 'Return to live'),
      );
      replayBadge.hidden = false;
      ops.close();
    },
  };

  const layer = createIntelGlobeLayer(viewer, {
    onSelect: (item) => drawer.open(item.id),
    onSelectCountry: (row) => ops.openEntity(`country:${row.iso}`),
  });
  const drawer = createDrawer({
    api: intelApi,
    onOpenEntity: (id) => ops.openEntity(id),
    onShowOnGlobe: (item) => {
      ops.close();
      layer.flyTo(
        item.lat,
        item.lon,
        item.geoPrecision === 'exact' ? 600_000 : 2_500_000,
      );
    },
  });
  ctx.claude = createClaudeConnect({
    api: intelApi,
    onConnected: () => loadOverview(true),
  });
  ctx.connectClaude = () => ctx.claude.open();
  const ops = createOpsCenter(ctx);

  // Launcher beside the top control row.
  const launcherStatus = h(
    'span',
    { class: 'ax-posture', dataset: { level: 'GUARDED' } },
    'CONNECTING',
  );
  const launcherCounts = h('span', { style: { display: 'flex', gap: '6px' } });
  const launcher = h(
    'button',
    {
      class: 'ax-root ax-launcher',
      title: 'Open the Anysee Ops Center (I)',
      'aria-label': 'Open Anysee Ops Center',
      onclick: () => ops.open(),
    },
    eyeMark(),
    h('span', { class: 'ax-brand' }, 'Anysee ops'),
    h('span', { class: 'ax-sep' }),
    launcherStatus,
    launcherCounts,
    h('kbd', {}, 'I'),
  );
  const toasts = h('div', {
    class: 'ax-root ax-toasts',
    'aria-live': 'polite',
  });
  const replayBadge = h('div', {
    class: 'ax-root ax-replay-badge',
    hidden: true,
  });
  document.body.append(launcher, toasts, replayBadge);

  function endReplay() {
    replaying = null;
    replayBadge.hidden = true;
    loadGeo(true);
  }

  function drawLauncher() {
    const state = ctx.state;
    if (!state) return;
    launcherStatus.dataset.level = state.posture.level;
    launcherStatus.textContent = state.posture.level;
    replace(
      launcherCounts,
      state.counts?.byTier.flash
        ? h(
            'span',
            { class: 'ax-chip-count flash' },
            `${state.counts.byTier.flash} FLASH`,
          )
        : null,
      state.counts?.byTier.priority
        ? h(
            'span',
            { class: 'ax-chip-count priority' },
            `${state.counts.byTier.priority} PRI`,
          )
        : null,
    );
  }

  function toast(alert) {
    const node = h(
      'div',
      {
        class: 'ax-toast',
        dataset: { tier: alert.tier },
        role: 'button',
        tabindex: 0,
        onclick: () => {
          node.remove();
          drawer.open(alert.itemId);
          if (Number.isFinite(alert.lat)) layer.flyTo(alert.lat, alert.lon);
        },
      },
      h(
        'span',
        {
          class: `ax-tier ${alert.tier}`,
          style: {
            fontFamily: 'var(--ax-mono)',
            fontSize: '10px',
            letterSpacing: '0.12em',
          },
        },
        alert.tier.toUpperCase(),
      ),
      h(
        'div',
        {},
        h('div', { class: 'ax-toast-title' }, alert.title),
        h(
          'div',
          {
            class: 'ax-meta',
            style: {
              fontFamily: 'var(--ax-mono)',
              fontSize: '10px',
              color: 'var(--ax-muted)',
              marginTop: '3px',
            },
          },
          `${alert.domain} · sev ${alert.severity}${alert.publishers > 1 ? ` · ${alert.publishers} sources` : ''}`,
        ),
      ),
      h(
        'button',
        {
          class: 'ax-close',
          'aria-label': 'Dismiss',
          onclick: (event) => {
            event.stopPropagation();
            node.remove();
          },
        },
        '×',
      ),
    );
    toasts.prepend(node);
    while (toasts.children.length > 4) toasts.lastChild.remove();
    setTimeout(() => node.remove(), TOAST_MS);
  }

  async function loadOverview(force = false) {
    const now = Date.now();
    if (!force && now - overviewAt < OVERVIEW_MIN_GAP_MS) {
      clearTimeout(overviewTimer);
      overviewTimer = setTimeout(() => loadOverview(true), OVERVIEW_MIN_GAP_MS);
      return;
    }
    overviewAt = now;
    try {
      ctx.state = await intelApi.overview();
      drawLauncher();
      ops.refresh();
    } catch (error) {
      launcherStatus.textContent = 'OFFLINE';
    }
  }

  async function loadGeo(force = false) {
    if (replaying) return;
    const now = Date.now();
    if (!force && now - geoAt < GEO_REFRESH_MS) return;
    geoAt = now;
    try {
      layer.setData(await intelApi.geo({ hours: 24, limit: 600 }));
    } catch {
      // the next update retries
    }
  }

  subscribeIntel((event, payload) => {
    if (event === 'update') {
      for (const alert of payload.alerts ?? [])
        if (alert.tier === 'flash' || alert.tier === 'priority') toast(alert);
      loadOverview();
      loadGeo();
    } else if (event === 'brief') {
      loadOverview(true);
      ctx.claude.refresh();
    } else if (event === 'hello') {
      loadOverview(true);
      loadGeo(true);
    }
  });
  setInterval(() => loadOverview(), OVERVIEW_POLL_MS);
  setInterval(() => loadGeo(), GEO_REFRESH_MS * 2);

  window.addEventListener('keydown', (event) => {
    if (
      event.defaultPrevented ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey
    )
      return;
    if (
      event.target instanceof HTMLElement &&
      event.target.closest('input, textarea, select, [contenteditable="true"]')
    )
      return;
    if (event.key === 'Escape') {
      if (ctx.claude.isOpen) ctx.claude.close();
      else if (drawer.isOpen) drawer.close();
      else if (ops.isOpen) ops.close();
      return;
    }
    if (event.key.toLowerCase() === 'i') {
      event.preventDefault();
      if (ops.isOpen) ops.close();
      else ops.open();
    }
  });

  return { ops, layer, drawer };
}
