/**
 * Outbound HTTP for intel sources: timeouts, a response size cap, a fixed
 * user agent, and per-host spacing for providers that publish a rate limit.
 */

const USER_AGENT =
  'Mozilla/5.0 (compatible; Anysee/0.1; +https://github.com/bilawalsidhu/gods-eye-view)';
const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_BYTES = 8 * 1024 * 1024;

// Minimum gap between requests to one host. GDELT asks for one request every
// five seconds; Yahoo answers bursts with 429.
const HOST_SPACING_MS = new Map([
  ['api.gdeltproject.org', 5_500],
  ['query2.finance.yahoo.com', 1_200],
  ['export.arxiv.org', 3_000],
  ['api.github.com', 2_000],
]);
const hostQueues = new Map();

function spaced(host, task) {
  const gap = HOST_SPACING_MS.get(host);
  if (!gap) return task();
  const previous = hostQueues.get(host) ?? Promise.resolve();
  const run = previous.then(task, task);
  hostQueues.set(
    host,
    run.then(
      () => new Promise((resolve) => setTimeout(resolve, gap)),
      () => new Promise((resolve) => setTimeout(resolve, gap)),
    ),
  );
  return run;
}

async function readCapped(response) {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw new Error(`Response exceeded ${MAX_BYTES} bytes`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Fetch a URL as text, honouring host spacing, a timeout and a size cap. */
export function fetchText(
  url,
  { timeoutMs = DEFAULT_TIMEOUT_MS, headers = {}, signal } = {},
) {
  const { host } = new URL(url);
  return spaced(host, async () => {
    const timeout = AbortSignal.timeout(timeoutMs);
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: '*/*', ...headers },
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      redirect: 'follow',
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`HTTP ${response.status} from ${host}`);
    }
    return readCapped(response);
  });
}

/** Fetch and parse JSON. */
export async function fetchJson(url, options) {
  const text = await fetchText(url, {
    ...options,
    headers: { Accept: 'application/json', ...options?.headers },
  });
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `Invalid JSON from ${new URL(url).host}: ${text.slice(0, 80)}`,
    );
  }
}
