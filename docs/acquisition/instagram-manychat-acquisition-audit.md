# Instagram → ManyChat → CRWN Acquisition Engine — Implementation Audit

> Written BEFORE any code changes, per the operating procedure. Every claim below was
> verified against the live repository, not against the CRWN Brain. Where the Brain and
> the repo disagree, the repo wins and the difference is recorded in "Brain corrections".
>
> Certainty labels: **[VERIFIED]** = read the file. **[INFERRED]** = deduced from
> surrounding code. **[UNKNOWN]** = could not confirm; treated as a risk.

---

## 1. Executive summary

The brief assumed a greenfield build. It is not. CRWN already contains **most of the
result-generation half** of this system, built to a high standard: a typed lead-magnet
registry, pure version-stamped result generators, a token-bearing results table, an
analytics event log, and a server that already refuses to trust client-computed results.

What is genuinely missing is the **conversation half**: there is no lead identity, no
session, no state machine, no webhook ingress, and no Claude layer.

So the smallest safe implementation is: **build the conversation half, and adapt it onto
the result half that already works.** Concretely, that deletes four large work items the
brief asked for (formula extraction + parity tests, a new registry, a new token service,
a new result page) and replaces them with adapters.

**Net effect: the five existing lead magnets are not modified at all.** Not one line of
`resultGenerators.ts`, `leadCalculator.ts`, `WorthExperience.tsx`, or the four tool configs
changes. The acquisition engine calls into them as a consumer.

---

## 2. What already exists and will be reused (do not rebuild)

### 2.1 The lead-magnet system — `src/lib/leadMagnets/` [VERIFIED]

| Asset | Path | Reuse decision |
|---|---|---|
| Typed registry | `registry.ts` — `LEAD_MAGNETS: LeadMagnetConfig[]`, `LEAD_MAGNET_BY_SLUG`, `getLeadMagnet(slug)`, `EXTERNAL_TOOLS` | **Extend** with an optional `acquisition` block. Existing configs stay valid. |
| Config type | `types.ts:74` — `LeadMagnetConfig` | **Extend**, additively. |
| Result engines | `resultGenerators.ts` — `generateResult(key, values)`, `GENERATOR_VERSION = '1.0.0'` | **Call as-is.** Pure, deterministic, version-stamped. |
| Validation/normalization | `validation.ts`, `server.ts` (`isValidEmail`, `normalizeEmail`) | **Reuse.** |
| Analytics | `analytics.ts` — 20 events in `LM_EVENTS` → `lead_magnet_events` | **Extend** the event list. |
| Disclaimers | `disclaimers.ts` — `ESTIMATE_DISCLAIMER`, `LEGAL_DISCLAIMER`, `CONSENT_TEXT_VERSION = '2026-07-11.v1'` | **Reuse.** |
| Conversion adapters | `conversionAdapters.ts` — `lm_*` prefill params into live builders | **Reuse** for the Rise Mode handoff. |

**The five lead magnets, confirmed:**

| # | Tool | Slug | Engine | Architecture |
|---|---|---|---|---|
| 1 | Vault Revenue Planner | `vault-revenue-planner` | `vaultRevenuePlan` | `LeadMagnetConfig` |
| 2 | Proof of Demand Test Builder | `proof-of-demand-test-builder` | `proofOfDemandTest` | `LeadMagnetConfig` |
| 3 | Fan Mission Generator | `fan-mission-generator` | `fanMission` | `LeadMagnetConfig` |
| 4 | Clip-to-Earn Campaign Planner | `clip-to-earn-campaign-planner` | `clipToEarnCampaign` | `LeadMagnetConfig` |
| 5 | **/worth** | `worth` | `leadCalculator.calculate()` | **`ExternalTool` — a different architecture** |

### 2.2 The critical finding: formulas are ALREADY pure services [VERIFIED]

Brief §8 asked me to extract formulas trapped in UI components and add parity tests. **They
are not trapped.** Both engines are already pure, framework-agnostic modules:

- `src/lib/leadMagnets/resultGenerators.ts:416` — `generateResult(key, values)` dispatcher.
  Header contract: *"Pure functions of normalized inputs. Same input + same version => same
  output... The server re-runs the SAME generator to recompute before persisting/converting
  (never trusts a client-sent result)."* Honored at `capture/route.ts:70`,
  `results/route.ts:38`, `results/[id]/route.ts:93`.
- `src/lib/leadCalculator.ts:90` — `calculate(inputs, assumptions)`. Header: *"PURE,
  framework-agnostic — the single source of truth for the /worth calculator."* Integer cents.

