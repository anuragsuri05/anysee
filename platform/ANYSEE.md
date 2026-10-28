# Anysee — all-source intel platform on God's Eye View

Anysee adds an intelligence layer to God's Eye View: one engine that sweeps public sources across world events, hazards, cyber, the AI sector and markets, links what it collects to countries, organisations and topics, scores and alerts on it, and shows it all in a single **Ops Center** dashboard and on the globe.

The design borrows ideas from four kinds of projects. All the code here is new; no AGPL code was copied.

| Idea | From | Where in Anysee |
| --- | --- | --- |
| 3D globe, live layers, voice, MCP | God's Eye View (this repo, MIT) | the base app, unchanged |
| Many-feed news aggregation, AI brief, country instability, market radar, MCP access | World Monitor | `server/intel/sources`, `brief.js`, `analytics.js`, `src/tools/queries/intel.js` |
| Sweep → diff against the last run → tiered FLASH/PRIORITY/ROUTINE alerts → Discord/Slack/Telegram | Crucix | `engine.js`, `scoring.js`, `notify.js` |
| Snapshot "time machine", cyber feeds, hazard feeds | ShadowBroker | `engine.js` snapshots, Time Machine tab |
| Ontology of linked objects, search-around, data health, lineage, audit log | Palantir Foundry/Gotham | `ontology.js`, `store.js`, Ontology and Data Health tabs |
| Models, papers, repos, funding, policy tracking | AI-sector trackers | `sources/ai.js`, AI Sector tab |

## Run it

```bash
npm ci
npm run dev          # http://localhost:4173
```

Press **I** (or click **ANYSEE OPS** at the top) to open the Ops Center. Press **Esc** to close. **World view** zooms the globe out to the whole intel layer.

No keys are needed. Optional settings are listed at the end of `.env.example`.

### Sign in with your Claude account

Anysee asks Claude to write its intelligence brief, and it can do that with the Claude Code login on your computer. You don't need an API key.

1. Install Claude Code once: `npm install -g @anthropic-ai/claude-code`
2. In the Ops Center, click **Connect Claude**, then **Sign in with Claude**. Approve the request in the browser tab that opens. You can also run `claude auth login` in a terminal.

Once you're connected, the header shows your account. Claude writes a brief right away, then every 2 hours (`ANYSEE_BRIEF_INTERVAL_MIN`), and whenever you press **Regenerate**. Briefs count toward your Claude plan's usage.

Under the hood, Anysee runs headless `claude -p` from a neutral folder. It turns off tools, MCP servers, settings files and session history for the call, and asks for structured JSON output. If `ANTHROPIC_API_KEY` is set, the API is used instead; `ANYSEE_BRIEF_PROVIDER` forces one or the other. Sign-in and brief requests are accepted only from the computer running Anysee.

This is meant for running Anysee on your own computer. If you offer Anysee to other people as a hosted product, have them use API keys. Anthropic doesn't allow third-party products to offer claude.ai login unless it has approved them.

## What you get

- **Overview**: the intelligence brief, live alerts, the country instability index, the top stories by severity, the AI pulse and the market strip.
- **World**: the all-source feed, with search and filters by domain, severity and sort order.
- **AI sector**: lab and industry news; funding rounds with amounts; trending models (Hugging Face) and new API models (OpenRouter); papers (HF Daily Papers, arXiv); rising GitHub repos; policy (news and the US Federal Register); Hacker News; and an attention leaderboard with day-over-day momentum.
- **Cyber**: CISA Known Exploited Vulnerabilities and security news.
- **Markets**: indices, macro gauges and AI equities, with sparklines and unusual-move events.
- **Ontology**: every linked object, plus *search around*: the stories linked to an object, a link graph of co-mentioned objects, and one click to pivot to any of them.
- **Data health**: each connector's status, last success, rows, new items, latency, cadence and failures, plus an audit log.
- **Time machine**: a snapshot every 15 minutes, kept for 7 days. You can replay any snapshot's markers and instability rings on the globe.
- **Globe**: a point per geolocated story, coloured by domain and sized by severity. Instability rings mark countries. Hover a point for a card, or click it for the item drawer, which shows the score's reasons, linked objects, the same story from other publishers, metrics and lineage.
- **Toasts**: new FLASH and PRIORITY alerts appear live, pushed over server-sent events.

