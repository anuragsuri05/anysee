/**
 * The AI sector: lab announcements, industry news, funding, policy, papers,
 * models, open-source repositories and community discussion.
 */

import { fetchJson, fetchText } from '../http.js';
import { parseFeed } from '../rss.js';
import {
  MINUTE,
  daysAgoIso,
  googleNewsUrl,
  parseCompany,
  parseRound,
  parseUsdAmount,
  rssSource,
  splitGoogleNewsTitle,
} from './common.js';

export const aiLabs = rssSource({
  id: 'ai-labs',
  name: 'AI lab announcements',
  domain: 'ai',
  kind: 'announcement',
  urls: [
    'https://openai.com/news/rss.xml',
    'https://deepmind.google/blog/rss.xml',
    'https://blog.google/technology/ai/rss/',
    'https://huggingface.co/blog/feed.xml',
    'https://blogs.nvidia.com/feed/',
  ],
  intervalMs: 20 * MINUTE,
  maxAgeMs: 14 * 86_400_000,
});

// Labs without a public feed are followed through Google News.
export const aiLabsNews = rssSource({
  id: 'ai-labs-news',
  name: 'AI labs in the news',
  domain: 'ai',
  kind: 'announcement',
  urls: [
    googleNewsUrl('(Anthropic OR Claude) AI when:2d'),
    googleNewsUrl(
      '(xAI OR Grok OR "Meta AI" OR Llama OR "Mistral AI") model when:2d',
    ),
    googleNewsUrl('(DeepSeek OR Qwen OR Kimi OR "Zhipu") model when:2d'),
  ],
  intervalMs: 20 * MINUTE,
  map: splitGoogleNewsTitle,
});

export const aiNews = rssSource({
  id: 'ai-news',
  name: 'AI industry news',
  domain: 'ai',
  urls: [
    'https://techcrunch.com/category/artificial-intelligence/feed/',
    'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml',
    'https://venturebeat.com/category/ai/feed/',
    'https://www.technologyreview.com/topic/artificial-intelligence/feed',
    'https://arstechnica.com/ai/feed/',
  ],
  intervalMs: 15 * MINUTE,
});

export const aiFunding = rssSource({
  id: 'ai-funding',
  name: 'AI funding rounds',
  domain: 'ai',
  kind: 'funding',
  urls: [
    googleNewsUrl('AI startup raises funding round when:3d'),
    googleNewsUrl('AI "series A" OR "series B" OR "series C" raises when:3d'),
    googleNewsUrl('AI company valuation billion funding when:3d'),
  ],
  intervalMs: 30 * MINUTE,
  map(item) {
    const clean = splitGoogleNewsTitle(item);
    const amountUsd = parseUsdAmount(clean.title);
    // Without an amount the headline is usually commentary, not a round.
    if (!amountUsd || !/rais|fund|valu|invest|round|back/i.test(clean.title))
      return null;
    return {
      ...clean,
      metrics: {
        amountUsd,
        round: parseRound(clean.title),
        company: parseCompany(clean.title),
      },
    };
  },
});

export const aiPolicyNews = rssSource({
  id: 'ai-policy-news',
  name: 'AI policy & regulation',
  domain: 'ai',
  kind: 'policy',
  urls: [
    googleNewsUrl(
      '("AI Act" OR "AI regulation" OR "AI executive order" OR "AI safety institute" OR "AI bill") when:3d',
    ),
  ],
  intervalMs: 30 * MINUTE,
  map: splitGoogleNewsTitle,
});

export const federalRegister = {
  id: 'federal-register-ai',
  name: 'US Federal Register (AI)',
  domain: 'ai',
  kind: 'policy',
  intervalMs: 120 * MINUTE,
  origin: 'www.federalregister.gov',
  async fetch({ signal }) {
    const body = await fetchJson(
      'https://www.federalregister.gov/api/v1/documents.json?per_page=25&order=newest' +
        '&conditions%5Bterm%5D=%22artificial+intelligence%22' +
        `&conditions%5Bpublication_date%5D%5Bgte%5D=${daysAgoIso(30)}`,
      { signal },
    );
    return (body.results ?? []).map((doc) => ({
      title: `${doc.type}: ${doc.title}`,
      url: doc.html_url,
      summary: (doc.abstract ?? '').slice(0, 400),
      time: Date.parse(doc.publication_date) || null,
      publisher:
        (doc.agencies ?? [])
          .map((agency) => agency.name)
          .filter(Boolean)
          .join(', ') || 'Federal Register',
      countryHint: 'US',
    }));
  },
};

export const arxiv = {
  id: 'arxiv',
  name: 'arXiv cs.AI / cs.CL / cs.LG',
  domain: 'ai',
  kind: 'paper',
  intervalMs: 60 * MINUTE,
  origin: 'export.arxiv.org',
  async fetch({ signal }) {
    const xml = await fetchText(
      'https://export.arxiv.org/api/query?search_query=cat:cs.AI+OR+cat:cs.CL+OR+cat:cs.LG' +
        '&sortBy=submittedDate&sortOrder=descending&max_results=40',
      { signal, timeoutMs: 40_000 },
    );
    return parseFeed(xml).map(({ raw, ...entry }) => ({
      ...entry,
      publisher: 'arXiv',
    }));
  },
};

