/**
 * The ontology: typed objects (countries, organisations, topics, and the
 * items sources report) linked by mentions. Resolves free text to object ids
 * and answers "search around" questions over the links.
 */

import { createHash } from 'node:crypto';
import { COUNTRIES, ORGANIZATIONS, TOPICS } from './gazetteer.js';

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function aliasMatcher(objects, flags) {
  const byAlias = new Map();
  for (const object of objects) {
    for (const alias of object.aliases ?? object.keywords) {
      const key = flags.includes('i') ? alias.toLowerCase() : alias;
      if (!byAlias.has(key)) byAlias.set(key, object);
    }
  }
  // Longest first, so "South Sudan" wins over "Sudan" at the same position.
  const alternation = [...byAlias.keys()]
    .sort((a, b) => b.length - a.length)
    .map(escape)
    .join('|');
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${alternation})(?![\\p{L}\\p{N}])`,
    `g${flags}u`,
  );
  return (text) => {
    const found = [];
    for (const match of text.matchAll(pattern)) {
      const key = flags.includes('i') ? match[0].toLowerCase() : match[0];
      const object = byAlias.get(key);
      if (object) found.push(object);
    }
    return found;
  };
}

const matchCountries = aliasMatcher(COUNTRIES, '');
const matchOrganizations = aliasMatcher(ORGANIZATIONS, '');
const matchTopics = aliasMatcher(TOPICS, 'i');

export const OBJECTS = new Map(
  [...COUNTRIES, ...ORGANIZATIONS, ...TOPICS].map((object) => [
    object.id,
    object,
  ]),
);
export const COUNTRY_BY_ISO = new Map(
  COUNTRIES.map((country) => [country.iso, country]),
);

const AI_TOPICS = new Set([
  'topic:ai_models',
  'topic:ai_chips',
  'topic:ai_funding',
  'topic:ai_policy',
  'topic:ai_research',
]);

/** Stable id for an item: its URL when it has one, else source and title. */
export function itemId(sourceId, url, title) {
  return createHash('sha1')
    .update(url || `${sourceId}|${title}`)
    .digest('base64url')
    .slice(0, 16);
}

function counted(objects) {
  const counts = new Map();
  for (const object of objects)
    counts.set(object.id, (counts.get(object.id) ?? 0) + 1);
  return counts;
}

/**
 * Resolve an item's text to linked object ids. The title counts double, so
 * the country a headline is about outranks one its summary mentions.
 */
export function resolveEntities(item) {
  const title = item.title ?? '';
  const body = item.summary ?? '';
  const countries = counted([
    ...matchCountries(title),
    ...matchCountries(title),
    ...matchCountries(body),
  ]);
  const organizations = counted([
    ...matchOrganizations(title),
    ...matchOrganizations(body),
  ]);
  const isAi = item.domain === 'ai' || organizations.size > 0;
  const topics = new Set(
    [...matchTopics(`${title} ${body}`)]
      .map((topic) => topic.id)
      .filter((id) => isAi || !AI_TOPICS.has(id)),
  );
  const rankedCountries = [...countries.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);
  return {
    countries: rankedCountries.map((id) => OBJECTS.get(id).iso),
    organizations: [...organizations.keys()],
    topics: [...topics],
    entities: [...rankedCountries, ...organizations.keys(), ...topics],
  };
}

/** A deterministic offset so items placed at one centroid don't stack. */
export function centroidJitter(id, spreadDeg = 1.6) {
  const hash = createHash('md5').update(id).digest();
  const angle = (hash[0] / 255) * Math.PI * 2;
  const radius = Math.sqrt(hash[1] / 255) * spreadDeg;
  return [Math.sin(angle) * radius, Math.cos(angle) * radius];
}

const STOPWORDS = new Set(
  'the a an and or of to in on for with at by from as is are was were be been has have had it its this that after over into new says say said will could would amid about than more up out not but who what why how live news us his her their they he she we you our'.split(
    ' ',
  ),
);

/** Normalised word set for near-duplicate story detection. */
export function titleTokens(title) {
  return new Set(
    (title ?? '')
      .toLowerCase()
      .replace(/[’']/g, '')
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word.length > 2 && !STOPWORDS.has(word)),
  );
}

export function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/**
 * Index of item ids per linked object, for search-around and for counting
 * mentions. Kept in step with the store.
 */
export function createLinkIndex() {
  const byEntity = new Map();
  return {
    add(item) {
      for (const id of item.entities ?? []) {
        if (!byEntity.has(id)) byEntity.set(id, new Set());
        byEntity.get(id).add(item.id);
      }
    },
    remove(item) {
      for (const id of item.entities ?? []) byEntity.get(id)?.delete(item.id);
    },
    itemsFor(entityId) {
      return byEntity.get(entityId) ?? new Set();
    },
    entityIds() {
      return byEntity.keys();
    },
  };
}

/** Describe an object for the API, with counts filled by the caller. */
export function describeObject(id) {
  const object = OBJECTS.get(id);
  if (!object) return null;
  const { aliases, keywords, ...rest } = object;
  return rest;
}
