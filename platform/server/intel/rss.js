/**
 * A small RSS 2.0 / Atom / RDF reader. Feeds are untrusted input: values are
 * returned as plain text with markup stripped, never as HTML.
 */

const ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
};

export function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
    if (code[0] === '#') {
      const value =
        code[1] === 'x' || code[1] === 'X'
          ? parseInt(code.slice(2), 16)
          : parseInt(code.slice(1), 10);
      return Number.isFinite(value) && value > 0 && value < 0x110000
        ? String.fromCodePoint(value)
        : '';
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

/** Strip CDATA, tags and entities, and collapse whitespace. */
export function plainText(value) {
  if (!value) return '';
  let text = value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  // Entity-encoded markup is common in descriptions; decode, then strip.
  text = decodeEntities(text);
  text = text.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  text = text.replace(/<[^>]+>/g, ' ');
  text = decodeEntities(text);
  return text.replace(/\s+/g, ' ').trim();
}

function tag(block, name) {
  const pattern = new RegExp(
    `<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`,
    'i',
  );
  return block.match(pattern)?.[1] ?? '';
}

function attr(block, name, attribute) {
  const pattern = new RegExp(`<${name}\\b[^>]*\\b${attribute}="([^"]*)"`, 'i');
  return block.match(pattern)?.[1] ?? '';
}

function safeUrl(raw) {
  const text = decodeEntities(plainText(raw) || raw || '').trim();
  try {
    const url = new URL(text);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function parseDate(raw) {
  const time = Date.parse(plainText(raw));
  return Number.isFinite(time) ? time : null;
}

/**
 * Parse a feed into `{ title, url, summary, time, source, lat, lon }` rows.
 * `lat`/`lon` come from GeoRSS when the feed carries it.
 */
export function parseFeed(xml) {
  const isAtom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml);
  const blocks = xml.match(
    isAtom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi,
  );
  if (!blocks) return [];
  return blocks.map((block) => {
    const title = plainText(tag(block, 'title'));
    const url = isAtom
      ? safeUrl(attr(block, 'link', 'href'))
      : safeUrl(tag(block, 'link')) || safeUrl(tag(block, 'guid'));
    const summary = plainText(
      tag(block, 'description') ||
        tag(block, 'summary') ||
        tag(block, 'content'),
    ).slice(0, 400);
    const time =
      parseDate(tag(block, 'pubDate')) ??
      parseDate(tag(block, 'published')) ??
      parseDate(tag(block, 'updated')) ??
      parseDate(tag(block, 'dc:date'));
    const source = plainText(tag(block, 'source'));
    let lat = null;
    let lon = null;
    const point = plainText(tag(block, 'georss:point'));
    if (point) {
      const [a, b] = point.split(/\s+/).map(Number);
      if (Number.isFinite(a) && Number.isFinite(b)) [lat, lon] = [a, b];
    } else {
      const geoLat = Number(plainText(tag(block, 'geo:lat')));
      const geoLon = Number(plainText(tag(block, 'geo:long')));
      if (
        plainText(tag(block, 'geo:lat')) &&
        Number.isFinite(geoLat) &&
        Number.isFinite(geoLon)
      )
        [lat, lon] = [geoLat, geoLon];
    }
    return { title, url, summary, time, source, lat, lon, raw: block };
  });
}
