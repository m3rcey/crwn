# 27 — Automated Fan Testimonials

> **ARCHITECTURE ONLY - NOT IMPLEMENTED.**
> No table exists. No route exists. No migration was authored. Nothing in this document is live,
> dark, or dormant: it is a proposal awaiting founder ratification. Do not add a `FEATURES` row,
> an `EXPECTED_MIGRATION_STATE` row, or a probe line until implementation actually begins.
>
> Authored 2026-08-12 on branch `claude/rise-mode-full-journey`, reconciled against the live
> repository. Source-of-truth order used: founder instruction, then CRWN Brain, then repository
> implementation, then existing conventions.

**Evidence labels:** **Existing** / **Partial** / **Missing** / **Decision required**.

---

## 0. Two corrections before anything else

### 0.1 The feature is fan-about-artist, and the repository is why the earlier reading went wrong

The only occurrence of the word "testimonial" in this codebase is
`frl_engagements.testimonial_consent` (`supabase/schema-phase2-frl-engagements.sql:85`), surfaced
admin-only in `src/components/admin/MoneyModelView.tsx` and documented in
`20-FIRST-REVENUE-LAUNCH-OFFER.md:207`. That column records whether an artist granted CRWN the
right to use a testimonial **about CRWN**, as part of the First Revenue Launch discount. It is a
sales-collateral consent field on three launch-partner engagements.

Anyone searching this repository for "testimonial" finds that and only that. The earlier
misinterpretation was not a careless reading: it was the only evidence available. **Existing**

That system is unrelated to this one and must stay unrelated. It is admin-scoped, artist-audience,
CRWN-subject. This document describes a fan-audience, artist-subject, artist-owned proof asset.

### 0.2 Two documents this task cites do not exist

`CRWN Future Features` and `CRWN_Future_Features_Ranked_and_Expanded` are **not in the working
tree and not in git history**. The only root-level product artifact of that kind is
`CRWN_Product_Plan.docx`. **Missing**

Therefore the premise of "the Future Features material already anticipates fan testimonials as
part of a future Receipts-to-Press-Kit proof system" **could not be verified**, and no part of
this design is derived from it. Searching the whole repository for press-kit or receipts concepts
returns exactly one relevant line, and it points the other way:

> `02-FEATURE-MAP.md:679` records receipts as **"out of scope by decision, not by omission."**

So there is no ratified Press Kit concept to build toward. Section 12 below still keeps the
testimonial store reusable by a future consumer, because that costs nothing and is good hygiene.
It does not design toward an unverified specification.

`CLAUDE_PROMPT_FRAMEWORK.md` is also absent from the tree and from history. This is the fourth
recorded confirmation (`docs/FEEDBACK_LOOPS.md` section 0,
`docs/CRWN_UNIFIED_PRODUCT_ARCHITECTURE_PLAN.md`, and `22-VIRALITY-ENGINE-ARCHITECTURE.md` are the
first three). Recorded once, not repeated. `CLAUDE.md`'s Problem-Solving Principles were followed
instead. **Missing**

---

## 1. The job to be done

The customer is the ARTIST:

> "Help me continuously collect credible proof from the people who actually support me, without me
> having to remember to ask them."

The automation is **right fan, right moment, right question, low friction, permissioned storage**.
It is not AI manufacturing praise, and it is not automatic publication.

**The loss this addresses:** an artist's best proof already exists. It arrives as a DM after a
listening session, a message after a purchase, a reply after a member-only drop. Every one of
those disappears into Instagram, into a phone, into memory. Proof is perishable, and today CRWN
captures none of it. Each month without capture is proof permanently gone, and it is exactly the
proof the artist needs when a venue, a brand, or a fan on the fence asks "why should I care?"

---

## 2. What already exists, and the one thing that is nearly this feature

### 2.1 The loyalty survey is 70 percent of this system already

This is the single most important reuse finding. CRWN **already** asks long-tenured fans, over
email, on a tokenized link, why they support an artist, and stores their exact words. **Existing**

| Piece | Where |
|---|---|
| Storage | `survey_responses` (`schema-phase2-retention.sql`), `survey_type = 'loyalty_fan'`, `answers` jsonb shaped `{ why_stayed[], favorite, nps, freeform }` |
| Fan-facing form | `src/app/(public)/survey/[token]/page.tsx` |
| Submit route | `src/app/api/surveys/route.ts` |
| Token | `src/lib/surveyTokens.ts`, HMAC-SHA256, 30 day expiry |
| Delivery | `sequences.trigger_type = 'loyalty_survey'` via the existing email sender |
| Eligibility | `src/app/api/cron/inactive-subscribers/route.ts`, active subscribers past `LOYALTY_SURVEY_MIN_DAYS` (90) |
| Dedupe | skip if a `survey_responses` row already exists for that (fan, artist, type) |

**What it is missing is precisely what makes a testimonial a testimonial:**

1. **It is not automatic.** Enrollment only runs for artists who have created an active
   `loyalty_survey` sequence themselves. Most artists never will.
2. **No consent to display.** Nothing in the row says the fan agreed to be shown. Publishing any
   of it today would publish words given for private research.
3. **No display identity.** No choice between name and anonymity.
4. **No verification label.** The relationship evidence is not attached.
5. **No artist library, no feature/hide, no publication path.**
6. **The token is the only authority.** `POST /api/surveys` trusts `respondentId` straight out of
   the token payload and never checks the session. A forwarded link lets anyone submit as that
   fan. That is acceptable for private research. It is **not** acceptable for text that will be
   published beside a "Verified Supporter" badge, and it is the reason section 9 requires an
   authenticated session.

