#!/usr/bin/env node
// Content-test funnel audit. READ-ONLY: every Supabase call is a select, every Graph call a GET.
//
//   views -> keyword comments -> DM/calculator -> result -> signup -> setup/launch -> first paid
//
// Run (WSL, repo root). load-env.sh does NOT carry the Supabase vars; .env.local does:
//   bash -c 'set -a; source ./.env.local; set +a; node scripts/funnel-audit.mjs --since 2026-09-25'
//
// Known blind spots (2026-09-26): Google sign-ups carry no source, so an account that never
// claimed a calculator result is untraceable to a video; ManyChat sends keyword "worth" for the
// VAULT flow and no source_post_id, so the DM side cannot be split per post.
//
// Instagram numbers come from the local read token in .env.instagram (see
// tools/instagram-mcp/server.mjs). Everything else comes from production with the service role.
// Founder/admin traffic is already excluded at write time for funnel_events (doNotTrack.ts);
// accounts are additionally filtered here: admin role never counts as a prospect.

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const arg = (name, d) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const SINCE_DAY = arg('since', '2026-09-25');
const SINCE = new Date(`${SINCE_DAY}T04:00:00Z`).toISOString(); // midnight US Eastern
const OWN_IG = 'thecrwnapp';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Missing Supabase env (source ./load-env.sh first)'); process.exit(1); }
const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const out = (title) => console.log(`\n=== ${title} ===`);
const tally = (rows, f) => rows.reduce((m, r) => { const k = f(r) ?? '(none)'; m[k] = (m[k] || 0) + 1; return m; }, {});
const sorted = (o) => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]));

async function all(table, cols, build = (q) => q) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(db.from(table).select(cols)).range(from, from + 999);
    if (error) { console.log(`  [${table}] ${error.message}`); return rows; }
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