## How it works

```
sources (26 connectors) ──► engine: schedule · fetch · normalise ──► store
                                                                     │  items (72 h), story clusters,
                                                                     │  link index (ontology)
                                ┌────────────────────────────────────┘
                                ▼
           scoring (severity + corroboration) → alerts (new or escalated clusters)
           analytics: instability index · AI pulse · posture · counts
           snapshots every 15 min (.gev-cache/intel/snapshots) · state.json
           brief: Claude (optional) or rules
                                │
       /api/intel/* (REST + SSE) ──► Ops Center, globe layer, toasts
                                └──► MCP / voice tools (get_intel_brief, search_around, …)
```

- **Normalise**: each row becomes an item with a domain, kind, publisher, time and metrics, and keeps its lineage (connector, first and last seen).
- **Link**: the gazetteer (`gazetteer.js`) resolves country names, demonyms and capitals, about 50 AI-sector organisations, and topic keywords to object ids. Items without coordinates are placed at their headline country's centroid or at their organisation's headquarters; the drawer shows which.
- **Cluster**: headlines whose words overlap enough (Jaccard ≥ 0.5 within 48 h) form one story. The number of independent publishers raises its severity.
- **Score**: deterministic rules (`scoring.js`) work from keywords, casualty counts, quake magnitude, GDACS level, KEV and ransomware status, round size, upvotes, stars and HN points. The reasons show in the drawer.
- **Alert**: a cluster raises an alert when it first reaches PRIORITY (60+) or FLASH (80+), or escalates. It only does so if the story is fresh (under 12 h). The first sweep is marked as the baseline and is never sent out.
- **Instability index**: 24 h of world, hazard and cyber items, weighted by topic and severity, mapped onto 0–100 and compared with a snapshot about a day old.

Failing sources back off, up to 4× their interval. Hosts with published limits are spaced out (GDELT gets 5.5 s between requests). Sources are listed in `server/intel/sources/index.js`.

## API

All routes are under `/api/intel`.

- `GET /overview`
- `GET /feed?domain=&kind=&country=&entity=&q=&min_severity=&since=&sort=time|severity&limit=`
- `GET /item?id=`
- `GET /geo?hours=`
- `GET /alerts?tier=`
- `GET /entities?type=`
- `GET /entity?id=country:FR|org:openai|topic:conflict`
- `GET /health`
- `GET /audit`
- `GET /snapshots`
- `GET /snapshot?ts=`
- `GET /markets`
- `GET /brief`
- `GET /stream` (SSE: `update`, `brief`)
- `GET /claude`: Claude connection status
- `POST /claude/login`, `POST /claude/login/code` and `POST /claude/login/cancel`: sign-in
- `POST /claude/refresh`
- `POST /sweep` and `POST /brief`.

All `POST` routes need the `X-Anysee: 1` header. The `/claude/*` routes and `/brief` also accept requests only from the computer running Anysee.

The MCP server (`npm run mcp`, or `/mcp` on the dev server) adds these tools: `get_intel_brief`, `get_intel_alerts`, `search_intel`, `get_ai_sector_pulse`, `get_country_instability` and `search_around`.

## Limits and notes

- **Reliability**: headlines are automatically collected and scored. The rules are heuristics, and country placement is inferred from text. Don't use this for safety-critical decisions.
- **Google News**: about a third of the AI-sector feeds come through Google News search RSS, which can change without notice.
- **Market data**: quotes come from Yahoo Finance's unofficial chart endpoint.
- **Language**: the Ops Center is English-only. `scripts/i18n.mjs` exempts `src/intel/` until its strings go through `t()`.
- **Individuals**: like the base app, Anysee tracks events, organisations and countries, not individuals.
- **Licensing**: the base project is MIT. Each feed has its own terms of use.
