# 15 — AI Agent Instructions

> Operating manual for Claude Code / another AI coding agent working on CRWN. Follow this to plan
> and implement safely without contradicting existing behavior. Distilled from `CLAUDE.md`,
> `DEV_RULES.md`, and the ratified contracts in `src/lib/architecture/invariants.ts`.
>
> **Last reconciled against the repository: 2026-08-12.** Every claim below was checked against
> code on that date. If you find one that disagrees with the repo, the repo wins: investigate the
> disagreement, then fix this file. Do not append a correction section, rewrite the stale rule.

## Source hierarchy (settle disagreements with this)

1. **Implementation truth** = the current repository. Always.
2. **Product truth** = the canonical Brain docs + founder decisions, but only where repository
   evidence still agrees with them.
3. **Ratified invariants** = `src/lib/architecture/invariants.ts` + `exceptions.ts`.
4. **Production truth** = the live probes (`verify:migrations`, `verify:flags`). A static file
   cannot tell you what production has.

When docs disagree with the repo, investigate. Never silently pick the more convenient one.

## Read first (in order)
1. `00-START-HERE.md` — orientation.
2. `CRWN-BRAIN-QUICK-CONTEXT.md` — for routine tasks, this may be all you need.
3. The repo's `CLAUDE.md` + `DEV_RULES.md` + `CODEBASE.md`. (Pricing/AI-provider claims in
   `PRD.md` are stale; trust the code and this package.)
4. `26-PRODUCT-DRIFT-PREVENTION.md` + `src/lib/architecture/invariants.ts` before changing
   anything ratified.
5. The domain doc for your task: `05-DATABASE`, `07-BUSINESS-RULES`, `03-USER-ROLES`,
   `10-INTEGRATIONS`, `11-SECURITY`, `08-DESIGN`, `09-CODING-CONVENTIONS`.

## Before you touch anything (pre-work checklist)
- [ ] **Grep before you build.** Search `src/components/` and `src/lib/` for existing logic. Do
      NOT create a duplicate (this repo already has painful duplication).
- [ ] **Find the source of truth.** Fees → `getArtistFeePercent()`/`TIER_LIMITS`. Limits →
      `TIER_LIMITS_V2`/`checkArtistLimit`. Column locations → `05-DATABASE`. Never re-hardcode.
- [ ] **Check `package.json`** before importing a library; run `npm install` if missing.
- [ ] **Identify the users + roles + entitlement** for the surface (`03-USER-ROLES`).
- [ ] **Confirm which Supabase client**: anon+RLS (components) or service-role (`/api/` only).

## How to inspect before editing
- Read the whole file and its imports; check DB columns against `05-DATABASE` (`src/types` lags).
- For any `[id]`/body param, confirm there is an ownership/session check. If you add a
  service-role route you MUST add this yourself — middleware does not protect `/api/`.
- For content, use `is_free`/`allowed_tier_ids` + entitlement views. **Never re-derive entitlement
  in TypeScript** (that caused the original paid-audio leak).

## Canonical ownership (agents may explain these, never redefine them)

| System | Owns |
|---|---|
| **Constraint Engine** | strategic diagnosis and priority |
| **Roadmap** | launch readiness |
| **Rise Mode / Quests** | execution and progress |
| **Needs You** | real pending events, deadlines, work |
| **Manager** | coaching and execution *around* canonical state |
| **Promise Calendar** | promises owed to FANS (internal tasks are not fan promises) |
| **Communications Governor** | communications classification |
| **Pop-up Engine** | interruption arbitration (max one per user per day) |
| **Z3 issuance** | `/api/artist/constraint` only |
| **Post-Win Referral** | unpaid artist advocacy attribution, never recruiter economics |
| **Team Splits** | artist-funded collaborator economics, never CRWN platform revenue |

## Hard rules (violating these breaks production)
1. **Never add a client-side `profiles.update({ role })`** — RLS silently rejects it; role
   promotion is a server-side trigger on artist publish.
2. **Service-role client is `/api/` only.** Every service-role route self-authenticates and checks
   ownership. Persist app-gating flags through a service-role route, never an unchecked client
   `.update()` (a fire-and-forget client `setup_completed` write silently failed and wedged
   artists). Example done right: `POST /api/artist/complete-setup`.
3. **Stripe:** subscriptions/prices on the **platform** account; `transfer_data.destination` for
   Connect; never pass `stripeAccount` to subscription retrieve/update/cancel. Metadata always
   `fan_id, artist_id, tier_id`/`product_id`. Checkout handler checks `data.url`.
4. **Prices are integer cents.** Input `Math.round(val*100)`, display `(price/100).toFixed(2)`.
   Reset form state with **every** field of the type.