**Conclusion:** reuse the survey's *delivery, eligibility and dedupe patterns*. Do **not** store
testimonials in `survey_responses`. Mixing private research answers and publishable content in one
table means a single mis-scoped query publishes research. Keep the instruments separate; keep the
patterns shared.

### 2.2 The canonical relationship evidence available today

Everything a verification badge could ever need already exists, in tables that own it. **Existing**

| Fact | Source | Notes |
|---|---|---|
| Is a paying supporter | `subscriptions.status = 'active'` joined to `subscription_tiers.price > 0` | |
| Member since / tenure | `subscriptions.started_at` | `UNIQUE(fan_id, artist_id)` means a resubscribe upserts, so derived tenure can UNDERSTATE. That is the safe direction: it never overstates. |
| Founding supporter | `subscriptions.is_founder` | Real, boolean, permanent. From the Founder Window (`schema-phase2-founder-window.sql`). This is the fan-side founding concept section 11 needs. |
| Promise delivered to them | `fulfillment_events.status = 'completed'`, `eligible_fan_count`, `completion_source_type/id` | Must be filtered through `onlyFanPromises` / `FAN_PROMISE_FILTER` (`src/lib/fulfillment.ts`); a row carrying `metadata.ramp_step_key` is a Revenue Ramp step and NOT a fan promise. |
| Attended a live session | `live_session_participants.joined_at` / `left_at` | |
| Producer Session participant | `session_submissions` | |
| Bought something | `purchases`, `live_ticket_purchases`, `live_tips` | |
| Held badges | `fan_badge_awards` (`first_100`, `superfan`, `promoter`, ...) | Catalog is publicly readable already. |

**`FoundingBadge` is for ARTISTS, not fans.** `src/components/shared/FoundingBadge.tsx` renders
`artist_profiles.founding_artist_number`, and that program is retired
(`src/app/api/stripe/platform-checkout/route.ts:206`). Do not reuse it for a fan badge.

### 2.3 `fan_events` exists but does not carry the money moments

`fan_events` (`schema-phase2-fan-events.sql`, `src/lib/fanEvents.ts`) is the shared
"what the fan actually DID" log, and its CHECK constraint permits `subscribe`, `purchase` and
`live_join`. **It does not actually contain them.** `recordFanEvent` has exactly five callers:

- `api/bounties/[id]/submissions`
- `api/squads/[id]/members`
- `api/quests/event`
- `api/road-campaigns/[id]/support`
- `api/city-unlocks/[id]/contribute`

The Stripe webhook does not emit one. **Partial**

**Consequence for this design:** trigger eligibility MUST be derived from the canonical tables in
2.2, never from `fan_events`. Building triggers on `fan_events` would silently produce zero
requests for every money-based moment. Wiring the webhook to emit those events is a legitimate
separate improvement, and it is not a prerequisite here.

### 2.4 There is no user-generated-content moderation primitive

No sanitizer, no profanity list, no report table, no moderation queue, no shared escaping helper.
**Missing**

Two things soften this and one sharpens it:

- React escapes text by default, and `dangerouslySetInnerHTML` appears **nowhere** in application
  code (only inside `agentSecurityBoundaries.test.ts`, as the string it forbids). Web rendering of
  fan text is therefore safe by construction.
- Email is the real injection surface, and it is inconsistent. `src/lib/emails/calendarReminder.ts`
  and `leadMagnetResult.ts` each define their own local `escapeHtml`. `artistNewPost.ts`
  interpolates `${fanName}` and `${truncatedPreview}` into raw HTML with no escaping. There is no
  shared boundary. **This is why V1 puts no testimonial text in any email** (section 8.3).

### 2.5 The privacy precedent that determines the badge design

`src/lib/leaderboardPrivacy.ts` exists because of a real defect: `spent` was redacted from the
public leaderboard, and the redaction did not work, because `referrals`, `comments` and `likes`
shipped in the same response and the score was a linear function of all four. Lifetime spend was
recoverable to the dollar by anyone who could load the page.

> "A redaction defeated by the fields shipped beside it is not a redaction."

Note also what that module **does** publish: `tier`. Tier name is already public per fan on the
artist page leaderboard. It is safe there because tenure is not published beside it.

**The same defect is one design decision away here.** A testimonial card reading
*"Gold member for 8 months"* on a page that lists Gold at $25/month publishes roughly $200 of
lifetime spend. Tier is safe alone. Tenure is safe alone. **Together they are a spend disclosure.**
Section 10 resolves this.

### 2.6 Display identity has an email-leak trap

`profiles.display_name` is public and historically defaulted to the signup email
(`schema-phase2-display-name-no-email-default.sql`, and the guard `isPresentableArtistName` /
`isEmailLike` in `src/lib/publicName.ts`). A fan display identity that naively defaults to
`display_name` would publish fan email addresses on artist pages. The guard already exists and
must be reused. **Existing**

### 2.7 The interruption surfaces, and the gap in the governor

**The Communications Governor does not govern fan-facing communication, deliberately.**
`src/lib/comms/taxonomy.ts` scopes V1 governance to `audience === 'artist' && origin === 'crwn'`,
and states why: fan-facing notifications are the fan's own truth, and artist-authored messages to
fans must never be suppressible by CRWN, because that would be a censorship layer.

Every fan-facing entry in `NOTIFICATION_TAXONOMY` is a `passthrough`. Every one of them is either
the artist's voice or a fact about the fan (their ticket, their badge, their referral earning,
a promise kept).

