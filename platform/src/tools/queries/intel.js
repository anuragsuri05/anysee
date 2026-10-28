/**
 * Anysee intel queries: the brief, alerts, the instability index, the AI
 * sector and search-around over linked objects, read from /api/intel.
 */

import { defineTool, ToolError } from '../catalog.js';
import { LIMIT_SCHEMA, capRows, isoTime } from '../results.js';

async function intel(services, path, signal) {
  const response = await services.app.fetch(`/api/intel${path}`, { signal });
  if (response.status === 404)
    throw new ToolError('invalid_arguments', 'No object or item has that id');
  if (!response.ok)
    throw new ToolError(
      'unavailable',
      `The intel engine answered ${response.status}`,
    );
  return response.json();
}

const row = (item) => ({
  id: item.id,
  title: item.title,
  domain: item.domain,
  kind: item.kind,
  severity: item.severity,
  tier: item.tier ?? null,
  publisher: item.publisher,
  sources: item.clusterSize ?? 1,
  time: isoTime(item.time ?? item.firstSeen),
  url: item.url,
  countries: item.countries,
});

export const getIntelBrief = defineTool({
  name: 'get_intel_brief',
  title: 'Intelligence brief',
  description:
    "Anysee's current all-source brief: global threat posture, headline, per-domain bullets " +
    '(world, hazards, cyber, AI sector, markets) and a watchlist, built from public news, ' +
    'hazard, cyber, research and market feeds.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  requires: ['app'],
  async run(_args, { services, signal }) {
    const overview = await intel(services, '/overview', signal);
    const brief = overview.brief;
    return {
      summary: `${overview.posture.level} (${overview.posture.value}). ${brief.headline}. ${brief.summary}`,
      data: {
        posture: overview.posture,
        brief,
        top_instability: overview.instability
          .slice(0, 10)
          .map(({ name, iso, score, band, delta }) => ({
            name,
            iso,
            score,
            band,
            delta,
          })),
      },
    };
  },
});

export const getIntelAlerts = defineTool({
  name: 'get_intel_alerts',
  title: 'Intel alerts',
  description:
    'Recent Anysee alerts, newest first. FLASH (severity 80+) and PRIORITY (60+) alerts are raised ' +
    'when a story first reaches that tier or escalates, scored on keywords, hazard magnitude, ' +
    'corroboration across publishers, funding size and similar rules.',
  inputSchema: {
    type: 'object',
    properties: {
      tier: { type: 'string', enum: ['flash', 'priority'] },
      limit: LIMIT_SCHEMA,
    },
    additionalProperties: false,
  },
  requires: ['app'],
  async run(args, { services, signal }) {
    const { alerts } = await intel(
      services,
      `/alerts?limit=200${args.tier ? `&tier=${args.tier}` : ''}`,
      signal,
    );
    const result = capRows(alerts, args.limit);
    return {
      summary: `${alerts.length} ${args.tier ?? 'flash and priority'} alerts on record.`,
      data: {
        ...result,
        rows: result.rows.map((alert) => ({
          tier: alert.tier,
          escalation: alert.escalation,
          title: alert.title,
          domain: alert.domain,
          severity: alert.severity,
          sources: alert.publishers,
          raised: isoTime(alert.ts),
          url: alert.url,
          countries: alert.countries,
        })),
      },
    };
  },
});

export const searchIntel = defineTool({
  name: 'search_intel',
  title: 'Search intel feed',
  description:
    'Search the Anysee feed of the last 72 hours across world news, hazards, cyber, the AI sector ' +
    'and markets. One row per story, with its severity and how many publishers carried it.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Words to find in titles, summaries or publishers.',
      },
      domain: {
        type: 'string',
        enum: ['world', 'hazard', 'cyber', 'ai', 'markets'],
      },
      kind: {
        type: 'string',
        enum: [
          'news',
          'event',
          'announcement',
          'funding',
          'policy',
          'paper',
          'model',
          'repo',
          'discussion',
          'vulnerability',
        ],
      },
      country: {
        type: 'string',
        description: 'ISO 3166-1 alpha-2 code, such as UA.',
      },
      min_severity: { type: 'number', minimum: 0, maximum: 100 },
      sort: { type: 'string', enum: ['time', 'severity'] },
      limit: LIMIT_SCHEMA,
    },
    additionalProperties: false,
  },
  requires: ['app'],
  async run(args, { services, signal }) {
    const params = new URLSearchParams({
      limit: '200',
      sort: args.sort ?? 'time',
    });
    if (args.query) params.set('q', args.query);
    for (const key of ['domain', 'kind', 'country', 'min_severity'])
      if (args[key] != null) params.set(key, String(args[key]));
    const feed = await intel(services, `/feed?${params}`, signal);
    const result = capRows(feed.items, args.limit);
    return {
      summary: `${feed.total} stories match.`,
      data: { ...result, rows: result.rows.map(row) },
    };
  },
});

