# Knowledge Base: Global-Intelligence Platforms (God's Eye View, World Monitor, Palantir)

Compiled: 2026-10-25 · Purpose: reference for designing our own platform (instructions to follow).

**Confidence tags:** **[Primary]** = read directly from the repo README or official docs. **[Secondary]** = blogs or news coverage, possibly inconsistent. **[Background]** = general knowledge, not re-verified in this pass; check it before relying on it. Star counts are snapshots and will change.

---

## 1. God's Eye View (`bilawalsidhu/gods-eye-view`)

**Repo:** https://github.com/bilawalsidhu/gods-eye-view · **License:** MIT · **Stars:** ~59.7k, ~11.6k forks (Oct 2026) [Primary]
**Authors:** Bilawal Sidhu and Sameh Khamis (Halfpixel). Formerly named "WorldView". Reached #1 on GitHub Trending in Aug 2026.
**Tagline:** "A spy satellite simulator in your browser, except the data is real."

### What it is
A **geospatial** client: a photorealistic 3D globe showing live public data (aircraft, ships, satellites, quakes, fires, cameras, weather). It models **events, assets and infrastructure, not individuals**. The project excludes named-person search, face recognition and tracking people. It is **not** a news or AI-sector tracker. Its only news layer is a headline feed (Google News RSS with a GDELT fallback). [Primary/Secondary]

### Features [Primary]
- Click-to-track with trails and metadata, a cockpit/follow camera, a 250 km "contacts roster", and handoff to nearby CCTV
- 3D aircraft models (787, ATR-72, Citation, Bell 206, MQ-9) that replace glyphs as the camera gets closer
- GLSL "sensor" styles: Normal, CRT, NVG, FLIR/thermal, Noir, Snow, Ironbow FLIR. Detection-box overlay, military HUD
- Satellite pass prediction (SGP4), analyst queries ("count/rank datacenters, dams, satellites")
- Shareable URLs that encode camera, style, layers and target. A "Director" tool for cinematic camera tours
- **Voice AI agent** (OpenAI Realtime, ~28–30 tools; Gemini Live is optional). It pulls scene context before answering, reads screenshots to identify signage, and an AI HUD gives a 5-word summary
- **MCP server**, so Claude Desktop, Codex or ChatGPT desktop can drive the globe

### Data layers and sources [Primary]
| Layer | Source | Key |
|---|---|---|
| Basemap | Esri World Imagery, OSM fallback | none |
| 3D cities/terrain | Google Photorealistic 3D Tiles (via Cesium ion or Google direct), Re:Earth/Mapterhorn terrain | optional |
| Flights / military flights | OpenSky, adsb.lol | none (OpenSky optional) |
| GPS jamming | adsb.lol + GPSJAM aggregation | none |
| Ships | AISStream | free key |
| Satellites | CelesTrak TLEs + SGP4 | none |
| Earthquakes | USGS | none |
| Fires | NASA FIRMS (free key), WFIGS/NIFC perimeters | mixed |
| Weather | NOAA GFS, ECMWF IFS, NOAA nowCOAST, NHC/CPHC, Open-Meteo | none |
| Traffic | OSM roads (simulated), TomTom live flow | optional |
| CCTV | TxDOT, Caltrans, TfL, Ontario 511, DriveBC, WSDOT, HK TD, Taiwan MOTC, etc. | mostly none |
| Street-level | Mapillary, Street View, KartaView, Panoramax | mixed |
| Transit / bikeshare / routing | GTFS-Realtime, GBFS, OSRM (FOSSGIS) | none |
| Launches | Launch Library 2 | none |
| Military sites, ALPR camera locations | OpenStreetMap (incl. DeFlock) | none |
| Radio | Radio Browser | none |
| Bundled static | 4,351 datacenters, 704 dams, 712 submarine cables (CC BY-NC-SA, non-commercial) | — |