**Consequence: the extract-and-prove-parity work item is DELETED.** The acquisition engine
imports these functions directly. Parity is structural, not tested-for, because there is
only one copy of each formula and I am not touching it.

### 2.3 `/worth` is also the homepage [VERIFIED — HIGH RISK]

`src/app/page.tsx` renders `<WorthExperience homepage />`. The site's front door and `/worth`
are the same 898-line component. It writes leads to `crm_contacts` (not `lead_magnet_leads`),
has no result token, and fires no analytics.

**Decision (founder-approved): adapter only.** `/worth` is registered in the acquisition
registry through an adapter that calls the existing pure `leadCalculator.calculate()`.
`WorthExperience.tsx` and `src/app/page.tsx` are **not modified**. The Instagram flow can
run the worth model and mint a tokenized result without touching the homepage's data flow.

### 2.4 Result storage + tokens already exist [VERIFIED]

`lead_magnet_results` (`supabase/schema-phase2-lead-magnets.sql:62`) already has:
`input_data` jsonb, `result_data` jsonb, `generator_version`, `status`, `source`,
**`public_token` UNIQUE**, `public_token_expires_at`, `converted_feature_type/record_id/at`.

**Decision: extend this table, do not create a parallel `lead_results` table.** Brief §5
explicitly says "extend existing tables when semantically correct." It is.

Gap to close: `public_token` is stored **in plaintext**. New acquisition tokens will store a
**SHA-256 hash** (`public_token_hash`) and a separate one-time `claim_token_hash`. The
existing plaintext column keeps working for the existing 4 tools; new rows populate both.

### 2.5 Auth, webhook, cron, and email conventions [VERIFIED]

| Concern | Existing pattern | Path |
|---|---|---|
| Artist-scoped service-role auth | `requireArtistOwner(artistId)` → `{ok, userId, platformTier}` | `src/lib/apiAuth.ts` |
| Admin auth | `requireAdmin()` → `User \| null`, 403 on null | `src/lib/auth/requireAdmin.ts` |
| **Unsigned third-party webhook** | **`x-webhook-secret` header, fail-closed** | `src/app/api/notifications/new-artist-hook/route.ts:14` |
| Idempotency | **Insert-as-claim** on `UNIQUE(event_id)`, `23505` = duplicate | `src/app/api/stripe/webhook/route.ts:59` |
| Rate limiting | `checkRateLimit(key, action, windowSec, max)`, `toUuidKey()` hashes non-UUID keys | `src/lib/rateLimit.ts` |
| Cron auth | `Bearer ${process.env.CRON_SECRET}`, GET | every `src/app/api/cron/*` |
| Email | `resend.emails.send({from: FROM_EMAIL, ...})`; templates are pure fns | `src/lib/resend.ts`, `src/lib/emails/*` |
| SMS + quiet hours | `sendSms()`, `isInQuietHours()` (fails closed), `MAX_SMS_PER_FAN_PER_DAY = 1` | `src/lib/twilio.ts` |
| Feature flags | `admin_settings` key→jsonb; only reader is `isQuestEngineEnabled` | `src/lib/quests/index.ts:391` |
| Build-time registry validator | regex over raw TS, exits 1 with a bulleted FAILED list | `scripts/verify-quest-catalog.mjs` |
| Rise Mode destinations | `CATEGORY_CTA` + `TEMPLATE_CTA` + `questCta(quest)` | `src/components/quests/questRoutes.ts` |

---

## 3. What exists but needs extension

1. **`LeadMagnetConfig`** — add an optional `acquisition` block (questions, required fields,
   Claude allowlists, destination, follow-up). Optional so the 4 existing configs compile
   untouched.
2. **`lead_magnet_results`** — `ALTER TABLE ADD COLUMN IF NOT EXISTS` for identity/session
   links, hashed tokens, and the immutable `original_input_data` snapshot.
3. **`LM_EVENTS`** — add the acquisition event names (§19 of the brief).
4. **`isQuestEngineEnabled`** — generalize into `getFlag(key)`; acquisition needs its own
   `acquisition_engine` kill switch and must NOT auto-enable the dark-launched Quest Engine.
5. **`questRoutes.ts`** — wrap in a typed `destinationRegistry` so Claude cannot return an
   arbitrary URL.
6. **`scripts/verify-quest-catalog.mjs`** — add a sibling `verify-acquisition-registry.mjs`
   in the same style, and wire both into `npm run build`.

---

## 4. What does not exist (build new)