**A testimonial request is neither.** It is CRWN-authored, fan-audience, and it is a
*solicitation*: it asks the fan for something rather than telling them something. That is a third
category the taxonomy has never had, and the governor's stated rationale for exempting fan traffic
does not cover it. **Missing**

The Pop-up Engine, however, already governs fans:

- `popup_events.user_id` references `profiles`, any role. **Existing**
- `PopupKind` already includes `'survey'`. **Existing**
- Fan-audience pop-ups already ship (`fan_first_support`, `audience: (c) => c.role === 'fan'`).
- The engine enforces **at most one pop-up per user per day** globally, on top of each pop-up's
  own `frequency` cap.
- `admin_settings.popup_engine` is **ON in production** (verified 2026-08-12).
- `FROZEN_POPUP_KEYS` in `src/lib/architecture/invariants.ts` is append-only.

**The Pop-up Engine is the correct delivery chokepoint for V1**, and using it means this feature
adds no new interruption path, which is what `CLAUDE.md` requires.

### 2.8 Other fan free-text already collected

For completeness, so no one builds a fifth one: `cancellation_reasons.freeform` (exit reasons),
`proof_of_demand_responses.response_value`, `popup_survey_responses.feedback`,
`session_submissions.note`, `community_posts` / `community_comments`. None carries display consent.
None is a proof asset. **Existing**

---

## 3. Canonical definition

> **A CRWN fan testimonial is a voluntary written statement, submitted by an authenticated fan
> about a specific artist, describing why they support that artist or what an experience in that
> artist's fan economy was like, stored with an explicit permission scope and an immutable body.**

Properties that make the definition load-bearing:

- **The fan is the author.** CRWN never writes one, never rewrites one, never generates one.
- **The body is immutable after submit.** Neither CRWN nor the artist can alter the words.
- **The artist controls display. The fan owns the statement.** This is the central invariant.
- **A testimonial is not a review.** No score, no stars, no rating, no aggregate. CRWN is an
  artist and fan relationship platform, and a rating turns a fan into a critic and an artist into
  a listing. No repository evidence supports a rating, and the only numeric instrument that exists
  (`survey_responses.nps_score`) is a private research field that is never published.

---

## 4. The differentiator: verified, not generic

A testimonial on a website can be invented. CRWN owns the relationship evidence, so it can attach
a claim it can actually prove: this person paid, this person has been here since March, this
person was in the room.

That is the mechanic worth building. It also sets the boundary: **verification must derive from
canonical evidence at render time (section 10), never be entered, never be asserted by the artist,
and never be faked.** A badge CRWN cannot re-derive is a badge CRWN must not show.

This is also the argument that settles the external-fan question in section 9: an unverified
testimonial from a stranger is the generic product. It is worth less than the thing CRWN can
uniquely make, and it arrives with a spam problem attached.

---

## 5. Recommended V1 trigger set: two triggers

`CLAUDE.md`'s five-step pass says delete before simplifying. The task offered thirteen candidate
triggers; V1 should ship **two**.

### T1. A promise was delivered to this fan

**Fires:** 3 days after a `fulfillment_events` row for the artist reaches
`status = 'completed'`, to fans who were eligible for that obligation.

**Why it is the strongest trigger CRWN has:** the fan just received the specific thing they were
promised. The value is experienced, recent, and concrete, which is exactly the condition
section 43 of the brief asks for. The Promise Calendar already knows the eligible fan set
(`eligible_fan_count`, and `calendarProjection.fanEligibleForObligation` which honors
`metadata.serves_tier_ids` inheritance), so no new eligibility logic is needed.

**Mandatory filter:** `onlyFanPromises` / `FAN_PROMISE_FILTER`. A `fulfillment_events` row carrying
`metadata.ramp_step_key` is a Revenue Ramp step, an artist's private business task, not something
owed to a fan. Asking a fan to comment on it would be incoherent, and it violates a ratified
invariant.

### T2. Thirty days as a paying member, still active

**Fires:** when a `subscriptions` row for a paid tier has `status = 'active'` and `started_at` is
at least 30 days ago.

**Why 30 and not 90:** a member has completed one full billing cycle, so they have both received a
month of value and chosen to keep paying. The existing loyalty survey uses 90 days, and it stays
at 90: it is a different instrument asking a different question, and running both at the same
threshold would double-tap the same fan.

**Why this trigger at all, given T1 is stronger:** T1 only fires for artists who have Promise
Calendar obligations and who keep them. T2 fires for every artist with a paying member and needs
nothing from the artist. It is the floor.

### Explicitly rejected for V1

| Candidate | Why not |
|---|---|
| Purchase confirmation / first checkout | No value has been experienced yet. It produces "excited to check this out", which is not proof. The brief's section 8 is correct. |
| Mission completion | The fan was rewarded for an action. A testimonial adjacent to a reward is contaminated proof (section 14). |
| Any tip / any purchase | Frequency. A fan who buys three things would be asked three times. |
| Renewal | Nearly the same population as T2, arriving later, at lower emotional charge. |

### Staged to Phase 2, with the reason stated

| Candidate | Why staged |
|---|---|
| Post paid-live and Producer Session | Emotionally the best moment on the platform, and cheap to add (same generator, different evidence query). Staged **only** because volume is near zero today, and an untestable code path cannot be validated. Add it the week those sessions have attendance. |
| Long-term supporter anniversary (12 months) | No fan has reached it yet on a platform this young. |

---

## 6. The question is data, and there is exactly one per trigger