### Tech stack and architecture [Primary]
- **Frontend:** vanilla JS + **Vite**, no framework. **CesiumJS** as the 3D engine, GLSL post-process shaders
- **Backend:** a local **Node.js proxy** (24.14+ or 26.x) that holds private keys. It is hardened against SSRF, caps response sizes and sanitizes errors. Only the Google Maps and Cesium keys reach the browser, and both should be referrer-restricted
- **Layout:** `src/main.js` (bootstrap), `src/data/` (one module per data layer plus orchestration and a context store), `src/layers/`, `src/ui/`, `src/voice/`, `src/scenes/`
- **Real-time technique:** feeds refresh every 15–30 s. The globe renders **one interval behind and interpolates**, using dead reckoning between fixes. Headings are projected per frame in screen space. Orbit rings are realigned with GMST. Entity heights are sampled against the terrain/geoid
- **Budget controls:** OpenSky credit governor, TomTom daily tile budget, disk-cached TLEs. OpenAI voice warns at $2 and hard-caps at $5
- **Install:** Pinokio one-click, or `npm ci && npm run doctor && npm run dev` (localhost:4173), or `docker compose up` (no MCP or OAuth voice in Docker). Keys are entered in the in-app "POWER UP" panel and written to `.env` (macOS Keychain is also supported)

### Performance [Primary]
- About 1.86 s median cold start (one M5/Chrome capture, not a guarantee)
- HLS video caps: 2 concurrent sessions, 24 MiB per session
- Some users report stutter in the Pinokio embedded view that goes away in an external browser

### Limitations [Primary]
- Data is delayed 15–30 s and may be incomplete or modeled. Traffic is simulated without TomTom, CCTV camera poses are estimated, and there is no mid-ocean AIS (terrestrial only)
- Not a hardened production service. No historical playback yet; tiling and scrubbing history is described as "the long game"
- A hosted version is being built by Halfpixel

---

## 2. Similar open-source "world view" and intelligence projects

### 2.1 World Monitor (`koala73/worldmonitor`), the closest match for news and current events
**Repo:** https://github.com/koala73/worldmonitor · **Live:** worldmonitor.app · **Stars:** ~89.4k, ~13.7k forks · **License:** AGPL-3.0, with commercial licensing available · **Author:** Elie Habib [Primary]

- **What it does:** a real-time dashboard combining AI-synthesized news (500+ curated feeds, ~15 categories, multilingual, RTL support), geopolitical monitoring and infrastructure tracking. It has 45 map overlays and cross-stream correlation of military, economic, disaster and escalation signals
- **Country Instability Index (CII):** live scores, bands and 24 h movement for 31 Tier-1 countries
- Finance radar (exchanges, commodities, crypto), ADS-B flights via Wingbits
- **Variants from one codebase:** world, **tech**, finance, commodity, happy, energy. *The tech variant is the closest existing thing to an AI-sector monitor.*
- **Stack:** vanilla TypeScript + Vite. Maps are globe.gl/Three.js (3D) and deck.gl + MapLibre GL (flat). Protobuf API contracts (sebuf). Redis (Upstash) with a 3-tier cache, CDN and service worker. Vercel Edge Functions plus a Railway relay. Convex. Desktop app via Tauri 2 with a Node sidecar. PWA
- **AI:** Ollama (local, no keys) or OpenRouter. Transformers.js runs in the browser
- **Agent and API access:** MCP server at `https://worldmonitor.app/mcp` (Streamable HTTP; `tools/call` needs `X-WorldMonitor-Key` or OAuth). REST API at `api.worldmonitor.app` with OpenAPI. `npx worldmonitor` TUI. SDKs for Python, Ruby and Go. Publishes `llms.txt`
- **Source catalog:** docs.worldmonitor.app/docs/data-sources
- Note: the fork `gklps/worldmonitor-palantir` exists (Palantir-styled variant) [Secondary]

