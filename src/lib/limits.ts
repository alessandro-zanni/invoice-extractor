// Per-user caps on uploads, checked against the user's own documents before each extraction.
// The Anthropic workspace spend limit ($20/month) is the hard cap across all users.
export const MAX_UPLOADS_PER_HOUR = 20;
export const MAX_USD_PER_DAY = 1;

const HOUR = 3600_000;

// rows: the user's documents created in the last 24 hours.
// ponytail: check-then-insert, so concurrent uploads can overshoot by a few; a DB-side counter if that ever matters.
export function limitError(rows: { created_at: string; cost_usd: number | string }[], now = Date.now()) {
  const lastHour = rows.filter((r) => now - Date.parse(r.created_at) < HOUR).length;
  if (lastHour >= MAX_UPLOADS_PER_HOUR) return `upload limit reached (${MAX_UPLOADS_PER_HOUR} per hour), try again later`;
  const spent = rows.reduce((s, r) => s + Number(r.cost_usd), 0);
  if (spent >= MAX_USD_PER_DAY) return `daily spend limit reached ($${MAX_USD_PER_DAY}), try again tomorrow`;
  return null;
}