5. **Middleware matcher MUST keep excluding `api/`** or all POSTs 404.
6. **Env vars:** always fallback (`|| 'dummy-...-for-build'`), never `!`. Never put a secret in a
   `NEXT_PUBLIC_` var.
7. **Copy:** no em dashes anywhere user-facing. Pick-one-of-3+ selectors use `OptionSelect`.
   Rise-Mode flows honor `?returnTo=`; back arrows use `smartBack`.
8. **Internal nav** = `router.push()`, never `window.location.href` (external/Stripe only).
9. **CSS:** use `bg-crwn-surface` (NOT the undefined `bg-crwn-card`). Reuse `ui/` primitives.

## Security contract (the lessons that cost the most)

### Authority source
Security-looking code is not security. `admin`, `role`, `user_id`, `require...` appearing in a
file proves nothing. **Prove where authority originates.**
- Admin authority must be **session-derived** or an explicitly registered internal authority.
- Service-role routes must prove ownership/relationship **before** privileged access.
- **A caller-supplied target id is never the authenticated actor's identity.** Confusing actor
  with target is what SEC-001 was.

### Service role and RLS
Service role **bypasses RLS**. That is precisely what makes route authorization mandatory, not
optional. Do not reason "RLS will catch it."

### RPCs
RLS does not protect an exposed callable function. **EXECUTE privileges matter**, and
`REVOKE ... FROM PUBLIC` does **not** remove Supabase's per-role grants — revoke `FROM anon`
by name too. That exact defect left `check_rate_limit` and `redeem_invite` anon-executable.

### Revoked columns
Naming ONE revoked column fails the **entire statement** with 42501, embedded joins included, so
the query returns no row rather than a row with a field missing. Never name
`stripe_connect_id`/`platform_stripe_*` from a browser client, and never inline an
`EXISTS (SELECT ... FROM artist_profiles ...)` into an RLS policy — use a `SECURITY DEFINER`
helper, which runs as its owner and is immune to the caller's column privileges.

### Money
Amounts, destination, and economic ownership are **server-derived**. Never trust request-body
values.

### AI
**Models are untrusted text generators, not security principals.** Authorization lives outside
the model. See the AI section below.

## Migration contract (four distinct states, never collapse them)

1. **Migration file in repo** — proves only that someone wrote SQL.
2. **Migration applied in production** — proved by `npm run verify:migrations`, nothing else.
3. **Feature flag state** — proved by `npm run verify:flags`, never by a code default.
4. **Feature runtime reachability** — the surface must exist too. See `FEATURES` in
   `invariants.ts`.

The old rule "a migration file exists therefore the feature is pending" is **forbidden**.

**A committed security mutation and a passing self-verify are different facts.** On 2026-08-12 the
earnings/recruiters migration committed its `BEGIN...COMMIT` block, closed the hole, and *then*
raised in a post-`COMMIT` `DO` block. Production was secure; repository reproducibility was not.
**Do not infer rollback merely because a later `DO` block raised.** Probe before you conclude.

Rules for writing one:
- Put SQL in `supabase/schema-phase2-[name].sql`. **Do NOT run it** — the founder applies it.
- **End every migration with a `DO $$ … RAISE EXCEPTION …$$` self-verify block.** Assert
  PRIVILEGE and `relrowsecurity` facts, never "a policy row exists" — a superuser in the SQL
  editor satisfies a mere-existence check vacuously.
- **Make the migration ENFORCE exactly what it ASSERTS.** The recruiters cleanup loop dropped
  only `USING(true)` policies while its assertion forbade any policy naming a Data API role, so
  it asserted a property it never enforced.
- Add an `EXPECTED_MIGRATION_STATE` row AND a probe line in `scripts/probe-migrations.mjs`.

### Live-check semantics
- **`anon-probe`** — an anon request can actually prove the expected live state. For SECURITY
  migrations the semantics are **inverted: `42501` is the PASS** and a `200` is the failure.
  Beware `25006` ("cannot execute in a read-only transaction"): that means the privilege check
  PASSED and the function is still reachable, i.e. still open.
- **`sql-check`** — the property needs database introspection a public probe cannot do. SEC-003
  is the honest example: the vulnerability concerns *authenticated writes*, the trigger reverts
  silently, and PostgREST cannot inspect installed trigger source. An anon probe there would look
  green while proving nothing, so `sql-check` is correct.

**Never choose a live-check type because it is convenient.** A probe that cannot distinguish
secure from insecure state is worse than no probe: it manufactures false assurance.

## Test assurance contract

A passing test proves something only if **all four** hold:
1. it is actually included in the shipping gate (`vitest.architecture.config.ts`),
2. it tests the right property,
3. mutation testing proves it fails when the property breaks,
4. **the deliberate mutation actually applied.**

