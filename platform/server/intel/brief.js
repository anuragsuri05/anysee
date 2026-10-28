/**
 * The intelligence brief. Claude writes it from the highest-severity stories
 * through one of two providers:
 *
 *   claude-code  the local Claude Code CLI, on the signed-in user's own
 *                Claude account (no API key needed)
 *   api          the Anthropic API, with ANTHROPIC_API_KEY
 *
 * ANYSEE_BRIEF_PROVIDER picks one (auto, claude-code, api or off). In auto,
 * an API key wins when set, else a signed-in Claude Code is used. Without
 * either, a deterministic brief is built from the same inputs.
 */

import Anthropic from '@anthropic-ai/sdk';
import { claudeCodeStatus, runClaudeCode } from './claudeCode.js';

const MODEL = process.env.ANYSEE_BRIEF_MODEL || 'claude-opus-5-5';
const PROVIDER_SETTING = (
  process.env.ANYSEE_BRIEF_PROVIDER || 'auto'
).toLowerCase();
const STATUS_TTL_MS = 60_000;

const BRIEF_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string', description: 'One line, at most 14 words.' },
    threat_level: {
      type: 'string',
      enum: ['GUARDED', 'ELEVATED', 'HIGH', 'SEVERE'],
    },
    summary: {
      type: 'string',
      description: 'Two or three sentences on the overall picture.',
    },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          domain: {
            type: 'string',
            enum: ['world', 'hazard', 'cyber', 'ai', 'markets'],
          },
          title: { type: 'string' },
          bullets: { type: 'array', items: { type: 'string' } },
        },
        required: ['domain', 'title', 'bullets'],
        additionalProperties: false,
      },
    },
    watchlist: {
      type: 'array',
      description: 'Developments to watch in the next 24-72 hours.',
      items: { type: 'string' },
    },
  },
  required: ['headline', 'threat_level', 'summary', 'sections', 'watchlist'],
  additionalProperties: false,
};

const SYSTEM = `You are the duty analyst for Anysee, an open-source situational-awareness console.
You write a concise intelligence brief from machine-collected public reporting.
Ground every statement in the supplied items; never invent facts, numbers or sources.
Each input line has a severity (0-100), the number of independent publishers reporting it, and linked countries or organisations.
Weigh corroborated, high-severity items most. Note when a claim rests on a single publisher.
Cover world events, hazards, cyber, the AI sector (models, research, funding, policy) and markets, skipping a domain with nothing notable.
Keep bullets short and factual, at most 25 words each, 2-5 bullets per section.`;

let client = null;
function getClient() {
  if (client) return client;
  try {
    client = new Anthropic();
  } catch {
    client = null;
  }
  return client;
}

const hasApiKey = () =>
  Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

let provider = {
  llm: false,
  provider: null,
  model: null,
  setting: PROVIDER_SETTING,
  claudeCode: null,
  reason: 'Checking for Claude…',
  checkedAt: 0,
};
let checking = null;

/** Re-detect the provider: API key, then a signed-in Claude Code. */
export function refreshBriefProvider() {
  checking ??= (async () => {
    const claudeCode =
      PROVIDER_SETTING === 'api' || PROVIDER_SETTING === 'off'
        ? null
        : await claudeCodeStatus();
    let chosen = null;
    let reason = null;
    if (PROVIDER_SETTING === 'off') reason = 'Claude briefs are turned off';
    else if (PROVIDER_SETTING !== 'claude-code' && hasApiKey()) chosen = 'api';
    else if (PROVIDER_SETTING !== 'api' && claudeCode?.loggedIn)
      chosen = 'claude-code';
    else
      reason =
        PROVIDER_SETTING === 'api'
          ? 'ANTHROPIC_API_KEY is not set'
          : (claudeCode?.reason ?? 'Claude is not connected');
    provider = {
      llm: Boolean(chosen),
      provider: chosen,
      // Claude Code uses the account's default model unless one is named.
      model:
        chosen === 'api'
          ? MODEL
          : chosen === 'claude-code'
            ? process.env.ANYSEE_BRIEF_MODEL || 'Claude Code default'
            : null,
      setting: PROVIDER_SETTING,
      claudeCode,
      reason,
      checkedAt: Date.now(),
    };
    return provider;
  })().finally(() => {
    checking = null;
  });
  return checking;
}

/** The last detected provider; refreshed in the background when stale. */
export function briefAvailability() {
  if (Date.now() - provider.checkedAt > STATUS_TTL_MS) refreshBriefProvider();
  return provider;
}

const fmtTime = (ms) =>
  ms ? new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + 'Z' : 'n/a';

