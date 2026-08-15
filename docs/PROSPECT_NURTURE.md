# Prospect Nurture (email-only calculator leads)

Long-term email nurture for artists who complete a CRWN calculator, ask for the result by email, but
do **not** create an account. It turns a one-shot result email into a versioned, calculator-aware,
consent-gated, image-led sequence that persuades the lead to make a free account and start the
specific action their calculator recommended, then exits them the instant they sign up.

This is **additive**, not a parallel system. It reuses the existing Resend sender, the global
`email_suppressions` gate, the daily Vercel cron scheduler, the `lead_magnet_leads` /
`lead_magnet_results` tables, the signup token handoff, and the `lead_magnet_events` analytics sink.
It is separate from the **platform sequences** (`platform_sequence_*`), which nurture account holders.

---

## Current reality: this system has never sent an email

Verified against production 2026-08-15 with the service-role key:

| Table | Rows |
|---|---:|
| `lead_magnet_results` | 41 |
| `lead_magnet_leads` | **0** |
| `prospect_nurture_enrollments` | **0** |
| `prospect_nurture_sends` | **0** |

The migration is applied and the tables exist. The cron runs daily. Nothing has ever flowed through
it, because **nobody has ever submitted the email capture form.**

### Root cause (established 2026-08-15, second investigation)

An earlier draft of this document blamed "consent UX". That was **wrong and unprovable**: the
exposure event did not fire, so there was no denominator. The actual causes, in order:

1. **The capture card sat behind an exit.** On every registry calculator the page order was
   result → recalculate → **builder** → hand-raiser → capture. The builder is the CTA, its Wizard
   footer is `stickyFooter` (rendered `sticky bottom-0 z-20`, so its Continue/Save is pinned to the
   viewport the whole time the builder is on screen), and its final press calls
   `router.push(buildContinueUrl(...))` to signup. Anything below the builder is therefore behind a
   permanently visible exit.
   **A first fix moved capture from after the hand-raiser to directly after the builder. That was
   not enough and was corrected**: it only shortened the distance to the same exit. The capture card
   now renders ABOVE the builder (see "Post-result page order" below).
2. **`/worth` had no lead-capture path at all.** It posts to `/api/leads/calculator`, which writes
   `crm_contacts`. No `lead_magnet_leads` row, no consent box, no enrollment. Fixed (see below).
3. **The whole capture funnel was uninstrumented.** `lead_magnet_lead_capture_viewed` and
   `lead_magnet_lead_submitted` were both defined AND server-allowlisted and fired by **nothing**.
   Fixed on both surfaces, with consent state on `reason_code`.

### What the 41 results actually were

Not 40 missed capture opportunities. Broken down:

- **16 had a `user_id`**: logged-in artists, who never see a lead-capture form. Structurally
  ineligible.
- **All 41 had `lead_id: null`**, and the capture route always sets `lead_id`. So **none** of them
  came from the capture path.
- **13 anonymous rows are `status: 'draft'`**, written by `/api/opportunity-drafts` (the
  value-before-signup builder), all dated 2026-07-28 or later.
- **11 anonymous rows are `status: 'completed'`**, all dated 2026-07-14 to 2026-07-27, i.e. mostly
  before prospect nurture shipped on 2026-07-27.

So the honest eligible denominator is roughly **24 anonymous results across a month**, not 40. That
is enough to detect a zero. It is not enough to tune copy.

**The constraint is capture, not copy.** Any claim about which email or cadence converts best is
currently unfalsifiable. Everything in the "Cadence" section below is a labelled hypothesis.

---

## Post-result page order (the capture invariant)

**The rule, founder decision 2026-08-15:** *the result is never email-gated, but the optional
continuation capture must not be buried behind the primary page-exit action.*