### 2.2 Crucix (`calesthio/Crucix`), a change-detection and alerting agent
**Stars:** ~12.1k · **License:** AGPL-3.0 · live demo crucix.live [Primary]
- **27 sources:** GDELT, OpenSky, NASA FIRMS, AIS, Safecast, ACLED, ReliefWeb, WHO, OFAC, OpenSanctions, ADS-B Exchange, FRED, US Treasury, BLS, EIA, GSCPI, USAspending, UN Comtrade, NOAA/NWS, EPA RadNet, USPTO Patents, Bluesky, Reddit, Telegram, KiwiSDR, CelesTrak, Yahoo Finance
- **How it detects updates (useful pattern for us):** sweeps every 15 min, running all sources in parallel with `Promise.allSettled`. It **diffs each run against the previous one** to find new signals, escalations and de-escalations, then scores severity, applies configurable thresholds and tiers alerts as FLASH, PRIORITY or ROUTINE with semantic dedup. Alerts are classified by an LLM, or by a deterministic rule engine as fallback. Hot memory plus daily cold archives
- Supports 8 LLM providers via raw `fetch`. Telegram and Discord bots with two-way commands
- **Stack:** Node 22 ESM, Express, SSE to a single-file dashboard, Globe.gl + D3, Docker

### 2.3 ShadowBroker (`BigBodyCobain/Shadowbroker`), a multi-domain OSINT map
**Stars:** ~11.4k · **License:** AGPL-3.0 [Primary]
- 60+ feeds and 40+ layers: aviation, AIS (25k+ vessels), Global Fishing Watch, 2,000+ satellites, rail, GDELT conflict, DeepState Ukraine frontline, volcanoes, OpenAQ, IODA internet outages, NASA GIBS, Sentinel-2 (Planetary Computer/CDSE), SAR change detection (NASA OPERA, EGMS), ~11k CCTV, KiwiSDR, OpenMHZ, Meshtastic/APRS, cyber feeds (abuse.ch, CISA KEV), recon tools (RDAP, crt.sh, BGP, Shodan)
- **Stack:** Next.js + MapLibre GL frontend. Python **FastAPI + APScheduler** backend with fast and slow fetch tiers. Rust privacy core. Tauri. Docker, Helm, ARM64
- **Notable:** a **"Time Machine" snapshot playback**, an HMAC-signed agent command API, country dossiers, entity-graph expansion
- ⚠️ Also tracks private and "billionaire" jets and yachts, which is ethically sensitive. We should not copy this

### 2.4 AI-sector trackers on GitHub (smaller, mostly static or digest style) [Secondary]
None of the repos found covers news, models, papers, benchmarks **and** funding together. **That is a gap our platform could fill.**
| Repo | Covers |
|---|---|
| `sparkorbit/sparkorbit` | Papers, models, benchmarks, company news, LMArena; 40+ sources (closest match) |
| `cc22ai/llm-tracker` | New foundation models across 12 vendors: context, params, open weights, pricing |
| `arielshakaramiro/llm-leaderboard-tracker` | Weekly LMArena snapshots with CSV history and charts (GitHub Actions) |
| `leoncuhk/awesome-llm-bench` | Daily top-10 tables for SWE-bench, Terminal-Bench, OSWorld, ARC-AGI-2, HLE |
| `zeztzchen/daily-llm-board` | Daily LLM news, papers, releases |
| `wuhy80/llm-news-tracker` | Chinese daily/weekly/monthly AI digest (GitHub Actions) |
| `Ryank90/buzz` | Hourly trending ML repos and posts (GitHub, HF, Reddit) |
| `hotin` (PyPI) | Trending models and papers, daily brief, time series |
| GitHub topic `ai-news` | Browse for more |