// ── DM keywords, from the registry source (the ONE list ManyChat keywords map to) ─────────────
const registry = readFileSync(new URL('../src/lib/leadMagnets/registry.ts', import.meta.url), 'utf8');
const KEYWORDS = new Set(
  [...registry.matchAll(/dmKeywords:\s*\[([^\]]*)\]/g)]
    .flatMap((m) => [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1].toLowerCase())),
);
KEYWORDS.add('worth');
const keywordOf = (text) => {
  const w = String(text || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').trim().split(/\s+/);
  return w.find((x) => KEYWORDS.has(x)) || null;
};

// ── 1. Instagram: views and keyword comments per post ─────────────────────────────────────────
async function instagram() {
  let token = '';
  try {
    token = (readFileSync(new URL('../.env.instagram', import.meta.url), 'utf8').match(/^IG_READ_TOKEN=(.+)$/m) || [])[1]?.trim() || '';
  } catch { /* no token file */ }
  if (!token) { out('INSTAGRAM'); console.log('  no .env.instagram token; skipped'); return []; }
  const G = async (path, params = {}) => {
    const q = new URLSearchParams({ ...params, access_token: token });
    const r = await fetch(`https://graph.instagram.com/v26.0/${path}?${q}`);
    const j = await r.json();
    if (j.error) throw new Error(`${j.error.code}: ${j.error.message}`);
    return j;
  };
  const posts = [];
  let after;
  for (;;) {
    const r = await G('me/media', { fields: 'id,caption,media_product_type,permalink,timestamp,comments_count,like_count', limit: '50', ...(after ? { after } : {}) });
    const fresh = r.data.filter((p) => p.timestamp >= SINCE);
    posts.push(...fresh);
    if (fresh.length < r.data.length || !r.paging?.next) break;
    after = r.paging.cursors.after;
  }
  const METRICS = ['views', 'reach', 'likes', 'comments', 'shares', 'saved', 'total_interactions', 'profile_visits', 'follows'];
  for (const p of posts) {
    p.m = {};
    await Promise.all(METRICS.map(async (metric) => {
      try { const r = await G(`${p.id}/insights`, { metric }); p.m[metric] = r.data?.[0]?.values?.[0]?.value ?? r.data?.[0]?.total_value?.value ?? null; } catch { p.m[metric] = null; }
    }));
    const comments = [];
    let c;
    for (;;) {
      const r = await G(`${p.id}/comments`, { fields: 'id,text,timestamp,from', limit: '50', ...(c ? { after: c } : {}) });
      comments.push(...r.data);
      if (!r.paging?.next) break;
      c = r.paging.cursors.after;
    }
    // The commenter is on `from` ({id, username}); the top-level `username` is often absent.
    for (const x of comments) x.who = x.from?.username || x.username || x.from?.id || x.id;
    const others = comments.filter((x) => String(x.who).toLowerCase() !== OWN_IG);
    const kw = others.filter((x) => keywordOf(x.text));
    p.kwComments = kw.length;
    p.kwUsers = new Set(kw.map((x) => x.who)).size;
    p.kwWho = new Set(kw.map((x) => x.who));
    p.kwBy = tally(kw, (x) => keywordOf(x.text));
    p.otherComments = others.length;
  }
  const acct = {};
  await Promise.all(['reach', 'views', 'profile_links_taps', 'accounts_engaged', 'follows_and_unfollows'].map(async (metric) => {
    try {
      const r = await G('me/insights', { metric, period: 'day', metric_type: 'total_value', since: String(Math.floor(Date.parse(SINCE) / 1000)), until: String(Math.floor(Date.now() / 1000)) });
      acct[metric] = r.data?.[0]?.total_value?.value ?? r.data?.[0]?.total_value ?? null;
    } catch (e) { acct[metric] = `n/a (${String(e.message).slice(0, 60)})`; }
  }));
  const me = await G('me', { fields: 'followers_count' });

  out(`INSTAGRAM: ${posts.length} posts since ${SINCE_DAY} (followers now ${me.followers_count})`);
  console.log('  account window:', JSON.stringify(acct));
  let tv = 0, tk = 0, tku = 0;
  const everyone = new Set();
  for (const p of posts.sort((a, b) => a.timestamp.localeCompare(b.timestamp))) {
    tv += p.m.views || 0; tk += p.kwComments; tku += p.kwUsers;
    for (const w of p.kwWho) everyone.add(w);
    const cap = (p.caption || '').split('\n')[0].slice(0, 60);
    console.log(`  ${p.timestamp.slice(5, 16)} ${p.media_product_type.padEnd(5)} views ${String(p.m.views ?? '?').padStart(6)} reach ${String(p.m.reach ?? '?').padStart(6)} likes ${String(p.m.likes ?? '?').padStart(4)} shares ${String(p.m.shares ?? '?').padStart(4)} saves ${String(p.m.saved ?? '?').padStart(4)} profVisits ${String(p.m.profile_visits ?? '?').padStart(4)} follows ${String(p.m.follows ?? '?').padStart(3)} | comments ${p.otherComments} keyword ${p.kwComments} (${p.kwUsers} ppl) ${JSON.stringify(p.kwBy)} | ${p.id} "${cap}"`);
  }
  console.log(`  TOTAL views ${tv}, keyword comments ${tk}, keyword commenters ${tku} per-post sum, ${everyone.size} distinct people, rate ${tv ? ((everyone.size / tv) * 100).toFixed(2) : '?'}% of views`);
  return posts;
}

// ── 2..6. Production ─────────────────────────────────────────────────────────────────────────
async function production(posts) {
  const postIds = new Set(posts.map((p) => p.id));

  // Admin accounts never count as prospects.
  const admins = new Set((await all('profiles', 'id', (q) => q.eq('role', 'admin'))).map((r) => r.id));

  out('DM SIDE (ManyChat -> lead_sessions)');
  const sessions = await all('lead_sessions', 'id,lead_identity_id,lead_magnet_id,keyword,source_post_id,state,status,utm_content,started_at', (q) => q.gte('started_at', SINCE));
  console.log(`  sessions ${sessions.length}, distinct people ${new Set(sessions.map((s) => s.lead_identity_id)).size}`);
  console.log('  by keyword', JSON.stringify(sorted(tally(sessions, (s) => (s.keyword || '').toLowerCase() || null))));
  console.log('  by tool', JSON.stringify(sorted(tally(sessions, (s) => s.lead_magnet_id))));
  console.log('  by state', JSON.stringify(sorted(tally(sessions, (s) => s.state))));
  console.log('  by post (tagged to a test post?)', JSON.stringify(sorted(tally(sessions, (s) => s.source_post_id ? (postIds.has(s.source_post_id) ? `test:${s.source_post_id}` : `other:${s.source_post_id}`) : null))));
  const aev = await all('acquisition_events', 'event_name,status', (q) => q.gte('occurred_at', SINCE));
  console.log('  acquisition_events', JSON.stringify(sorted(tally(aev, (e) => e.event_name))));
  console.log('  acquisition_events failed/dead', JSON.stringify(sorted(tally(aev.filter((e) => ['failed', 'dead_letter'].includes(e.status)), (e) => e.event_name))));
  const idents = await all('lead_identities', 'id,email,user_id,status,first_seen_at', (q) => q.gte('first_seen_at', SINCE));
  console.log(`  new lead identities ${idents.length}, with email ${idents.filter((i) => i.email).length}, claimed by an account ${idents.filter((i) => i.user_id).length}`);
  console.log('  identity status', JSON.stringify(sorted(tally(idents, (i) => i.status))));

  out('CALCULATOR RESULTS (lead_magnet_results)');
  const results = await all('lead_magnet_results', 'id,tool_slug,source,user_id,status,input_data,created_at', (q) => q.gte('created_at', SINCE));
  const pub = results.filter((r) => r.source === 'public' && !admins.has(r.user_id));
  const attr = (r) => r.input_data?._attribution || {};
  console.log(`  public results ${pub.length}, claimed into an account ${pub.filter((r) => r.user_id).length}`);
  console.log('  by tool', JSON.stringify(sorted(tally(pub, (r) => r.tool_slug))));
  console.log('  by channel/platform', JSON.stringify(sorted(tally(pub, (r) => [attr(r).channel, attr(r).platform].filter(Boolean).join('/') || null))));
  console.log('  by campaign', JSON.stringify(sorted(tally(pub, (r) => attr(r).campaign))));
  console.log('  by creative', JSON.stringify(sorted(tally(pub, (r) => attr(r).creative))));
  console.log('  by day', JSON.stringify(tally(pub, (r) => r.created_at.slice(0, 10))));

  out('CALCULATOR STEP DROP-OFF (lead_magnet_events, public)');
  const lme = await all('lead_magnet_events', 'event_type,tool_slug,step,total_steps,utm_content,created_at', (q) => q.gte('created_at', SINCE).eq('context', 'public'));
  for (const tool of Object.keys(sorted(tally(lme, (e) => e.tool_slug)))) {
    const rows = lme.filter((e) => e.tool_slug === tool);
    console.log(`  ${tool}: ${JSON.stringify(sorted(tally(rows, (e) => e.event_type)))}`);
    const steps = rows.filter((e) => e.step != null);
    if (steps.length) console.log(`    by step: ${JSON.stringify(tally(steps.sort((a, b) => a.step - b.step), (e) => `${e.event_type}@${e.step}/${e.total_steps}`))}`);
  }

  out('WEB FUNNEL (funnel_events; founder devices/accounts excluded at write)');
  const ev = await all('funnel_events', 'stage,calculator,referrer,campaign,video,user_id,anon_id,metadata,occurred_at', (q) => q.gte('occurred_at', SINCE));
  const evp = ev.filter((e) => !admins.has(e.user_id));
  const actor = (e) => e.user_id || e.anon_id || null;
  const STAGES = ['page_viewed', 'calculator_started', 'calculator_completed', 'result_revealed', 'assumptions_changed', 'email_submitted', 'signup_clicked', 'account_created', 'email_verified', 'setup_started', 'setup_completed', 'builder_opened', 'builder_published', 'rise_mode_started', 'stripe_connected', 'fans_imported', 'fan_invited', 'call_requested', 'first_paid_conversion'];
  for (const s of STAGES) {
    const rows = evp.filter((e) => e.stage === s);
    if (!rows.length) { console.log(`  ${s.padEnd(22)} 0`); continue; }
    console.log(`  ${s.padEnd(22)} ${String(rows.length).padStart(5)} events, ${String(new Set(rows.map(actor).filter(Boolean)).size).padStart(4)} actors | by source ${JSON.stringify(sorted(tally(rows, (e) => e.referrer)))}`);
  }
  const top = (stage, f) => JSON.stringify(sorted(tally(evp.filter((e) => e.stage === stage), f)));
  console.log('  calculator_started by calculator', top('calculator_started', (e) => e.calculator));
  console.log('  calculator_completed by calculator', top('calculator_completed', (e) => e.calculator));
  console.log('  page_viewed by video', top('page_viewed', (e) => e.video));
  console.log('  page_viewed by page', top('page_viewed', (e) => e.metadata?.path || e.metadata?.page || e.calculator));

  out('ACCOUNTS -> SETUP -> LAUNCH -> PAID');
  const profiles = await all('profiles', 'id,role,display_name,email,created_at,onboarding_completed', (q) => q.gte('created_at', SINCE));
  const pros = profiles.filter((p) => p.role !== 'admin');
  const artists = await all('artist_profiles', 'id,user_id,slug,created_at,setup_completed,stripe_connect_id,platform_tier', (q) => q.gte('created_at', SINCE));
  const aIds = artists.map((a) => a.id);
  const tiers = aIds.length ? await all('subscription_tiers', 'id,artist_id,price,is_active,stripe_price_id', (q) => q.in('artist_id', aIds)) : [];
  const tracks = aIds.length ? await all('tracks', 'id,artist_id', (q) => q.in('artist_id', aIds)) : [];
  const subs = aIds.length ? await all('subscriptions', 'id,artist_id,tier_id,status,created_at,fan_id', (q) => q.in('artist_id', aIds)) : [];
  const tierPrice = Object.fromEntries(tiers.map((t) => [t.id, t.price || 0]));
  // Login emails live in auth.users; profiles.email is not reliably populated.
  const authEmail = {};
  for (const p of profiles) {
    const { data } = await db.auth.admin.getUserById(p.id);
    authEmail[p.id] = data?.user?.email || null;
  }
  const isTest = (id) => /^crwn\.astra\.audit\+test/i.test(authEmail[id] || '');
  const mask = (e) => (e ? (/^crwn\.astra\.audit/i.test(e) ? 'ASTRA TEST' : e.replace(/^(.{2}).*(@.*)$/, '$1***$2')) : '-');
  console.log(`  Astra test accounts among them: ${pros.filter((p) => isTest(p.id)).length}`);
  console.log(`  new accounts ${pros.length} (roles ${JSON.stringify(tally(pros, (p) => p.role))}), new artist pages ${artists.length}`);
  for (const a of artists) {
    const p = profiles.find((x) => x.id === a.user_id) || {};
    p.email = authEmail[a.user_id] || p.email;
    const paid = tiers.filter((t) => t.artist_id === a.id && t.is_active && (t.price || 0) > 0);
    const paying = subs.filter((s) => s.artist_id === a.id && s.status === 'active' && (tierPrice[s.tier_id] || 0) > 0);
    const res = results.filter((r) => r.user_id === a.user_id).map((r) => r.tool_slug);
    console.log(`  ${a.created_at.slice(5, 16)} ${String(a.slug).padEnd(22)} ${mask(p.email).padEnd(28)} setup ${a.setup_completed ? 'DONE' : 'open'} | tracks ${tracks.filter((t) => t.artist_id === a.id).length} | paid tiers ${paid.length} (priced in Stripe ${paid.filter((t) => t.stripe_price_id).length}) | stripe ${a.stripe_connect_id ? 'yes' : 'no'} | members ${subs.filter((s) => s.artist_id === a.id && s.status === 'active').length}, paying ${paying.length} | came from ${res.join(',') || '-'}`);
  }
  const fans = pros.filter((p) => !artists.some((a) => a.user_id === p.id));
  console.log(`  accounts with no artist page: ${fans.length}`, fans.map((p) => `${p.created_at.slice(5, 16)} ${p.role} ${mask(authEmail[p.id] || p.email)} onboarded=${p.onboarding_completed}`).join(' | '));
}

const posts = await instagram().catch((e) => { console.log('  instagram failed:', e.message); return []; });
await production(posts);
