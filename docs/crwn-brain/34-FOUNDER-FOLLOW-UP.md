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

The canonical scorer's band for the lead's CURRENT evidence must be `sales_priority`.
`rescore.scoreCurrent(identityId)` is the read-only half of `recomputeScore`: the same profile read,
the same behavior loader, the same `scoreLead()`, no writes. It is not a second scorer. The stored
`lead_profiles.score_band` is only a candidate filter and a display column. It moves only when an
event rescores, so it can outlive a fixed normalizer or a phantom recalculation (both happened,
2026-09-29), and a lead whose live band has dropped resolves to `not_qualified`. The admin row shows
"stored X, live Y" when they disagree. There is no score threshold and no second formula anywhere in
the follow-up files (a scan test, mutation-proven). Admin accounts and founder-test artists
(`profiles.role = 'admin'`, `artist_profiles.is_founder_test`) resolve to `internal_account` and are
never emailed.

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

## "Email their numbers": the hand-pressed link with the VSL under it (2026-10-03)

Founder ask: "email people a link that shows their numbers with the VSL right up under the link."
Not a stage and not automated. `/admin` -> Acquisition -> **Leads** tab: every DM lead with a
saved result and a consented email has an **Email their numbers** button (any band, not only
sales_priority). It sends from Josh (`FOUNDER_FROM`, replies to him): greeting, one line, a gold
"See my numbers" button to a freshly minted link to their saved result, and DIRECTLY under it the
calculator VSL poster (`CALCULATOR_VSL`) linking to `/watch/vsl-calculator?tool=&result=`, so the
watch page's button continues their own calculator. Copy: `src/lib/acquisition/numbersEmail.ts`
(pure); send: `numbersEmailServer.ts`; action `email_numbers` on `/api/admin/acquisition`.

- **It never quotes the headline.** Real stored headlines include "About $0 a month is sitting on
  the table". The page shows the number with its assumptions; the email only gets them there.
- **The request carries a result id, a pointer.** The recipient comes from that row's own
  `lead_session_id` -> `lead_identity_id`, never from the request. A web-only result is refused
  (`no_dm_result`); web captures already get the nurture sequence, which carries the VSLs.
- **Refuse BEFORE rotating.** Only a token hash is stored, so minting a link kills the lead's
  previous one. `emailBlockedReason` (channels.ts) asks every question `send()` would ask (opt-out,
  consent, caps, suppression) first, so a refusal leaves their DM link working. Pinned and
  mutation-tested in `numbersEmail.test.ts`, together with "nothing between the link and the video".
- **Not transactional.** The lead did not ask for this email now, so the 24h and lifetime caps
  apply and the send counts toward them. A second press the same day answers "already got a CRWN
  message in the last 24 hours". Audited in `agent_action_log` as `acquisition_email_numbers`.

## Provenance: "did this artist actually tell us this?" (2026-09-29)

A WORTH DM asks two questions (monthly listeners, then "have your fans ever paid you directly?").
Both answers are the artist's own typed words: `lead_conversation_messages` keeps the inbound text,
`lead_answers` the raw value, and `lead_profiles.field_provenance` records each field's source
(`deterministic` = their words through the alias rules). The scorer only ever reads `lead_profiles`,
so the fields CRWN fills for the calculator (`social_followers`, `streaming_revenue_cents`) never
reached a score.

What did lose provenance was the calculator row. The result page's debounced auto-save fired on
FIRST RENDER, so opening a result wrote the form's empty fields into `input_data` as `0`, stamped
`recalculated_at`, and earned the scorer's `engaged_with_result` (+4). In production that was 30 of
30 recorded recalculations; none was a real edit. Fixed three ways, none of which rewrites history:

- The page posts only after a change from the values it opened with.
- `/api/lead-results/[token]/recalculate` is a no-op when the modeled numbers did not change
  (`inputsChanged` in `inputProvenance.ts`), so a cached old page cannot fake it either. A real edit
  records `_provenance` inside `input_data` and `direct_answer` in `field_provenance` for exactly the
  fields that moved.
