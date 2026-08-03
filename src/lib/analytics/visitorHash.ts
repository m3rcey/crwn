// visitorHash.ts — the ONE definition of an anonymous visitor identity.
//
// This was private to middleware.ts, where it identified page visits. Tier events need the
// same identity or the two tables cannot be reconciled (a tier view and the page visit that
// contained it have to agree on who the visitor was). Copying it would be how the two
// silently drift apart after one edit, so it lives here and middleware imports it.
//
// Web Crypto and TextEncoder only, no Node built-ins, so this is safe in BOTH the Edge
// runtime (middleware) and a Node route handler.
//
// Privacy: the input is the client IP plus the user-agent and the output is a one-way SHA-256
// digest. No IP, no user-agent and no PII is ever stored. It is stable for a given device on
// a given network, which is exactly enough to deduplicate a day of views and nothing more.

const BOT_PATTERNS =
  /bot|crawl|spider|slurp|facebookexternalhit|twitterbot|linkedinbot|discordbot|telegrambot|whatsapp|preview|monitor|uptime|pingdom|headless|phantom|selenium|puppeteer|lighthouse|pagespeed|gtmetrix/i;

export function isBot(userAgent: string): boolean {
  return BOT_PATTERNS.test(userAgent);
}

/** The header subset the hash reads. Works for a NextRequest or a plain Headers. */
export interface VisitorHeaders {
  get(name: string): string | null;
}

/**
 * Stable pseudonymous id for a visitor, or null when the caller is a bot.
 *
 * Returning null for bots is not an optimization, it is a correctness rule: a crawler that
 * renders an artist page would otherwise register a view against every tier and inflate the
 * denominator of every conversion rate on that page.
 */
export async function hashVisitor(headers: VisitorHeaders): Promise<string | null> {
  const ua = headers.get('user-agent') || 'unknown';
  if (isBot(ua)) return null;

  // Only the first entry in the chain is the actual client; the rest are proxies.
  const forwardedFor = headers.get('x-forwarded-for');
  const ip = forwardedFor
    ? forwardedFor.split(',')[0].trim()
    : headers.get('x-real-ip') || 'unknown';

  const data = new TextEncoder().encode(`${ip}:${ua}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
