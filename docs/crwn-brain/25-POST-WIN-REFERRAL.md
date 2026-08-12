# 25 — Post-Win Referral System

> **STATUS: V1 LIVE (shipped 2026-08-12).** Both blocking founder decisions were ratified and are
> implemented and pinned by test. Only the behavior described in sections 1 to 11 is live; every
> expansion in section 14 remains unbuilt.
>
> **FOUNDER POLICY, PERMANENT:**
> - **Organic Post-Win referral: UNPAID, forever.** No commission, credit, discount, free month or
>   payout entitlement, and **never retroactively commissionable** if a paid Artist Affiliate
>   program launches later.
> - **A future paid Artist Affiliate program is a SEPARATE program**, requiring its own enrollment
>   and approval, attribution type, economics and effective date.
> - **The recruiter rail is never used.** Post-Win referral activity alone may not create
>   `artist_referrals` or `recruiter_payouts`, assign the $50 flat fee or recurring recruiter
>   economics, or promote anyone to recruiter/partner.
> - **No retroactivity.** Historical Post-Win referrals stay unpaid regardless of later programs.

## 1. Purpose

When an artist experiences a **verified** CRWN win, use that high-trust moment to make it
frictionless for them to refer another qualified artist.

This is **not** an affiliate programme, a cash referral programme, a leaderboard, a multi-level
scheme, a Virality Engine campaign, or a new acquisition funnel. It is one ask, at one moment,
carrying one link.

## 2. Actor model — five referral systems already exist and none is artist → artist

| System | Referrer | Referred | Attribution carrier | Incentive | Financial rail | Live? |
|---|---|---|---|---|---|---|
| Fan referral | fan | paying fan | `referrals` + cookie | artist-funded commission | `referral_earnings` → fan cashout | yes (0 rows) |
| Clipper | clipper fan | paying fan | `referrals` (`source` discriminator) | rate schedule | same as above | yes |
| Recruiter / partner | recruiter | **artist** | `recruiters.referral_code` → `artist_profiles.recruited_by` | **$50 flat fee + recurring** | `artist_referrals` → `recruiter_payouts` | yes (0 referrals, 5 recruiters) |
| Admin invite | admin | artist | `invite_codes` | none | none | yes |
| Fan Drive (Z11) | artist | paying fan | derived, no new dimension | non-cash badge | none by DB CHECK | yes |
| **Post-Win Referral** | **artist** | **artist** | **`artist_ref` → `_attribution.artistReferrer`** | **none, permanently** | **NONE, by policy** | **yes (V1)** |

**The recruiter row is the trap.** It is the only existing artist-acquisition rail, and reusing it
means inheriting `flat_fee_amount: 5000` — a real $50 obligation written from a Stripe webhook
(`webhookHandlers.ts`). An artist→artist referral must not enter that table in V1.

## 3. The chosen win: `first_paid_conversion`

`src/lib/analytics/paidConversion.ts` is the ONE definition of an artist's first paid fan, and it
is genuinely canonical:

- covers **all six paid rails** (subscription, product, track, booking, live ticket, live tip),
- **deduped per artist** (the first event is the only one that ever lands),
- already carries attribution dimensions,
- emitted from 5+ call sites in `webhookHandlers.ts`,
- is a declared `FUNNEL_STAGES` member.

**Why this win and not another.** Setup completion, Stripe connection and track upload are
*prerequisites*, not realized value: they are CRWN chores, and asking for a referral after a chore
trades on no trust. First paid fan is economically real, observable, memorable and idempotent.

**The honest caveat, and it is not small.** CRWN's ICP is the Independent Empire Builder, who may
already have paying fans elsewhere. "First paid member **on CRWN**" is a proof that CRWN works, not
the first money of their life. The ask must be framed as the former.

## 4. Timing and precedence

```
first_paid_conversion recorded (canonical, deduped)
  → celebration
  → referral ask, ONLY when the pop-up governor allows
  → a genuine fan obligation still outranks it
```

Class: **`celebration`** in the existing Communications Governor taxonomy. Founder policy already
covers the behavior and no new class is needed:
- celebrations coexist with fan obligations in multi-item surfaces,
- celebrations never displace a higher-order interruption,
- no cross-channel cap exists in V1.

A first paid member frequently *creates* a fan obligation. The ask must never appear to say "go
recruit another artist" while a promise is due, and must never be permanently suppressed either:
losing the moment is a deferral, not a cancellation.

## 5. Surface, share UX, destination

- **Surface:** one `PopupDef` in the existing registry. No referral dashboard, no navigation item,
  no new table, no new impression store. Frequency, dismissal, the one-per-day cap and the
  single-winner priority sort all come free from the pop-up engine.
- **Share:** copy a link. One control. No social button grid, no form, no affiliate onboarding.
- **Copy:** truthful to the win, no causal claim ("CRWN got you paid"), no guarantee, no
  "artists like you", no dollar figure.
- **Destination:** the current acquisition journey (calculator → personalized result → builder →
  account), **not** signup. A referred artist is still a prospect who needs to see the value.

## 6. Attribution — LIVE, additive, non-financial

A ninth dimension, `artistReferrer`, was added to `campaignAttribution.ts`, carried on the query
string as **`?artist_ref=<artist slug>`**.

**Deliberately NOT `ref`.** That field means "partner/recruiter code" and flows into
`partner_code_used` / `recruited_by` / `artist_referrals`, whose rows carry `flat_fee_amount: 5000`
written from a Stripe webhook. Overloading it would put an organic share one branch from a
commission obligation. `artist_ref` has no alias and is never populated from `ref`.

