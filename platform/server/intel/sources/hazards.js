/** Natural hazards with exact coordinates: USGS, GDACS and NASA EONET. */

import { fetchJson, fetchText } from '../http.js';
import { parseFeed, plainText } from '../rss.js';
import { MINUTE } from './common.js';

export const usgs = {
  id: 'usgs-quakes',
  name: 'USGS Earthquakes M4.5+',
  domain: 'hazard',
  kind: 'event',
  intervalMs: 5 * MINUTE,
  origin: 'earthquake.usgs.gov',
  async fetch({ signal }) {
    const body = await fetchJson(
      'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson',
      { signal },
    );
    return (body.features ?? []).map((feature) => {
      const [lon, lat, depth] = feature.geometry?.coordinates ?? [];
      const p = feature.properties ?? {};
      return {
        title: `M${Number(p.mag).toFixed(1)} earthquake — ${p.place ?? 'unknown location'}`,
        url: p.url,
        summary: `Depth ${Math.round(depth ?? 0)} km.${p.tsunami ? ' Tsunami flag raised.' : ''}${p.alert ? ` PAGER alert: ${p.alert}.` : ''}`,
        time: p.time,
        publisher: 'USGS',
        lat,
        lon,
        metrics: {
          magnitude: p.mag,
          depthKm: depth,
          tsunami: p.tsunami,
          pager: p.alert ?? null,
        },
      };
    });
  },
};

const GDACS_TYPES = {
  EQ: 'Earthquake',
  TC: 'Tropical cyclone',
  FL: 'Flood',
  VO: 'Volcano',
  DR: 'Drought',
  WF: 'Wildfire',
  TS: 'Tsunami',
};

export const gdacs = {
  id: 'gdacs',
  name: 'GDACS Disaster Alerts',
  domain: 'hazard',
  kind: 'event',
  intervalMs: 10 * MINUTE,
  origin: 'www.gdacs.org',
  async fetch({ signal }) {
    const xml = await fetchText('https://www.gdacs.org/xml/rss.xml', {
      signal,
    });
    const weekAgo = Date.now() - 7 * 86_400_000;
    return parseFeed(xml)
      .map((entry) => {
        const block = entry.raw;
        const level = plainText(
          block.match(
            /<gdacs:alertlevel>([\s\S]*?)<\/gdacs:alertlevel>/i,
          )?.[1] ?? '',
        );
        const type = plainText(
          block.match(/<gdacs:eventtype>([\s\S]*?)<\/gdacs:eventtype>/i)?.[1] ??
            '',
        );
        const country = plainText(
          block.match(/<gdacs:country>([\s\S]*?)<\/gdacs:country>/i)?.[1] ?? '',
        );
        return {
          title: entry.title,
          url: entry.url,
          summary: entry.summary,
          time: entry.time,
          publisher: 'GDACS',
          lat: entry.lat,
          lon: entry.lon,
          metrics: {
            alertLevel: level || null,
            hazardType: GDACS_TYPES[type] ?? type,
          },
          countryHint: country,
        };
      })
      .filter(
        (item) =>
          item.time &&
          item.time > weekAgo &&
          item.metrics.alertLevel !== 'Green',
      );
  },
};

export const eonet = {
  id: 'nasa-eonet',
  name: 'NASA EONET',
  domain: 'hazard',
  kind: 'event',
  intervalMs: 20 * MINUTE,
  origin: 'eonet.gsfc.nasa.gov',
  async fetch({ signal }) {
    const body = await fetchJson(
      'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=10&limit=120',
      { signal },
    );
    return (body.events ?? []).flatMap((event) => {
      const geometry = event.geometry?.at(-1);
      if (geometry?.type !== 'Point') return [];
      const [lon, lat] = geometry.coordinates;
      const category = event.categories?.[0]?.title ?? 'Natural event';
      return [
        {
          title: `${category}: ${event.title}`,
          url: event.sources?.[0]?.url ?? event.link,
          summary: geometry.magnitudeValue
            ? `${geometry.magnitudeValue} ${geometry.magnitudeUnit ?? ''}`.trim()
            : '',
          time: Date.parse(geometry.date) || null,
          publisher: 'NASA EONET',
          lat,
          lon,
          metrics: { hazardType: category },
        },
      ];
    });
  },
};