Gating and ordering are different things. The previous wording in `CLAUDE.md` ("nothing may appear
between the result and the builder") conflated them and is what kept the card unreachable. The
signup/booking half of that rule is unchanged and still asserted.

| Registry calculators (`PublicToolClient`) | `/worth` (`WorthExperience`) |
|---|---|
| result (+ `ResultToBuilder`, the gold primary CTA) | result card (+ `ResultToBuilder`) |
| "change an answer and recalculate" | derivation card |
| **optional email capture** | **optional email capture** |
| builder (`builderRef`, sticky exit) | builder |
| qualified hand-raiser | inputs |
| explore / showcase | account CTA (`claimCtaCard`) |

Three properties, all of which must hold:

1. **Value first.** The result and its transition are both above the capture card.
2. **Not a gate.** `ResultToBuilder` scrolls straight to `builderRef`, so an artist who wants to
   build skips the card entirely. `leadCapture.required` is false on every tool. The builder works
   without ever touching the card.
3. **Not behind an exit.** The card precedes the builder, whose action is sticky and navigating.

**`scroll-mt` on the builder is measured behaviour, not spacing.** On a 375x667 phone the result and
its disclaimer occupy 588px, so the capture card starts below the fold, and a flush `block:'start'`
scroll to the builder left it **0% visible**: a visitor who tapped the gold CTA immediately never saw
the offer at all. A ~200px scroll margin lands the builder just below the fold line and leaves the
card's tail (consent line and button) on screen. Deliberately kept BELOW the exposure threshold, so
it improves the experience without manufacturing a `capture_viewed`. `/worth` uses the margin at
every breakpoint because its result, stats and derivation push the card below the fold on desktop
too; the registry calculators keep a tight desktop margin because their card is already ~68% visible
on load.

Measured with `scripts/probe-capture-exposure.mjs` (drives real Chrome over CDP):

| Surface | Viewport | Card visible on load | Visible after tapping the gold CTA |
|---|---|---:|---:|
| Registry | 1280x900 | 68% (fires) | 0% (already exposed) |
| Registry | 390x844 | 50% (fires) | 40% |
| Registry | 375x667 | 15% (does not fire) | 40% |
| `/worth` | 1280x900 | below fold | 71% |
| `/worth` | 375x667 | below fold | 44% |

Two supporting details, both found by LOOKING at the rendered page rather than by a unit test:

- The capture submit button is **not gold**. Directly under `ResultToBuilder`'s gold pill, a
  full-width gold button was visually the louder of the two and inverted the hierarchy.
- On `/worth` the account/membership CTA was **split out** of the email card into `claimCtaCard` and
  left below the builder. An optional email ask may precede the builder; an account CTA may not, or
  the builder becomes skippable.

Asserted by `pageComposition.test.ts` and `prospectNurture/capture.test.ts`. Those assertions also
check that the exit they guard against still exists (`stickyFooter`, `sticky bottom-0`, the
`router.push` in `onSaveDeliverable`), so the rule cannot outlive its reason without failing.

## Funnel

1. Lead runs a calculator on a public tool page.
2. The result renders immediately. It is never gated.
3. Between the result and the builder, an optional capture card offers to email the result and the
   follow-up. Consent is an explicit unchecked box. This posts to `POST /api/lead-magnets/capture`.
4. The capture route stores the lead + result, sends the **transactional** result email immediately,
   and (with consent) calls `enrollProspect(...)`.
5. The daily cron `GET /api/cron/prospect-nurture` (`30 10 * * *`) sends the next due email to each
   active enrollment.
6. When the lead signs up, `autoClaimForUser` runs `exitProspectNurtureForUser(...)` and the sequence
   stops. The user moves into the existing signup/onboarding/activation flows.

**`/worth` now enrolls, through the canonical nurture** (2026-08-15). It is a promoted tool that
predates the registry capture architecture, so it keeps its own card and still posts to
`/api/leads/calculator`. What changed:

- An **explicit, unchecked** marketing consent box was added to its email card. Same scope wording as
  the registry calculators. The breakdown email is transactional and still sends without it.
- On `emailConsent === true`, that route now creates the `lead_magnet_leads` row (with
  `consent_text_version` and `consented_at`), binds it to the builder draft the visitor already made
  via `public_token` (or writes a minimal `completed` result in the shape `buildNurtureTokens`
  reads), and calls the shared **`enrollProspect`**. No second nurture system, no second enroller.
- `worth` is an `EXTERNAL_TOOLS` entry, not a `LEAD_MAGNETS` one, so it cannot post to
  `/api/lead-magnets/capture` (that route 404s an unknown slug). The nurture side already understood
  the slug: `calculatorModules.ts` has a bespoke `worth` module and the cron resolves its config from
  `EXTERNAL_TOOLS`. Only the lead and result rows were ever missing.
- A nurture failure is caught and never breaks the capture the visitor asked for.

## Who it targets (docs/ICP.md)

A proven direct-to-fan seller whose monetization stack is **fragmented** (Patreon, Shopify, Discord,
Linktree, Gumroad, Eventbrite, email tools, YouTube Memberships). The pitch is **consolidation**, not
"streaming pays pennies" (they already know that). It never tells the artist their audience is too
small, that fans might not pay, or that they need a catalog/label/budget. `sequence.test.ts` asserts
that beginner framing stays out of the copy.

## The copy rule (revised 2026-08-15)

The previous rule was "lead with the LOSS, never the gain." It was audited and **replaced for this
sequence**, because optimizing one term of the value equation for twelve months does not convert; it
unsubscribes. The rule is now:

> Start from a problem the artist already recognizes, then make the **outcome**, the **credibility**
> of the path, the **speed** of the first result, and the **smallness** of the first step
> progressively more concrete. Never spend an email on loss alone.

Every email should answer four questions: what does this make possible, why would it work for them
specifically, how soon do they see anything, and what exactly are they being asked to do. An email
that answers only the first is not finished.

This governs **this sequence only**. The artist-facing loss-framing rule in `CLAUDE.md` for heroes,
tool cards and landing pages is unchanged: there the reader has not yet identified the problem, and
here they have, by running a calculator.

## Sequence v3: cadence and structure

Content lives in code (`src/lib/prospectNurture/sequence.ts`), versioned in git like the quest
catalog. Day 0 is the transactional result email, sent by the capture route and not counted here.

| Phase | Days | Emails |
|---|---|---|
| A. Diagnose | 1, 2, 4, 6 | `what-it-means`, `not-a-selling-problem`, `first-move`, `parallel-not-migration` |
| B. Believe | 8, 11, 14, 18 | `one-record`, `proven-buyers`, `ten-minutes`, `recalc` |
| C. Decide | 24, 32, 45 | `compounding`, `worked-example`, `fine-has-a-price` |
| D. Evergreen | 60, 120, 210, 365 | `ownership`, `numbers-moved`, `one-blocker`, `final-invite` |

**15 nurture emails + the day-0 transactional = 16 touches**, down from v2's 26. Nine land inside the
first 18 days.

What changed from v2 and why:

- **Front-loaded.** v2 sent 11 of 25 emails after day 84. The decision window for trying a piece of
  software is days, not a year. *(Hypothesis, to be measured.)*
- **Objections moved to where they occur.** v2 held "I already have a Patreon" until day 56; it is
  now day 6, because that thought arrives within minutes of reading the result. Two switching-risk
  objections were merged into one email, since they are the same fear.
- **Proof moved forward.** v2's mechanism email was day 100 and its worked example day 150. They are
  now day 8 and day 32. Perceived likelihood is what a sophisticated buyer weighs in week two.
- **Long tail thinned, not deleted.** Four evergreen touches remain. A lead silent at day 60 is not
  persuaded by density, and the unsubscribe cost of pretending otherwise is permanent.
- **Phases renamed to decision states.** v2's eight calendar phases scheduled beliefs by date. Four
  phases now describe where the reader is.

## Version safety (fixed 2026-08-15)

`current_step` is an **index** into a version's `emails` array. v2 stored a `sequence_version` on the
enrollment and then **always indexed the live array**, so shipping any reorder would have jumped
in-flight leads to unrelated emails. The version number was decorative.

`sequenceForVersion(v)` is the fix: the runner resolves the array by the enrollment's stored version,
and an enrollment on a **retired** version is completed with `exit_reason = 'sequence_retired'`
rather than sent a mismatched email. v2's copy was not carried forward because production had zero
enrollments to protect. Tested in `sequence.test.ts`.

## Image-led creative

Every email renders a banner **above** its copy. `NurtureEmail.art` is a required field typed to the
`NURTURE_ART` keys, so an email cannot compile without one. Twelve concepts serve fifteen emails;
reuse is capped at two emails per asset.

Manifest and regeneration: **`docs/acquisition/nurture-creative-manifest.md`**.
Visual system: **`CLAUDE.md` → "Brand Imagery"** (not restated anywhere else).
Runtime binding: `src/lib/prospectNurture/art.ts`. Prompts: `generate-nurture-art.mjs`.

The day-0 transactional result email carries the same treatment (`nurture-discovery`).

## Calculator-to-module mapping

One universal core serves every calculator. The `moduleQuickWin` / `moduleUseCase` blocks and the
`{{feature_name}}` / `{{hero_value}}` tokens inject calculator-specific content at render time.
`src/lib/prospectNurture/calculatorModules.ts` has an explicit module per registry slug (plus the
external `worth` tool). Any slug without one derives a module from the registry
(`featureName` + `conversionTarget.route`), so a newly added calculator is nurtured automatically.
A known **sub-avatar** module wins over the slug's, because all four avatars run the same calculator.

Each module supplies: `featureName`, `quickWin` (a low-effort action this week), `firstBuild` (the
smallest first build), `useCase` (opportunity to offer), `destinationRoute`.

## CTA logic

Three kinds, in `NurtureCta.kind`:

- **`result`** reopens the secure result page. The low-commitment ask, used early and for re-engagement.
- **`signup`** opens the existing `/signup` handoff carrying the calculator + result token.
- **`auto`** resolves **server-side, in the cron**: a lead whose stored calculator answers score
  `sales_priority` through the canonical `decideCallRequest`, **and** who ran the
  `opportunity-calculator`, is pointed at the existing launch-call hand-raiser on their own result
  page (`#crwn-launch-call`). Everyone else falls through to `signup`.

Boundaries that must hold (`src/lib/prospectNurture/ctaBranch.ts`, tested):

- The branch changes **only the destination and label**, never the body copy, and never who qualifies.
- The lead never self-declares. Scoring is recomputed server-side from the stored inputs.
- `/api/lead-magnets/call-request` re-scores again before any founder alert fires, so the worst case
  for a wrong branch is a link to a request the server then declines to escalate.
- An unresolved `auto` falls through to **self-serve**, never to the sales path.
- Only `opportunity-calculator` can branch, because that is the only result page hosting the card.

**Tradeoff, deliberate:** per-lead copy branching would need a conditional block type and a second
truthful copy set. Pre-PMF that is unmeasurable surface area, so the copy is written to be true for a
self-serve reader first, and the assisted option is mentioned only where it is honestly available.

## Personalization token dictionary

Built by `buildNurtureTokens(...)` (pure, in `tokens.ts`). Every token is a string; a missing value
renders as an empty string, never `undefined` or a literal `{{token}}`. Tested against every email in
both the with-number and without-number branches.

| Token | Source | Fallback |
|---|---|---|
| `first_name` | `lead_magnet_leads.artist_name` first word | `there` |
| `artist_name` | `lead_magnet_leads.artist_name` | `""` |
| `tool_name` | registry `name` | tool slug config |
| `feature_name` | registry `featureName` | derived |
| `hero_value` | `result_data.heroValue` or `estimatedMonthlyCents` | `""` |
| `monthly_value` | `hero_value` + " a month" | `""` |
| `annual_value` | `result_data.estimatedAnnualCents` | `""` |
| `result_url` | public route + `?result=<public_token>` | route without token |
| `signup_url` | `/signup?tool=<slug>&result=<token>&ref=nurture` | without token |
| `cta_label` | `continueCtaFor(slug)` | "Build This In CRWN" |
| `unsubscribe_url` | `/api/prospect-nurture/unsubscribe/<unsub_token>` | always present |

**Financial values are never recomputed in the email layer.** They come straight from the stored
result's `result_data`. The `numberOrFallback` block renders a with-number line when a figure exists
and a no-number line for score-only tools (Royalty, Quest Path).

## Consent, suppression, enrollment + exit rules

- **Consent:** nurture is marketing, so `enrollProspect` requires `emailConsent === true`. The box is
  never pre-checked and the transactional result email is separate and always sent. Unchanged.
- **Consent copy (updated 2026-08-15):** the tail was "and occasional CRWN tips for artists", which
  described nothing. It is now ", plus the follow-up emails on how to launch it. Unsubscribe
  anytime." That is **narrower and more specific** than what it replaced, so the permission granted
  did not widen. Requirement, default state and legal scope are unchanged.
- **Suppression:** `isEmailSuppressed` is checked at enroll and before every send. A hard bounce,
  spam complaint, or unsubscribe is a global suppression that overrides every marketing send.
- **Dedup:** a partial unique index (`email` where `status='active'`) enforces at most one active
  nurture per email. A second calculator refreshes personalization instead of overlapping.
- **Idempotency:** `prospect_nurture_sends` has `UNIQUE(enrollment_id, email_id)`, so a step can
  never be sent twice even if the cron double-runs. The slot is claimed BEFORE the send and rolled
  back on provider failure.
- **Exit on signup:** `exitProspectNurtureForUser` cancels active enrollments
  (`exit_reason = account_created`). The cron also re-checks `converted_user_id` before every send,
  so an existing account holder is never asked to sign up.

## Behavioral attribution and measurement

Sends carry an `X-Prospect-Send-Id` header. The **signed** Resend webhook (`/api/webhooks/resend`,
`verifySvixSignature`, fails closed) updates `prospect_nurture_sends` on `delivered` / `opened` /
`clicked` / `bounced`. A hard bounce or complaint also adds the address to `email_suppressions`.

Events in `lead_magnet_events`: `prospect_nurture_enrolled`, `prospect_nurture_refreshed`,
`prospect_nurture_email_sent`, `prospect_nurture_exited`, `prospect_nurture_unsubscribed`, plus
`lead_magnet_lead_capture_viewed` (now actually fired).

On `prospect_nurture_email_sent`: `reason_code` is the **email id** and `conversion_target` is the
**CTA variant** (`signup` / `result` / `assisted`). `recordLmEvent` has a fixed column allowlist, so
an ad-hoc metadata bag is silently dropped; those two columns are the whole budget and they answer
"which email" and "which ask".

**Answerable today:** sends, deliveries, opens, clicks per email id; enrollments and exits by reason;
conversions (enrollments that exited `account_created`); per calculator; per CTA variant.
**Not answerable:** first-paid-member attributed back to a nurture email. That would need the
enrollment id stamped on a funnel stage below signup, and it is not worth building before the
sequence has non-zero volume.

### The five capture-funnel rates

Never write `0%` for a stage that was not measured. Use `not measured`.

**The denominator is the ELIGIBLE population, not every result.** An eligible anonymous
promoted-calculator result is one where `lead_magnet_results.user_id IS NULL` (an authenticated
artist never sees prospect capture), `tool_slug` is in `PROMOTED_TOOL_KEYS`, and the surface actually
presents prospect capture. Of the 41 historical rows, 16 are authenticated and 17 came from paused
calculators, so `result_generated` would flatter every rate measured against it.

| Rate | Formula |
|---|---|
| Eligible result to exposure | `capture_viewed / eligible_anonymous_promoted_result` |
| Exposure to attempt | `lead_submitted / capture_viewed` |
| Attempt to consent | `lead_submitted[reason_code='consented'] / lead_submitted` |
| Consent to enrollment | `prospect_nurture_enrolled / lead_submitted[reason_code='consented']` |
| Enrollment to account | `prospect_nurture_exited[reason_code='account_created'] / prospect_nurture_enrolled` |

**`lead_magnet_lead_capture_viewed` means actual viewport exposure, not component mount.** It fires
once per result experience when at least half the capture card has been continuously on screen for
~0.9s (`src/hooks/useViewportExposure.ts`). The dwell is the point: the primary CTA scrolls the page
past the card in a few hundred milliseconds, and an element that swept through the viewport on the
way somewhere else was not an opportunity to read an offer. The threshold and dwell are product
judgement, not science; they exist only to separate "rendered in the DOM" from "had a fair chance to
see it". Dedup is a per-tool `sessionStorage` key, so it survives a remount and a scroll-away-and-back
but counts a genuinely new visit again. Without `IntersectionObserver` it fires **nothing**, because
an absent number is honest and an inflated one is not.

Before 2026-08-15 the first three rates were **unmeasurable**, because neither client event fired.
The first wiring of the exposure event fired it on mount, which would have been worse than silence.

**The one metric to watch first:** *eligible result to exposure*. If artists now see the card and
still do not opt in, the problem is the offer; if they still do not see it, the problem is still
placement. That distinction was impossible to make before and is the entire point of the
instrumentation.

**Known and deliberate:** on a short phone a visitor who taps the gold CTA within the first screen is
never exposed, and is correctly **not** counted. That is a real limit of the composition, not a
measurement artefact, and the exposure rate is what will show how large it is.

## Admin controls

- **Inspect:** Admin → Sequences tab → "Prospect Nurture" (`/api/admin/prospect-nurture`,
  `requireAdmin`). Enrollments by status/calculator/phase, exit reasons, sends, opens, clicks,
  bounces, conversions. Emails masked.
- **Pause everything:** it is code, so remove the cron entry from `vercel.json` or return early.
- **Pause one lead:** set that enrollment's `status` to `paused` or `canceled` in Supabase.
- **Edit content safely:** edit `sequence.ts` / `calculatorModules.ts`. In-flight enrollments read
  their own version. To force a clean cut, add a new version to `PROSPECT_NURTURE_SEQUENCES` and bump
  `PROSPECT_NURTURE_VERSION`; do not mutate a version that has live enrollments.

## Database

Migration `supabase/schema-phase2-prospect-nurture.sql`, **applied in production** (verified by
direct query 2026-08-15).

- `prospect_nurture_enrollments` — `lead_id`, `email`, `tool_slug`, `result_id`, `sequence_version`,
  `phase`, `current_step`, `status`, `next_send_at`, `last_sent_at`, `exit_reason`, `unsub_token`.
  Partial unique on `email` where `status='active'`.
- `prospect_nurture_sends` — `UNIQUE(enrollment_id, email_id)`, `resend_message_id`, `status`,
  `opened_at`, `clicked_at`.
- Additive: `email_suppressions.reason` CHECK allows `unsubscribe`. RLS on, admin-only SELECT.

**No migration is needed for v3.** `phase` is a free-text column, so the renamed phases store fine,
and `sequence_version` already exists.

## Testing

`npx vitest run src/lib/prospectNurture` (51 tests). Covers sequence structure and ordering, version
resolution and retired-version safety, art existence / WebP magic bytes / size / alt text / the
65:35 representation ratio / reuse cap, banner-above-copy ordering, no-raw-token rendering in both
number branches, HTML escaping, CTA branch boundaries, anchor sync with `PublicToolClient`, and
content claims (no em dashes, no bare "CRWN", no prices, no guarantees, no invented proof, no fake
scarcity, no beginner framing, no paused-calculator references).

## Known limitations

- **Zero production volume.** No cadence, subject line or image in this system has been validated by
  a real recipient. Every performance statement here is a hypothesis.
- **The capture fixes are not in production yet.** They live on
  `claude/rise-mode-full-journey`; production tracks `master` and was serving `sw.js` `crwn-v403` at
  the time of writing. Nothing here is live until that merges and the version moves.
- **Historical capture exposure is unknowable.** The exposure event never fired, and there is no
  per-visitor scroll telemetry, so "how many of the 24 anonymous visitors ever had the capture card
  on screen" cannot be recovered. The zero is real; its precise attribution across the three causes
  above is inference from the code, not measurement.
- **No first-paid-member attribution** back to a nurture email (see Measurement).
- **Instagram/DM-origin leads** live in `lead_identities` and are nurtured by the acquisition
  follow-up system, not this one.