Point 4 is not pedantry. Report a mutation test only after showing the fixture/source really
changed (grep the count before and after), the test failed **for the intended reason**, the
mutation was reverted, and the clean suite passed again.

Point 1 is not free either. The manifest is protected by TWO assertions in `architecture.test.ts`:
the `enforcedBy` parity check, and `REQUIRED_SECURITY_SUITES`. The second exists because the
first never covered the cybersecurity suites — no invariant names them in `enforcedBy`, so
deleting their lines from the config shrank the security gate while everything stayed green.

**Security exceptions must prove liveness.** Every `DELIBERATELY_PUBLIC` / allowlist entry must
still match the exceptional code path it claims to justify. If the route becomes authenticated,
disappears, or changes semantics, the exception must fail as stale. A stale
`tracks/check-limit` entry is what surfaced this.

## Business rules (don't contradict)
Read `07-BUSINESS-RULES.md`. Especially: unique `(fan_id, artist_id)` subscription (resubscribe =
upsert); free tier bypasses Stripe; deferred downgrade.

**The founding-artist 5% override is GONE** (founder call 2026-07-15). Nothing sets
`is_founding_artist` anymore and a partner code is pure attribution now
(`platformTier.ts`, `webhookHandlers.ts`). Do not reintroduce it as a rule.

### Team Splits (artist-funded, and currently not cashable)
- Collaborator authority is the authenticated **`collaborator_user_id`**. A mutable profile email
  is invitation/discovery data, **never** enduring payout authority.
- Splits are **artist-funded**. CRWN platform revenue never subsidizes a collaborator share.
- No retroactive accrual on pre-deal earnings. Future charges on existing subscriptions
  participate only if properly funded before settlement.
- Unowed reserve belongs to the **artist**. No payable collaborator balance without funding, and
  cashout may never exceed the funded released balance.
- **Runtime state: funding/cashout is deliberately DISABLED (503).** The three funding decisions
  are RATIFIED (2026-08-12): `FUNDING_RATIFIED_DECISIONS` in `src/lib/teamSplits/funding.ts` is the
  record, `28-TEAM-SPLIT-FUNDING-ARCHITECTURE.md` the detail. Settled decisions do not open the
  rail: it stays 503 until the charge-time reserve is wired into checkout and a test-mode canary
  proves the payout source. Do not "fix" the 503; it is the safe state.

## AI surfaces (see `10-INTEGRATIONS.md` for the full table)

Three providers, verified by scan on 2026-08-12. Do not repeat the stale two-provider claim.
- **DeepSeek** (`deepseek-chat`) — support chat, admin support, admin agent briefing, admin agent
  analyze (two calls), Manager insights, Manager actions.
- **OpenAI** (`gpt-4o-mini`) — Sync Opportunities generation.
- **Anthropic** — acquisition lead decision (`src/lib/acquisition/claudeDecisionService.ts`),
  reached from the ManyChat inbound webhook.

Rules for touching any of them:
- **The model proposes; it never authorizes.** Every executable AI action stays action-type
  allowlisted, schema-validated, target-verified server-side, bounded, signed/server-issued,
  re-authorized at execution, and shown to the approving admin **with its actual params**.
- **Treat all external prose as untrusted DATA**, never instructions: support messages, bug
  reports, filenames, URLs, user-agent strings, stored DB prose, ManyChat lead text, and prior
  model output. Structure prompts as SYSTEM POLICY / TRUSTED FACTS / UNTRUSTED DATA / TASK.
  Delimiters are defense in depth, **not** authorization.
- **Write every agent as though the model WILL be fully prompt-injected.** The required property:
  even then it cannot exceed server-defined capability, because authority is outside the model.
- **Never claim an AI security issue is fixed because the system prompt forbids it.** For each AI
  security property name the non-model control: cross-user privacy → server query ownership;
  admin mutation → validator + signature + auth + approval; secrets → never in model context;
  money → server computes amount and destination.
- **Manager does not create priority.** It explains the canonical Constraint/Roadmap state and
  coaches the next bounded action. It must distinguish observed / modeled / insufficient evidence,
  must not claim causality from association, and must not surface cross-artist private evidence.
- **Autonomous Manager is DORMANT and stays dormant** unless the founder changes it. Do not repair
  its scheduling, broaden its actions, or enable auto-send.
- Failure is safe by design: support escalates to a human, Manager falls back to deterministic
  output, admin performs no privileged mutation on malformed output, Sync writes no unsafe record.
  **Model availability is never a prerequisite for a money or auth flow.**
- Do not change provider or model because another might be "better." That is not an objective.

## How to test your change

Run the commands and record the CURRENT result. **Do not hardcode test totals into docs** — they
drift the moment anyone adds a test, and a stale count teaches the next agent to distrust the file.