### 2.5 Candidate data sources for an AI-sector and world-events feed [Background, verify each]
- **World events:** GDELT 2.0 (DOC/GEO/Events/GKG; updates every 15 min; free; ~1 req per 5 s on the DOC API [Secondary]; BigQuery for bulk), ACLED, ReliefWeb, USGS, NASA FIRMS, Google News RSS
- **AI research:** arXiv API/RSS (cs.AI, cs.CL, cs.LG), Semantic Scholar API, OpenReview, Hugging Face Daily Papers
- **AI models:** Hugging Face Hub API (trending, new models), OpenRouter `/models` (new models and pricing), LMArena leaderboard data, Epoch AI datasets (notable models, compute)
- **AI code:** GitHub REST/GraphQL (stars velocity, releases), GitHub Trending
- **AI companies and funding:** SEC EDGAR (Form D, 8-K, S-1), lab blogs and RSS (OpenAI, Anthropic, Google DeepMind, Meta AI, Mistral, xAI), Crunchbase/PitchBook/Dealroom (paid), TechCrunch/VentureBeat RSS
- **AI policy:** Federal Register API, regulations.gov, EU AI Act updates, USAspending (AI contracts)
- **Community signal:** Hacker News (Algolia API), Reddit, Bluesky, X (paid)

---

## 3. Palantir, end to end

Palantir sells **software that connects an organization's scattered data, models it as real-world "objects", and lets people and AI act on it**, with strict security and an audit trail. **Palantir does not have a secret master database of its own.** Each customer, an agency or a company, connects *its own* systems inside *its own* deployment, under that customer's legal authorities. [Primary + Secondary]

### 3.1 Products
| Product | Role |
|---|---|
| **Gotham** | Government, defense and intelligence analysis: entity resolution, graph and link analysis, maps, ops |
| **Foundry** | Data integration plus Ontology plus apps (commercial and civil government; ICE, NHS, Army data) |
| **AIP** (Artificial Intelligence Platform) | LLMs and agents grounded on the Ontology |
| **Apollo** | Continuous delivery to cloud, on-prem, classified, air-gapped and edge environments |
| **Maven Smart System** | DoD targeting and situational-awareness system built on the stack |

