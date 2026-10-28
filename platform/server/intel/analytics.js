/**
 * Derived views over the store: the country instability index, the AI-sector
 * pulse and per-domain counts.
 */

import { COUNTRY_BY_ISO, OBJECTS } from './ontology.js';

const DAY = 86_400_000;

const TOPIC_WEIGHT = {
  'topic:conflict': 3,
  'topic:terror': 3,
  'topic:unrest': 2.5,
  'topic:disaster': 2,
  'topic:health': 1.5,
  'topic:cyber': 1.2,
  'topic:energy': 1,
  'topic:economy': 0.8,
  'topic:elections': 0.8,
  'topic:diplomacy': 0.5,
};

const itemTime = (item) => item.time ?? item.firstSeen;

function companyOf(item) {
  const org = item.entities.find((id) => id.startsWith('org:'));
  return org ? OBJECTS.get(org).name : item.metrics.company;
}

/**
 * Whether two funding items report the same round. Outlets word a round
 * differently and not every headline names the company before a raise verb,
 * so equal amounts match when either company appears in the other's title.
 */
function sameRound(a, b) {
  if (a.clusterId === b.clusterId) return true;
  if (a.metrics.amountUsd !== b.metrics.amountUsd) return false;
  const named = (item, other) => {
    const company = companyOf(item);
    return (
      Boolean(company) &&
      other.title.toLowerCase().includes(company.toLowerCase())
    );
  };
  return named(a, b) || named(b, a);
}

function weightFor(item) {
  let weight = 0.4;
  for (const entity of item.entities)
    weight = Math.max(weight, TOPIC_WEIGHT[entity] ?? 0);
  if (item.domain === 'hazard') weight = Math.max(weight, 2);
  return weight * (0.5 + item.severity / 100);
}

export function bandFor(score) {
  if (score >= 70) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 30) return 'elevated';
  return 'low';
}

/**
 * Country Instability Index: a 0–100 score from the last 24 h of world,
 * hazard and cyber reporting, weighted by topic and severity. The headline
 * country counts fully; other mentioned countries count 30%.
 */
export function computeInstability(store, now, history = []) {
  const raw = new Map();
  const drivers = new Map();
  for (const item of store.items.values()) {
    if (!['world', 'hazard', 'cyber'].includes(item.domain)) continue;
    if (now - itemTime(item) > DAY) continue;
    const weight = weightFor(item);
    item.countries.forEach((iso, index) => {
      const share = index === 0 ? 1 : 0.3;
      raw.set(iso, (raw.get(iso) ?? 0) + weight * share);
      if (index === 0) {
        if (!drivers.has(iso)) drivers.set(iso, []);
        drivers.get(iso).push(item);
      }
    });
  }
  // The most recent snapshot at least 20 h old is the day-over-day baseline.
  const baseline = [...history]
    .reverse()
    .find((snapshot) => now - snapshot.ts >= 20 * 3_600_000);
  const previous = new Map(
    (baseline?.cii ?? []).map((row) => [row.iso, row.score]),
  );
  return [...raw.entries()]
    .map(([iso, value]) => {
      const country = COUNTRY_BY_ISO.get(iso);
      const score = Math.round(100 * (1 - Math.exp(-value / 14)));
      const top = (drivers.get(iso) ?? [])
        .sort((a, b) => b.severity - a.severity)
        .filter(
          (item, index, all) =>
            all.findIndex((other) => other.clusterId === item.clusterId) ===
            index,
        )
        .slice(0, 3)
        .map((item) => ({
          id: item.id,
          title: item.title,
          severity: item.severity,
        }));
      return {
        iso,
        name: country.name,
        lat: country.lat,
        lon: country.lon,
        score,
        band: bandFor(score),
        delta: previous.has(iso) ? score - previous.get(iso) : null,
        trend: history
          .slice(-24)
          .map(
            (snapshot) =>
              snapshot.cii?.find((row) => row.iso === iso)?.score ?? 0,
          ),
        drivers: top,
      };
    })
    .filter((row) => row.score >= 5)
    .sort((a, b) => b.score - a.score);
}