**Identity is the artist's public slug.** Already public (it is their page URL), already unique,
already stable, resolvable server-side to exactly one artist. **No token table, no signed payload,
no schema.** The slug is normalized like any other tag, so a hostile value does not survive.

**It rides existing storage end to end**, so every reader inherits it: parsed at landing, stored on
`lead_magnet_results.input_data._attribution` by `/api/lead-magnets/capture`, re-parsed by
`sanitizeStoredAttribution`, first-touch merged by `mergeAttribution`, read back by
`attributionDimsFor` (auto-claim, complete-setup, connectReconcile, paidConversion), and surfaced in
the funnel through the existing JSONB `metadata` bag as `artist_referrer`.

**Two real bugs were found and fixed while wiring it**, both the same shape: `sanitizeStoredAttribution`
and `buildCampaignUrl` each re-parse through `parseCampaignAttribution` via an explicit key map, and
both omitted the new field. The dimension would have been captured and then silently dropped on
every read, and the link would have serialized nothing. **Anything added to `CampaignAttribution`
must be added to those two maps under its query-param name.**

## 7. Collision semantics — additive, never an overwrite

`mergeAttribution` is first-touch and iterates the keys of `EMPTY_ATTRIBUTION`, so the new
dimension inherited first-touch behavior automatically. `artistReferrer` fills **only** the funnel
`metadata` bag: it never populates `campaign`, `video` or `referrer`, which belong to the marketing
attribution contest. An artist who clicks a Post-Win link and later arrives through a tagged video
keeps **both** facts: the campaign that converted them AND the artist who introduced them.

## 8. Incentive: none, and that is the point

No canonical artist→artist incentive exists. **V1 must invent none.** The reason to refer is trust
immediately after realized value, not money. A non-cash V1 also shrinks the abuse surface to
near-nothing: self-referral, duplicate credit and identity loops matter far less when no money
moves.

## 9. Boundaries

- **Virality Engine (22):** artist → *fan participant* → paying *fan*. Different actors, different
  target, different loop. Reuse infrastructure, never ownership.
- **Affiliate/recruiter:** reusing it imports admin approval, commission setup, a partner role,
  payouts and tax. Too heavy for V1, and it drags economics in through the back door.
- **Z3 / Constraint / Manager:** none involved. This is acquisition mechanics after a product win,
  not a recommendation.
- **Not a network effect.** Zero To One states CRWN's network effects are near zero. This is a
  referral loop.

## 10. Measurement

Success is **not** "link copied". Reuse `funnel_events`, which already declares every stage needed:
`account_created → email_verified → setup_completed → first_paid_conversion`. The metric is
**referred artists who reach first paid**, not shares. Same discipline as the calculators: more
top-of-funnel only counts if qualified downstream outcomes follow.

## 11. Production state at ship (2026-08-12, read-only)

| Fact | Value |
|---|---|
| Artists | 9 |
| **Artists with ≥1 active paying member** | **2** |
| `first_paid_conversion` rows | **0** |
| `artist_referrals` / `recruiter_payouts` | 0 / 0 |
| `lead_magnet_results` carrying `_attribution` | **0 of 41** |
| Artist acquisition source | 8 organic, 1 founding |

The trigger population is **two artists**, and the win has never been recorded once.

## 12. What shipped (2026-08-12)

- **Win:** the canonical deduped `first_paid_conversion`, read and never redefined. No
  `post_win_events`, no second activation record. Five webhook rails cannot produce five asks
  because the stage itself dedupes per artist.
- **Ask:** one `PopupDef` (`artist_post_win_referral`), priority **30**, below Stripe (100), first
  broadcast (80) and resume (40). `everyN` 30 days, max 2, on top of the engine's one-per-day cap
  and single-winner sort. A fan obligation or launch blocker simply takes the day, and `everyN`
  keeps the ask eligible afterwards, so losing an interruption is a deferral and never a
  cancellation.
- **Share:** the CTA **copies** the link. This needed one small generic addition to the pop-up
  contract (`PopupCta.copyText`), reusable by any pop-up whose action is "take this with you"
  rather than "go here". The alternative was a whole referral page for one button. It falls back to
  navigation when the clipboard is unavailable.
- **Destination:** `/tools/opportunity-calculator`, never signup.
- **Self-referral:** `isSelfReferral` compares slugs case-insensitively. The stronger guard is
  structural: an artist who already has an account emits no `account_created` event, so following
  any referral link cannot register them as a new acquisition regardless of whose link it was.
- **Measurement:** the existing funnel stages, sliceable by `metadata.artist_referrer`.

**No schema, no new table, no new navigation, no cash, no AI, no new priority engine.**

## 13. Why this shape (options rejected)

**Option A: post-win share ask, no reward.** One win (`first_paid_conversion`), one ask (a
`celebration` pop-up), one share (copy link), one attribution path (a new reporting-only
`artist_referrer` dimension, additive, never overwriting), one quality measure (referred artists
reaching first paid). Rejected: commissions (C), CRWN credit (D) — both invent economics; reusing
the affiliate system unchanged (E) — imports approval and payouts; non-cash recognition (B) — a
badge is still a reward semantic and can wait for evidence.

## 14. Deferred

Rewards of any kind, recognition, leaderboards, ambassador tiers, multi-level referral, a referral
dashboard, adaptive trigger selection, and any cross-artist recommendation layer.
