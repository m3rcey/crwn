// Mint a one-time login link for an artist's account (founder tool).
//
// Usage:   node scripts/artist-login-link.mjs gb
//
// Looks up the artist by slug, resolves their auth account, and asks Supabase's admin
// API for a MAGIC LINK action_link. Nothing about the account changes: the password is
// untouched, the artist's own sessions stay alive, and the link is single-use and
// expires after about an hour. This exists for consented support/testing sessions
// ("log in as me and check it"); it uses the service role key, which the founder
// already holds, so it grants nothing new.
//
// Open the printed link in an INCOGNITO window, or it will replace your own session.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const slug = process.argv[2];
if (!slug) {
  console.error('Usage: node scripts/artist-login-link.mjs <artist-slug>');
  process.exit(1);
}

// Parse .env.local the way load-env.sh does: split on the FIRST '=', strip quotes,
// skip malformed lines. Never source it.
const envFile = resolve(process.cwd(), '.env.local');
const env = {};
for (const line of readFileSync(envFile, 'utf8').split('\n')) {
  const i = line.indexOf('=');
  if (i < 1 || line.trimStart().startsWith('#')) continue;
  const key = line.slice(0, i).trim();
  let val = line.slice(i + 1).trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  env[key] = val;
}

const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const SRK = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !SRK) {
  console.error('NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing from .env.local');
  process.exit(1);
}

const headers = { apikey: SRK, Authorization: `Bearer ${SRK}`, 'Content-Type': 'application/json' };

// 1. slug -> user_id
const apRes = await fetch(`${URL_}/rest/v1/artist_profiles?select=user_id,slug&slug=eq.${encodeURIComponent(slug)}`, { headers });
const apRows = await apRes.json();
if (!Array.isArray(apRows) || apRows.length !== 1) {
  console.error(`Expected exactly one artist with slug "${slug}", got: ${JSON.stringify(apRows)}`);
  process.exit(1);
}
const userId = apRows[0].user_id;

// 2. user_id -> auth email
const uRes = await fetch(`${URL_}/auth/v1/admin/users/${userId}`, { headers });
const user = await uRes.json();
if (!uRes.ok || !user?.email) {
  console.error(`Could not resolve the auth account for user ${userId}: ${JSON.stringify(user)}`);
  process.exit(1);
}

// 3. Mint the magic link. generate_link returns the action_link WITHOUT emailing anyone.
//
// Two attempts on purpose. The first asks Supabase to land the session on /home, which is
// nicer but only works if that exact URL is on the project's allowed-redirect list. If it
// is not, Supabase rejects the whole call, so the second attempt drops the redirect and
// lets the project's Site URL decide. A founder running this should never have to debug a
// redirect allowlist to get a login link.
// The landing path must be PUBLIC. /home is in middleware's protectedPaths, so the browser
// arrives with the session still in the URL fragment (the server never sees a fragment),
// middleware finds no auth cookie, and bounces to /login before the client can store it.
// /verify is public, is already the page that finishes an auth hand-off, and reads the
// session once the client has parsed the URL. That is the whole fix for "it dumped me on
// the sign-in screen".
const LANDING = 'https://thecrwn.app/verify';

async function mintLink(withRedirect) {
  const body = { type: 'magiclink', email: user.email };
  if (withRedirect) body.options = { redirect_to: LANDING };
  const res = await fetch(`${URL_}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  const action = json?.action_link || json?.properties?.action_link || null;
  return { ok: res.ok && !!action, action, json };
}

let minted = await mintLink(true);
if (!minted.ok) minted = await mintLink(false);

if (!minted.ok) {
  console.error('Could not generate the link. Supabase said:');
  console.error(JSON.stringify(minted.json, null, 2));
  console.error('');
  console.error('Send that message to Claude; it names the reason.');
  process.exit(1);
}
const actionLink = minted.action;

console.log(`One-time login link for ${slug} (${user.email}):`);
console.log('');
console.log(actionLink);
console.log('');
console.log('Open it in an INCOGNITO window (a normal window replaces YOUR session).');
console.log('You should land on a page that says "Email verified". That means it worked:');
console.log('press Continue, then go to thecrwn.app/studio/lab.');
console.log('');
console.log('If you land on the SIGN-IN page instead, the link was already used or it');
console.log('expired. Each link works once. Re-run this command for a fresh one.');
console.log('The artist keeps their password and their own sessions; nothing was changed.');
