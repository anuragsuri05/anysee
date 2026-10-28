/** Cyber: CISA Known Exploited Vulnerabilities and security news. */

import { fetchJson } from '../http.js';
import { MINUTE, rssSource } from './common.js';

export const cisaKev = {
  id: 'cisa-kev',
  name: 'CISA Known Exploited Vulnerabilities',
  domain: 'cyber',
  kind: 'vulnerability',
  intervalMs: 60 * MINUTE,
  origin: 'www.cisa.gov',
  async fetch({ signal }) {
    const body = await fetchJson(
      'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json',
      { signal, timeoutMs: 40_000 },
    );
    const monthAgo = Date.now() - 30 * 86_400_000;
    return (body.vulnerabilities ?? [])
      .map((v) => ({ ...v, added: Date.parse(v.dateAdded) }))
      .filter((v) => v.added > monthAgo)
      .sort((a, b) => b.added - a.added)
      .slice(0, 40)
      .map((v) => ({
        title: `${v.cveID}: ${v.vendorProject} ${v.product} — ${v.vulnerabilityName}`,
        url: `https://nvd.nist.gov/vuln/detail/${v.cveID}`,
        summary:
          `${v.shortDescription ?? ''} Remediate by ${v.dueDate}.`.trim(),
        time: v.added,
        publisher: 'CISA KEV',
        metrics: {
          ransomware: v.knownRansomwareCampaignUse === 'Known',
          dueDate: v.dueDate,
        },
      }));
  },
};

export const cyberNews = rssSource({
  id: 'cyber-news',
  name: 'Security news',
  domain: 'cyber',
  urls: [
    'https://feeds.feedburner.com/TheHackersNews',
    'https://www.bleepingcomputer.com/feed/',
  ],
  intervalMs: 15 * MINUTE,
});
