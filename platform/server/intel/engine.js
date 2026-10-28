/**
 * The intel engine: schedules every source on its own interval, ingests rows
 * into the store, detects what changed since the last pass, raises tiered
 * alerts, keeps snapshots for time-travel and an audit log, and persists to
 * disk so a restart resumes where it left off.
 */

import {
  mkdir,
  readFile,
  readdir,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { SOURCES } from './sources/index.js';
import { createStore, publicItem } from './store.js';
import {
  computeAiPulse,
  computeCounts,
  computeInstability,
  computePosture,
} from './analytics.js';
import {
  briefAvailability,
  briefContext,
  deterministicBrief,
  generateLlmBrief,
  refreshBriefProvider,
} from './brief.js';
import { deliverAlerts, notificationChannels } from './notify.js';
import { TIER_RANK } from './scoring.js';

const TICK_MS = 10_000;
const MAX_CONCURRENT = 4;
const SNAPSHOT_EVERY_MS = 15 * 60_000;
const SNAPSHOT_RETENTION_MS = 7 * 86_400_000;
const SAVE_DEBOUNCE_MS = 30_000;
// Claude briefs run on the user's own account or key, so the cadence is
// modest and configurable. A failed brief is retried sooner.
const AUTO_BRIEF_EVERY_MS =
  (Number(process.env.ANYSEE_BRIEF_INTERVAL_MIN) || 120) * 60_000;
const BRIEF_RETRY_MS = 15 * 60_000;
const MANUAL_BRIEF_GAP_MS = 2 * 60_000;
const MAX_ALERTS = 600;
const MAX_AUDIT = 600;
// Only stories first seen recently and published recently can raise alerts.
const ALERT_FRESHNESS_MS = 12 * 3_600_000;

export function createIntelEngine({
  dataDir,
  sources = SOURCES,
  now = () => Date.now(),
  log = console,
} = {}) {
  const store = createStore();
  const health = new Map(
    sources.map((source, index) => [
      source.id,
      {
        id: source.id,
        name: source.name,
        domain: source.domain,
        origin: source.origin ?? '',
        intervalMs: source.intervalMs,
        status: 'pending',
        runs: 0,
        failures: 0,
        lastRun: null,
        lastOk: null,
        lastError: null,
        lastCount: 0,
        lastNew: 0,
        latencyMs: null,
        // Stagger the first pass so startup is not one burst.
        nextRun: now() + index * 1_500,
      },
    ]),
  );
  const sourceData = {};
  let alerts = [];
  let audit = [];
  let snapshots = []; // index: { ts, file, counts, posture }
  let brief = null;
  let lastBriefAttempt = 0;
  let nextBriefAt = 0;
  let derived = {
    instability: [],
    pulse: null,
    counts: null,
    posture: { value: 0, level: 'GUARDED' },
    computedAt: 0,
  };
  let running = 0;
  let timer = null;
  let saveTimer = null;
  let recomputeTimer = null;
  let lastSnapshot = 0;
  let baselineDone = false;
  let briefInFlight = null;
  const listeners = new Set();
  const controller = new AbortController();

  const snapshotDir = join(dataDir, 'snapshots');
  const statePath = join(dataDir, 'state.json');

  function record(actor, action, detail = {}) {
    audit.push({ ts: now(), actor, action, ...detail });
    if (audit.length > MAX_AUDIT) audit = audit.slice(-MAX_AUDIT);
  }

  function broadcast(event, payload) {
    for (const listener of listeners) {
      try {
        listener(event, payload);
      } catch {
        listeners.delete(listener);
      }
    }
  }

  async function runSource(source, actor = 'scheduler') {
    const entry = health.get(source.id);
    entry.status = 'running';
    entry.lastRun = now();
    entry.runs += 1;
    running += 1;
    const started = Date.now();
    try {
      const output = await source.fetch({ signal: controller.signal });
      const rows = Array.isArray(output) ? output : (output.items ?? []);
      if (!Array.isArray(output) && output.data)
        sourceData[source.id] = output.data;
      let fresh = 0;
      const stamp = now();
      for (const row of rows) {
        const result = store.upsert(row, source, stamp);
        if (result?.isNew) fresh += 1;
      }
      Object.assign(entry, {
        status: 'ok',
        lastOk: stamp,
        lastError: null,
        lastCount: rows.length,
        lastNew: fresh,
        latencyMs: Date.now() - started,
      });
      if (actor !== 'scheduler')
        record(actor, 'source.run', {
          source: source.id,
          rows: rows.length,
          new: fresh,
        });
      if (fresh || output.data) scheduleRecompute();
    } catch (error) {
      if (controller.signal.aborted) return;
      entry.failures += 1;
      Object.assign(entry, {
        status: 'error',
        lastError: String(error.message ?? error).slice(0, 200),
        latencyMs: Date.now() - started,
      });
      record('system', 'source.error', {
        source: source.id,
        error: entry.lastError,
      });
    } finally {
      running -= 1;
      // Failing sources back off up to 4x their interval.
      const backoff =
        entry.status === 'error' ? Math.min(4, 1 + entry.failures * 0.5) : 1;
      entry.nextRun = now() + source.intervalMs * backoff;
      if (
        !baselineDone &&
        [...health.values()].every(
          (row) => row.runs > 0 && row.status !== 'running',
        )
      ) {
        baselineDone = true;
        record('system', 'baseline.complete', { items: store.items.size });
        scheduleRecompute(0);
      }
    }
  }

  function tick() {
    const due = sources
      .filter(
        (source) =>
          health.get(source.id).status !== 'running' &&
          health.get(source.id).nextRun <= now(),
      )
      .sort((a, b) => health.get(a.id).nextRun - health.get(b.id).nextRun);
    for (const source of due) {
      if (running >= MAX_CONCURRENT) break;
      runSource(source);
    }
    if (baselineDone && now() - lastSnapshot >= SNAPSHOT_EVERY_MS)
      writeSnapshot().catch((error) =>
        log.warn('[intel] snapshot failed', error.message),
      );
    if (
      baselineDone &&
      !briefInFlight &&
      briefAvailability().llm &&
      now() >= nextBriefAt
    )
      refreshBrief('scheduler');
  }

  function scheduleRecompute(delay = 3_000) {
    clearTimeout(recomputeTimer);
    recomputeTimer = setTimeout(recompute, delay);
  }

  /** Raise an alert for each story cluster that newly reached (or escalated to) a tier. */
  function detectAlerts(stamp) {
    const raised = [];
    for (const cluster of store.clusters.values()) {
      if (!cluster.tier || cluster.tier === 'routine') continue;
      const lead = store.items.get(cluster.leadId);
      if (!lead) continue;
      if (stamp - cluster.firstSeen > ALERT_FRESHNESS_MS) continue;
      if (lead.time && stamp - lead.time > ALERT_FRESHNESS_MS) continue;
      const previous = cluster.alertedTier;
      if (previous && TIER_RANK[previous] >= TIER_RANK[cluster.tier]) continue;
      cluster.alertedTier = cluster.tier;
      // Headlines about one funding round often land in separate clusters;
      // the same amount alerted within a day is treated as the same round.
      const amount = lead.kind === 'funding' ? lead.metrics.amountUsd : null;
      if (
        amount &&
        [...alerts, ...raised].some(
          (alert) =>
            alert.amountUsd === amount && stamp - alert.ts < 86_400_000,
        )
      )
        continue;
      raised.push({
        id: `a_${cluster.id}_${cluster.tier}`,
        ts: stamp,
        tier: cluster.tier,
        escalation: Boolean(previous),
        baseline: !baselineDone,
        clusterId: cluster.id,
        itemId: lead.id,
        title: lead.title,
        url: lead.url,
        domain: lead.domain,
        kind: lead.kind,
        severity: cluster.severity,
        publishers: cluster.publishers.size,
        countries: lead.countries,
        entities: lead.entities,
        reasons: lead.reasons,
        lat: lead.lat ?? null,
        lon: lead.lon ?? null,
        amountUsd: amount,
      });
    }
    return raised.sort((a, b) => b.severity - a.severity);
  }

  function recompute() {
    const stamp = now();
    store.prune(stamp);
    const raised = detectAlerts(stamp);
    if (raised.length) {
      alerts = [...alerts, ...raised].slice(-MAX_ALERTS);
      record('system', 'alerts.raised', {
        count: raised.length,
        flash: raised.filter((alert) => alert.tier === 'flash').length,
      });
      const live = raised.filter((alert) => !alert.baseline);
      if (live.length) {
        deliverAlerts(live).then((failures) => {
          for (const failure of failures)
            record('system', 'notify.error', { error: failure });
        });
      }
    }
    const instability = computeInstability(store, stamp, snapshotHistory());
    const pulse = computeAiPulse(store, stamp);
    derived = {
      instability,
      pulse,
      counts: computeCounts(store, stamp),
      posture: computePosture(instability, alerts, stamp),
      computedAt: stamp,
    };
    broadcast('update', {
      computedAt: stamp,
      counts: derived.counts,
      posture: derived.posture,
      alerts: raised.filter((alert) => !alert.baseline).slice(0, 10),
    });
    scheduleSave();
  }

  // Snapshot summaries kept in memory for trends; full snapshots stay on disk.
  const historyCache = [];
  function snapshotHistory() {
    return historyCache;
  }

  async function writeSnapshot() {
    const stamp = now();
    lastSnapshot = stamp;
    const geo = [...store.items.values()]
      .filter(
        (item) =>
          Number.isFinite(item.lat) &&
          stamp - (item.time ?? item.firstSeen) < 24 * 3_600_000,
      )
      .sort((a, b) => b.severity - a.severity)
      .slice(0, 500)
      .map(
        ({
          id,
          title,
          url,
          domain,
          kind,
          severity,
          tier,
          lat,
          lon,
          publisher,
          time,
          geoPrecision,
        }) => ({
          id,
          title,
          url,
          domain,
          kind,
          severity,
          tier,
          lat,
          lon,
          publisher,
          time,
          geoPrecision,
        }),
      );
    const snapshot = {
      ts: stamp,
      counts: derived.counts,
      posture: derived.posture,
      cii: derived.instability.map(({ iso, name, score, band, lat, lon }) => ({
        iso,
        name,
        score,
        band,
        lat,
        lon,
      })),
      alerts: alerts
        .filter((alert) => stamp - alert.ts < 24 * 3_600_000)
        .slice(-40),
      pulse: derived.pulse
        ? {
            counts: derived.pulse.counts,
            organizations: derived.pulse.organizations.slice(0, 8),
          }
        : null,
      geo,
    };
    await mkdir(snapshotDir, { recursive: true });
    const file = `${stamp}.json`;
    await writeFile(join(snapshotDir, file), JSON.stringify(snapshot));
    snapshots.push({
      ts: stamp,
      file,
      counts: snapshot.counts,
      posture: snapshot.posture,
    });
    historyCache.push({
      ts: stamp,
      cii: snapshot.cii.map(({ iso, score }) => ({ iso, score })),
    });
    if (historyCache.length > 96)
      historyCache.splice(0, historyCache.length - 96);
    const expired = snapshots.filter(
      (row) => stamp - row.ts > SNAPSHOT_RETENTION_MS,
    );
    snapshots = snapshots.filter(
      (row) => stamp - row.ts <= SNAPSHOT_RETENTION_MS,
    );
    await Promise.all(
      expired.map((row) => unlink(join(snapshotDir, row.file)).catch(() => {})),
    );
    record('system', 'snapshot.written', { ts: stamp, geo: geo.length });
  }

  async function readSnapshot(ts) {
    const row = snapshots.find((entry) => entry.ts === Number(ts));
    if (!row) return null;
    return JSON.parse(await readFile(join(snapshotDir, row.file), 'utf8'));
  }

  function refreshBrief(actor) {
    if (briefInFlight) return briefInFlight;
    const stamp = now();
    if (
      actor !== 'scheduler' &&
      stamp - lastBriefAttempt < MANUAL_BRIEF_GAP_MS
    ) {
      return Promise.resolve({ brief, throttled: true });
    }
    lastBriefAttempt = stamp;
    const inputs = {
      store,
      instability: derived.instability,
      pulse: derived.pulse,
      posture: derived.posture,
      quotes: sourceData.markets?.quotes,
      now: stamp,
    };
    briefInFlight = (async () => {
      if (!briefAvailability().llm) {
        brief = deterministicBrief(inputs);
        return { brief };
      }
      try {
        brief = await generateLlmBrief(briefContext(inputs), {
          signal: controller.signal,
        });
        nextBriefAt = now() + AUTO_BRIEF_EVERY_MS;
        record(actor, 'brief.generated', {
          model: brief.generator,
          via: brief.via,
          ...brief.usage,
        });
      } catch (error) {
        nextBriefAt = now() + BRIEF_RETRY_MS;
        // A sign-out or a removed key shows up here; re-detect the provider.
        refreshBriefProvider();
        const reason =
          error instanceof Anthropic.AuthenticationError
            ? 'Anthropic credentials were rejected'
            : error instanceof Anthropic.RateLimitError
              ? 'Anthropic rate limit; retrying next cycle'
              : String(error.message ?? error).slice(0, 200);
        record('system', 'brief.error', { error: reason });
        brief = { ...deterministicBrief(inputs), error: reason };
      }
      broadcast('brief', { generatedAt: brief.generatedAt });
      scheduleSave();
      return { brief };
    })().finally(() => {
      briefInFlight = null;
    });
    return briefInFlight;
  }

  function scheduleSave() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      save().catch((error) => log.warn('[intel] save failed', error.message));
    }, SAVE_DEBOUNCE_MS);
  }

  async function save() {
    await mkdir(dataDir, { recursive: true });
    const body = JSON.stringify({
      version: 1,
      savedAt: now(),
      items: store.serialize(),
      alerts,
      audit,
      brief,
      sourceData,
      snapshots,
      historyCache,
    });
    const temp = `${statePath}.tmp`;
    await writeFile(temp, body);
    await rename(temp, statePath);
  }

  async function load() {
    try {
      const state = JSON.parse(await readFile(statePath, 'utf8'));
      const stamp = now();
      store.restore(state.items, stamp);
      alerts = state.alerts ?? [];
      for (const alert of alerts) {
        const cluster = store.clusters.get(alert.clusterId);
        if (
          cluster &&
          (!cluster.alertedTier ||
            TIER_RANK[alert.tier] > TIER_RANK[cluster.alertedTier])
        )
          cluster.alertedTier = alert.tier;
      }
      audit = state.audit ?? [];
      brief = state.brief ?? null;
      Object.assign(sourceData, state.sourceData ?? {});
      historyCache.push(...(state.historyCache ?? []));
      const files = new Set(await readdir(snapshotDir).catch(() => []));
      snapshots = (state.snapshots ?? []).filter((row) => files.has(row.file));
      lastSnapshot = snapshots.at(-1)?.ts ?? 0;
      // Restored data counts as the baseline: alerts resume immediately.
      baselineDone = store.items.size > 0;
      record('system', 'state.restored', {
        items: store.items.size,
        alerts: alerts.length,
      });
    } catch (error) {
      if (error.code !== 'ENOENT')
        log.warn('[intel] could not restore state:', error.message);
    }
  }

  return {
    store,
    async start() {
      await load();
      await refreshBriefProvider();
      if (brief && brief.generator !== 'rules')
        nextBriefAt = brief.generatedAt + AUTO_BRIEF_EVERY_MS;
      record('system', 'engine.start', {
        sources: sources.length,
        llmBrief: briefAvailability().llm,
        notify: notificationChannels(),
      });
      recompute();
      timer = setInterval(tick, TICK_MS);
      timer.unref?.();
      tick();
    },
    async stop() {
      clearInterval(timer);
      clearTimeout(recomputeTimer);
      clearTimeout(saveTimer);
      controller.abort();
      await save().catch(() => {});
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    sweep(actor = 'user') {
      record(actor, 'sweep.requested', {});
      for (const entry of health.values())
        if (entry.status !== 'running') entry.nextRun = now();
      tick();
    },
    refreshBrief,
    /** Re-detect Claude after a sign-in, and write a brief straight away. */
    async claudeConnected(actor = 'user') {
      const detected = await refreshBriefProvider();
      record(actor, 'claude.connected', {
        provider: detected.provider,
        account: detected.claudeCode?.email ?? null,
      });
      if (detected.llm) {
        nextBriefAt = 0;
        lastBriefAttempt = 0;
        if (baselineDone) refreshBrief(actor);
      }
      return detected;
    },
    readSnapshot,
    get derived() {
      return derived;
    },
    get brief() {
      return brief;
    },
    get alerts() {
      return alerts;
    },
    get audit() {
      return audit;
    },
    get snapshots() {
      return snapshots;
    },
    get sourceData() {
      return sourceData;
    },
    health: () => [...health.values()],
    status: () => ({
      baselineDone,
      items: store.items.size,
      clusters: store.clusters.size,
      running,
      brief: briefAvailability(),
      notify: notificationChannels(),
    }),
    publicItem,
  };
}