- The scorer's behavior loader counts a recalculation only if `original_input_data` and `input_data`
  differ, so the 30 historical phantoms stop counting on the next read.

New DM results carry `input_data._provenance` (`user_explicit`, `system_default`, `derived`,
`enriched_verified`, `unknown`, and so on) in both snapshots. A row without it reads `unknown` for
every field, never `user_explicit`. The draft save (`PUT /api/opportunity-drafts/[token]`) rebuilds
`input_data` keeping only `_attribution`, so a draft-saved row degrades to `unknown`, which is the
safe direction.

Result-page language (not changed here): with no streaming income given, the worth result labels
an ESTIMATE from monthly listeners "What streaming pays you now" and the DM summary says "Streaming
currently pays you about ...". That reads as a figure the artist supplied. Follow-up item.

**Evidence matrix (current weights unchanged):**

| Signal | Weight | Can come from | Provenance-aware today? | Risk if assumed data counted |
|---|---|---|---|---|
| Monetization (`direct_monetization_proven` at 30+) | 40 | DM answer (alias or Claude), web calculator answer | yes, `field_provenance` | the largest lever; one misread is a band change |
| Audience (`tier1_audience`) | 25 | DM answer, a real recalculation edit | yes | low: CRWN never fills a nonzero default |
| Engagement | 20 | Claude extraction from DM text | yes (`claude_extraction`) | medium: inferred, not said |
| Catalog | 15 | DM answer or extraction | yes | low |
| Behavior | 20 | observed rows (view, claim, setup, recalculation) | observed, not asserted | was fabricated by the phantom recalculation; fixed |
| Founder-verified research | none | nowhere | no field exists | an artist the founder KNOWS sells merch scores as "no sales evidence" |

Recommended, not built (founder decision): a `founder_verified` FieldSource that the admin can set
on a lead field with a note and date, ranked above `direct_answer` in `TRUST_RANK`, so verified
research can count without ever being quoted back to the artist as something they said.

## Monetization answers: NEGATION IS RESOLVED BEFORE POSITIVE INTENT MATCHING

`fieldRegistry.ts` `negatedValue`: the answer is split into clauses (punctuation, "but / though /
except", and a following "just / only" phrase), and the ordered alias rules only see clauses with no
negation cue. Nothing positive plus a negated clause resolves to `none`; mixed evidence keeps its
positive half ("I don't have memberships but I sell merch" becomes `merch_only`). Before this, first
match over the whole sentence stored "I have no paid program or subscriptions" as `direct_some`
(the bare "i have" rule) and "I don't have anyone of Patreon etc" as `direct_some` ("patreon").
`drops?` became `drops` ("when I drop everything" is a release, not a sale). Tests:
`answerNegation.test.ts` (mutation-proven).

Stored rows are corrected only through `renormalize.ts`, from the admin Founder tab ("Check stored
answers", then "Apply"). It touches only values the deterministic normalizer wrote, only from the
retained raw text, and only when the current normalizer returns a non-null different value. Each
write is guarded on the value it planned from, records `renormalized.from` in `field_provenance`,
and rescores through `recomputeScore`. A null re-read is left for a human.

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

2026-09-29, second pass: Anthony's two answers were his own typed words ("700,000"; "I have no paid
program or subscriptions"). His stored `direct_some` was the negation misread and his
`engaged_with_result` was the phantom recalculation. Canonical scorer on current evidence: 71
sales_priority with the misread answer, 27 nurture once it is corrected (`reach_without_proof`,
because CRWN stores no evidence of his merch). His draft quotes only observed setup facts and is
unchanged.

2026-09-29, @anthony_b_originalfireman resolved to `setup_incomplete` (tiers priced, Stripe live,
one product, no music, Launch not pressed), `wait` until 2026-09-30 10:53 UTC because a platform
sequence email reached him 2026-09-28. The draft was handed to Josh to send by hand; flag off.
