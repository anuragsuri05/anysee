/**
 * /api/intel routes. Reads are open to the local app; writes (sweep, brief,
 * Claude sign-in) need the `X-Anysee: 1` header, which a cross-site page
 * cannot send without a CORS preflight this server never approves. Writes
 * that run Claude Code or spend Claude usage also need a loopback request.
 */

import { deterministicBrief } from './brief.js';
import {
  cancelClaudeLogin,
  claudeLoginState,
  startClaudeLogin,
  submitClaudeLoginCode,
} from './claudeCode.js';
import { OBJECTS, describeObject } from './ontology.js';
import { DOMAINS, SOURCES } from './sources/index.js';
import { publicItem } from './store.js';

const MAX_LIMIT = 500;
const itemTime = (item) => item.time ?? item.firstSeen;

function send(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

function limitParam(params, fallback) {
  const value = Number(params.get('limit'));
  return Number.isFinite(value) && value > 0
    ? Math.min(MAX_LIMIT, Math.floor(value))
    : fallback;
}

function matchesQuery(item, params) {
  const domain = params.get('domain');
  if (domain && !domain.split(',').includes(item.domain)) return false;
  const kind = params.get('kind');
  if (kind && !kind.split(',').includes(item.kind)) return false;
  const country = params.get('country');
  if (country && !item.countries.includes(country.toUpperCase())) return false;
  const entity = params.get('entity');
  if (entity && !item.entities.includes(entity)) return false;
  const tier = params.get('tier');
  if (tier && !tier.split(',').includes(item.tier)) return false;
  const since = Number(params.get('since'));
  if (since && itemTime(item) < since) return false;
  const minSeverity = Number(params.get('min_severity'));
  if (minSeverity && item.severity < minSeverity) return false;
  const q = params.get('q')?.trim().toLowerCase();
  if (
    q &&
    !`${item.title} ${item.summary} ${item.publisher}`.toLowerCase().includes(q)
  )
    return false;
  return true;
}

/** The brief to show: Claude's when fresh, else one built from the rules. */
function currentBrief(engine) {
  const brief = engine.brief;
  const now = Date.now();
  if (
    brief &&
    brief.generator !== 'rules' &&
    now - brief.generatedAt < 3 * 3_600_000
  )
    return brief;
  const derived = engine.derived;
  return {
    ...deterministicBrief({
      store: engine.store,
      instability: derived.instability,
      pulse: derived.pulse,
      posture: derived.posture,
      now,
    }),
    ...(brief?.error ? { error: brief.error } : {}),
  };
}

function searchAround(engine, entityId, limit) {
  const object = describeObject(entityId);
  if (!object) return null;
  const ids = engine.store.links.itemsFor(entityId);
  const items = [...ids]
    .map((id) => engine.store.items.get(id))
    .filter(Boolean)
    .sort((a, b) => itemTime(b) - itemTime(a));
  const related = new Map();
  for (const item of items) {
    for (const other of item.entities) {
      if (other === entityId) continue;
      related.set(other, (related.get(other) ?? 0) + 1);
    }
  }
  const instability =
    object.type === 'country'
      ? (engine.derived.instability.find((row) => row.iso === object.iso) ??
        null)
      : null;
  const quote = object.ticker
    ? (engine.sourceData.markets?.quotes?.find(
        (row) => row.symbol === object.ticker,
      ) ?? null)
    : null;
  const byDomain = {};
  for (const item of items)
    byDomain[item.domain] = (byDomain[item.domain] ?? 0) + 1;
  return {
    object,
    total: items.length,
    byDomain,
    instability,
    quote,
    items: items.slice(0, limit).map(publicItem),
    related: [...related.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 24)
      .map(([id, weight]) => ({ ...describeObject(id), weight })),
  };
}

// Routes that run Claude Code or spend the user's Claude usage.
const LOCAL_ONLY = /^\/(claude\/|brief$)/;
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/** A request from this machine, not forwarded by a proxy or tunnel. */
function isLoopback(req) {
  return (
    LOOPBACK.has(req.socket?.remoteAddress) &&
    !req.headers['x-forwarded-for'] &&
    !req.headers.forwarded
  );
}

const MAX_BODY_BYTES = 16 * 1024;

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY_BYTES) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Body must be JSON'));
      }
    });
    req.on('error', reject);
  });
}