export const hfPapers = {
  id: 'hf-daily-papers',
  name: 'Hugging Face Daily Papers',
  domain: 'ai',
  kind: 'paper',
  intervalMs: 60 * MINUTE,
  origin: 'huggingface.co',
  async fetch({ signal }) {
    const rows = await fetchJson(
      'https://huggingface.co/api/daily_papers?limit=40',
      { signal },
    );
    return rows.map((row) => ({
      title: row.paper?.title ?? row.title,
      url: `https://huggingface.co/papers/${row.paper?.id}`,
      summary: (row.paper?.ai_summary ?? row.paper?.summary ?? '').slice(
        0,
        400,
      ),
      time: Date.parse(row.publishedAt ?? row.paper?.publishedAt) || null,
      publisher: 'HF Daily Papers',
      metrics: {
        upvotes: row.paper?.upvotes ?? 0,
        comments: row.numComments ?? 0,
      },
    }));
  },
};

export const hfModels = {
  id: 'hf-trending-models',
  name: 'Hugging Face trending models',
  domain: 'ai',
  kind: 'model',
  intervalMs: 30 * MINUTE,
  origin: 'huggingface.co',
  async fetch({ signal }) {
    const rows = await fetchJson(
      'https://huggingface.co/api/models?sort=trendingScore&direction=-1&limit=30',
      { signal },
    );
    return rows.map((row, rank) => ({
      title: row.id,
      url: `https://huggingface.co/${row.id}`,
      summary: [
        row.pipeline_tag,
        row.library_name,
        `${row.likes ?? 0} likes`,
        `${row.downloads ?? 0} downloads`,
      ]
        .filter(Boolean)
        .join(' · '),
      time: Date.parse(row.createdAt) || null,
      publisher: 'Hugging Face',
      metrics: {
        rank: rank + 1,
        trending: row.trendingScore ?? 0,
        likes: row.likes ?? 0,
        downloads: row.downloads ?? 0,
        task: row.pipeline_tag ?? null,
      },
    }));
  },
};

export const openRouterModels = {
  id: 'openrouter-models',
  name: 'OpenRouter new models',
  domain: 'ai',
  kind: 'model',
  intervalMs: 60 * MINUTE,
  origin: 'openrouter.ai',
  async fetch({ signal }) {
    const body = await fetchJson('https://openrouter.ai/api/v1/models', {
      signal,
      timeoutMs: 40_000,
    });
    const cutoff = Date.now() / 1000 - 21 * 86_400;
    return (body.data ?? [])
      .filter((model) => model.created > cutoff)
      .sort((a, b) => b.created - a.created)
      .slice(0, 40)
      .map((model) => {
        const inPrice = Number(model.pricing?.prompt) * 1e6;
        const outPrice = Number(model.pricing?.completion) * 1e6;
        const price =
          Number.isFinite(inPrice) && Number.isFinite(outPrice)
            ? inPrice === 0 && outPrice === 0
              ? 'free'
              : `$${inPrice.toFixed(2)} / $${outPrice.toFixed(2)} per 1M tokens`
            : '';
        return {
          title: model.name ?? model.id,
          url: `https://openrouter.ai/${model.id}`,
          summary: [
            `${Math.round((model.context_length ?? 0) / 1000)}K context`,
            price,
          ]
            .filter(Boolean)
            .join(' · '),
          time: model.created * 1000,
          publisher: 'OpenRouter',
          metrics: {
            contextLength: model.context_length ?? null,
            priceInPerM: inPrice,
            priceOutPerM: outPrice,
            modelId: model.id,
          },
        };
      });
  },
};

const GITHUB_TOPICS = ['llm', 'ai-agents', 'generative-ai', 'mcp'];
let githubTurn = 0;
export const githubRepos = {
  id: 'github-ai-repos',
  name: 'GitHub rising AI repos',
  domain: 'ai',
  kind: 'repo',
  intervalMs: 20 * MINUTE,
  origin: 'api.github.com',
  async fetch({ signal }) {
    const topic = GITHUB_TOPICS[githubTurn++ % GITHUB_TOPICS.length];
    const headers = process.env.GITHUB_TOKEN
      ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
      : {};
    const body = await fetchJson(
      `https://api.github.com/search/repositories?q=${encodeURIComponent(`topic:${topic} created:>${daysAgoIso(30)}`)}&sort=stars&order=desc&per_page=15`,
      { signal, headers },
    );
    return (body.items ?? []).map((repo) => ({
      title: repo.full_name,
      url: repo.html_url,
      summary: `${repo.description ?? ''}`.slice(0, 300),
      time: Date.parse(repo.created_at) || null,
      publisher: 'GitHub',
      metrics: {
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        language: repo.language ?? null,
        topic,
      },
    }));
  },
};

const AI_WORDS =
  /\b(ai|a\.i\.|llms?|gpt|claude|gemini|openai|anthropic|deepmind|nvidia|agents?|model|neural|machine learning|transformer|diffusion|copilot|inference|mcp)\b/i;

export const hackerNews = {
  id: 'hacker-news-ai',
  name: 'Hacker News (AI)',
  domain: 'ai',
  kind: 'discussion',
  intervalMs: 15 * MINUTE,
  origin: 'hn.algolia.com',
  async fetch({ signal }) {
    const body = await fetchJson(
      'https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=60',
      { signal },
    );
    return (body.hits ?? [])
      .filter((hit) => AI_WORDS.test(hit.title ?? ''))
      .map((hit) => ({
        title: hit.title,
        url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
        summary: `${hit.points ?? 0} points · ${hit.num_comments ?? 0} comments`,
        time: (hit.created_at_i ?? 0) * 1000 || null,
        publisher: 'Hacker News',
        metrics: {
          points: hit.points ?? 0,
          comments: hit.num_comments ?? 0,
          discussion: `https://news.ycombinator.com/item?id=${hit.objectID}`,
        },
      }));
  },
};
