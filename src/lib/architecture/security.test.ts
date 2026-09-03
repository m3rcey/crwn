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
import { readFileSync } from 'node:fs';
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
    // Meta (Instagram + Facebook) verifies through verifyMetaSignature() in the same
    // canonical module as Svix and Twilio: HMAC-SHA256 of the raw body under the app
    // secret (X-Hub-Signature-256), timing-safe, fails closed with no configured secret,
    // pinned by test vectors in src/lib/webhookSignatures.meta.test.ts.
    const VERIFIES = /constructEvent\s*\(|verifyWebhookSignature\s*\(|WebhookReceiver|svix|verifySignature\s*\(|verifyMetaSignature\s*\(|createHmac\s*\(|verifyCalcomRequest\s*\(|presentedSecret/;
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

describe('SEC-REDIRECT — no route sends a person to an unvalidated destination', () => {
  // SEC-016: three email click-tracking routes did
  //   NextResponse.redirect(searchParams.get('url'), 302)
  // so CRWN's own domain served attacker-chosen content. The sendId did not even
  // need to exist. Any redirect whose target came from the request must go through
  // src/lib/safeRedirect.ts.
  it('no API route redirects to a raw request-supplied value', () => {
    const offenders: string[] = [];
    for (const f of API_ROUTES) {
      const src = readStripped(f);
      // Find the variable each redirect uses, then check it was not read straight
      // from the query string in the same file without passing through a validator.
      if (!/NextResponse\.redirect\s*\(\s*url\b/.test(src)) continue;
      const readsRawUrl = /searchParams\.get\(\s*['"]url['"]\s*\)/.test(src);
      const validates = /safeRedirect|resolveTrackedLink|safeInternalRedirect|safeExternalRedirect|safeInternalPath/.test(src);
      if (readsRawUrl && !validates) offenders.push(f);
    }
    expect(
      offenders,
      violation(
        'SEC-REDIRECT',
        `route(s) redirect to a raw request-supplied url: ${offenders.join(', ')}. That turns thecrwn.app into an open redirect, which is phishing wearing a domain the recipient's mail client already trusts. Route the destination through src/lib/safeRedirect.ts.`,
        { owner: 'src/lib/safeRedirect.ts', docs: 'docs/CYBERSECURITY_AUDIT_2026-08-12.md' },
      ),
    ).toEqual([]);
  });
});

describe('SEC-PROFILE — identity and approval columns are not self-service', () => {
  // SEC-003: the freeze trigger guarded three columns, so email, phone and
  // is_approved were writable by the account itself from the browser. That was
  // money: Team Splits resolved a collaborator by profiles.email, and is_approved
  // is the artist gate.
  it('the profiles freeze trigger protects every identity and authority column', () => {
    const src = MIGRATIONS.map(f => readRaw(f)).join('\n');
    expect(src.length, 'positive control: migrations are readable').toBeGreaterThan(1000);
    const missing = ['is_active', 'stripe_connect_id', 'email', 'phone', 'is_approved']
      .filter(col => !new RegExp(`NEW\\.${col}\\s*:=\\s*OLD\\.${col}`).test(src));
    expect(
      missing,
      violation(
        'SEC-PROFILE',
        `no migration freezes profiles.${missing.join(', profiles.')} against a browser write. A bare ownership UPDATE policy lets the OWNER rewrite their own row, so a column that carries identity (email, phone) or authority (is_approved, role, is_active) must be reverted by the trigger. Column privileges alone are not enough: schema-phase2-profiles-column-privileges.sql revoked SELECT and left UPDATE untouched, which is how SEC-003 happened.`,
        { docs: 'docs/CYBERSECURITY_AUDIT_2026-08-12.md' },
      ),
    ).toEqual([]);
  });
});

describe('SEC-SPLIT — collaborator identity and funding', () => {
  const CREATE = 'src/app/api/team-splits/route.ts';
  const ACCEPT = 'src/app/api/team-splits/accept-invite/route.ts';
  const CASHOUT = 'src/app/api/stripe/team-split-cashout/route.ts';

  it('found the Team Split surface (positive control)', () => {
    for (const f of [CREATE, ACCEPT, CASHOUT]) {
      expect(readStripped(f).length, `${f} unreadable`).toBeGreaterThan(200);
    }
  });

  // Ratified rule: email INVITES, an authenticated identity AUTHORIZES.
  it('deal creation never binds a collaborator by looking up a mutable profile email', () => {
    const src = readStripped(CREATE);
    const bindsByEmail = /ilike\(\s*['"]email['"]/.test(src) || /\.eq\(\s*['"]email['"]/.test(src);
    expect(
      bindsByEmail,
      violation(
        'SEC-SPLIT',
        `${CREATE} resolves a collaborator through profiles.email. That column is a self-writable mirror of the verified auth identity, and collaborator_user_id is the column the accrual cron selects on and atomic_team_split_cashout pays out on, so binding it from email hands a payout relationship to whoever claimed the address first. Email may INVITE; only an authenticated identity may AUTHORIZE.`,
        { file: CREATE },
      ),
    ).toBe(false);
  });

  it('acceptance proves the accepting account IS the invited identity', () => {
    const src = readStripped(ACCEPT);
    // The binding must be gated on the VERIFIED auth email, not merely on holding
    // the invite link: a forwarded invite must not bind a stranger to someone
    // else's revenue share.
    expect(
      /collaborator_email/.test(src) && /user\.email/.test(src),
      violation(
        'SEC-SPLIT',
        `${ACCEPT} sets collaborator_user_id without comparing the invitation's collaborator_email to the authenticated user's VERIFIED auth email. Possession of the invite link is not proof of identity.`,
        { file: ACCEPT },
      ),
    ).toBe(true);
  });

  // TS-ID-001. Payout authority is `collaborator_user_id`, an authenticated
  // identity. It must never be derived from a column the account itself can
  // rewrite, which is what made a payout hijack possible: claim a producer's
  // address before they sign up and their revenue share binds to you.
  it('TS-ID-001 payout authority is an authenticated id, never a mutable profile email', () => {
    const accrual = readStripped('src/app/api/cron/team-split-accruals/route.ts');
    const cashout = readStripped('src/app/api/stripe/team-split-cashout/route.ts');
    expect(accrual.length + cashout.length, 'positive control').toBeGreaterThan(600);

    // Both money paths must key on collaborator_user_id.
    expect(
      /collaborator_user_id/.test(accrual) && /p_collaborator_id|collaborator_user_id/.test(cashout),
      violation('TS-ID-001', 'a Team Split money path no longer keys on collaborator_user_id.'),
    ).toBe(true);

    // And neither may resolve a collaborator through profiles.email.
    const offenders = [CREATE, ACCEPT, 'src/app/api/cron/team-split-accruals/route.ts',
      'src/app/api/stripe/team-split-cashout/route.ts']
      .filter(f => /from\(\s*['"]profiles['"]\s*\)[\s\S]{0,200}?(ilike|eq)\(\s*['"]email['"]/.test(readStripped(f)));
    expect(
      offenders,
      violation(
        'TS-ID-001',
        `Team Split path(s) resolve an identity through profiles.email: ${offenders.join(', ')}. That column is a self-writable mirror of the verified auth identity. Email may INVITE; only an authenticated id may AUTHORIZE.`,
      ),
    ).toEqual([]);
  });

  // TS-MONEY-001. The accrual loop must never write a payable row straight from
  // the split math. It did, which is "accrue first and hope the funds exist
  // later", and it is how the platform ended up paying collaborators from its
  // own Stripe balance.
  it('TS-MONEY-001 no collaborator payable balance without a funded reserve', () => {
    const src = readStripped('src/app/api/cron/team-split-accruals/route.ts');
    expect(src.length, 'positive control: accrual cron readable').toBeGreaterThan(500);
    expect(src).toContain("from('team_split_earnings')"); // positive control: it still writes
    expect(
      /fundedReserveFor\s*\(/.test(src) && /accruableAmount\s*\(/.test(src),
      violation(
        'TS-MONEY-001',
        'the Team Split accrual cron creates a payable balance without checking that the money was actually reserved. An accrual is a promise to pay: it must follow the money, never precede it. Gate every insert on fundedReserveFor()/accruableAmount() from src/lib/teamSplits/funding.ts.',
        { file: 'src/app/api/cron/team-split-accruals/route.ts' },
      ),
    ).toBe(true);
  });

  // TS-MONEY-003. A deal starts economically at its effective moment. Historical
  // artist money is not rewritten because a deal was signed later.
  it('TS-MONEY-003 an earning predating the deal cannot accrue', () => {
    const src = readStripped('src/app/api/cron/team-split-accruals/route.ts');
    expect(
      /withinFundingBoundary\s*\(/.test(src),
      violation(
        'TS-MONEY-003',
        'the accrual cron does not enforce the deal effective-date boundary, so a newly signed deal could accrue against earnings that settled before it existed and were never reserved.',
        { file: 'src/app/api/cron/team-split-accruals/route.ts' },
      ),
    ).toBe(true);
  });

  // TS-MONEY-002 + TS-MONEY-004. CRWN's fee is CRWN's revenue and is never a
  // collaborator funding source; a reserve that stops being owed goes back to the
  // ARTIST, never into platform revenue.
  it('TS-MONEY-002/004 CRWN revenue is the platform fee, and surplus returns to the artist', () => {
    const src = readStripped('src/lib/teamSplits/funding.ts');
    expect(src.length, 'positive control: funding module readable').toBeGreaterThan(500);
    // ANCHORED to the exact statement, terminator included. A substring match here
    // is worthless: `return b.platformFeeCents + b.collaboratorReserveCents;` still
    // contains `return b.platformFeeCents`, so a loose pattern would pass while CRWN
    // booked custodial collaborator money as its own revenue. That is the SEC-001
    // failure shape (asserting a string that the broken code also satisfies), caught
    // here by mutation-testing this very assertion.
    expect(
      /export function crwnRevenueCents/.test(src) && /return b\.platformFeeCents;/.test(src),
      violation(
        'TS-MONEY-002',
        'crwnRevenueCents no longer returns EXACTLY the platform fee. A Team Split reserve is custodial artist money held temporarily on the platform; counting it as CRWN revenue would make the platform the funding source, which is the one rule this rail exists to respect.',
        { file: 'src/lib/teamSplits/funding.ts' },
      ),
    ).toBe(true);
    expect(
      /export function surplusToArtist/.test(src),
      violation(
        'TS-MONEY-004',
        'surplusToArtist is gone. Reserve that becomes deterministically unowed belongs to the artist and must never be absorbed into the application fee, CRWN revenue, or another collaborator deal.',
        { file: 'src/lib/teamSplits/funding.ts' },
      ),
    ).toBe(true);
  });

  // TS-MONEY-006 (D4, ratified 2026-08-12). A deal must not become economically binding if CRWN
  // cannot honour its literal percentage. The pure rule is commitment.ts; the ENFORCEMENT is the
  // accept_team_split_deal RPC, which holds an advisory lock on the artist so two acceptances
  // cannot both read the old world and commit 110% between them.
  it('TS-MONEY-006 over-commitment is refused atomically, not merely warned', () => {
    const commitment = readStripped('src/lib/teamSplits/commitment.ts');
    expect(
      /MAX_COMMITTED_PERCENT_OF_NET\s*=\s*100/.test(commitment),
      violation('TS-MONEY-006', 'the 100%-of-net ceiling is gone from commitment.ts.', {
        file: 'src/lib/teamSplits/commitment.ts',
      }),
    ).toBe(true);

    // The acceptance route must go through the enforced path, never a bare status update.
    const respond = readStripped('src/app/api/team-splits/[id]/respond/route.ts');
    // The CALL, not merely the identifier: a bypass that leaves the import in place while routing
    // around the RPC would satisfy a name check. Found by mutation on 2026-08-12.
    expect(
      /await acceptDealEnforced\(supabaseAdmin,/.test(respond),
      violation('TS-MONEY-006', 'the accept path no longer calls the enforced acceptance against the service-role client, so two overlapping deals could both become binding.', {
        file: 'src/app/api/team-splits/[id]/respond/route.ts',
      }),
    ).toBe(true);
    // And no bare status write may bypass it.
    expect(
      /update\(\s*\{[^}]*status:\s*goActive/.test(respond),
      violation('TS-MONEY-006', 'the accept path writes the deal status directly, bypassing the atomic commitment check.', {
        file: 'src/app/api/team-splits/[id]/respond/route.ts',
      }),
    ).toBe(false);
    expect(
      /over_committed/.test(respond),
      violation('TS-MONEY-006', 'the accept path does not refuse an over-committed deal.', {
        file: 'src/app/api/team-splits/[id]/respond/route.ts',
      }),
    ).toBe(true);

    // The enforcement is in the DATABASE, under a lock, or the race is open.
    const migration = readFileSync('supabase/schema-phase2-team-split-funded-reserve.sql', 'utf8');
    expect(
      /pg_advisory_xact_lock/.test(migration),
      violation('TS-MONEY-006', 'the acceptance check is not serialized, so concurrent acceptances can over-commit.', {
        file: 'supabase/schema-phase2-team-split-funded-reserve.sql',
      }),
    ).toBe(true);
    expect(
      /IF v_total > 100 THEN/.test(migration),
      violation('TS-MONEY-006', 'the database no longer refuses above 100% of net.', {
        file: 'supabase/schema-phase2-team-split-funded-reserve.sql',
      }),
    ).toBe(true);
  });

  // TS-MONEY-002. Conservation is a PRECONDITION of withholding, not a report written afterwards.
  // If the cents do not add up the reserve must be zero, because a number nobody can reconcile is
  // exactly how CRWN ends up funding a collaborator. Found missing by mutation on 2026-08-12.
  it('TS-MONEY-002 the charge-time reserve refuses to withhold an unreconciled amount', () => {
    const src = readStripped('src/lib/teamSplits/reserve.ts');
    expect(
      /reconciles\(breakdown\)/.test(src),
      violation('TS-MONEY-002', 'reserve.ts no longer checks conservation before withholding, so a breakdown with phantom cents could reach Stripe.', {
        file: 'src/lib/teamSplits/reserve.ts',
      }),
    ).toBe(true);
    // And the reserve must ride the APPLICATION FEE, which is what keeps it out of the artist's
    // Connect balance and therefore out of Stripe's automatic daily payout sweep.
    const track = readStripped('src/app/api/stripe/track-checkout/route.ts');
    expect(
      /application_fee_amount:\s*applicationFeeAmount/.test(track) && /reserve\.reserveCents/.test(track),
      violation('TS-MONEY-002', 'a one-time rail stopped adding the collaborator reserve to the application fee, so the artist would be paid money already promised to a collaborator.', {
        file: 'src/app/api/stripe/track-checkout/route.ts',
      }),
    ).toBe(true);
  });

  // TS-MONEY-007. A destination-charge refund debits the PLATFORM and, by default, lets the artist
  // keep what was transferred. CRWN creates no refunds in code, so the control cannot be a dashboard
  // checkbox: it must run from the refund webhook, where it also covers refunds CRWN never issued.
  it('TS-MONEY-007 a refund recovers the artist share instead of CRWN absorbing it', () => {
    const wh = readStripped('src/lib/webhookHandlers.ts');
    expect(
      /recoverArtistShareOnRefund\(/.test(wh),
      violation('TS-MONEY-007', 'the refund handler no longer recovers the artist share, so CRWN silently funds the artist portion of every destination-charge refund.', {
        file: 'src/lib/webhookHandlers.ts',
      }),
    ).toBe(true);
    const rec = readStripped('src/lib/stripe/refundRecovery.ts');
    // The double-reversal guard is the load-bearing half: Stripe already tracks amount_reversed.
    expect(
      /alreadyReversed/.test(rec) && /amount_reversed/.test(rec),
      violation('TS-MONEY-010', 'refund recovery stopped consulting the already-reversed amount, so a redelivered webhook or a dashboard refund that already reversed would reverse twice.', {
        file: 'src/lib/stripe/refundRecovery.ts',
      }),
    ).toBe(true);
    // Unrecovered money must be reported, never rounded away.
    expect(
      /shortfall/.test(rec),
      violation('TS-MONEY-007', 'refund recovery no longer reports a shortfall, so unrecoverable loss would be invisible.', {
        file: 'src/lib/stripe/refundRecovery.ts',
      }),
    ).toBe(true);
  });

  // TS-MONEY-009. A reserve predicted at checkout is not money. Only the settled charge proves it.
  it('TS-MONEY-009 accrual eligibility comes from settlement proof, not from checkout intent', () => {
    const wh = readStripped('src/lib/webhookHandlers.ts');
    // COUNT, not presence: removing the proof from ONE of the five earnings writers leaves the
    // identifier in the file and silently strands that rail's collaborators. Found by mutation
    // on 2026-08-13.
    const proofSites = (wh.match(/\.\.\.settledReserveFor\(/g) || []).length;
    expect(
      proofSites,
      violation('TS-MONEY-009', `only ${proofSites} earnings writer(s) record the funded reserve; all five one-time rails must, or a funded charge on a missing rail can never pay its collaborator.`, {
        file: 'src/lib/webhookHandlers.ts',
      }),
    ).toBeGreaterThanOrEqual(5);
    // Read from the SETTLED Stripe object, never recomputed from what checkout intended.
    expect(
      /reserveFromStripeMetadata/.test(wh),
      violation('TS-MONEY-009', 'settlement proof is being recomputed rather than read from the settled charge.', {
        file: 'src/lib/webhookHandlers.ts',
      }),
    ).toBe(true);
  });

  // TS-MONEY-010. The refund event is the ONE authoritative clawback writer.
  it('TS-MONEY-010 the Team Split clawback happens at the refund event', () => {
    const wh = readStripped('src/lib/webhookHandlers.ts');
    // The CALL must be reached, not merely present. A mutation that wrapped it in `if (false)`
    // kept the identifier and passed a presence check. Found by mutation on 2026-08-13.
    expect(
      /try \{\s*await clawbackTeamSplitsForRefund\(supabaseAdmin, \{/.test(wh),
      violation('TS-MONEY-010', 'the Team Split clawback is no longer unconditionally awaited in the refund handler, reopening the window in which a collaborator can cash out against refunded money.', {
        file: 'src/lib/webhookHandlers.ts',
      }),
    ).toBe(true);
  });

  // TS-MONEY-002 extended: every eligible one-time rail withholds the reserve. A rail that forgets
  // pays the artist money already promised to a collaborator, and Stripe sweeps it the same day.
  // booking-checkout left this list on 2026-09-03 because the route was deleted with the
  // book-an-artist flow. If a booking rail ever returns it belongs back in both lists here, and
  // ledgerIntegrity.test.ts already fails the moment that file reappears.
  it('TS-MONEY-002 every one-time payment rail withholds the collaborator reserve', () => {
    const rails = [
      'src/app/api/stripe/track-checkout/route.ts',
      'src/app/api/stripe/product-checkout/route.ts',
      'src/app/api/stripe/live-checkout/route.ts',
      'src/app/api/stripe/live-tip-checkout/route.ts',
    ];
    for (const f of rails) {
      const src = readStripped(f);
      expect(
        src.includes('reserveForSaleAtomic(') && /application_fee_amount:\s*applicationFeeAmount/.test(src),
        violation('TS-MONEY-002', `${f} does not withhold the collaborator reserve in its application fee. The artist would be paid money already promised to a collaborator.`, { file: f }),
      ).toBe(true);
      expect(
        /reserveToStripeMetadata\(/.test(src),
        violation('TS-MONEY-009', `${f} does not carry the per-deal reserve on the charge, so settlement cannot prove what was funded.`, { file: f }),
      ).toBe(true);
    }
  });

  // TS-MONEY-011. Subscriptions are the large majority of CRWN's earnings rows, so an unfunded
  // subscription rail means the reserve covers the minority of real revenue. The reserve must be
  // set while the invoice is a DRAFT: Stripe makes monetary fields immutable at finalization, which
  // is also what makes D1 enforceable (a finalized invoice can never be back-filled into liability).
  it('TS-MONEY-011 every qualifying subscription invoice funds before finalization or funds nothing', () => {
    const wh = readStripped('src/app/api/stripe/webhook/route.ts');
    expect(
      /case 'invoice\.created'/.test(wh) && /fundSubscriptionInvoice\(/.test(wh),
      violation('TS-MONEY-011', 'the invoice.created handler is gone, so subscription charges fund no collaborator reserve and the majority of CRWN revenue silently pays nobody.', {
        file: 'src/app/api/stripe/webhook/route.ts',
      }),
    ).toBe(true);

    const fund = readStripped('src/lib/teamSplits/invoiceFunding.ts');
    // Draft-only, or the update is a no-op against an immutable invoice.
    expect(
      /!== 'draft'/.test(fund),
      violation('TS-MONEY-011', 'invoice funding no longer checks that the invoice is a draft; a finalized invoice cannot accept a fee and must create zero liability.', {
        file: 'src/lib/teamSplits/invoiceFunding.ts',
      }),
    ).toBe(true);
    // The fee may never exceed the invoice total.
    expect(
      /applicationFeeAmount > grossCents/.test(fund),
      violation('TS-MONEY-011', 'invoice funding no longer bounds the application fee by the invoice total.', {
        file: 'src/lib/teamSplits/invoiceFunding.ts',
      }),
    ).toBe(true);
    // TS-MONEY-011, THE INITIAL CHARGE. Stripe creates the first subscription invoice already
    // `open`, and Checkout forbids updating it while the subscription is `incomplete`, so there is
    // no draft window for it. It MUST be funded at checkout through application_fee_percent, and a
    // previous pass wrongly claimed invoice.created covered it. Pinned so that claim cannot return.
    const checkout = readStripped('src/app/api/stripe/checkout/route.ts');
    expect(
      checkout.includes('reserveForSaleAtomic(') && checkout.includes('application_fee_percent: subscriptionFeePercent'),
      violation('TS-MONEY-011', 'the INITIAL subscription charge no longer withholds a collaborator reserve at checkout. Stripe gives that invoice no draft window, so invoice.created cannot fund it and the first charge would pay the artist money already promised to a collaborator.', {
        file: 'src/app/api/stripe/checkout/route.ts',
      }),
    ).toBe(true);
    // And the draft-only guard must stay, so an already-open invoice funds nothing instead of
    // silently appearing to.
    expect(
      fund.includes("if (anyInv.status && anyInv.status !== 'draft') return none('not_draft');"),
      violation('TS-MONEY-011', 'the draft-only guard is gone; an already-open invoice would appear fundable and could create liability nobody withheld.', {
        file: 'src/lib/teamSplits/invoiceFunding.ts',
      }),
    ).toBe(true);

    // Referral comes off BEFORE the collaborator share, or a split eats a referrer's commission.
    // The VALUE must reach the calculation. `attributedCutPercent: 0` still contains the
    // identifier and would satisfy a name check while silently letting a split eat a referrer's
    // commission. Found by mutation on 2026-08-13.
    expect(
      fund.includes('      attributedCutPercent,'),
      violation('TS-MONEY-011', 'invoice funding no longer passes the real referral/clipper cut into the reserve calculation, so a Team Split could consume money already owed to a referrer.', {
        file: 'src/lib/teamSplits/invoiceFunding.ts',
      }),
    ).toBe(true);
    // One canonical calculation: no bespoke split math on this rail.
    expect(
      fund.includes('reserveForSaleAtomic('),
      violation('TS-MONEY-011', 'invoice funding computes its own split math instead of the canonical calculation.', {
        file: 'src/lib/teamSplits/invoiceFunding.ts',
      }),
    ).toBe(true);
  });

  // TS-MONEY-009 extended: BOTH subscription earnings writers record the proof, not just renewals.
  // The initial charge and every renewal are funded by the same invoice.created path, so a proof
  // on only one of them strands the other's collaborators.
  it('TS-MONEY-009 both subscription earnings writers record settlement proof', () => {
    const wh = readStripped('src/lib/webhookHandlers.ts');
    expect(
      /\.\.\.settledReserveFor\(invoice\.metadata\)/.test(wh),
      violation('TS-MONEY-009', 'the renewal earnings writer no longer records the funded reserve from the settled invoice.', {
        file: 'src/lib/webhookHandlers.ts',
      }),
    ).toBe(true);
    expect(
      /\.\.\.settledReserveFor\(initialInvoiceMetadata\)/.test(wh),
      violation('TS-MONEY-009', 'the INITIAL subscription earnings writer records no funded reserve, so a first-charge collaborator can never be paid.', {
        file: 'src/lib/webhookHandlers.ts',
      }),
    ).toBe(true);
  });

  // TS-MONEY-012/013. Cap headroom is raced between rails, and the race is invisible in any table:
  // money is WITHHELD at charge time but only ACCRUES after settlement. Every rail must therefore
  // take an ATOMIC grant, and a payment that never settles must give the headroom back.
  it('TS-MONEY-012 every payment rail reserves cap through the atomic grant', () => {
    const rails = [
      'src/app/api/stripe/track-checkout/route.ts',
      'src/app/api/stripe/product-checkout/route.ts',
      'src/app/api/stripe/live-checkout/route.ts',
      'src/app/api/stripe/live-tip-checkout/route.ts',
      'src/app/api/stripe/checkout/route.ts',
      'src/lib/teamSplits/invoiceFunding.ts',
    ];
    for (const f of rails) {
      const src = readStripped(f);
      expect(
        src.includes('reserveForSaleAtomic('),
        violation('TS-MONEY-012', f + ' reserves cap without the atomic grant, so two concurrent payments can both take the same remaining headroom.', { file: f }),
      ).toBe(true);
      expect(
        src.includes('resolveReserveForSale('),
        violation('TS-MONEY-012', f + ' still calls the non-atomic reserve directly. Desired cents are not granted cents.', { file: f }),
      ).toBe(false);
    }
    const mig = readFileSync('supabase/schema-phase2-team-split-cap-reservations.sql', 'utf8');
    expect(
      mig.includes('FROM team_split_deals WHERE id = p_deal_id FOR UPDATE'),
      violation('TS-MONEY-012', 'the grant no longer locks the deal row, so concurrent grants can exceed the cap.', {
        file: 'supabase/schema-phase2-team-split-cap-reservations.sql',
      }),
    ).toBe(true);
    expect(
      mig.includes("status IN ('provisional', 'funded')") && mig.includes('v_headroom :='),
      violation('TS-MONEY-012', 'headroom ignores live reservations, so the pre-settlement window is unprotected.', {
        file: 'supabase/schema-phase2-team-split-cap-reservations.sql',
      }),
    ).toBe(true);
  });

  it('TS-MONEY-013 an unsettled terminal payment releases its cap headroom', () => {
    const wh = readStripped('src/app/api/stripe/webhook/route.ts');
    expect(
      wh.includes("releaseReserves(supabaseAdmin, { kind: 'checkout_session', id: expiredKey }, 'checkout_expired')"),
      violation('TS-MONEY-013', 'an expired checkout no longer releases its reservation, so a payment that never happened holds cap headroom forever.', {
        file: 'src/app/api/stripe/webhook/route.ts',
      }),
    ).toBe(true);
    const mig = readFileSync('supabase/schema-phase2-team-split-cap-reservations.sql', 'utf8');
    const rel = mig.slice(mig.indexOf('FUNCTION public.release_team_split_reservation'));
    expect(
      rel.slice(0, 900).includes("status = 'provisional'"),
      violation('TS-MONEY-013', 'release is no longer provisional-only; funded money could be given back as headroom while the collaborator is still owed it.', {
        file: 'supabase/schema-phase2-team-split-cap-reservations.sql',
      }),
    ).toBe(true);
  });

  it('TS-MONEY-014/015 the first charge over-retains rather than underfunding', () => {
    const co = readStripped('src/app/api/stripe/checkout/route.ts');
    expect(
      co.includes('firstChargeFeePlan(') && co.includes('feePlan.safe'),
      violation('TS-MONEY-014', 'the first subscription charge no longer uses the ceiling fee plan, so two-decimal rounding could retain fewer cents than the collaborator accepted.', {
        file: 'src/app/api/stripe/checkout/route.ts',
      }),
    ).toBe(true);
    const fp = readStripped('src/lib/teamSplits/feePercent.ts');
    expect(
      fp.includes('Math.ceil((required / gross)'),
      violation('TS-MONEY-014', 'the fee percentage is no longer rounded UP, so a first charge can underfund the collaborator.', {
        file: 'src/lib/teamSplits/feePercent.ts',
      }),
    ).toBe(true);
    expect(
      co.includes('team_split_rounding_surplus'),
      violation('TS-MONEY-015', 'rounding over-retention is no longer recorded, so artist-owned surplus would silently stay with CRWN.', {
        file: 'src/app/api/stripe/checkout/route.ts',
      }),
    ).toBe(true);
  });

  it('TS-MONEY-016 the artist surplus return is idempotent and never CRWN revenue', () => {
    const sp = readStripped('src/lib/teamSplits/surplus.ts');
    expect(
      sp.includes('crwn_tssurplus_'),
      violation('TS-MONEY-016', 'the surplus transfer lost its durable idempotency key, so a crash between Stripe and the ledger could pay the artist twice.', {
        file: 'src/lib/teamSplits/surplus.ts',
      }),
    ).toBe(true);
    expect(
      sp.includes("res.status !== 'funded'") && sp.includes('res.frozen_at'),
      violation('TS-MONEY-016', 'surplus no longer refuses unfunded or disputed reserve, so money still at risk could be returned.', {
        file: 'src/lib/teamSplits/surplus.ts',
      }),
    ).toBe(true);
    expect(
      sp.includes('artist_owned_reserve_return'),
      violation('TS-MONEY-015', 'the surplus accounting class is gone; a report could book an artist return as CRWN revenue.', {
        file: 'src/lib/teamSplits/surplus.ts',
      }),
    ).toBe(true);
  });

  it('TS-MONEY-017/018 a disputed source is frozen, and resolution cannot apply twice', () => {
    const wh = readStripped('src/app/api/stripe/webhook/route.ts');
    expect(
      wh.includes("case 'charge.dispute.closed'") && wh.includes('handleTeamSplitDispute('),
      violation('TS-MONEY-017', 'dispute reconciliation is not wired, so disputed funding could still reach a collaborator cashout.', {
        file: 'src/app/api/stripe/webhook/route.ts',
      }),
    ).toBe(true);
    const d = readStripped('src/lib/teamSplits/disputes.ts');
    expect(
      d.includes('freezeReservesForEarning(') && d.includes('unfreezeReservesForEarning('),
      violation('TS-MONEY-017', 'the dispute path no longer freezes or restores reservations.', {
        file: 'src/lib/teamSplits/disputes.ts',
      }),
    ).toBe(true);
    expect(
      d.includes('recoverArtistShareOnRefund('),
      violation('TS-MONEY-018', 'the dispute path no longer recovers the ARTIST transfer, leaving CRWN funding the disputed artist proceeds.', {
        file: 'src/lib/teamSplits/disputes.ts',
      }),
    ).toBe(true);
  });

  it('TS-MONEY-019 the cashout gate stays shut until the ledger, the rails and a canary all pass', () => {
    const cashout = readStripped(CASHOUT);
    expect(
      cashout.includes('cashoutFundingReady: boolean = false'),
      violation('TS-MONEY-019', 'the collaborator cashout gate was opened. It may only open after the cap-reservation migration is applied AND a Stripe canary proves conservation end to end.', {
        file: CASHOUT,
      }),
    ).toBe(true);
    const bal = readStripped('src/lib/teamSplits/cashoutBalance.ts');
    expect(
      bal.includes('frozenCents') && bal.includes('negativeCarryCents'),
      violation('TS-MONEY-019', 'the cashout balance stopped deducting frozen or carried-negative amounts, so disputed or already-lost money could be withdrawn.', {
        file: 'src/lib/teamSplits/cashoutBalance.ts',
      }),
    ).toBe(true);
  });

  // F-3 / TS-MONEY-005: destination charges settle the artist's share into the
  // artist's Connect account, so a transfer to a collaborator with no reserve
  // withheld draws on CRWN's own balance. Until the reserve is wired into
  // checkout, the rail must fail closed.
  it('TS-MONEY-005 collaborator cashout cannot pay from an unfunded platform balance', () => {
    const src = readStripped(CASHOUT);
    const failsClosed = /cashoutFundingReady/.test(src) && /TEAM_SPLIT_FUNDING_PENDING/.test(src);
    const reserveWired = /computeFunding\s*\(|collaboratorReserveCents/.test(
      readStripped('src/app/api/stripe/checkout/route.ts'),
    );
    expect(
      failsClosed || reserveWired,
      violation(
        'SEC-SPLIT',
        `${CASHOUT} can transfer to a collaborator, but checkout does not withhold a collaborator reserve. CRWN sells through Stripe destination charges, so the artist's share settles into the ARTIST's Connect account and only the application fee stays with CRWN. Transferring the collaborator's share therefore spends CRWN's own money. Either wire the reserve (src/lib/teamSplits/funding.ts) into checkout, or keep the rail failing closed.`,
        { file: CASHOUT, docs: 'docs/CYBERSECURITY_AUDIT_2026-08-12.md' },
      ),
    ).toBe(true);
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
    // Fan recognition labels for a public artist page. A signed-out reader must see the
    // same badges every other reader sees, so requiring a session would make the feature
    // depend on who is looking. It reads no other tenant's rows in any meaningful sense:
    // every requested fan id is first intersected with the authors of that artist's own
    // public posts, and what comes back is a tier NAME the page already displays. No
    // price, spend, status, tier id or date leaves this route.
    'src/app/api/recognition/route.ts',
    // Internal SMS alert consent. Public because a Twilio campaign reviewer has no CRWN
    // account and must be able to walk the opt-in experience end to end; that is the whole
    // reason the page exists. It is the most capability-free public write in CRWN: it holds
    // no Twilio client and no credentials, sends no SMS, reads nothing back, and can only
    // append a consent row for the number in the request into a table that RLS and revoked
    // grants keep closed to anon and authenticated alike.
    'src/app/api/sms-alert-consent/route.ts',
    // Live-show vote capture. A logged-out person standing in a venue IS the intended
    // caller, exactly like the lead-capture routes above. Declared public deliberately,
    // and it is the most tightly bounded public write in CRWN: it may only touch the ONE
    // artist named by a gated slug whose lead magnet is live and whose poll is currently
    // open, it writes only that artist's free-tier membership, one vote and one claim
    // row, and it RETURNS NO SESSION, so the caller gains no authenticated capability.
    // It refuses outright when the email belongs to a VERIFIED account, so it can never
    // act in a real person's name. Rate limited per IP and per email.
    'src/app/api/song-lab/live-claim/route.ts',
    // Fan Automation drop claim. A fan arriving from an Instagram/Facebook DM with no CRWN
    // account IS the intended caller, exactly like live-claim above, and it follows the same
    // captured-contact boundary: it uses the session when one exists (auth.getUser), otherwise
    // identityDecision rules apply verbatim: it may create/reuse only an UNCONFIRMED auth user,
    // writes nothing for a confirmed account's email, RETURNS NO SESSION, and can only touch
    // the ONE artist whose automation the unguessable token names. joinFreeTier is the sole
    // membership writer, so a paid member can never be downgraded. Rate limited per IP and email.
    'src/app/api/drop/[token]/claim/route.ts',
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

  // A declaration that outlives the thing it describes is worse than no declaration:
  // it asserts "this route is deliberately public" about a route that may since have
  // been locked down, or deleted, or replaced. `tracks/check-limit` sat here after it
  // had already been given requireArtistOwner, and nothing noticed because the entry
  // simply stopped matching anything. A registry nobody can trust is how SEC-001
  // survived, so the allowlist now has to justify its own existence.
  it('no DELIBERATELY_PUBLIC entry is stale', () => {
    const stale = [...DELIBERATELY_PUBLIC].filter(f => !serviceRoleRoutes.includes(f));
    expect(
      stale,
      violation(
        'SEC-SERVICE',
        `DELIBERATELY_PUBLIC names route(s) that are no longer unauthenticated service-role routes: ${stale.join(', ')}. Either the route was gated (delete the entry, it now misdescribes the code) or it moved or was removed (delete or update it). An allowlist entry that matches nothing is a claim about code that no longer exists.`,
      ),
    ).toEqual([]);
  });

  it('every service-role route establishes an identity, a secret, or a signature, or is declared public', () => {
    // `verifyUnsubscribe[A-Za-z]*` rather than `verifyUnsubscribe` exactly: the helper was
    // generalized to `verifyUnsubscribeScope` when platform-sequence opt-out shipped (2026-08-15),
    // binding kind + row id + artist + recipient instead of an address alone. The old name stopped
    // matching, so a route doing HMAC-SHA256 with timingSafeEqual read to this scan as having no
    // authorization at all. That is the matcher going stale on a rename, NOT a rule being relaxed:
    // the new helper is strictly stronger than the one this pattern already trusted, and the route
    // it guards is stricter than its own siblings, which sit on DELIBERATELY_PUBLIC with no
    // signature at all. Allowlisting that route instead would have thrown the signature away.
    // `requireSongLabArtist` (src/lib/songLab/server.ts) is in the trusted set for the same
    // reason requireArtistOwner is: it calls auth.getUser() on the session client, resolves
    // the caller's OWN artist_profiles row (never a client-supplied id), and additionally
    // requires the server-only song_lab_enabled gate. Strictly stronger than the bare
    // auth.getUser() this pattern already trusts.
    // verifyTwilioSignature: the inbound SMS keyword route's authority. It is a provider
    // signature in the same class as constructEvent (Stripe) and verifyCalcomRequest, and
    // the HMAC itself is pinned against Twilio's published test vector in
    // src/lib/sms/keywords.test.ts, so this name cannot come to mean nothing.
    // requireMemberFilesArtist (src/lib/memberFiles/server.ts): same class as
    // requireSongLabArtist. It calls auth.getUser() on the session client and resolves the
    // caller's OWN artist_profiles row by user_id; it takes no artist id from the request
    // and has no parameter that could carry one, so a caller can name a bundle but never
    // name whose bundle it is. Named specifically rather than `requireArtist` so this
    // pattern can never come to bless some other, weaker helper that happens to share a
    // generic name.
    // verifyMetaSignature: the Meta (Instagram + Facebook) webhook's authority. A provider
    // signature in the same class as constructEvent (Stripe) and verifyCalcomRequest:
    // HMAC-SHA256 of the raw body under the app secret, timing-safe, fails closed with no
    // configured secret, pinned by test vectors in src/lib/webhookSignatures.meta.test.ts.
    const ESTABLISHES = /auth\.getUser\s*\(|requireAdmin\s*\(|requireArtistOwner\s*\(|requireSongLabArtist\s*\(|requireMemberFilesArtist\s*\(|getOwnedArtistIds\s*\(|CRON_SECRET|INTERNAL_[A-Z_]*SECRET|constructEvent\s*\(|verifyWebhookSignature\s*\(|verifyTwilioSignature\s*\(|verifyMetaSignature\s*\(|WebhookReceiver|createHmac\s*\(|verifyUnsubscribe[A-Za-z]*\s*\(|verifyCalcomRequest\s*\(|presentedSecret/;
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