- **`npm test`** — vitest, pure business layers. Add a `.test.ts` beside any new pure business
  logic. Several suites are deliberate guards that fail when a new tool ships without its
  deliverable or analytics entry, so a red test may mean work is missing, not broken.
- **`npm run verify:architecture`** — the deterministic drift + security gate. Run it before
  pushing anything touching money, priority ownership, notifications, attribution, navigation,
  identifiers, AI boundaries, or docs.
- **`npm run build`** (inside WSL in this environment) — must pass clean. No component/integration
  /e2e test exists, so the build remains the gate for everything the suite does not reach.
- **`npm run lint` is not a gate** (a large pre-existing error count). Check your own files only.
- Live probes, kept SEPARATE from the static gates: **`npm run verify:migrations`**,
  **`npm run verify:flags`**, `npm run verify:stripe`, `npm run verify:quests`.
- **Deployment reality: production (thecrwn.app) deploys from `master`.** Pushing a working branch
  does NOT reach production until `master` fast-forwards. To verify what is live, check
  `https://thecrwn.app/sw.js` `CACHE_NAME` and probe a new endpoint (a `404` means not deployed).
  Don't assume a code bug on prod until you confirm the code is live.

There is no `npm run verify:security` script. The security suites run inside
`verify:architecture`; if you add such a script, register it here and in `CLAUDE.md`.

## Security checks before shipping
- New endpoint returning data? Confirm session + ownership scoping (no IDOR), and that the
  authority is derived server-side rather than read off the request.
- New webhook? Verify the provider signature (Resend=Svix, Stripe=constructEvent,
  LiveKit=WebhookReceiver). Twilio is gone: SMS was removed 2026-07-31.
- Handling money? Recompute amounts server-side; don't trust request-body values.
- Touching sensitive columns (role/tier/Stripe ids/audio urls)? They are column-privilege-frozen;
  changes go through the right server path.
- Adding a new `artist_profiles` column? `ADD COLUMN` alone is 42501 to anon. Grant per column
  and rebuild the view.

## Documenting uncertainty
- Use the labels: `Confirmed`, `Strongly inferred`, `Unclear`, `Not found in codebase`,
  `Needs founder confirmation`. Don't present assumptions as facts.
- Report missing evidence as **missing**, never as zero.
- If you discover an exposed secret, report the file path + severity WITHOUT reproducing the value.

## When to propose before implementing
Get founder confirmation before: schema changes to money tables; anything touching
payouts/fees/entitlement; **enabling a dark or dormant feature** (check `FEATURES` in
`invariants.ts` for what is actually dark — the Quest Engine is **LIVE**, flag `quest_engine` ON,
so it is no longer the example); deleting "dead" code that is still wired; changing pricing;
enabling autonomous Manager; re-enabling Team Split funding. Fees come only from
`TIER_LIMITS`/`getArtistFeePercent()`.

## Post-work checklist
- [ ] `npm run build` passes (WSL).
- [ ] `npm run verify:architecture` passes.
- [ ] No duplicate component/logic introduced; reused existing primitives.
- [ ] Ownership/session checks present on any new data route, with authority derived server-side.
- [ ] Cents + Stripe platform/Connect discipline preserved.
- [ ] Migration (if any) ends with a self-verify block that asserts privileges, enforces what it
      asserts, was NOT auto-run, and has both a registry row and a probe line.
- [ ] No em dashes; `OptionSelect`/`smartBack`/`?returnTo` honored; `bg-crwn-surface`.
- [ ] Bumped `CACHE_NAME` in `public/sw.js` if the frontend changed.
- [ ] Founder-only follow-up work added to `TODO.md` in the SAME commit.
- [ ] Updated the relevant Brain doc(s) + `CHANGELOG.md` if behavior/architecture changed.

## Keeping the CRWN Brain updated
After each feature: update `02-FEATURE-MAP` (status), `05-DATABASE` (new tables),
`07-BUSINESS-RULES` (new rules), `13-CURRENT-STATE`, and append to `CHANGELOG.md`. If a claim here
becomes stale, **rewrite it** rather than appending a correction. Stale docs caused several of the
reconciliation issues in this package, and a doc that accumulates contradictory historical rules
stops being an operating manual.

---

*See also: [00-START-HERE.md](00-START-HERE.md) · [09-CODING-CONVENTIONS.md](09-CODING-CONVENTIONS.md) · [10-INTEGRATIONS.md](10-INTEGRATIONS.md) · [11-SECURITY-AND-PRIVACY.md](11-SECURITY-AND-PRIVACY.md) · [26-PRODUCT-DRIFT-PREVENTION.md](26-PRODUCT-DRIFT-PREVENTION.md)*
