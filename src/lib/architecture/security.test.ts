// ============================================================================
// SECURITY DRIFT INVARIANTS — from the 2026-08-12 cybersecurity audit
// ============================================================================
// These are the classes the audit proved CRWN can regress into. Each one is a
// real finding that reached production, generalised into a check.
//
// Companion suites written alongside the same remediation (kept separate so each
// stays close to the code it guards):
//   authorization.test.ts   AUTH-001, the SEC-001 admin authority-source class
//   ledgerIntegrity.test.ts SEC-005/006, server-derived ledger ownership + amounts
//   publicEndpointSafety.test.ts SEC-008/013/019, unauthenticated write/mail paths
//   mediaAndTenancy.test.ts SEC-009/014/018, private media + cross-tenant writes
//   adminAgentSafety.test.ts SEC-010, AI action validation + approval display
//
// Every assertion here carries a positive control so it cannot pass vacuously,
// and every one was mutation-tested (violation introduced, suite watched to fail,
// violation reverted) before being committed. An assertion nobody has watched
// fail is not protection: that is precisely how AUTH-001 certified SEC-001 as safe.
import { describe, it, expect } from 'vitest';
import { listSourceFiles, readStripped, readRaw, violation } from './sourceScan';

const API_ROUTES = listSourceFiles('src/app/api').filter(f => f.endsWith('/route.ts'));
const MIGRATIONS = listSourceFiles('supabase', { ext: /\.sql$/ });

