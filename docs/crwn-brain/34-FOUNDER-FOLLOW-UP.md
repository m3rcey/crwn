# 34 · Founder follow-up for qualified leads

Built 2026-09-29. Code: [src/lib/acquisition/founderFollowUp.ts](../../src/lib/acquisition/founderFollowUp.ts)
(pure resolver + templates), [src/lib/acquisition/founderFollowUpServer.ts](../../src/lib/acquisition/founderFollowUpServer.ts)
(loader, admin read, hand-sent marker, daily runner). Tests:
[founderFollowUp.test.ts](../../src/lib/acquisition/founderFollowUp.test.ts).

## What it is

One short, contextual email in Josh's name to a lead the scorer already treats as founder-level,
written for **where that artist actually is** in CRWN right now, with one link that continues
their own journey. It is not a sequence, not a drip and not an AI writer. It is one deterministic
resolver and a handful of fixed templates with verified merge fields.

## Who qualifies

`lead_profiles.score_band = 'sales_priority'`, as stored by the canonical scorer
(`leadScoring.ts`, recomputed by `rescore.ts`). That is the ONLY qualification input: no score
threshold, no second formula. The band already encodes the ICP (Tier 1 audience AND proven direct
sales, or a booked call, or total >= 70). A boundary test fails if either follow-up file imports
the scorer, reads a raw metric, or compares a score to a number (mutation-tested).

Web calculator leads with no `lead_identities` row carry no stored band. They are covered by the
immediate call request (`/api/lead-magnets/call-request`), not by this system.

## The stages (first match wins)

| Stage | Evidence (canonical owner) | Email | Link |
|---|---|---|---|
| `not_qualified` | band is not sales_priority | none | |
| `first_paid` | `funnel_events` `first_paid_conversion` for the artist (paidConversion.ts) | **none, ever** (different lifecycle) | |
| `call_booked` | `acquisition_events` `sales_call_booked`, status `recorded` | none (a human owns it) | |
| `call_requested` | `hot_lead_call_requested` whose snapshot names one of the lead's results | "about the call you asked for" | Cal.com link carrying the lead id |
| `setup_incomplete` | account, `artist_profiles.setup_completed = false`; screen from `setupProgress.ts` | names what is done, then the ONE missing piece | `/setup` (resumes on that screen) |
| `offer_not_payable` | setup done; no paid tier, or `tierPurchaseBlocker` blocks every paid tier (paymentReadiness.ts) | "fans cannot pay you on CRWN yet" | `/profile/artist` (Rise Mode resolves the fix) |
| `ready_no_first_paid` | a purchasable paid tier, no first paid | "ready for member number one" | `/profile/artist` |
| `builder_saved_no_account` | newest result has `input_data.deliverableValues`, no account | "your plan is still saved" | a freshly minted result link |
| `result_no_account` | a result, no account | "your result is still saved" | a freshly minted result link |
| `no_result` | qualified mid-DM, no result yet | none | |

`setupProgress.ts` is the per-screen rule the wizard itself uses (the page delegates to it), so
the screen the email names is the screen `/setup` opens on. A test pins the page's screen order
to it.

## When it sends (the daily runner)

Hosted by the acquisition dispatcher on the existing `platform-crm` cron (05:00 UTC, once a day).
No new cron. Gated by `admin_settings.founder_followup` (fails CLOSED; absent = off). Flip:
[supabase/founder-followup-flag-on.sql](../../supabase/founder-followup-flag-on.sql).

A lead is emailed only when ALL hold:

- the stage has never been sent (see dedupe);
- 48h since their last action (DM, result view, recalculation, claim, signup, setup step, tier,
  track, product, Stripe, call request), so an active conversation or a lead mid-progress is left alone;
- 48h since any other CRWN email to them (acquisition sends, platform sequences);
- 7 days since the last founder follow-up (any stage);
- pre-signup only: no acquisition nurture job still queued (that sequence finishes first);
- email eligible (below).

**Stale copy is impossible by construction.** Nothing is queued. Each run resolves the lead's
current state and writes the email for that state at the moment of sending. An artist who signed
up yesterday resolves to `setup_incomplete` today and can never receive "open your result".

## Eligibility and suppression

- `lead_identities.consent_email` (the acquisition engine's per-channel email consent), status not
  `opted_out`/`disqualified`, address present, not in `email_suppressions` (unsubscribe, hard
  bounce, spam complaint).
- Unsubscribed / suppressed / opted out / disqualified: `none`. Not even a hand-send suggestion.
- No address or no email consent: `manual_only`. The draft is shown; nothing automated sends.
- `channels.send()` re-checks consent, status, the 24h + lifetime caps and suppression at send
  time, and adds the one-click unsubscribe (`/api/acquisition/unsubscribe`, which writes the
  suppression AND clears consent) plus the postal address footer.

## Dedupe

Key: `send:founder_followup:v1:<lead_identity_id>:<stage>` on `acquisition_events.idempotency_key`,
which has a unique index. `channels.send()` inserts the key BEFORE calling Resend (insert-as-claim),
so a cron retry, an overlapping run, a rescore or a replayed webhook cannot send the same stage
twice. Progression to a new stage is a new key, so a lead can hear from Josh once per stage.
A failed provider call leaves the key `skipped` (a known property of `claimSend`): it is never
retried, which errs toward silence. Bumping `FOUNDER_FOLLOWUP_VERSION` allows one more note per
stage; never bump it casually.

No schema change. The existing table already stores lead, key, status, timestamps, error and
metadata.

## Sender

`FOUNDER_FROM` = `Josh at CRWN <hello@thecrwn.app>`, `replyTo` = Josh's Gmail
(`ADMIN_NOTIFY_EMAIL`). This is the founder identity the new-artist welcome already uses, on the
authenticated thecrwn.app domain. There is no josh@thecrwn.app mailbox and no Gmail integration;
sending FROM the Gmail address through Resend would fail DMARC. If Josh wants mail to come from
his actual mailbox (and sit in his Sent folder), that is a new Gmail OAuth integration and a
founder decision, not a setting.

## Admin

`/admin` -> Acquisition -> **Founder** tab: every sales_priority lead with stage, blocker, last
action, decision and why, when a wait lifts, what was already sent for this stage (and its
delivery result or error), and the exact draft. "Copy draft" for Gmail; **"I sent this by hand"**
claims the same dedupe key (re-derived server-side, audited in `agent_action_log`), so the
automation never repeats a note Josh already sent.

## What it deliberately does NOT do

- It never quotes `monetization_status` or any other normalized DM answer back to the artist.
  A normalizer can be wrong (found 2026-09-29: "I have no paid program or subscriptions" matched
  the bare "i have" alias and was stored as `direct_some`). It never states merch, tour, fan,
  catalog, team, label or platform facts. It only names things the artist created or saw in CRWN.
- It never scrapes, never calls a model, never infers a fact from absence.
- It never emails a converted artist or someone with a booked call.
- It is an acquisition/activation note, classified MARKETING in doc 30 (consent-gated,
  unsubscribe, suppression).

## Validation record (one-time, not a rule)

2026-09-29, @anthony_b_originalfireman resolved to `setup_incomplete` (tiers priced, Stripe live,
one product, no music, Launch not pressed), `wait` until 2026-09-30 10:53 UTC because a platform
sequence email reached him 2026-09-28. The draft was handed to Josh to send by hand; flag off.
