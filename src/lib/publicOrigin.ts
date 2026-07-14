/**
 * The origin CRWN answers on in public, and the ONLY one an internal self-call may use.
 *
 * Never `req.nextUrl.origin`, never `https://${VERCEL_URL}`. Inside a Vercel cron both
 * resolve to the *.vercel.app DEPLOYMENT origin, and deployment origins sit behind
 * Vercel Authentication (custom domains are public, deployment urls are not). That wall
 * answers EVERY path, `/api/*` included, with an http 200 and an html login page.
 *
 * Which means a self-call sent there does not fail loudly. It "succeeds": status 200,
 * a body full of html, and the work silently never happens. That is how the RLS canary
 * came to email a LEAK alert about its own front door, and it is why these urls are
 * hardcoded rather than configured. Vercel env values cannot be read back to verify
 * (sensitive ones pull as empty strings), so a mistyped origin here would be a whole
 * class of work quietly not happening, with nothing to notice it.
 */
export const PUBLIC_ORIGIN =
  process.env.NODE_ENV === 'production' ? 'https://thecrwn.app' : 'http://localhost:3000';
