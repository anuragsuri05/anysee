/**
 * DOM and formatting helpers. All text from sources is untrusted, so nodes
 * are built with textContent and links are limited to http(s).
 */

/** Create an element: h('div', { class: 'x', onclick }, child, 'text'). */
export function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value == null || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function')
      node.addEventListener(key.slice(2), value);
    else if (key === 'class') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'style' && typeof value === 'object')
      Object.assign(node.style, value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  append(node, children);
  return node;
}

function append(node, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    node.append(
      child instanceof Node ? child : document.createTextNode(String(child)),
    );
  }
}

export function replace(node, ...children) {
  node.replaceChildren();
  append(node, children);
  return node;
}

/** An external link, or plain text when the URL is not http(s). */
export function link(url, text, className = 'ax-link') {
  try {
    const parsed = new URL(url);
    if (['http:', 'https:'].includes(parsed.protocol)) {
      return h(
        'a',
        {
          class: className,
          href: parsed.href,
          target: '_blank',
          rel: 'noopener noreferrer',
        },
        text,
      );
    }
  } catch {
    // fall through
  }
  return h('span', {}, text);
}

export function ago(ms, now = Date.now()) {
  if (!ms) return '—';
  const seconds = Math.max(0, Math.round((now - ms) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function utc(ms) {
  if (!ms) return '—';
  return `${new Date(ms).toISOString().slice(0, 16).replace('T', ' ')}Z`;
}

export function usd(value) {
  if (!Number.isFinite(value)) return '—';
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(value >= 1e10 ? 0 : 1)}B`;
  if (value >= 1e6) return `$${Math.round(value / 1e6)}M`;
  return `$${Math.round(value).toLocaleString()}`;
}

export function compact(value) {
  if (!Number.isFinite(value)) return '—';
  return Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

export function pct(value) {
  if (!Number.isFinite(value)) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function svg(tag, attrs = {}, ...children) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null) continue;
    if (key.startsWith('on') && typeof value === 'function')
      node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, String(value));
  }
  for (const child of children.flat()) {
    if (child == null) continue;
    node.append(
      child instanceof Node ? child : document.createTextNode(String(child)),
    );
  }
  return node;
}

/** A small polyline sparkline. */
export function sparkline(
  values,
  { width = 140, height = 28, stroke = 'currentColor' } = {},
) {
  const points = values.filter(Number.isFinite);
  const node = svg('svg', {
    class: 'ax-spark',
    viewBox: `0 0 ${width} ${height}`,
    preserveAspectRatio: 'none',
    'aria-hidden': 'true',
  });
  if (points.length < 2) return node;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const coords = points
    .map(
      (value, index) =>
        `${((index / (points.length - 1)) * width).toFixed(1)},${(height - 2 - ((value - min) / span) * (height - 4)).toFixed(1)}`,
    )
    .join(' ');
  node.append(
    svg('polyline', {
      points: coords,
      fill: 'none',
      stroke,
      'stroke-width': 1.5,
      'vector-effect': 'non-scaling-stroke',
    }),
  );
  return node;
}

/** The eye mark used on the launcher and Ops Center header. */
export function eyeMark() {
  return svg(
    'svg',
    {
      class: 'ax-eye',
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': 1.6,
      'aria-hidden': 'true',
      style: 'color: var(--ax-accent)',
    },
    svg('path', { d: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z' }),
    svg('circle', { cx: 12, cy: 12, r: 3.2 }),
    svg('circle', { cx: 12, cy: 12, r: 0.8, fill: 'currentColor' }),
  );
}

export const DOMAIN_LABEL = {
  world: 'World',
  hazard: 'Hazard',
  cyber: 'Cyber',
  ai: 'AI',
  markets: 'Markets',
};
