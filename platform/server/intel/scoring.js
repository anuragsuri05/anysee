/**
 * Severity scoring (0–100) and alert tiers. Rules are deterministic so every
 * score can be explained by its reasons; the optional LLM brief reads scores,
 * it does not produce them.
 */

const LEXICON = [
  [
    45,
    /\b(nuclear (strike|attack|test|weapon)|declares? war|coup|martial law|chemical weapons?|mass casualt\w*|assassinat\w*|tsunami warning|state of emergency|invasion of)\b/i,
    'critical keyword',
  ],
  [
    25,
    /\b(killed|dead|deaths|explosions?|airstrikes?|air strikes?|missiles?|attack(ed|s)?|evacuat\w*|hostages?|ransomware|zero-day|outbreak|shot down|casualties|massacre|bombing|earthquake)\b/i,
    'high-impact keyword',
  ],
  [
    10,
    /\b(protests?|clashes|warning|breach|strikes?|crisis|tensions|drones?|sanctions|arrest(ed|s)?|riots?|wildfire|flood\w*)\b/i,
    'notable keyword',
  ],
];

const LAB_ORGS = new Set([
  'org:openai',
  'org:anthropic',
  'org:deepmind',
  'org:google',
  'org:meta',
  'org:xai',
  'org:deepseek',
  'org:mistral',
  'org:alibaba',
  'org:moonshot',
  'org:microsoft',
  'org:nvidia',
  'org:apple',
]);
const RELEASE_WORDS =
  /\b(launch\w*|releas\w*|introduc\w*|unveil\w*|announc\w*|debut\w*|open-sourc\w*|rolls? out)\b/i;

function casualtyBonus(text) {
  const match = text.match(
    /\b(\d[\d,]*)\s+(?:people\s+)?(?:killed|dead|deaths|casualties)\b/i,
  );
  if (!match) return 0;
  const count = Number(match[1].replace(/,/g, ''));
  if (count >= 100) return 30;
  if (count >= 20) return 20;
  if (count >= 5) return 10;
  return 0;
}

function lexiconScore(text, reasons) {
  let score = 0;
  for (const [weight, pattern, label] of LEXICON) {
    if (pattern.test(text)) {
      score += weight;
      reasons.push(label);
    }
  }
  const casualties = casualtyBonus(text);
  if (casualties) {
    score += casualties;
    reasons.push('reported casualties');
  }
  return score;
}

/** Score one item on its own merits. Corroboration is added per cluster. */
export function baseSeverity(item) {
  const reasons = [];
  const text = `${item.title} ${item.summary ?? ''}`;
  const m = item.metrics ?? {};
  let score = 10;

  if (item.domain === 'hazard') {
    if (Number.isFinite(m.magnitude)) {
      score =
        m.magnitude >= 7
          ? 88
          : m.magnitude >= 6.5
            ? 75
            : m.magnitude >= 6
              ? 62
              : m.magnitude >= 5.5
                ? 45
                : 28;
      reasons.push(`magnitude ${m.magnitude}`);
      if (m.tsunami) ((score += 10), reasons.push('tsunami flag'));
      if (m.pager === 'red' || m.pager === 'orange')
        ((score += 10), reasons.push(`PAGER ${m.pager}`));
    } else if (m.alertLevel) {
      score = m.alertLevel === 'Red' ? 85 : m.alertLevel === 'Orange' ? 62 : 30;
      reasons.push(`GDACS ${m.alertLevel}`);
    } else {
      score = /storm|volcano/i.test(m.hazardType ?? '') ? 35 : 25;
      reasons.push(m.hazardType ?? 'natural event');
    }
  } else if (item.domain === 'cyber') {
    if (item.kind === 'vulnerability') {
      score = 52;
      reasons.push('actively exploited (CISA KEV)');
      if (m.ransomware) ((score += 15), reasons.push('ransomware use'));
    } else {
      score = 12 + lexiconScore(text, reasons) * 0.8;
    }
  } else if (item.domain === 'markets') {
    const move = Math.abs(m.changePct ?? 0);
    score = 45 + Math.min(35, move * 3);
    reasons.push(`${m.symbol} moved ${move.toFixed(1)}%`);
  } else if (item.domain === 'ai') {
    const labs = (item.entities ?? []).filter((id) => LAB_ORGS.has(id));
    switch (item.kind) {
      case 'funding': {
        const amount = m.amountUsd ?? 0;
        score =
          amount >= 5e9
            ? 78
            : amount >= 1e9
              ? 66
              : amount >= 2.5e8
                ? 52
                : amount >= 5e7
                  ? 40
                  : 28;
        reasons.push(`$${(amount / 1e6).toFixed(0)}M round`);
        break;
      }
      case 'model':
        score = m.rank ? (m.rank <= 3 ? 48 : m.rank <= 10 ? 36 : 24) : 32;
        if (m.rank) reasons.push(`#${m.rank} trending on Hugging Face`);
        else reasons.push('new model on OpenRouter');
        if (labs.length) ((score += 12), reasons.push('frontier lab'));
        break;
      case 'paper':
        score = (m.upvotes ?? 0) >= 80 ? 46 : (m.upvotes ?? 0) >= 30 ? 34 : 18;
        if (m.upvotes) reasons.push(`${m.upvotes} upvotes`);
        break;
      case 'repo':
        score = (m.stars ?? 0) >= 5000 ? 50 : (m.stars ?? 0) >= 1000 ? 38 : 22;
        reasons.push(`${m.stars ?? 0} stars`);
        break;
      case 'discussion':
        score = (m.points ?? 0) >= 500 ? 45 : (m.points ?? 0) >= 200 ? 34 : 22;
        reasons.push(`${m.points ?? 0} HN points`);
        break;
      case 'policy':
        score =
          /\b(executive order|final rule|ai act|ban|law signed|passes)\b/i.test(
            text,
          )
            ? 50
            : 28;
        reasons.push('policy');
        break;
      default:
        score = 20;
        if (labs.length && RELEASE_WORDS.test(item.title)) {
          score = 56;
          reasons.push('frontier lab release');
        }
        score += lexiconScore(text, reasons) * 0.4;
    }
  } else {
    score = 14 + lexiconScore(text, reasons);
  }
  return { severity: Math.max(0, Math.min(100, Math.round(score))), reasons };
}

/** Bonus for the same story reported by several independent publishers. */
export function corroborationBonus(publisherCount) {
  if (publisherCount >= 8) return 25;
  if (publisherCount >= 5) return 18;
  if (publisherCount >= 3) return 10;
  return 0;
}

export function tierFor(severity) {
  if (severity >= 80) return 'flash';
  if (severity >= 60) return 'priority';
  if (severity >= 40) return 'routine';
  return null;
}

export const TIER_RANK = { flash: 3, priority: 2, routine: 1 };
