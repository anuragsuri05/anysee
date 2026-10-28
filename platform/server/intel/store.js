/**
 * The item store: normalised items from every source, grouped into story
 * clusters (the same event from several publishers) and indexed by linked
 * object. Items keep their lineage: source connector, publisher, fetch time.
 */

import {
  COUNTRY_BY_ISO,
  OBJECTS,
  centroidJitter,
  createLinkIndex,
  itemId,
  jaccard,
  resolveEntities,
  titleTokens,
} from './ontology.js';
import { baseSeverity, corroborationBonus, tierFor } from './scoring.js';

const RETENTION_MS = 72 * 3_600_000;
const MAX_ITEMS = 8_000;
const CLUSTER_WINDOW_MS = 48 * 3_600_000;
const CLUSTER_SIMILARITY = 0.5;

export function createStore() {
  const items = new Map();
  const tokens = new Map(); // itemId -> Set(word)
  const byToken = new Map(); // word -> Set(itemId)
  const clusters = new Map();
  const links = createLinkIndex();

  function indexTokens(item, words) {
    tokens.set(item.id, words);
    for (const word of words) {
      if (!byToken.has(word)) byToken.set(word, new Set());
      byToken.get(word).add(item.id);
    }
  }

  function unindexTokens(id) {
    for (const word of tokens.get(id) ?? []) {
      const set = byToken.get(word);
      set?.delete(id);
      if (set && !set.size) byToken.delete(word);
    }
    tokens.delete(id);
  }

  function findCluster(item, words, now) {
    // Candidates share the item's rarest words, which keeps this sublinear.
    const rare = [...words]
      .map((word) => [word, byToken.get(word)?.size ?? 0])
      .filter(([, size]) => size > 0)
      .sort((a, b) => a[1] - b[1])
      .slice(0, 3);
    let best = null;
    let bestScore = CLUSTER_SIMILARITY;
    for (const [word] of rare) {
      for (const candidateId of byToken.get(word) ?? []) {
        const candidate = items.get(candidateId);
        if (!candidate || candidate.domain !== item.domain) continue;
        if (now - candidate.firstSeen > CLUSTER_WINDOW_MS) continue;
        const score = jaccard(words, tokens.get(candidateId));
        if (score > bestScore) {
          bestScore = score;
          best = candidate.clusterId;
        }
      }
    }
    return best;
  }

  function refreshCluster(cluster) {
    let lead = null;
    let maxBase = 0;
    for (const id of cluster.itemIds) {
      const member = items.get(id);
      if (!member) continue;
      if (member.baseSeverity > maxBase || !lead) {
        maxBase = Math.max(maxBase, member.baseSeverity);
        lead = member;
      }
    }
    if (!lead) return;
    cluster.leadId = lead.id;
    cluster.title = lead.title;
    cluster.severity = Math.min(
      100,
      maxBase + corroborationBonus(cluster.publishers.size),
    );
    cluster.tier = tierFor(cluster.severity);
    for (const id of cluster.itemIds) {
      const member = items.get(id);
      if (member) {
        member.severity = Math.min(
          100,
          member.baseSeverity + corroborationBonus(cluster.publishers.size),
        );
        member.tier = tierFor(member.severity);
        member.clusterSize = cluster.publishers.size;
      }
    }
  }

  /** Normalise one raw source row and add it. Returns the item and whether it is new. */
  function upsert(raw, source, now) {
    const title = (raw.title ?? '').trim();
    if (!title) return null;
    const id = itemId(source.id, raw.idKey ?? raw.url, title);
    const existing = items.get(id);
    if (existing) {
      existing.lastSeen = now;
      if (raw.metrics)
        existing.metrics = { ...existing.metrics, ...raw.metrics };
      return { item: existing, isNew: false };
    }
    const item = {
      id,
      domain: raw.domain ?? source.domain,
      kind: raw.kind ?? source.kind,
      title: title.slice(0, 300),
      summary: (raw.summary ?? '').slice(0, 500),
      url: raw.url || null,
      publisher: raw.publisher ?? source.name,
      sourceId: source.id,
      time: Number.isFinite(raw.time) ? Math.min(raw.time, now) : null,
      firstSeen: now,
      lastSeen: now,
      metrics: raw.metrics ?? {},
      tags: raw.tags ?? [],
    };
    const resolved = resolveEntities(item);
    let countries = resolved.countries;
    if (raw.countryHint) {
      const hinted = [...COUNTRY_BY_ISO.values()].find(
        (country) =>
          country.iso === raw.countryHint || country.name === raw.countryHint,
      );
      if (hinted && !countries.includes(hinted.iso))
        countries = [hinted.iso, ...countries];
    }
    item.countries = countries;
    item.entities = [
      ...countries.map((iso) => `country:${iso}`),
      ...new Set([...resolved.organizations, ...(raw.entityHints ?? [])]),
      ...resolved.topics,
    ].filter((entity, index, all) => all.indexOf(entity) === index);
    if (Number.isFinite(raw.lat) && Number.isFinite(raw.lon)) {
      item.lat = raw.lat;
      item.lon = raw.lon;
      item.geoPrecision = 'exact';
    } else if (countries.length) {
      const country = COUNTRY_BY_ISO.get(countries[0]);
      const [dLat, dLon] = centroidJitter(id);
      item.lat = country.lat + dLat;
      item.lon = country.lon + dLon;
      item.geoPrecision = 'country';
    } else {
      // AI-sector items without a country sit at their organisation's HQ.
      const org = item.entities
        .map((entityId) => OBJECTS.get(entityId))
        .find((object) => object?.type === 'organization');
      if (org) {
        const [dLat, dLon] = centroidJitter(id, 0.4);
        item.lat = org.lat + dLat;
        item.lon = org.lon + dLon;
        item.geoPrecision = 'organization';
      }
    }
    const scored = baseSeverity(item);
    item.baseSeverity = scored.severity;
    item.reasons = scored.reasons;

    const words = titleTokens(title);
    const clusterId =
      (words.size >= 3 && findCluster(item, words, now)) || `c_${id}`;
    item.clusterId = clusterId;
    items.set(id, item);
    indexTokens(item, words);
    links.add(item);
    if (!clusters.has(clusterId)) {
      clusters.set(clusterId, {
        id: clusterId,
        domain: item.domain,
        itemIds: new Set(),
        publishers: new Set(),
        firstSeen: now,
        alertedTier: null,
      });
    }
    const cluster = clusters.get(clusterId);
    cluster.itemIds.add(id);
    cluster.publishers.add(item.publisher);
    cluster.lastSeen = now;
    refreshCluster(cluster);
    return { item, isNew: true };
  }

  function remove(id) {
    const item = items.get(id);
    if (!item) return;
    items.delete(id);
    unindexTokens(id);
    links.remove(item);
    const cluster = clusters.get(item.clusterId);
    if (cluster) {
      cluster.itemIds.delete(id);
      if (!cluster.itemIds.size) clusters.delete(cluster.id);
      else refreshCluster(cluster);
    }
  }

  function prune(now) {
    for (const item of items.values()) {
      if (now - item.lastSeen > RETENTION_MS) remove(item.id);
    }
    if (items.size > MAX_ITEMS) {
      const oldest = [...items.values()]
        .sort((a, b) => a.lastSeen - b.lastSeen)
        .slice(0, items.size - MAX_ITEMS);
      for (const item of oldest) remove(item.id);
    }
  }

  /** Items as they are persisted and served: plain data, no indexes. */
  function serialize() {
    return [...items.values()];
  }

  /** Restore persisted items, rebuilding clusters and indexes. */
  function restore(rows, now) {
    for (const row of rows ?? []) {
      if (!row?.id || now - (row.lastSeen ?? 0) > RETENTION_MS) continue;
      items.set(row.id, row);
      indexTokens(row, titleTokens(row.title));
      links.add(row);
      if (!clusters.has(row.clusterId)) {
        clusters.set(row.clusterId, {
          id: row.clusterId,
          domain: row.domain,
          itemIds: new Set(),
          publishers: new Set(),
          firstSeen: row.firstSeen,
          alertedTier: null,
        });
      }
      const cluster = clusters.get(row.clusterId);
      cluster.itemIds.add(row.id);
      cluster.publishers.add(row.publisher);
      cluster.firstSeen = Math.min(cluster.firstSeen, row.firstSeen);
      cluster.lastSeen = Math.max(cluster.lastSeen ?? 0, row.lastSeen);
    }
    for (const cluster of clusters.values()) refreshCluster(cluster);
  }

  return { items, clusters, links, upsert, prune, serialize, restore };
}

/** Public shape of an item. */
export function publicItem(item) {
  if (!item) return null;
  const { baseSeverity: _base, ...rest } = item;
  return rest;
}