/** The AI-sector pulse over the last 24 h, with the prior 24 h for momentum. */
export function computeAiPulse(store, now) {
  const recent = [];
  const prior = [];
  for (const item of store.items.values()) {
    if (item.domain !== 'ai') continue;
    const age = now - itemTime(item);
    if (age <= DAY) recent.push(item);
    else if (age <= 2 * DAY) prior.push(item);
  }
  const mentions = (rows) => {
    const counts = new Map();
    for (const item of rows) {
      for (const id of item.entities) {
        if (id.startsWith('org:')) counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    return counts;
  };
  const nowMentions = mentions(recent);
  const priorMentions = mentions(prior);
  const organizations = [...nowMentions.entries()]
    .map(([id, count]) => {
      const object = OBJECTS.get(id);
      const before = priorMentions.get(id) ?? 0;
      return {
        id,
        name: object.name,
        kind: object.kind,
        ticker: object.ticker,
        mentions: count,
        prior: before,
        momentum: count - before,
      };
    })
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, 15);

  const all = [...store.items.values()].filter((item) => item.domain === 'ai');
  const byKind = (kind) => all.filter((item) => item.kind === kind);
  const fundingRows = byKind('funding')
    .filter((item) => now - itemTime(item) <= 3 * DAY)
    .sort((a, b) => (b.metrics.amountUsd ?? 0) - (a.metrics.amountUsd ?? 0))
    // One row per round.
    .filter(
      (item, index, rows) =>
        rows.findIndex((other) => sameRound(other, item)) === index,
    );
  const strip = ({
    id,
    title,
    url,
    publisher,
    time,
    firstSeen,
    metrics,
    severity,
    entities,
    kind,
  }) => ({
    id,
    title,
    url,
    publisher,
    time,
    firstSeen,
    metrics,
    severity,
    entities,
    kind,
  });
  return {
    counts: {
      items24h: recent.length,
      announcements: recent.filter((item) => item.kind === 'announcement')
        .length,
      papers: byKind('paper').filter((item) => now - item.firstSeen <= DAY)
        .length,
      models: byKind('model').length,
      repos: byKind('repo').length,
      funding3d: fundingRows.length,
      fundingTotalUsd3d: fundingRows.reduce(
        (sum, item) => sum + (item.metrics.amountUsd ?? 0),
        0,
      ),
      policy: byKind('policy').filter((item) => now - itemTime(item) <= 3 * DAY)
        .length,
    },
    organizations,
    models: [
      ...byKind('model')
        .filter((item) => item.metrics.rank)
        .sort((a, b) => a.metrics.rank - b.metrics.rank)
        .slice(0, 12),
    ].map(strip),
    newModels: byKind('model')
      .filter((item) => !item.metrics.rank)
      .sort((a, b) => itemTime(b) - itemTime(a))
      .slice(0, 15)
      .map(strip),
    papers: byKind('paper')
      .sort(
        (a, b) =>
          (b.metrics.upvotes ?? 0) - (a.metrics.upvotes ?? 0) ||
          itemTime(b) - itemTime(a),
      )
      .slice(0, 15)
      .map(strip),
    repos: byKind('repo')
      .sort((a, b) => (b.metrics.stars ?? 0) - (a.metrics.stars ?? 0))
      .filter(
        (item, index, rows) =>
          rows.findIndex((other) => other.title === item.title) === index,
      )
      .slice(0, 12)
      .map(strip),
    funding: fundingRows.slice(0, 15).map(strip),
    policy: byKind('policy')
      .sort((a, b) => b.severity - a.severity || itemTime(b) - itemTime(a))
      .filter(
        (item, index, rows) =>
          rows.findIndex((other) => other.clusterId === item.clusterId) ===
          index,
      )
      .slice(0, 12)
      .map(strip),
    discussion: byKind('discussion')
      .sort((a, b) => (b.metrics.points ?? 0) - (a.metrics.points ?? 0))
      .slice(0, 10)
      .map(strip),
  };
}

export function computeCounts(store, now) {
  const counts = {
    total: store.items.size,
    last24h: 0,
    geo: 0,
    byDomain: {},
    byTier: { flash: 0, priority: 0, routine: 0 },
  };
  for (const item of store.items.values()) {
    const recent = now - itemTime(item) <= DAY;
    if (recent) counts.last24h += 1;
    if (Number.isFinite(item.lat)) counts.geo += 1;
    counts.byDomain[item.domain] = (counts.byDomain[item.domain] ?? 0) + 1;
    if (recent && item.tier) counts.byTier[item.tier] += 1;
  }
  return counts;
}

/** A global threat posture from the instability index and recent flashes. */
export function computePosture(instability, alerts, now) {
  const top =
    instability.slice(0, 5).reduce((sum, row) => sum + row.score, 0) / 5 || 0;
  const flashes = alerts.filter(
    (alert) => alert.tier === 'flash' && now - alert.ts < 6 * 3_600_000,
  ).length;
  const value = Math.min(100, Math.round(top * 0.7 + flashes * 6));
  const level =
    value >= 75
      ? 'SEVERE'
      : value >= 55
        ? 'HIGH'
        : value >= 35
          ? 'ELEVATED'
          : 'GUARDED';
  return { value, level };
}
