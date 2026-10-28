/** Every intel source connector, in the order the data-health panel lists them. */

import { gdelt, worldFeeds } from './world.js';
import { eonet, gdacs, usgs } from './hazards.js';
import { cisaKev, cyberNews } from './cyber.js';
import {
  aiFunding,
  aiLabs,
  aiLabsNews,
  aiNews,
  aiPolicyNews,
  arxiv,
  federalRegister,
  githubRepos,
  hackerNews,
  hfModels,
  hfPapers,
  openRouterModels,
} from './ai.js';
import { markets } from './markets.js';

export const SOURCES = Object.freeze([
  ...worldFeeds,
  gdelt,
  usgs,
  gdacs,
  eonet,
  cisaKev,
  cyberNews,
  aiLabs,
  aiLabsNews,
  aiNews,
  aiFunding,
  aiPolicyNews,
  federalRegister,
  arxiv,
  hfPapers,
  hfModels,
  openRouterModels,
  githubRepos,
  hackerNews,
  markets,
]);

export const DOMAINS = Object.freeze({
  world: 'World events',
  hazard: 'Hazards',
  cyber: 'Cyber',
  ai: 'AI sector',
  markets: 'Markets',
});