No AI. A `prompt_key` identifies a template; the rendered string is derived, so changing the
wording later does not orphan stored rows.

| `prompt_key` | Trigger | Question |
|---|---|---|
| `promise_delivered` | T1 | "You just got [thing]. What did you think?" |
| `member_30d` | T2 | "You have been part of [Artist]'s CRWN for a month now. What do you get here that you do not get from just following them?" |

Both are open, neither is leading, and neither asks for praise. "What do you get here that you do
not get from following them" is the highest-yield phrasing in the brief, because it forces a
specific comparison and specificity is what makes proof usable.

**Storing `prompt_key` rather than the rendered question** is what lets a future Press Kit or
Proof of Demand consumer group testimonials by what was asked without parsing prose.

---

## 7. Fan experience

One screen. One question. Not a survey.

```
  [Artist name] asked:
  "You have been part of [Artist]'s CRWN for a month now. What do you get here
   that you do not get from just following them?"

  [ multiline text box, 2 to 600 characters ]

  Show this as:
    ( ) Maya W.                      <- their display name, only if it is not email-like
    (o) A verified supporter         <- default, and forced when the name fails the guard

  [ ] I give [Artist] permission to show this on their CRWN page.
      Leave this unchecked and only [Artist] sees it.

  [ Send ]   [ Not right now ]
```

Design notes:

- **The consent checkbox is not required to submit.** Unchecked means the response is stored as
  private feedback for the artist. That single choice is what makes the negative-feedback path
  (section 13) work without a second mechanism.
- **"Not right now" is a real, recorded answer**, not a dismissal. It starts the cooldown.
- No character minimum beyond 2. A short authentic answer is still authentic; section 43 of the
  brief is right that the prompt should raise quality, not a validator.
- No rating, no stars, no NPS.
- **Every string above must be free of em dashes**, per `CLAUDE.md`.

---

## 8. Delivery

### 8.1 Surface: the Pop-up Engine, plus a persistent card

Add one `PopupDef` with `kind: 'survey'` and a fan audience. One new key,
`fan_share_experience`, appended to `FROZEN_POPUP_KEYS`.

The engine's global one-per-user-per-day cap and per-pop-up frequency cap apply unchanged. This
feature adds **no new interruption path**, which is what `CLAUDE.md` requires.

Because a pop-up only reaches a fan who visits, the pending request also renders as a card in the
fan's own hub (`FAN_HUB_DESTINATIONS`) until it expires. The pop-up is the interrupt; the card is
the retrieval. A dismissed pop-up therefore does not destroy the request.

### 8.2 The governor gap must be closed, not routed around

Section 2.7 established that a fan-facing CRWN-authored solicitation has no home in
`src/lib/comms/taxonomy.ts`. Two honest options:

- **Recommended:** extend the taxonomy with a fan-facing governable class (`fan_solicitation`),
  keeping every existing fan `passthrough` exactly as it is. The rationale for exempting fan
  traffic is that it is the fan's own truth or the artist's voice, and a solicitation is neither,
  so this is a gap being closed rather than a policy being reversed.
- **Not recommended:** ship it ungoverned because the pop-up cap happens to catch it. That works
  today and stops working the moment a second channel is added.

### 8.3 No email in V1

Email would reach more fans. It is still out, for three reasons that compound:

1. It requires the governor extension above to actually be in place first.
2. It requires honoring `fan_communication_prefs.email_marketing` and `email_suppressions`, which
   is real work with real failure modes.
3. Section 2.4: there is no shared HTML escaping boundary, and the one template that interpolates
   fan-authored text (`artistNewPost.ts`) does not escape it.

Email delivery is Phase 2, and closing the governor gap plus adding one shared `escapeHtml` are
its prerequisites.

### 8.4 Frequency and dedupe, stated exactly

1. At most **one outstanding request per (fan, artist)** at any time. Enforced by a partial unique
   index, not by application logic.
2. At most **one request per (fan, artist, trigger_kind), ever.**
3. At most **one request per (fan, artist) per 180 days**, across all triggers.
4. A fan who has already submitted for an artist is **not asked again in V1.** Context-specific
   follow-up asks are Phase 2, and only once there is evidence a second ask is welcome.
5. A fan who answers "Not right now" enters the same 180 day cooldown and is never asked for that
   trigger kind again.
6. The Pop-up Engine's one-per-user-per-day cap applies on top, untouched.
7. Generation runs on the existing **daily** cron cadence. Vercel Hobby permits no more than one
   run per day, and nothing here is time-critical.

---

## 9. Who may submit: authenticated CRWN fans only

**This is decided by repository evidence, not left to the founder.**

- Verification is the entire differentiator (section 4). An unverified submission is the generic
  product.
- The one existing tokenized submission path is forgeable in exactly the way that matters:
  `POST /api/surveys` trusts `respondentId` from the token and never checks the session, so a
  forwarded link submits as that fan. Publishing forged words under a "Verified Supporter" badge
  destroys the credibility the feature exists to create.
- Authentication is also the anti-spam boundary, and CRWN has no moderation platform to fall back
  on (section 2.4).

The artist's manual request link and external fans are **Phase 3**, and if they ever ship they
carry a visually distinct, unverified treatment. Three levels, never rendered alike:
verified supporter with economic evidence, authenticated account with none, unverified external.
V1 ships only the first.

---

## 10. Verification badges: derive at render, and never publish an invertible pair