### 3.2 The pipeline, step by step [Primary: Foundry docs]
1. **Connect (Data Connection).** Connectors for databases (JDBC), cloud storage (S3, ADLS, GCS), SaaS and ERP (SAP, Salesforce), Kafka, REST APIs and files.
   - **Agents** are installed *inside the customer network* and reach systems behind firewalls. [Background: agents make **outbound-only** connections to Foundry, so no inbound firewall holes are needed. **Direct connections** from Foundry's cloud are controlled by egress policies.] Private links are available for AWS, Azure and GCP.
   - **Sync types:** batch (to datasets), streaming (to streams), **CDC** (to streams with changelog metadata), media (to media sets). **Listeners** let systems *push* data in: HTTPS webhooks, WebSockets, email.
   - **Virtual tables** query Snowflake, BigQuery or Databricks in place, with compute pushdown, instead of copying the data.
2. **Store and version.** Every dataset is a series of **transactions**, so full history is kept and you can time-travel. **Lineage** records how each dataset was produced.
3. **Transform.** **Pipeline Builder** (no-code, batch and streaming) or **Code Repositories** (Git, PRs, CI; Python, Java, SQL). Python runs on PySpark or single-node Pandas, Polars or DuckDB. Streaming runs on Flink. **Data Expectations** (quality assertions) can block bad builds. **Global Branching** lets you test changes across apps before merging.
4. **Model: the Ontology (the core idea).** Rows become **objects**, columns become **properties**, joins become **links**. For example: *Person, Vehicle, Flight, Case, Supplier, Order*. On top of that:
   - **Actions** are governed edits with parameters, rules and side effects (webhooks, notifications). Users' decisions **write back** to the source systems
   - **Functions** (TypeScript or Python) query and traverse objects or call APIs
   - **Interfaces** provide polymorphism across object types
   - **Materializations** capture current object state, including user edits, for downstream use
5. **Use (apps).** **Workshop** (low-code apps), **Slate** (custom HTML/JS), **Quiver** (time-series analysis), **Contour** (tabular analysis), **Object Explorer**, **Map**, **Notepad**, **OSDK** (typed SDKs for your own apps). In Gotham: **Graph + Search Around** (expand a network from a seed entity), **Map / Gaia** (shared live operational map), **Dossier** (co-authored reports), **Object Explorer** (filter billions of objects). [Secondary for Gotham]
6. **AI (AIP).** Model Catalog (commercial LLMs) plus BYOM. **AIP Logic** (no-code LLM functions that can edit the Ontology). **Chatbot Studio**/agents with tools (actions, object queries, functions). **AIP Evals**. **Ontology MCP** exposes the Ontology to external agents over OAuth 2.0.
7. **Automate.** **Automate** fires actions, functions, AIP Logic or notifications on time-based or **data-change** conditions. Schedules trigger builds. **Incremental transforms** process only new or changed rows.
8. **Monitor.** **Data Health** checks (freshness, schema, content) alert to email, Slack or PagerDuty. Workflow Lineage, traces, P95 metrics.
9. **Secure and govern.** Projects are the security boundary. Roles are discretionary. **Markings** are mandatory controls (PII, PHI, classification levels). Row- and column-level security, SSO/MFA, encryption, **full audit logging**, retention policies, and justification prompts for sensitive actions. [Background: purpose-based access controls]
10. **Deploy (Apollo).** A declarative, pull-based delivery model that upgrades hundreds of services with zero downtime. For classified networks, Apollo builds an export package, Palantir's Network Operations Center carries it across the boundary under IL6 protocols, and Apollo applies it automatically on arrival. DISA granted an IL6 provisional authorization in Oct 2022. Apollo's controls are designed for FedRAMP, IL5 and IL6.

### 3.3 How Palantir "tracks updates"
No single magic feed. It combines:
- **Scheduled syncs** (cron-like) and **incremental syncs** that only pull new rows or files
- **CDC streams** that capture inserts, updates and deletes from source databases in near real time
- **Push listeners and webhooks**, where sources notify Palantir
- **Transaction-versioned datasets plus lineage**, so every change is recorded and downstream builds re-run automatically
- **Automate and Data Health**, which turn data changes into alerts or actions

### 3.4 How it connects to government systems (examples) [Secondary unless noted]
- **Mechanism:** the agency installs Palantir (cloud GovCloud or on-prem or classified). Agents and connectors attach to the agency's *own* databases. Inter-agency data appears only where data-sharing agreements or legal authorities exist. Entity resolution then merges records about the same person or thing across sources.
- **ICE:** Investigative Case Management has run on **Gotham since 2014**. **ImmigrationOS** is a ~$30M rush award from April 2025, with the prototype due Sept 2025 and the contract running to about Sept 2027. ICE says it ingests "ICE, DHS and external" data. Reported sources include passport, Social Security and tax data and license-plate-reader data, but **neither ICE nor Palantir has published the full list**.
- **US Army:** a 10-year, **up to $10B Enterprise Agreement** (31 Jul 2025) that consolidated 75 contracts.
- **Maven Smart System:** ceiling raised toward about $1.3B. A $618M expansion was reported in Aug 2026.
- **DHS:** a reported BPA of up to $1B over 5 years (Feb 2026). Treat as unconfirmed.
- **UK NHS:** Federated Data Platform, built on Foundry (see Computer Weekly's "Inside FDP" series).
- **Controversy:** civil-liberties concerns centre on cross-agency data fusion, especially for immigration enforcement. Critics also argue that Palantir's "ontology" is an operational data model rather than a formal OWL/RDF ontology.

---

## 4. Takeaways for our platform

**Architecture patterns worth borrowing**
1. **One module per source** (God's Eye `src/data/`), behind a common interface: `fetch() → normalize() → entities/events`.
2. **Server-side key proxy** with SSRF guards and response caps. Never ship private keys to the browser.
3. **Tiered polling:** fast tier (15–60 s) for flights and markets, slow tier (15 min to daily) for news, papers and filings. APScheduler (ShadowBroker) or a cron worker.
4. **Diff-based change detection** (Crucix): store each sweep's snapshot, compute new, escalated or resolved items, score severity, dedupe semantically, tier alerts.
5. **Ontology-lite** (Palantir idea): normalize everything into typed objects such as `Event`, `Organization`, `Model`, `Paper`, `FundingRound`, `Person (public figures only)`, `Location`, with **links** between them and source **lineage** on each.
6. **Versioned storage:** append-only snapshots enable a "time machine" (ShadowBroker) and audit history (Palantir).
7. **Render-behind interpolation** for smooth live map entities (God's Eye).
8. **AI layer:** LLM summarization and briefs (World Monitor), an LLM classifier with a rule-engine fallback (Crucix), plus an **MCP server** so external agents can query us (all three projects do this).
9. **Caching:** Redis with a CDN and service worker (World Monitor).

**Recommended stack candidates:** Vite + TypeScript, MapLibre GL / deck.gl (2D) or CesiumJS / globe.gl (3D). A Node or FastAPI backend with a job scheduler. Postgres (+PostGIS, +pgvector) or Supabase. Redis cache. An LLM via the Claude API. SSE or WebSocket push.

**Gap and opportunity:** no open-source project unifies **world events** with a full **AI-sector intelligence layer** (models, papers, benchmarks, funding, policy, GitHub momentum) on a correlated timeline or map.

**Licensing cautions:**
- World Monitor, Crucix and ShadowBroker are **AGPL-3.0**. Copying their code obliges us to open-source a networked service built on it. God's Eye View is **MIT**, which is safe to reuse with attribution.
- Submarine-cable data is CC BY-NC-SA. Free Cesium ion is non-commercial. Google 3D Tiles are metered and carry attribution terms.
- Avoid tracking individuals. Respect each feed's terms of service.

---

## 5. Sources
- God's Eye View: https://github.com/bilawalsidhu/gods-eye-view · https://pyshine.com/Gods-Eye-View-Browser-Spy-Satellite-OSINT/ · https://aiidelist.com/blog/gods-eye-view-open-source-osint-globe · https://www.besthub.dev/articles/god-s-eye-view-open-source-3d-globe-aggregates-global-real-time-signals-with-sci-fi-ui-8666aaa45e5a
- World Monitor: https://github.com/koala73/worldmonitor · https://themenonlab.blog/blog/worldmonitor-real-time-global-intelligence-dashboard · https://dev.to/wonderlab/open-source-project-130-worldmonitor-real-time-global-intelligence-dashboard-with-73k-stars-ecf
- Crucix: https://github.com/calesthio/Crucix · ShadowBroker: https://github.com/BigBodyCobain/Shadowbroker · https://themenonlab.blog/blog/osint-shadowbroker-crucix-thinkcreate-intel-stack
- AI trackers: https://github.com/topics/ai-news · https://github.com/cc22ai/llm-tracker · https://github.com/arielshakaramiro/llm-leaderboard-tracker · https://github.com/leoncuhk/awesome-llm-bench · https://github.com/zeztzchen/daily-llm-board · https://github.com/wuhy80/llm-news-tracker · https://github.com/Ryank90/buzz
- GDELT: https://blog.gdeltproject.org/gdelt-geo-2-0-api-debuts/
- Palantir official: https://www.palantir.com/docs/foundry/getting-started/foundry-platform-summary-llm/ · https://palantir.com/docs/foundry/architecture-center · https://www.palantir.com/docs/apollo/core/introduction/index.html · https://blog.palantir.com/how-palantir-meets-il6-security-requirements-with-apollo-f6c3f0c51fe
- Palantir secondary: https://goldingresearch.substack.com/p/inside-palantir-gotham · https://s3.documentcloud.org/documents/810526/1035-palantir-product-description-gotham.pdf · https://www.puppygraph.com/blog/palantir-ontology · https://www.computerweekly.com/opinion/Inside-FDP-part-3-The-data-architecture-that-makes-it-work
- Government contracts: https://www.theregister.com/2025/04/21/ice_enlists_palantir_to_develop/ · https://heise.de/-11153189 · https://samsearch.co/government-contracting-news/us-army-awards-palantir-10-billion-enterprise-agreement-for-data-modernization-177815 · https://www.fedsavvystrategies.com/palantirs-federal-expansion-accelerates/ · https://finance.yahoo.com/news/billion-dollar-palantir-contract-gives-213500997.html