export const getAiSectorPulse = defineTool({
  name: 'get_ai_sector_pulse',
  title: 'AI sector pulse',
  description:
    'The AI sector over the last day: most-mentioned organisations and their momentum, recent ' +
    'funding rounds with amounts, trending and newly released models, top papers, rising ' +
    'open-source repositories and policy developments.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  requires: ['app'],
  async run(_args, { services, signal }) {
    const { pulse } = await intel(services, '/overview', signal);
    if (!pulse)
      throw new ToolError('unavailable', 'The first AI sweep has not finished');
    const brief = (items) =>
      items.slice(0, 8).map((item) => ({
        title: item.title,
        url: item.url,
        publisher: item.publisher,
        metrics: item.metrics,
      }));
    return {
      summary:
        `${pulse.counts.items24h} AI items in 24 h; ${pulse.counts.funding3d} funding rounds in 3 days. ` +
        `Most mentioned: ${pulse.organizations
          .slice(0, 5)
          .map((org) => `${org.name} (${org.mentions})`)
          .join(', ')}.`,
      data: {
        counts: pulse.counts,
        organizations: pulse.organizations,
        funding: brief(pulse.funding),
        trending_models: brief(pulse.models),
        new_models: brief(pulse.newModels),
        papers: brief(pulse.papers),
        repos: brief(pulse.repos),
        policy: brief(pulse.policy),
      },
    };
  },
});

export const getCountryInstability = defineTool({
  name: 'get_country_instability',
  title: 'Country instability index',
  description:
    'Countries ranked by a 0–100 instability score from the last 24 hours of conflict, unrest, ' +
    'terrorism, disaster, health and cyber reporting, with the day-over-day change and the stories driving it.',
  inputSchema: {
    type: 'object',
    properties: { limit: LIMIT_SCHEMA },
    additionalProperties: false,
  },
  requires: ['app'],
  async run(args, { services, signal }) {
    const { instability } = await intel(services, '/overview', signal);
    const result = capRows(instability, args.limit);
    return {
      summary: instability.length
        ? `Highest: ${instability
            .slice(0, 5)
            .map((entry) => `${entry.name} ${entry.score}`)
            .join(', ')}.`
        : 'No country has a score yet.',
      data: {
        ...result,
        rows: result.rows.map(({ name, iso, score, band, delta, drivers }) => ({
          name,
          iso,
          score,
          band,
          delta,
          drivers: drivers.map((driver) => driver.title),
        })),
      },
    };
  },
});

export const searchAround = defineTool({
  name: 'search_around',
  title: 'Search around an object',
  description:
    "Pivot on one object in Anysee's ontology — a country (country:UA), an organisation " +
    '(org:openai, org:nvidia) or a topic (topic:conflict, topic:ai_funding) — and return the ' +
    'stories linked to it and the objects most often mentioned alongside it.',
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description:
          'Object id such as country:FR, org:anthropic or topic:cyber.',
      },
      limit: LIMIT_SCHEMA,
    },
    required: ['id'],
    additionalProperties: false,
  },
  requires: ['app'],
  async run(args, { services, signal }) {
    const data = await intel(
      services,
      `/entity?id=${encodeURIComponent(args.id)}&limit=200`,
      signal,
    );
    const result = capRows(data.items, args.limit);
    return {
      summary: `${data.object.name}: ${data.total} linked stories. Most co-mentioned: ${data.related
        .slice(0, 6)
        .map((entry) => entry.name)
        .join(', ')}.`,
      data: {
        object: data.object,
        instability: data.instability,
        quote: data.quote,
        related: data.related.map(({ id, name, type, weight }) => ({
          id,
          name,
          type,
          weight,
        })),
        ...result,
        rows: result.rows.map(row),
      },
    };
  },
});
