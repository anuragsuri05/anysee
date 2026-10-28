/** Client for the /api/intel routes and their event stream. */

const BASE = '/api/intel';

async function request(path, init) {
  const response = await fetch(`${BASE}${path}`, init);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${response.status}`);
  }
  return response.json();
}

const query = (params = {}) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
};

const write = (path, body) =>
  request(path, {
    method: 'POST',
    headers: {
      'X-Anysee': '1',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

export const intelApi = {
  overview: () => request('/overview'),
  feed: (params) => request(`/feed${query(params)}`),
  item: (id) => request(`/item${query({ id })}`),
  geo: (params) => request(`/geo${query(params)}`),
  entities: (params) => request(`/entities${query(params)}`),
  entity: (id, limit = 60) => request(`/entity${query({ id, limit })}`),
  health: () => request('/health'),
  audit: () => request('/audit?limit=150'),
  snapshots: () => request('/snapshots'),
  snapshot: (ts) => request(`/snapshot${query({ ts })}`),
  sweep: () => write('/sweep'),
  regenerateBrief: () => write('/brief'),
  claude: () => request('/claude'),
  claudeRefresh: () => write('/claude/refresh'),
  claudeLogin: () => write('/claude/login'),
  claudeLoginCode: (code) => write('/claude/login/code', { code }),
  claudeLoginCancel: () => write('/claude/login/cancel'),
};

/** Subscribe to engine events; reconnects on its own. Returns an unsubscribe. */
export function subscribeIntel(onEvent) {
  let source = null;
  let closed = false;
  let retry = null;
  const open = () => {
    source = new EventSource(`${BASE}/stream`);
    for (const event of ['hello', 'update', 'brief']) {
      source.addEventListener(event, (message) => {
        try {
          onEvent(event, JSON.parse(message.data));
        } catch {
          // ignore malformed frames
        }
      });
    }
    source.onerror = () => {
      source.close();
      if (!closed) retry = setTimeout(open, 5_000);
    };
  };
  open();
  return () => {
    closed = true;
    clearTimeout(retry);
    source?.close();
  };
}