describe('SEC-CRON — the cron secret never reaches the browser', () => {
  it('found the client surface (positive control)', () => {
    const clientFiles = listSourceFiles('src', { ext: /\.tsx$/ });
    expect(clientFiles.length).toBeGreaterThan(100);
  });

  // The original finding: NEXT_PUBLIC_CRON_SECRET shipped the scheduler's bearer
  // token to every visitor. It was removed and the value rotated. A NEXT_PUBLIC_
  // prefix on any secret-shaped name is the same bug returning.
  it('no NEXT_PUBLIC_ env var carries a secret-shaped name', () => {
    const offenders: string[] = [];
    for (const f of [...listSourceFiles('src'), ...listSourceFiles('src', { ext: /\.tsx$/ })]) {
      const src = readStripped(f);
      const hits = src.match(/NEXT_PUBLIC_[A-Z0-9_]*(SECRET|SERVICE_ROLE|PRIVATE|TOKEN|PASSWORD)[A-Z0-9_]*/g);
      if (hits) offenders.push(`${f}: ${[...new Set(hits)].join(', ')}`);
    }
    expect(
      offenders,
      violation(
        'SEC-CRON',
        `a NEXT_PUBLIC_ variable is named like a secret: ${offenders.join(' | ')}. Anything NEXT_PUBLIC_ is inlined into the client bundle and readable by every visitor. Read it server-side without the prefix.`,
        { docs: 'docs/CYBERSECURITY_AUDIT_2026-08-12.md' },
      ),
    ).toEqual([]);
  });

  it('no client component reads a server-only secret', () => {
    // Must match a READ of the value (`process.env.X`), not a mention of the name.
    // AgentInsights.tsx legitimately names DEEPSEEK_API_KEY inside an operator-facing
    // error string ("check that it is set in Vercel"); that publishes no secret.
    const SERVER_ONLY = /process\.env\.(SUPABASE_SERVICE_ROLE_KEY|STRIPE_SECRET_KEY|CRON_SECRET|RESEND_API_KEY|DEEPSEEK_API_KEY|OPENAI_API_KEY|LIVEKIT_API_SECRET|INTERNAL_TRACK_SECRET|R2_[A-Z_]*(KEY|SECRET))/;
    const offenders = listSourceFiles('src', { ext: /\.tsx$/ }).filter(f => {
      const raw = readRaw(f);
      if (!/^['"]use client['"]/m.test(raw)) return false;
      return SERVER_ONLY.test(readStripped(f));
    });
    expect(
      offenders,
      violation(
        'SEC-CRON',
        `client component(s) reference a server-only secret: ${offenders.join(', ')}. A 'use client' file is compiled into the browser bundle, so any secret named there is published.`,
      ),
    ).toEqual([]);
  });
});

describe('SEC-WEBHOOK — provider webhooks verify a signature and fail closed', () => {
  // Webhook routes settle money and grant entitlements. An unsigned one lets
  // anyone forge a paid event.
  const webhookRoutes = API_ROUTES.filter(f => /\/(webhook|webhooks)\//.test(f) || /\/webhook\/route\.ts$/.test(f));

  it('found webhook routes (positive control)', () => {
    expect(webhookRoutes.length, 'no webhook routes matched — the layout changed and this scan examines nothing').toBeGreaterThan(0);
  });

  it('every provider webhook verifies a signature', () => {
    // Cal.com verifies through verifyCalcomRequest() (real HMAC over the raw body).
    // ManyChat genuinely cannot HMAC-sign, so it presents a shared secret that the
    // route compares constant-time and fails closed on; that is its signature
    // equivalent and is documented in the acquisition architecture.
    const VERIFIES = /constructEvent\s*\(|verifyWebhookSignature\s*\(|WebhookReceiver|svix|verifySignature\s*\(|createHmac\s*\(|verifyCalcomRequest\s*\(|presentedSecret/;
    const offenders = webhookRoutes.filter(f => !VERIFIES.test(readStripped(f)));
    expect(
      offenders,
      violation(
        'SEC-WEBHOOK',
        `webhook route(s) accept a payload without verifying a provider signature: ${offenders.join(', ')}. A webhook endpoint is public by definition, so the signature IS the authentication. Verify over the RAW body and fail closed when the secret is unset.`,
        { owner: 'src/lib/webhookSignatures.ts' },
      ),
    ).toEqual([]);
  });
});

describe('SEC-RPC — security-sensitive database functions are not callable by the Data API roles', () => {
  it('found migrations (positive control)', () => {
    expect(MIGRATIONS.length).toBeGreaterThan(100);
  });

  // SEC-002 in one sentence: `REVOKE ... FROM PUBLIC` does NOT remove the grants
  // Supabase hands to anon and authenticated by name, so a function that looks
  // locked in its migration stays callable through PostgREST. check_rate_limit
  // was anon-executable and a negative window truncated the whole rate_limits
  // table. Any migration that revokes only PUBLIC is repeating that mistake.
  // These three migrations contain the flawed pattern and are already APPLIED in
  // production, so their text cannot be rewritten retroactively. Each is
  // SUPERSEDED by schema-phase2-sec-002-rpc-execute-lockdown.sql, which revokes the
  // same functions from anon and authenticated by name. Registered rather than
  // hidden: if a NEW migration repeats the pattern it must fail this test.
  const SUPERSEDED_BY_SEC_002 = new Set([
    'supabase/schema-phase2-artist-approval-gate.sql',          // redeem_invite
    'supabase/schema-phase2-artist-approval-gate-repair.sql',   // redeem_invite (repair copy)
    'supabase/schema-phase2-fix-profiles-update-permission.sql',// user_passes_artist_gate
  ]);

  it('a migration that revokes a function from PUBLIC also revokes it from anon and authenticated', () => {
    const offenders: string[] = [];
    for (const f of MIGRATIONS) {
      if (SUPERSEDED_BY_SEC_002.has(f)) continue;
      const src = readRaw(f);
      const revokesFunctionFromPublic = /REVOKE\s+(ALL|EXECUTE)[\s\S]{0,80}?ON\s+FUNCTION[\s\S]{0,200}?FROM\s+PUBLIC/i.test(src);
      if (!revokesFunctionFromPublic) continue;
      const namesAnon = /FROM\s+[^;]*\banon\b/i.test(src);
      const namesAuthenticated = /FROM\s+[^;]*\bauthenticated\b/i.test(src);
      if (!namesAnon || !namesAuthenticated) offenders.push(f);
    }
    expect(
      offenders,
      violation(
        'SEC-RPC',
        `migration(s) revoke a function from PUBLIC but never from anon/authenticated by name: ${offenders.join(', ')}. Supabase bootstraps ALTER DEFAULT PRIVILEGES ... GRANT ALL ON FUNCTIONS TO anon, authenticated. Those are per-role grants; revoking PUBLIC leaves them intact and the function stays callable over the Data API. Name both roles explicitly.`,
        { docs: 'docs/CYBERSECURITY_AUDIT_2026-08-12.md' },
      ),
    ).toEqual([]);
  });
});

describe('SEC-RLS — new tables ship with row level security', () => {
  // SEC-007: tier_benefits had no CREATE migration and therefore no RLS, so anon
  // read every row and the browser wrote entitlements directly.
  it('every migration that creates a table also enables RLS on it', () => {
    // Migrations whose CREATE TABLE predates this rule and whose tables are brought
    // under RLS by schema-phase2-sec-012-money-table-rls-reproducibility.sql. The CRM
    // file is the notable one: its own comment claims "No RLS needed - these tables
    // are only accessed via admin API routes using service role client", which is the
    // exact inversion this invariant exists to catch. How the application reaches a
    // table says nothing about who else can reach it over the Data API.
    const RLS_ADDED_BY_SEC_012 = new Set(['supabase/schema-phase2-crm-contacts.sql']);

    const offenders: string[] = [];
    for (const f of MIGRATIONS) {
      if (RLS_ADDED_BY_SEC_012.has(f)) continue;
      // Comment-stripped, and the table name must be followed by an opening paren,
      // so prose like "the CREATE TABLE statements above" is not read as a table.
      const src = readStripped(f);
      const created = [...src.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?"?([a-z0-9_]+)"?\s*\(/gi)].map(m => m[1]);
      if (!created.length) continue;
      for (const t of new Set(created)) {
        const enables = new RegExp(`ALTER\\s+TABLE\\s+(?:public\\.)?"?${t}"?\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'i');
        if (!enables.test(src)) offenders.push(`${f}:${t}`);
      }
    }
    expect(
      offenders,
      violation(
        'SEC-RLS',
        `table(s) created without ENABLE ROW LEVEL SECURITY in the same migration: ${offenders.join(', ')}. Supabase grants anon and authenticated full table privileges by default, so a table without RLS is world-readable and often world-writable the moment it exists. Enable RLS and add the policies in the migration that creates the table.`,
        { docs: 'docs/crwn-brain/05-DATABASE.md' },
      ),
    ).toEqual([]);
  });
});

describe('SEC-MEDIA — private media is signed only for content the caller is entitled to', () => {
  it('the audio signer refuses caller-supplied absolute URLs', () => {
    const src = readStripped('src/lib/storage/signedAudio.ts');
    expect(src.length, 'signedAudio.ts is empty — positive control failed').toBeGreaterThan(200);
    // SEC-009: the signer accepted ANY value merely CONTAINING the public audio
    // prefix and signed it with the service role, so a user-supplied string became
    // a signed URL to any object in the private bucket, including track masters.
    expect(
      /indexOf\(\s*PUBLIC_PREFIX\s*\)/.test(src) && !/isSafeAudioKey|rejectAbsolute|SEC-009/.test(src),
      violation(
        'SEC-MEDIA',
        'signedAudio.ts derives a storage path by searching for the public prefix inside a caller-supplied value. Knowing an object locator is not entitlement: sign only keys the system itself wrote for content the caller has proven access to.',
        { file: 'src/lib/storage/signedAudio.ts' },
      ),
    ).toBe(false);
  });
});

describe('SEC-SERVICE — service-role routes are the only authorization boundary they have', () => {
  // Middleware excludes /api/, and a service-role client bypasses RLS, so a route
  // holding one is solely responsible for proving the caller may touch the row.
  // This does not try to prove ownership logic is correct (a static scan cannot);
  // it proves the route at least establishes an identity or a secret before it acts.
  const serviceRoleRoutes = API_ROUTES.filter(f => /SUPABASE_SERVICE_ROLE_KEY/.test(readStripped(f)));

  it('found service-role routes (positive control)', () => {
    expect(serviceRoleRoutes.length, 'no service-role routes found — the scan is examining nothing').toBeGreaterThan(100);
  });

  // DELIBERATELY PUBLIC service-role routes. "Public" is a valid authority class,
  // but it must be DECLARED, never inferred from the absence of a check. That is
  // the whole lesson of the audit: the route manifest existed only because nobody
  // could answer "who may call this?" from the code. Adding a route here is a
  // security decision and should be reviewed as one.
  //
  // Each of these is public because an unauthenticated human or an email client is
  // the intended caller: storefront/discovery reads, lead capture from a logged-out
  // visitor, email open/click/unsubscribe endpoints keyed on an unguessable id, and
  // provider callbacks that authenticate by shared secret inside the handler.
  // Being listed here does NOT license reading or writing another tenant's rows;
  // several of these were tightened by this same remediation (smart-links/capture,
  // leads/calculator), and the unsigned-unsubscribe and open-redirect findings on
  // the tracking routes are tracked separately in the audit document.
  const DELIBERATELY_PUBLIC = new Set([
    // Public discovery / storefront reads
    'src/app/api/explore/route.ts',
    'src/app/api/leaderboard/route.ts',
    'src/app/api/artist/movement-stats/route.ts',
    'src/app/api/missions/participant-counts/route.ts',
    'src/app/api/live/thumbnail/route.ts',
    'src/app/api/live/tips/route.ts',
    'src/app/api/tracks/check-limit/route.ts',
    // Lead capture and public tools (logged-out visitor is the intended caller)
    'src/app/api/lead-magnets/capture/route.ts',
    'src/app/api/lead-magnets/analytics/route.ts',
    'src/app/api/lead-magnets/call-request/route.ts',
    'src/app/api/lead-results/[token]/recalculate/route.ts',
    'src/app/api/leads/calculator/route.ts',
    'src/app/api/opportunity-drafts/route.ts',
    'src/app/api/opportunity-drafts/[token]/route.ts',
    'src/app/api/smart-links/capture/route.ts',
    'src/app/api/partner/apply/route.ts',
    'src/app/api/surveys/route.ts',
    'src/app/api/producer/flag/route.ts',
    'src/app/api/notifications/new-artist-hook/route.ts',
    // Email-embedded endpoints: the recipient's mail client is the caller, keyed on
    // an unguessable send/enrollment id. Compliance requires unsubscribe to work
    // without a session.
    'src/app/api/campaigns/track/[sendId]/route.ts',
    'src/app/api/campaigns/unsubscribe/[sendId]/route.ts',
    'src/app/api/campaigns/unsubscribe-all/[sendId]/route.ts',
    'src/app/api/sequences/track/[sendId]/route.ts',
    'src/app/api/sequences/unsubscribe/[enrollmentId]/route.ts',
    'src/app/api/prospect-nurture/unsubscribe/[token]/route.ts',
    'src/app/api/admin/crm/outreach/track/[sendId]/route.ts',
    'src/app/api/admin/crm/outreach/unsubscribe/[sendId]/route.ts',
    // Provider callbacks that authenticate inside the handler
    'src/app/api/integrations/calcom/webhook/route.ts',
    'src/app/api/outreach/webhook/route.ts',
    'src/app/api/outreach/inbound/route.ts',
    'src/app/api/webhooks/resend/route.ts',
  ]);

  it('every service-role route establishes an identity, a secret, or a signature, or is declared public', () => {
    const ESTABLISHES = /auth\.getUser\s*\(|requireAdmin\s*\(|requireArtistOwner\s*\(|getOwnedArtistIds\s*\(|CRON_SECRET|INTERNAL_[A-Z_]*SECRET|constructEvent\s*\(|verifyWebhookSignature\s*\(|WebhookReceiver|createHmac\s*\(|verifyUnsubscribe\s*\(|verifyCalcomRequest\s*\(|presentedSecret/;
    const offenders = serviceRoleRoutes
      .filter(f => !DELIBERATELY_PUBLIC.has(f))
      .filter(f => !ESTABLISHES.test(readStripped(f)));
    expect(
      offenders,
      violation(
        'SEC-SERVICE',
        `route(s) hold a service-role client (which bypasses RLS) without establishing any caller identity, shared secret, or provider signature: ${offenders.join(', ')}. Middleware does not guard /api/, so this route IS the authorization boundary. If it is deliberately public, it must still not read or write another tenant's rows.`,
        { owner: 'src/lib/apiAuth.ts', docs: 'docs/CYBERSECURITY_AUDIT_2026-08-12_ROUTE_MANIFEST.md' },
      ),
    ).toEqual([]);
  });
});