- Lead identity, session, answers, conversation log, persistent lead profile, score history.
- ManyChat ingress, verification, idempotency, response mapping.
- Deterministic conversation state machine.
- Claude decision service (no Anthropic SDK installed).
- Acquisition event outbox + dispatcher.
- Secure claim flow linking an anonymous Instagram lead to a verified Supabase user.
- Any test framework at all.

---

## 5. Brain corrections (repo facts that differ from `docs/crwn-brain/`)

| Brain / brief said | Repository actually |
|---|---|
| "Use Zod or the repo's current runtime validation" | **No validation library exists.** Zero hits for zod/yup/joi/ajv. All routes hand-roll TS guards. → I hand-roll too, matching convention. No new runtime dep. |
| "AI provider is DeepSeek/OpenAI" | Correct, but via the **`openai` SDK with a `baseURL` override** to `api.deepseek.com`. `@google/genai` is a **devDependency only** (content scripts, not app code). **No Anthropic SDK.** → must `npm i @anthropic-ai/sdk`. |
| "Extract calculator formulas from components" | **Already extracted.** See §2.2. |
| "Create a lead-magnet registry" | **Already exists.** See §2.1. |
| Brief §16/§17 imply adding crons | **`vercel.json` has 25 cron entries and nearly every hour slot 0-23 is taken.** The house pattern is to **piggyback** (`cron/sequences/route.ts:20` does exactly this for calendar reminders). → acquisition dispatch piggybacks `/api/cron/platform-crm` (`0 5 * * *`), the semantically correct home (it is already CRWN's own artist-acquisition pipeline). **No new cron entry.** |
| Brief §10 "verify the webhook signature" | **ManyChat cannot HMAC-sign.** Its External Request sends custom headers only. → shared-secret header + idempotency claim, per `new-artist-hook`. Documented honestly as replay-*bounded*, not replay-*proof*. |
| `/api/ai-manager` root route | Does not exist. Only `/api/ai-manager/generate` and `/api/ai-manager/execute`. |
| No test framework | Confirmed. `package.json` has no `test` script. → add Vitest (devDep only). |

### 5.1 Latent bug found (pre-existing, NOT introduced here)

`src/app/api/lead-magnets/results/resume` **does not exist as a route.** Both
`PublicToolClient.tsx:45` and `ArtistToolClient.tsx:54` fetch
`/api/lead-magnets/results/resume?token=…`, which falls through to the `[id]` dynamic
segment with `id === 'resume'`. It works **only** because `results/[id]/route.ts:46` checks
`token` before it ever reads `id`.

This is load-bearing by accident. Any reordering of that GET handler silently breaks
emailed-result resume and post-signup import. **Flagged, not fixed** — out of scope for this
change, and fixing it would touch the existing five tools, which the brief forbids. Recorded
in `docs/crwn-brain/17-OPEN-QUESTIONS.md`.

---

## 6. Selected architecture, and why it is the smallest safe implementation

```
Instagram comment
   │
   ▼
ManyChat  (transport only: triggers, private reply, DM, thin custom fields)
   │  POST  x-webhook-secret
   ▼
/api/integrations/manychat/webhook          ◄── ONE route, dispatches on event_type
   │                                             (not 7 routes = 7 chances to forget auth)
   ├─ verifyManyChatRequest()   fail-closed, timing-safe
   ├─ claimIdempotency(event_id)   insert-as-claim, 23505 ⇒ replay ⇒ return cached response
   ├─ rateLimit(manychat_contact_id)
   ▼
orchestrate()                               ◄── deterministic, CRWN-authoritative
   ├─ resolveIdentity()        strict precedence, never merges on username
   ├─ storeRawAnswer()         immutable, before any AI touches it
   ├─ normalizeDeterministic() numbers/enums resolved WITHOUT Claude
   ├─ knownFields()            session → lead_profile → profiles → artist_profiles → prior results
   ├─ claudeDecision()         ONLY for free-form text, ONLY if a field is still missing
   │     └─ validateDecision() reject unknown fields/routes/tools; clamp scores; drop URLs
   ├─ stateMachine.next()      Claude RECOMMENDS; the machine DECIDES
   ├─ executeResult()          ── calls existing generateResult() / leadCalculator.calculate()
   ├─ mintResultToken()        opaque 32-byte random; SHA-256 hash stored
   └─ enqueue(outbox)          side effects never block the ManyChat response
   │
   ▼
thin JSON  { action, message, question_key, result_url, status }   ◄── no PII, no internals
```

**Why this shape:**

1. **One ingress route, not seven.** The brief's seven endpoints share one auth path and one
   idempotency path. Seven copies of a security check is seven chances to omit one. Distinct
   Zod-equivalent schemas per `event_type` preserve the brief's requirement (§10: "preserve
   distinct schemas and actions") while collapsing the attack surface to a single door.

2. **Claude is a passenger, not the driver.** The state machine is authoritative and the
   deterministic fallback is a *complete* path, not a stub. If Anthropic is down, the flow
   still asks the next required field and still generates the result. This is the single most
   important property in the design: the brief's own §11 demands it, and it is what keeps a
   provider outage from destroying a lead session.

3. **Claude never produces a number that reaches a result.** Extraction only. All money and
   all projections come from `resultGenerators.ts` / `leadCalculator.ts`. Enforced structurally:
   the decision schema has no numeric output field that feeds a calculator input, and
   `validateDecision()` strips any `extractedFields` key not in the field registry.

4. **Trust ordering is explicit and enforced in one place**
   (`progressiveProfiling.ts#TRUST_RANK`), so a Claude guess can never overwrite a verified
   CRWN value:
   `verified_crwn (5) > verified_contact (4) > direct_answer (3) > deterministic (2) > claude_extraction (1) > provider_metadata (0)`

5. **The claim flow trusts only Supabase.** An Instagram identity is *never* sufficient to
   touch an account. The claim token is one-time, hashed, expiring, and is only redeemed
   **after** `auth.getUser()` returns a verified session. This is the rule that stops the
   `/api/audience` failure class from recurring on a route that is, by necessity, both
   service-role and reachable by an unauthenticated stranger.

### 6.1 Data model

| Table | Why new / why not extended |
|---|---|
| `lead_identities` | No equivalent. `crm_contacts` is admin-CRM-shaped and has no provider identifiers. |
| `lead_sessions` | No equivalent. |
| `lead_answers` | No equivalent. Append-only; corrections supersede, never overwrite. |
| `lead_conversation_messages` | No equivalent. Minimal retention. |
| `lead_profiles` | Typed columns for anything scoring/admin/calculators filter on; jsonb only for provenance + extensibility. |
| `lead_score_history` | No equivalent. `artist_profiles.platform_lead_score` exists but is a *post-signup* score with no components and no history. |
| `acquisition_events` | Unified idempotency claim + outbox + analytics. Mirrors `processed_webhook_events` (insert-as-claim) and `lead_magnet_events` (analytics) rather than inventing a third pattern. |
| `lead_magnet_results` | **EXTENDED, not duplicated.** |

All new tables: `ENABLE ROW LEVEL SECURITY`, no client write policy, admin SELECT, and
authenticated SELECT only on rows linked to the caller's own verified user. Migration ends
with a `DO $$ … RAISE EXCEPTION … $$` self-verify block. **Not auto-run.**

---

## 7. Deliberate scope cuts (phase 2)

Named here so they are not mistaken for oversights:

- **Admin duplicate-merge tooling.** There are zero leads to merge. Building a merge UI before
  the first lead exists is automating something that should not yet exist.
- **SMS channel.** Provider interface + a disabled safe adapter ship now; the live channel does
  not. Consent infrastructure exists (`sms_consent_log`, quiet hours) but wiring a new
  compliance surface for zero phase-1 value fails the "delete" test.
- **Circuit breaker / cost telemetry on Claude.** Timeout + one retry + deterministic fallback
  covers the failure mode. A breaker is optimization before there is load to optimize.
- **Full admin acquisition panels.** Phase 2. The API routes and the audit trail land now so the
  data is complete from day one; the UI to read it follows.

---

## 8. Risks I am accepting, stated plainly

1. **Replay is bounded, not prevented.** ManyChat cannot sign. A captured request can be
   resent; the idempotency claim makes it a no-op, but an attacker holding the secret can
   forge *new* events. Mitigation: fail-closed secret, rate limit per contact, and the
   webhook can never read PII back out. Rotate `MANYCHAT_WEBHOOK_SECRET` if leaked.
2. **`check_rate_limit` has no checked-in migration.** It exists only in prod
   (`schema-phase2-money-ledger-rls.sql` admits this for four other tables too). I depend on
   it. If it is missing, `checkRateLimit` returns `false` = deny, which fails closed. Safe.
3. **Instagram DM messaging windows are Meta-governed.** CRWN cannot send an Instagram DM
   outside the permitted window regardless of what the dispatcher wants. Outbound IG follow-up
   is therefore modeled as a *ManyChat action*, and the constraint is documented rather than
   worked around.
4. **`/worth`'s lead pipeline stays split** from `lead_magnet_leads` (it writes `crm_contacts`).
   Unifying it would rewrite the homepage. Accepted; documented.

---

*Audit complete. Proceeding to implementation.*
