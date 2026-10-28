/**
 * Optional outbound alert delivery. Each channel is off unless its variables
 * are set; nothing is sent during the first (baseline) sweep.
 *
 *   ANYSEE_DISCORD_WEBHOOK_URL   Discord channel webhook
 *   ANYSEE_SLACK_WEBHOOK_URL     Slack incoming webhook
 *   ANYSEE_TELEGRAM_BOT_TOKEN + ANYSEE_TELEGRAM_CHAT_ID
 *   ANYSEE_NOTIFY_MIN_TIER       flash (default) or priority
 */

const MAX_PER_BATCH = 8;
const TIMEOUT_MS = 10_000;

export function notificationChannels(env = process.env) {
  return {
    discord: Boolean(env.ANYSEE_DISCORD_WEBHOOK_URL),
    slack: Boolean(env.ANYSEE_SLACK_WEBHOOK_URL),
    telegram: Boolean(
      env.ANYSEE_TELEGRAM_BOT_TOKEN && env.ANYSEE_TELEGRAM_CHAT_ID,
    ),
    minTier: env.ANYSEE_NOTIFY_MIN_TIER === 'priority' ? 'priority' : 'flash',
  };
}

function line(alert) {
  const where = alert.countries?.length
    ? ` [${alert.countries.join(', ')}]`
    : '';
  return `${alert.tier.toUpperCase()} · ${alert.domain} · sev ${alert.severity}${where}\n${alert.title}${alert.url ? `\n${alert.url}` : ''}`;
}

async function post(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
}

/** Deliver alerts at or above the configured tier. Returns failures. */
export async function deliverAlerts(alerts, env = process.env) {
  const channels = notificationChannels(env);
  const wanted = alerts
    .filter((alert) =>
      channels.minTier === 'priority'
        ? alert.tier !== 'routine'
        : alert.tier === 'flash',
    )
    .slice(0, MAX_PER_BATCH);
  if (!wanted.length) return [];
  const text = `ANYSEE ALERTS\n\n${wanted.map(line).join('\n\n')}`;
  const sends = [];
  if (channels.discord)
    sends.push([
      'discord',
      post(env.ANYSEE_DISCORD_WEBHOOK_URL, { content: text.slice(0, 1900) }),
    ]);
  if (channels.slack)
    sends.push(['slack', post(env.ANYSEE_SLACK_WEBHOOK_URL, { text })]);
  if (channels.telegram) {
    sends.push([
      'telegram',
      post(
        `https://api.telegram.org/bot${env.ANYSEE_TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          chat_id: env.ANYSEE_TELEGRAM_CHAT_ID,
          text: text.slice(0, 4000),
          disable_web_page_preview: true,
        },
      ),
    ]);
  }
  const results = await Promise.allSettled(sends.map(([, promise]) => promise));
  return results
    .map((result, index) =>
      result.status === 'rejected'
        ? `${sends[index][0]}: ${result.reason.message}`
        : null,
    )
    .filter(Boolean);
}