/** The compact, line-per-story context the brief is written from. */
export function briefContext({ store, instability, pulse, quotes, now }) {
  const leads = new Map();
  for (const cluster of store.clusters.values()) {
    const lead = store.items.get(cluster.leadId);
    if (!lead || now - (lead.time ?? lead.firstSeen) > 36 * 3_600_000) continue;
    leads.set(cluster.id, {
      lead,
      publishers: cluster.publishers.size,
      severity: cluster.severity ?? lead.severity,
    });
  }
  const byDomain = {};
  for (const row of leads.values()) {
    (byDomain[row.lead.domain] ??= []).push(row);
  }
  const lines = [`Brief time: ${fmtTime(now)}`];
  for (const [domain, rows] of Object.entries(byDomain)) {
    lines.push('', `## ${domain.toUpperCase()}`);
    rows
      .sort((a, b) => b.severity - a.severity || b.publishers - a.publishers)
      .slice(0, domain === 'ai' ? 30 : 25)
      .forEach(({ lead, publishers, severity }) => {
        const links = lead.entities
          .filter((id) => !id.startsWith('topic:'))
          .join(',');
        lines.push(
          `- [sev ${severity} | ${publishers} pub | ${fmtTime(lead.time)}] ${lead.title} (${lead.publisher}${links ? `; ${links}` : ''})`,
        );
      });
  }
  lines.push('', '## COUNTRY INSTABILITY (0-100, 24h)');
  for (const row of instability.slice(0, 10)) {
    lines.push(
      `- ${row.name}: ${row.score} (${row.band}${row.delta != null ? `, ${row.delta >= 0 ? '+' : ''}${row.delta} d/d` : ''})`,
    );
  }
  if (pulse) {
    lines.push('', '## AI PULSE');
    lines.push(
      `- Funding (3d): ${pulse.counts.funding3d} rounds, ~$${(pulse.counts.fundingTotalUsd3d / 1e9).toFixed(1)}B reported`,
    );
    lines.push(
      `- Most-mentioned orgs: ${pulse.organizations
        .slice(0, 8)
        .map(
          (org) =>
            `${org.name} ${org.mentions} (${org.momentum >= 0 ? '+' : ''}${org.momentum})`,
        )
        .join('; ')}`,
    );
    lines.push(
      `- Trending models: ${pulse.models
        .slice(0, 6)
        .map((model) => model.title)
        .join(', ')}`,
    );
    lines.push(
      `- New API models: ${pulse.newModels
        .slice(0, 6)
        .map((model) => model.title)
        .join(', ')}`,
    );
  }
  if (quotes?.length) {
    lines.push('', '## MARKETS (day change)');
    lines.push(
      quotes
        .map(
          (quote) =>
            `${quote.label} ${quote.changePct == null ? 'n/a' : `${quote.changePct >= 0 ? '+' : ''}${quote.changePct.toFixed(1)}%`}`,
        )
        .join('; '),
    );
  }
  return lines.join('\n');
}

/** A brief from the scores alone, used without credentials or on failure. */
export function deterministicBrief({
  store,
  instability,
  pulse,
  posture,
  now,
}) {
  const sections = [];
  const domainTitles = {
    world: 'World events',
    hazard: 'Hazards',
    cyber: 'Cyber',
    ai: 'AI sector',
    markets: 'Markets',
  };
  for (const domain of Object.keys(domainTitles)) {
    const rows = [...store.clusters.values()]
      .map((cluster) => ({ cluster, lead: store.items.get(cluster.leadId) }))
      .filter(
        ({ lead }) =>
          lead &&
          lead.domain === domain &&
          now - (lead.time ?? lead.firstSeen) < 24 * 3_600_000,
      )
      .sort((a, b) => (b.cluster.severity ?? 0) - (a.cluster.severity ?? 0))
      .slice(0, 4);
    if (rows.length) {
      sections.push({
        domain,
        title: domainTitles[domain],
        bullets: rows.map(
          ({ cluster, lead }) =>
            `${lead.title} — ${lead.publisher}${cluster.publishers.size > 1 ? ` +${cluster.publishers.size - 1}` : ''}`,
        ),
      });
    }
  }
  const top = instability
    .slice(0, 3)
    .map((row) => `${row.name} (${row.score})`)
    .join(', ');
  return {
    headline: top
      ? `Highest instability: ${top}`
      : 'Collecting the first sweep',
    threat_level: posture.level,
    summary:
      `${store.items.size} items from ${new Set([...store.items.values()].map((item) => item.publisher)).size} publishers are tracked.` +
      (pulse
        ? ` The AI sector logged ${pulse.counts.items24h} items in 24 h and ${pulse.counts.funding3d} funding rounds in 3 days.`
        : ''),
    sections,
    watchlist: instability
      .filter((row) => (row.delta ?? 0) >= 8)
      .slice(0, 5)
      .map((row) => `${row.name} instability rising (+${row.delta})`),
    generatedAt: now,
    generator: 'rules',
  };
}

/** Ask Claude for the brief. Throws on any failure; the caller falls back. */
export async function generateLlmBrief(context, { signal } = {}) {
  const prompt = `Write the brief from this collection.\n\n${context}`;
  if (provider.provider === 'claude-code') {
    const result = await runClaudeCode({
      prompt,
      system: SYSTEM,
      schema: BRIEF_SCHEMA,
      model: process.env.ANYSEE_BRIEF_MODEL || null,
      effort: 'medium',
      signal,
    });
    return {
      ...result.output,
      generatedAt: Date.now(),
      generator: result.model,
      via: 'Claude Code',
      account: provider.claudeCode?.email ?? null,
      usage: result.usage,
    };
  }
  const anthropic = getClient();
  if (!anthropic) throw new Error('Anthropic client unavailable');
  const response = await anthropic.beta.messages.create(
    {
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      output_config: {
        effort: 'medium',
        format: { type: 'json_schema', schema: BRIEF_SCHEMA },
      },
      messages: [{ role: 'user', content: prompt }],
    },
    { signal },
  );
  if (response.stop_reason === 'refusal')
    throw new Error('The model declined to write this brief');
  const text = response.content.find((block) => block.type === 'text')?.text;
  if (!text)
    throw new Error(`No brief text (stop reason ${response.stop_reason})`);
  return {
    ...JSON.parse(text),
    generatedAt: Date.now(),
    generator: response.model ?? MODEL,
    via: 'Anthropic API',
    usage: {
      input: response.usage?.input_tokens ?? 0,
      output: response.usage?.output_tokens ?? 0,
    },
  };
}