**Rule: the badge is re-derived from canonical evidence every time it is rendered.** The row stores
a pointer to the evidence (`verification_evidence_kind` + `verification_evidence_id`), not a
snapshot of the claim. A refund, a chargeback, or a deleted subscription therefore degrades the
badge automatically instead of leaving a stale claim in public.

### Safe to publish

| Badge | Derived from | Why it is safe |
|---|---|---|
| `Verified supporter` | an active paid subscription | Binary. Says "greater than zero", not how much. |
| `Founding supporter` | `subscriptions.is_founder` | Boolean, permanent, no amount. |
| `Supporter for 6+ months` | bucketed `subscriptions.started_at` | Buckets only: new, 3+, 6+, 1 year+. |
| `Was in the room` | `live_session_participants` | Non-monetary participation. |

### Never publish

Amount spent, lifetime value, tier price, purchase history, referral earnings, email, private CRM
tags, exact join date, exact supporter ordinal, `superfan` (its own catalog description is "one of
this artist's most valuable fans", which is a spend claim wearing a badge).

### The pair rule, which is the finding that matters

**Never publish tier name and tenure on the same card.** Section 2.5: the public leaderboard
already publishes tier, safely, because tenure is not beside it. A card reading
"Gold member for 8 months" beside a page listing Gold at $25/month discloses roughly $200 of
lifetime spend, which is precisely the defect `leaderboardPrivacy.ts` exists to prevent.

V1 publishes **coarse tenure only** and omits the tier name from testimonial cards.

The public projection should be a pure, tested function in the shape of
`toPublicLeaderboardEntry`, so that adding a field is a visible privacy decision with a test
attached rather than an edit to a route.

---

## 11. Fan identity and privacy

Two options, not four:

1. **Their display name**, offered only when it passes the `isEmailLike` guard in
   `src/lib/publicName.ts`.
2. **"A verified supporter"** (anonymous but still verified). Default, and **forced** when the
   name fails the guard.

"First name plus last initial" is rejected: CRWN stores no structured name, so it would be
`display_name.split(' ')`, which is fragile and can still leak an email local-part.

Email is never rendered, never returned by a public route, never included in a payload.

### Supporter identity and Rise

Section 25 of the brief hoped for a "Founding Supporter, supporter number" identity. Half of it is
real: `subscriptions.is_founder` genuinely exists and is genuinely permanent. The other half does
not: no per-fan supporter ordinal is published anywhere in CRWN today, and publishing one would
reveal join order and, combined with tenure, join date. Use the boolean and the `first_100` bucket.
Do not invent an ordinal.

---

## 12. Consent

One required decision, expressed as one checkbox, stored as `consent_scope`:

| Value | Meaning |
|---|---|
| `private_to_artist` | Box unchecked. The artist sees it. It can never be published, and the artist cannot promote it. |
| `crwn_only` | Box checked. The artist may feature it on their CRWN surfaces. |

**`external` is deliberately not a V1 value.** Permission to use a fan's words in a press kit, a
sponsor deck, or on social is a materially different right, and collecting a right the product
cannot yet exercise is dead weight with legal surface attached. Add the value to the CHECK
constraint when a consumer actually exists, and ask for it then. This is what keeps the store
reusable by a future Press Kit without designing toward an unverified spec (section 0.2).

**The consent scope may only ever be narrowed after submission, never widened.** Widening requires
asking the fan again.

---

## 13. Artist rights, and negative feedback

### The artist may

View, feature, unfeature, hide, archive.

### The artist may never

Edit the body. Change the consent scope. Change the display identity. Publish a
`private_to_artist` response. See another artist's library.

No artist editing at all in V1. Not even "suggest a shorter version". The moment an artist can
propose wording, the artifact stops being the fan's statement, and the distinction between
suggestion and fan-approved wording is a state machine that buys nothing at this stage.

### Negative feedback

An honest question gets honest answers, and that is a feature. The flow needs no sentiment
analysis, because the fan already routed it: a critical response arrives with the consent box
unchecked, lands as `private_to_artist`, and reaches the artist as feedback that can never be
published. No classifier, no AI, no suppression mechanism.

**Complaints about CRWN are a different thing and must not sit in an artist's library.** The
submission screen carries an explicit branch: "Need help with your CRWN account or a payment?"
linking to `/support`. Deterministic, fan-chosen, and artist-invisible. An artist must never be
positioned to bury a platform complaint.

The artist hiding a negative response from **their own page** is legitimate: it is their marketing
surface. That is not suppression of a platform complaint, and the two paths must stay separate so
it never becomes one.

---

## 14. Rewards: none

No money, no commission, no XP, no badge, no unlock, no mission integration, and no reward
conditioned on sentiment. Not even a neutral incentive in V1.

The reasoning is the same reasoning that keeps the Fan Drives spine non-cash at the database: once
a reward is adjacent to praise, every testimonial is discounted by anyone reading it, including
the venue or brand the artist is trying to convince. The asset's only value is its credibility.

If mission integration is ever revisited, the framing must be "Share your experience", never
"Leave a positive testimonial", and the reward must be identical for a critical response.

---

## 15. Fan edit and withdrawal

- **Withdraw: yes, at any time, permanently.** Sets `withdrawn_at`, and the row leaves every public
  surface immediately. Public reads filter on it, so there is no cache to invalidate at CRWN's
  current scale.
- **Edit: no.** Withdraw and submit again instead. Editing creates a race where the artist featured
  version A and the fan changed it to version B, and it puts a mutable body into a system whose
  central invariant is an immutable one.

| Event | Behavior |
|---|---|
| Fan cancels membership | Testimonial survives. It was true when written. The badge re-derives and degrades. |
| Refund or chargeback | Evidence invalidated, badge drops, row is automatically unfeatured. |
| Fan deletes account | Cascade delete, following every other fan-scoped table. Founder decision D3 below, because "retain anonymized" is defensible too. |
| Artist deletes account | Cascade delete. |
| Artist blocks fan | Row is hidden, not deleted. |
| Fan changes their mind | That is what withdraw is for. |

---

## 16. Moderation, sized to reality

CRWN has no moderation infrastructure (section 2.4) and should not grow one for this. V1:

1. **Deterministic validation at submit:** length bounds, a URL count of zero (links are stripped,
   not rejected, and the fan is told), control-character stripping, and rate limiting through the
   existing `rate_limits` table.
2. **No stored XSS surface on the web:** React escapes, and nothing renders fan text through
   `dangerouslySetInnerHTML`. A drift assertion should keep it that way.
3. **No fan text in email in V1** (section 8.3), which removes the one real injection surface.
4. **Artist hide** is the first-line control and is instant.
5. **Admin block** (`moderation_status = 'blocked'`) is the platform-level backstop, using the
   existing admin surface.

Slurs, threats and harassment are handled by hide plus admin block, which is proportionate when a
testimonial is only ever visible after an artist deliberately features it. There is no open feed
for abuse to appear in.

---

## 17. Automatic collection is not automatic publication

**This is the safety property the whole design rests on.**

CRWN automatically finds the fan, picks the moment, and asks. Everything after that is a human
decision: the fan decides whether to answer, what to say, whether it may be shown, and under what
name. The artist decides whether it appears.

Nothing is ever published without an explicit artist action on that specific testimonial. This is
what prevents accidental publication of an embarrassing, irrelevant, abusive, or privacy-leaking
response, and it costs the artist about one click per testimonial.

---

## 18. Surfaces

### 18.1 The library (artist, private)

Location: a Studio destination plus an AccountHub entry, per `CLAUDE.md`'s navigation rules. Hub
parity is asserted by a drift test, so both are required. It wears `HubPage`, or `HubBackControl`
if it is a connector page, and it is linked with `<Link prefetch>`.

Each row shows: the quote, the fan's chosen display identity, the derived verification badge, which
experience prompted it, the submission date, the permission scope, and its featured or hidden
state. Counts in the header are derived on read. No dashboard, no charts.

### 18.2 The public section (artist page)

One section on `src/app/[slug]/page.tsx`, rendering only testimonials that satisfy **all** of:
`consent_scope = 'crwn_only'`, `featured_at` set, `hidden_at` null, `withdrawn_at` null,
`moderation_status = 'auto_ok'`, and a verification that still re-derives. Renders nothing when
empty.

Two rules specific to that page:

- **Owner checks are `session.user.id === artist.user_id`**, never "does this viewer have an
  `artist_profiles` row". That confusion previously gave every artist owner controls on every other
  artist's page.
- **Owner preview** (`useArtistPreview` / `useSubscription`) may only ever REMOVE access. The
  public testimonial section is visible to everyone, so preview should not change it. If it ever
  becomes tier-gated, it must fall back to tier math while previewing.

**Why public display is in V1 rather than staged:** a library nobody can see is inventory, not
value. The verified claim only does work at the point where a fan is deciding, and the measurement
funnel cannot reach "artist featured" without it. It is also genuinely small: one server-rendered
section reading one public projection. This is the one scope call worth the founder overruling
(decision D2).

### 18.3 Deliberately not built

Proof of Demand integration, Press Kit, campaign and offer page placement, tier-specific placement,
social export. All of them consume the same store later. None is a V1 consumer, and building any of
them now would create the per-feature testimonial systems this design exists to avoid.

The store stays reusable because `context_kind` / `context_id` and `prompt_key` are recorded from
day one. A future Proof of Demand panel pairing "523 interested, 67 paying, 12 verified
testimonials" needs no schema change: quantitative proof says what fans did, qualitative proof says
why they cared, and they stay separate systems joined by an artist id.

---

## 19. Security model

Threats and the non-model, non-UI control that answers each:

| Threat | Control |
|---|---|
| Fan submits for an artist they never supported | Eligibility is **re-derived server-side at submit** from `subscriptions` / `fulfillment_events`. The request row's existence is not sufficient. |
| Caller-supplied `artist_id` or `context_id` is trusted | Never accepted. The client posts a `request_id`; the server reads artist and context off the server-generated row. This is the AUTH-002 and SEC-001 lesson. |
| Fan submits as another fan | Authority is the authenticated session (`auth.uid()`), never a token payload. This is the concrete fix for the forgeable pattern in `POST /api/surveys`. |
| Artist edits the fan's words | Body is immutable: no route accepts it after insert, and a column-freeze trigger enforces it, following `sec-003-profiles-identity-freeze`. |
| Artist reads another artist's library | Ownership derives from the session, not from possession of an `artist_profiles` row. Service-role routes authorize explicitly, because middleware excludes `/api/`. |
| Public caller enumerates unfeatured or private rows | RLS plus an explicit column allowlist in a pure public projection. Never `select('*')`. |
| Stored XSS | React escaping, no `dangerouslySetInnerHTML`, no fan text in email in V1. |
| Malicious links | Stripped at submit, not rendered as anchors. |
| Spam | Authenticated-only, one outstanding request per fan and artist, existing `rate_limits`. |
| Service-role IDOR | Every route resolves the artist from the session or from the server-owned row. |
| Withdrawal leaves a stale public copy | Public reads filter `withdrawn_at`; nothing is denormalized into another table. |
| Prompt injection if text later reaches a model | V1 uses no model. If one is ever added, testimonial text is untrusted DATA, and the model may never publish, feature, or grant consent. |

New columns on an existing table would need per-column grants and a rebuilt
`artist_profiles_public` view; V1 adds no column there, which avoids that class entirely.

---

## 20. Data model proposal

**Proposal only. No migration was authored, and none should be until the founder decisions in
section 23 are ratified.** Two tables, both new, both fan-scoped, both cascading.

### `fan_testimonial_requests`

The ask. Server-generated, never client-created.

```
id                  uuid pk
artist_id           uuid  -> artist_profiles(id)  on delete cascade
fan_id              uuid  -> profiles(id)         on delete cascade
trigger_kind        text  CHECK ('promise_fulfilled' | 'member_30d')
evidence_kind       text  -- 'fulfillment_event' | 'subscription'
evidence_id         uuid  -- pointer, not a snapshot
prompt_key          text
status              text  CHECK ('pending' | 'submitted' | 'declined' | 'expired')
created_at          timestamptz
delivered_at        timestamptz
responded_at        timestamptz
expires_at          timestamptz

unique partial (artist_id, fan_id) where status = 'pending'   -- one outstanding
unique (artist_id, fan_id, trigger_kind)                      -- never twice per trigger
```

### `fan_testimonials`

The statement.

```
id                          uuid pk
request_id                  uuid null -> fan_testimonial_requests(id)  -- null allows a future unsolicited path
artist_id                   uuid  -> artist_profiles(id)  on delete cascade
fan_id                      uuid  -> profiles(id)         on delete cascade
context_kind                text null   -- 'promise' | 'membership' | 'live' | 'product' | null = general
context_id                  uuid null
prompt_key                  text        -- which question was asked, not the rendered string
body                        text        -- the fan's exact words. IMMUTABLE.
display_identity            text  CHECK ('display_name' | 'anonymous')
consent_scope               text  CHECK ('private_to_artist' | 'crwn_only')
verification_evidence_kind  text        -- pointer for re-derivation at render
verification_evidence_id    uuid
moderation_status           text  CHECK ('auto_ok' | 'flagged' | 'blocked')
submitted_at                timestamptz
featured_at                 timestamptz null
hidden_at                   timestamptz null
withdrawn_at                timestamptz null

unique (artist_id, fan_id, context_kind, context_id)
```

**What is deliberately absent, and why.** No tier name, no tenure integer, no amount, no fan email,
no fan display name copy, no verification LABEL. Every one of those is either derivable from the
evidence pointer or is a spend disclosure waiting to be shipped beside something else (section 2.5).
Storing a computed label would also let it go stale after a refund, which is exactly the failure
re-derivation prevents.

### Registry work required when this is implemented

A `FEATURES` row in `src/lib/architecture/invariants.ts`, an `EXPECTED_MIGRATION_STATE` row plus a
probe line in `scripts/probe-migrations.mjs`, `fan_share_experience` appended to
`FROZEN_POPUP_KEYS`, a notification or comms classification for the request, and the Studio and
AccountHub parity entries. None of these should be added now: the registry describes what is, and
right now nothing is.

---

## 21. State machine

```
eligible
   |  daily generator, dedupe rules 8.4
   v
request:pending ---- expires (30d) ----> request:expired
   |  fan opens
   +---- "Not right now" -------------> request:declined  (180d cooldown)
   |  fan submits
   v
testimonial:submitted
   |
   +-- consent unchecked --> private_to_artist   [TERMINAL for publication]
   |
   +-- consent checked ----> crwn_only:unfeatured
                                  |  artist features        ^ artist unfeatures
                                  v                         |
                             crwn_only:featured  ------------+
                                  |
       fan withdraws / artist hides / admin blocks / evidence invalidated
                                  v
                             not public
```

A row is public if and only if **all** of: `consent_scope = 'crwn_only'`, `featured_at` set,
`hidden_at` null, `withdrawn_at` null, `moderation_status = 'auto_ok'`, and verification
re-derives. `private_to_artist` has no path to publication other than the fan submitting again.

---

## 22. Measurement

Derive the funnel from the two tables' timestamps. **Add no new events table, no new
`funnel_events` stage** (those are frozen and artist-acquisition scoped), and no dashboard.

```
eligible -> request created -> delivered -> submitted -> consented -> featured
```

Minimal metrics, computed on read in the library header: requests generated, submit rate, consent
rate, verified share, featured count.

**Do not claim testimonials improve conversion.** Nothing measures that yet, and V1 should not
build the instrumentation to measure it either: that requires artist-page conversion attribution
which is a larger question. State it as unmeasured (section 24).

---

## 23. Founder decisions required

**D1. Build this now, or after there are more paying fans?**
*Why it matters:* the eligible population is every fan who has paid and then experienced value.
CRWN's dominant constraint is still `first_paid_conversion`, so that population is very small
today, and `CLAUDE.md` explicitly forbids optimizing a downstream stage while an upstream
constraint fails.
*Recommended:* **build the capture primitive now, at the two-trigger scope.** Proof is perishable,
the asset compounds, and every month without capture is proof lost permanently. The scope is small
precisely because the volume is small.
*Alternative:* defer entirely until N artists have a paying member, and spend the time on
first-paid conversion instead. This is a defensible call and the strongest argument against
building now.

**D2. Does V1 include the public artist-page section, or stop at the private library?**
*Why it matters:* it is the difference between artist value and artist inventory, and it is where
every privacy mistake becomes visible.
*Recommended:* **include it**, artist-featured only, coarse badges only.
*Alternative:* library only in V1, publish in Phase 2. Halves the blast radius and delays all value.

**D3. When a fan deletes their account, delete their testimonials or retain them anonymized?**
*Why it matters:* "the fan owns the statement" argues delete. "The artist earned this proof"
argues retain.
*Recommended:* **cascade delete**, matching every other fan-scoped table and the stated ownership
principle.
*Alternative:* retain with identity stripped and the badge removed. Preserves the artist's asset,
and is harder to defend if a fan asks for erasure.

**D4. May an artist turn the automation off?**
*Why it matters:* some artists will not want CRWN messaging their fans at all, and CRWN messaging
fans on an artist's behalf is a trust boundary.
*Recommended:* **on by default, with one artist toggle to disable.** No per-trigger configuration,
no custom questions: that is configuration overload for a two-trigger system.
*Alternative:* always on, no toggle. Simpler, and wrong the first time an artist objects.

Four decisions. Everything else in this document is settled by repository evidence, including
authenticated-fans-only (section 9), no artist editing (section 13), fan withdrawal (section 15),
no rewards (section 14), and the display-identity default (section 11).

---

## 24. Drift and security invariants to register at implementation time

Each is written to be assertable by `src/lib/architecture/sourceScan.ts`, and each must be
**mutation-tested** before it counts as protection: introduce the violation, grep the fixture to
prove the mutation applied, watch the suite fail for the intended reason, revert, and confirm the
clean suite passes.

- **TESTIMONIAL-001.** The body is immutable after submission. No route or component writes
  `fan_testimonials.body` outside the insert.
- **TESTIMONIAL-002.** Only the owning artist manages visibility, and ownership derives from the
  session, never from possession of an `artist_profiles` row.
- **TESTIMONIAL-003.** Only the authoring fan may withdraw. Authority is `auth.uid()`, never a
  token payload or a caller-supplied id.
- **TESTIMONIAL-004.** A public read requires `consent_scope = 'crwn_only'` plus `featured_at`.
  There is exactly one public projection function and it enumerates its columns.
- **TESTIMONIAL-005.** A verification badge derives from canonical relationship evidence at render.
  No stored label, no artist-supplied claim.
- **TESTIMONIAL-006.** The public payload contains no amount, tier price, tier name, exact tenure,
  exact join date, supporter ordinal, email, or CRM field. **Tier name and tenure never appear
  together on any card.**
- **TESTIMONIAL-007.** Requests are delivered only through the Pop-up Engine and the fan hub card.
  No feature-local send path.
- **TESTIMONIAL-008.** No fan-authored text reaches an email template while a shared escaping
  boundary does not exist.
- **TESTIMONIAL-009.** Trigger eligibility reads canonical tables, never `fan_events` (section 2.3),
  and every `fulfillment_events` read goes through `onlyFanPromises`.

---

## 25. Recommended phases

| Phase | Contents | Gate |
|---|---|---|
| **1** | Two tables, daily generator for T1 and T2, pop-up plus hub card, one-question form, consent checkbox, two identity options, private library with feature and hide, public artist-page section, withdrawal | D1 to D4 ratified |
| **2** | Live and Producer Session triggers, email delivery, the `fan_solicitation` governor class, a shared `escapeHtml` | Phase 1 has real submissions, and live sessions have attendance |
| **3** | Artist manual request link, external unverified testimonials with distinct treatment, Proof of Demand pairing | Phase 2 measured, and a moderation answer that scales |
| **Never** | Star ratings, review marketplace, paid or rewarded testimonials, AI-generated fan quotes, artist rewriting, testimonial leaderboards, automated social posting, video testimonial studio | |

---

## 26. Acceptance criteria for a future implementation

Implementation is complete when all of the following are observed, not asserted:

1. A fan who was never a supporter cannot create a testimonial, verified by attempting it against
   a real request id with a foreign session.
2. A testimonial body cannot be modified after insert, by the artist, by an API route, or by a
   direct authenticated write, with the read-back as the evidence rather than the status code.
3. An unfeatured or `private_to_artist` row is absent from the public payload, verified with an
   anon-key probe against production, not with a superuser session.
4. Withdrawal removes the row from the public surface on the next request.
5. A refunded supporter's badge degrades and the row unfeatures automatically.
6. No public payload contains an amount, a tier price, a tier name, an exact tenure, or an email,
   verified by inspecting the projection function's output.
7. The pop-up respects the one-per-user-per-day cap alongside existing pop-ups.
8. A fan is never asked twice for the same trigger, verified across two generator runs.
9. `npm run verify:architecture` passes with the nine invariants registered and mutation-tested.
10. `npm test` and `npm run build` pass, with the build run inside WSL.

---

## 27. What this does not know

- **Whether testimonials improve conversion.** Unmeasured, and V1 does not measure it. Do not
  claim it.
- **Submit rate.** No comparable in-product ask exists. The loyalty survey's rate is unknown
  because artist-created `loyalty_survey` sequences appear to be rare or absent.
- **Whether fans will grant display consent at any useful rate.** This is the single riskiest
  assumption in the design, and Phase 1 exists partly to answer it.
- **Whether the 30-day threshold is right.** Chosen by reasoning about billing cycles, not by data.
- **Production row counts** for `subscriptions`, `fulfillment_events` and `survey_responses`, which
  would size the eligible population precisely. They were not queried: this task was
  investigation-only and created no production reads or writes.