/** What the dashboard shows about the Claude connection. */
function claudeView(engine) {
  const status = engine.status().brief;
  const account = status.claudeCode;
  return {
    connected: status.llm,
    provider: status.provider,
    setting: status.setting,
    model: status.model,
    reason: status.reason,
    briefEveryMin: Number(process.env.ANYSEE_BRIEF_INTERVAL_MIN) || 120,
    claudeCode: account
      ? {
          installed: account.installed,
          version: account.version ?? null,
          loggedIn: account.loggedIn,
          email: account.email ?? null,
          plan: account.subscriptionType ?? null,
          authMethod: account.authMethod ?? null,
        }
      : null,
    login: claudeLoginState(),
    lastBrief: engine.brief
      ? {
          generatedAt: engine.brief.generatedAt,
          generator: engine.brief.generator,
          via: engine.brief.via ?? null,
          error: engine.brief.error ?? null,
        }
      : null,
  };
}

function isTrustedWrite(req) {
  if (req.headers['x-anysee'] !== '1') return false;
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

export function createIntelApi(engine) {
  const routes = {
    'GET /overview': () => {
      const derived = engine.derived;
      return {
        status: engine.status(),
        computedAt: derived.computedAt,
        posture: derived.posture,
        counts: derived.counts,
        domains: DOMAINS,
        instability: derived.instability.slice(0, 40),
        pulse: derived.pulse,
        quotes: engine.sourceData.markets?.quotes ?? [],
        alerts: engine.alerts.slice(-60).reverse(),
        brief: currentBrief(engine),
        health: engine.health(),
        snapshots: engine.snapshots.map(({ ts, posture, counts }) => ({
          ts,
          posture,
          total: counts?.total ?? 0,
        })),
      };
    },
    'GET /feed': (params) => {
      const limit = limitParam(params, 100);
      const rows = [...engine.store.items.values()].filter((item) =>
        matchesQuery(item, params),
      );
      const sort = params.get('sort') ?? 'time';
      rows.sort(
        sort === 'severity'
          ? (a, b) => b.severity - a.severity || itemTime(b) - itemTime(a)
          : (a, b) => itemTime(b) - itemTime(a),
      );
      // One row per story unless asked otherwise.
      const seen = new Set();
      const unique =
        params.get('clusters') === 'all'
          ? rows
          : rows.filter(
              (item) => !seen.has(item.clusterId) && seen.add(item.clusterId),
            );
      return {
        total: unique.length,
        items: unique.slice(0, limit).map(publicItem),
      };
    },
    'GET /item': (params) => {
      const item = engine.store.items.get(params.get('id'));
      if (!item) return null;
      const cluster = engine.store.clusters.get(item.clusterId);
      return {
        item: publicItem(item),
        cluster: cluster
          ? {
              id: cluster.id,
              severity: cluster.severity,
              tier: cluster.tier,
              publishers: [...cluster.publishers],
              items: [...cluster.itemIds]
                .map((id) => engine.store.items.get(id))
                .filter(Boolean)
                .map(({ id, title, url, publisher, time }) => ({
                  id,
                  title,
                  url,
                  publisher,
                  time,
                })),
            }
          : null,
        entities: item.entities.map(describeObject).filter(Boolean),
        lineage: {
          source:
            SOURCES.find((source) => source.id === item.sourceId)?.name ??
            item.sourceId,
          sourceId: item.sourceId,
          firstSeen: item.firstSeen,
          lastSeen: item.lastSeen,
        },
      };
    },
    'GET /geo': (params) => {
      const hours = Math.min(72, Number(params.get('hours')) || 24);
      const cutoff = Date.now() - hours * 3_600_000;
      const items = [...engine.store.items.values()]
        .filter(
          (item) =>
            Number.isFinite(item.lat) &&
            itemTime(item) >= cutoff &&
            matchesQuery(item, params),
        )
        .sort((a, b) => b.severity - a.severity)
        .slice(0, limitParam(params, 400))
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
            clusterSize,
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
            clusterSize,
          }),
        );
      return { items, instability: engine.derived.instability.slice(0, 60) };
    },
    'GET /alerts': (params) => {
      const tier = params.get('tier');
      const rows = engine.alerts.filter(
        (alert) => !tier || tier.split(',').includes(alert.tier),
      );
      return {
        total: rows.length,
        alerts: rows.slice(-limitParam(params, 100)).reverse(),
      };
    },
    'GET /entities': (params) => {
      const type = params.get('type');
      const rows = [];
      for (const id of engine.store.links.entityIds()) {
        const object = OBJECTS.get(id);
        if (!object || (type && object.type !== type)) continue;
        const count = engine.store.links.itemsFor(id).size;
        if (count) rows.push({ ...describeObject(id), count });
      }
      rows.sort((a, b) => b.count - a.count);
      return { entities: rows.slice(0, limitParam(params, 200)) };
    },
    'GET /entity': (params) =>
      searchAround(engine, params.get('id'), limitParam(params, 60)),
    'GET /health': () => ({
      status: engine.status(),
      sources: engine.health(),
    }),
    'GET /audit': (params) => ({
      events: engine.audit.slice(-limitParam(params, 200)).reverse(),
    }),
    'GET /snapshots': () => ({
      snapshots: engine.snapshots.map(({ ts, posture, counts }) => ({
        ts,
        posture,
        counts,
      })),
    }),
    'GET /snapshot': async (params) => engine.readSnapshot(params.get('ts')),
    'GET /markets': () => engine.sourceData.markets ?? { quotes: [] },
    'GET /brief': () => currentBrief(engine),
    'POST /brief': async () => {
      const result = await engine.refreshBrief('user');
      return { ...currentBrief(engine), throttled: Boolean(result.throttled) };
    },
    'POST /sweep': () => {
      engine.sweep('user');
      return { ok: true };
    },
    // Claude connection. Sign-in runs Claude Code on this machine, so those
    // routes answer loopback requests only (see LOCAL_ONLY).
    'GET /claude': () => claudeView(engine),
    'POST /claude/refresh': async () => {
      await engine.claudeConnected('user');
      return claudeView(engine);
    },
    'POST /claude/login': () => {
      startClaudeLogin({
        onDone: (state) => {
          if (state === 'done') engine.claudeConnected('user');
        },
      });
      return claudeView(engine);
    },
    'POST /claude/login/code': async (_params, req) => {
      const { code } = await readJson(req);
      const result = submitClaudeLoginCode(code);
      return { ...claudeView(engine), error: result.error ?? null };
    },
    'POST /claude/login/cancel': () => {
      cancelClaudeLogin();
      return claudeView(engine);
    },
  };

  return async function intelApi(req, res, next) {
    const url = new URL(req.url, 'http://local');
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (req.method === 'GET' && path === '/stream') return stream(req, res);
    const route = routes[`${req.method} ${path}`];
    if (!route) return next();
    if (req.method !== 'GET' && !isTrustedWrite(req))
      return send(res, 403, {
        error: 'Writes need the X-Anysee header from this origin',
      });
    if (LOCAL_ONLY.test(path) && req.method !== 'GET' && !isLoopback(req))
      return send(res, 403, {
        error: 'Connect Claude from the machine that runs Anysee',
      });
    try {
      const body = await route(url.searchParams, req);
      if (body == null) return send(res, 404, { error: 'Not found' });
      send(res, 200, body);
    } catch (error) {
      send(res, 500, { error: String(error.message ?? error).slice(0, 200) });
    }
  };

  function stream(req, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
    });
    const write = (event, payload) =>
      res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    write('hello', { computedAt: engine.derived.computedAt });
    const unsubscribe = engine.subscribe(write);
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 25_000);
    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  }
}
