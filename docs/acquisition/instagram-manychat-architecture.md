# Instagram → ManyChat → CRWN Acquisition Engine — Architecture

> Companion docs: `instagram-manychat-acquisition-audit.md` (what already existed and why the
> design is shaped this way), `manychat-setup-guide.md` (how to configure it),
> `acquisition-deployment-checklist.md` (how to ship it).

---

## The one-sentence version

Instagram carries the conversation, ManyChat carries the messages, **CRWN makes every
decision**, and Claude helps CRWN read messy human text. Nothing else is true of this system.

---

## Flow

```
Instagram comment ("WORTH")
   │
   ▼
ManyChat  private reply → DM opt-in → External Request
   │  POST /api/integrations/manychat/webhook     header: x-webhook-secret
   ▼
┌──────────────────────────────────────────────────────────────┐
│ THE ONE DOOR                                                 │
│  verifyManyChatRequest()   fail-closed, timing-safe          │
│  isAcquisitionEngineEnabled()   kill switch → 503            │
│  validateInbound()         hand-rolled, bounds every field   │
│  checkRateLimit(contact)   20/min per contact                │
│  claimEvent(event_id)      insert-as-claim; 23505 = replay   │
└──────────────────────────────┬───────────────────────────────┘
                               ▼
                        orchestrate()
   1. storeRawAnswer()        ── BEFORE any AI sees it
   2. normalizeDeterministic() ── "40k" → 40000, no model call
   3. loadProfile()           ── never ask what we already know
   4. decide()                ── Claude, ONLY if step 2 failed
   5. validateDecision()      ── drop unknown fields/routes/tools
   6. applyValues()           ── trust ordering: a guess never beats a fact
   7. stateMachine.nextState() ── CRWN decides; Claude only suggested
   8. generateAndStore()      ── calls the EXISTING calculator
   9. enqueue()               ── side effects never block the DM
                               ▼
        thin JSON  { action, message, question_key, result_url }
                               ▼
              ManyChat sends the DM + the result link
                               ▼
      /tools/[slug]/result/[token]   server-rendered, token-only URL
                               ▼
      /claim/[token] → verified Supabase session → link → /setup or Rise Mode
```

---

## The five load-bearing decisions

### 1. Claude cannot produce a number that reaches a result

Not "is told not to". **Cannot.** Three independent mechanisms:

- `fieldRegistry` marks every money field `aiExtractable: false`. There is no key Claude
  could write revenue into.
- `decisionSchema.validateDecision()` drops any `extractedFields` key that is not in the
  AI-extractable allowlist.
- `progressiveProfiling.applyValues()` rejects a `claude_extraction` write to a
  non-extractable field a second time.

Every number in a stored result came out of `resultGenerators.ts` or `leadCalculator.ts`,
unchanged. Claude's job is to turn "I got like 40k monthly but nobody buys anything" into
`{monthly_listeners: 40000, primary_blocker: 'audience_wont_pay'}`. That is all.

### 2. The deterministic fallback is a complete path, not a stub

`fallbackDecision.ts` can run the entire conversation with no model at all: it asks for the
first missing required field, then the next, then generates the result. So:

- `ANTHROPIC_API_KEY` unset → works
- Anthropic down → works
- Claude returns garbage → validation drops it → works
- Request times out → works

Claude is an **upgrade**, not a dependency. This is why a provider outage cannot destroy a
lead session.

### 3. An Instagram identity is evidence, never authorization

`identityResolution.ts` merges leads on provider-assigned identifiers (ManyChat contact id,
Instagram user id) and on **verified** emails. It never merges on a username, a display name,
or an email someone merely typed into a DM.

The webhook cannot set `user_id` on a lead identity. Only `resultAccess.claimResult()` can,
and only after `supabase.auth.getUser()` returns a verified session on the server. The claim
route ignores any user id in the request body, because accepting one would make it an account
takeover endpoint.

### 4. Trust ordering, enforced in one place

```
verified_crwn (5) > verified_contact (4) > direct_answer (3)
    > deterministic (2) > claude_extraction (1) > provider_metadata (0)
```

Strictly greater wins. A Claude guess cannot overwrite a value the artist typed, and neither
can overwrite what their real CRWN profile says. Enforced in
`progressiveProfiling.applyValues()`, tested in `acquisition.test.ts`.

### 5. Replay is bounded by idempotency, not prevented by signatures

**ManyChat cannot HMAC-sign a request.** Its External Request sends custom headers and
nothing more. So the webhook uses a shared secret (fail-closed, timing-safe, the same pattern
as `new-artist-hook`), and replay is handled one layer down: `acquisition_events` has
`UNIQUE(idempotency_key)`, claimed by INSERT. A replayed delivery returns the **original
cached response** and does zero work.

This is stated plainly rather than dressed up. A captured request can be resent; it is a
no-op. An attacker holding the secret can write junk leads; they cannot read anything, because
the response payload has no field that could carry PII (see `responseMapper.ts`), and they
cannot touch an account.

---

## Data model

| Table | Purpose |
|---|---|
| `lead_identities` | One human across many IG touches and tools. Provider ids unique where present. |
| `lead_sessions` | One journey. The state machine's row. One OPEN session per (identity, tool). |
| `lead_answers` | **Append-only.** A correction supersedes; it never overwrites `raw_value`. |
| `lead_conversation_messages` | Minimal transcript, retention-bounded, admin-read only. |
| `lead_profiles` | Typed columns + per-field provenance. Money in integer cents. |
| `lead_score_history` | Every score, with its components. A score is always explainable. |
| `acquisition_events` | Idempotency claim + outbox + analytics, one table. |
| `acquisition_campaigns` | Per-campaign kill switch. |
| `lead_magnet_results` | **EXTENDED, not duplicated.** Hashed tokens, immutable original inputs. |

Every new table: RLS enabled, no client write policy, admin SELECT, self-read only via your
own linked identity. Conversation content is **admin-only** even for the claimed user: there
is no product reason to give an artist an API to re-read their own Instagram DMs from CRWN,
and it would be a fresh PII egress path.

---

## What is NOT built (phase 2, named so it is not mistaken for an oversight)

- **Admin acquisition panels.** The API routes and the audit trail land now so the data is
  complete from day one. The UI to read it follows.
- **Duplicate-merge tooling.** There are zero leads to merge. Building a merge UI before the
  first lead exists is automating something that should not yet exist.
- **SMS channel.** The provider interface exists in `channels.ts` with a **disabled safe
  adapter** (`sms_channel_disabled`). A cold Instagram lead has no phone and no SMS consent,
  so the channel would reach nobody while adding a live compliance surface. Enabling it later
  requires no restructuring.
- **Duplicate-merge tooling.** Zero leads to merge.

## Follow-up automation (BUILT)

`automationDispatcher.ts`, **piggybacked on `/api/cron/platform-crm`** (`0 5 * * *`). No new
`vercel.json` entry: 25 already exist and the hourly slots are full. Fully wrapped in a
try/catch, because a guest in someone else's cron must never break its host.

| Trigger | When | Channel |
|---|---|---|
| `session_abandoned_nudge` | open session idle 48h, **and no result yet** | DM, then email |
| `result_not_viewed_check` | 24h after the link was sent, still unopened | DM, then email |
| `result_viewed_not_claimed` | 48h after first view, still unclaimed | DM, then email |
| `personal_nudge` | +2d. Automated, and honest about being automated | DM, then email |
| `offer_call` | +3d. Offers **both** paths and lets her choose. Hands off to the tool drip | DM, then email |
| `tool_spotlight` | +5d each after `offer_call`. One CRWN tool per email (what/why/how/tool), in registry order, until all are introduced | DM, then email |
| `call_booked` | Cal.com `BOOKING_CREATED` | DM, then email |
| `call_no_show` | **only when Josh confirms it in admin** | DM, then email |
| `call_no_show_second` | +2d after that | DM, then email |
| `call_no_show_final` | +5d. The breakup, then CRWN stops for good | DM, then email |
| `high_intent_alert` | score band hits `sales_priority` | email to the founder |

A session that already produced a result is **completed**, not abandoned. The artist got what
they came for; nagging them about "finishing" is how you make a good outcome feel like a bug.

### Every DM ends with a question. That is infrastructure, not style.

Meta's 24-hour messaging window reopens **every time she replies**. A DM ending in a link she
ignores lets the window close, and once it closes CRWN can never message her again. A DM ending
in a question she answers buys another 24 hours. The question is what keeps the channel alive,
so it is enforced by a test, not by a habit.

### The cancellation rule

Checked before **every** outbound message: a lead who has converted (booked a call, or claimed
an account) **exits the nurture funnel entirely**. Not "gets fewer messages": exits.

One automated "you never opened your numbers" landing while she is in a Zoom with Josh undoes
everything the conversation just built. `hasConverted()` is the guard, and it filters on
`status = 'recorded'` so that a **cancelled** booking correctly un-converts her (she told us she
is not coming; responding by going permanently silent would be the wrong read).

## Booking detection: `/api/integrations/calcom/webhook` (BUILT)

Cal.com **can** HMAC-sign, unlike ManyChat, so this route verifies a real `x-cal-signature-256`
against the **raw body** and fails closed. Without `CALCOM_WEBHOOK_SECRET` set, every request is
rejected, no booking is ever detected, and the cancellation rule above never fires.

**The lead id rides through the booking URL** (`?metadata[crwn]=<uuid>`, added by
`bookingUrlFor()`). Email is not a usable join key: an Instagram lead has no email on file, and
she may type a brand new one into Cal.com. Email is only a fallback, and only on an exact single
match. **A booking never creates or merges an identity** — anyone can type anyone's address into
a booking form.

`parseCalBooking()` hunts for the UUID recursively rather than asserting a path, because Cal.com
moves custom values between `metadata`, `responses` and `bookingFieldsResponses` across versions.
That is the ManyChat lesson applied: bend to what the other system actually sends. A booking with
no id is recorded as `sales_call_unattributed` for Josh to link by hand, never guessed at.

### A no-show is CONFIRMED, never inferred

The ladder fires on a **human's verdict**, from either of two places, which write the same
idempotency key so using both cannot double-send:

1. Josh ticks **No-show** on the booking in Cal.com (`BOOKING_NO_SHOW_UPDATED`). Un-ticking it
   is the undo and cancels every unsent rung.
2. Josh clicks **No-show** in `/admin` → Acquisition → **Calls**.

Cal.com also offers an `After guests didn't join cal video` trigger on a 5-minute timer. **We do
not subscribe to it.** "Has not joined yet" is not "did not show up", and an artist who joins at
minute 7 would receive "sorry we missed you" while she is on the call. The flag is read from the
**attendee**, never from `noShowHost`, which means the *founder* missed it. A missing flag parses
to `null`, and null never fires the ladder: defaulting it to `true` would turn every booking into
a no-show.

Sending "sorry we missed you" to an artist who *did* turn up, and had a good conversation, is
humiliating and unrecoverable. An unsent message costs nothing; a wrong one costs the artist. So
the one step in this funnel that stays manual is the one where being wrong is worst.

The ladder itself gets **lighter**, not heavier: a warm no-guilt DM within the day, a second at
+2d naming the money, then a clean breakup at +5d that offers to take her off the list. Then the
lead moves to `nurture` and CRWN stops. A funnel that will not take silence for an answer is not
persistent, it is a nuisance.

### The channel ordering is arithmetic, not preference

**Instagram DM first, email second.** A cold Instagram lead almost never gave us an email,
because we never asked for one. The DM is the channel that exists; email is a bonus when they
happen to have signed up. An email-only nurture would reach nearly nobody.

### Meta's 24-hour window is real and we do not route around it

Instagram permits a business to message a user for 24 hours after that user's last
interaction. Outside it, Meta rejects the send. So `outside_messaging_window` is classified
**terminal, not retryable**: the window reopens when the artist messages us, not on a timer.
Retrying it nightly forever is not persistence, it is how an app gets flagged. If
`MANYCHAT_API_TOKEN` is unset the DM channel is a **disabled adapter** that reports
"not configured" honestly instead of silently dropping the send.

### Retry policy

- **transient** (network, 5xx): exponential backoff in days (the host runs daily, so retrying
  sooner is pointless), capped at `max_attempts`, then `dead_letter`.
- **terminal** (no consent, no email, capped, Meta's window shut, opted out): stop
  immediately, `status='skipped'`. Nothing about these changes on a timer.

### Guardrails

One outbound message per lead per **24h**, **4 per lead ever**. Consent is checked per
channel (consent to a DM is not consent to a mailing list). The existing global
`email_suppressions` table is honored, so a bounce recorded anywhere in CRWN stops acquisition
email too. Every send is claimed by a unique idempotency key before dispatch, so two
overlapping dispatcher runs cannot double-send.

### Retention (BUILT)

`lead_conversation_messages` older than **90 days** have their `content` blanked and
`redacted_at` stamped. The event skeleton survives for analytics; the literal text a stranger
typed into Instagram three months ago does not.

## Still not built

- **Admin acquisition panels.** The API routes and the audit trail land now so the data is
  complete from day one. The UI to read it follows. Dead-lettered rows are visible today with
  `SELECT * FROM acquisition_events WHERE status = 'dead_letter'`.
- **Auto-claim through the signup funnel is SOLVED**, but not the way the brief assumed:
  `/signup` still ignores `?next`. Instead `ClaimRedeemer` (mounted in `(main)/layout.tsx`
  after both gates) redeems the token from `localStorage` once the artist lands in the app.
  `/welcome` and `useAuth` were deliberately not touched.

---

## Cron

**No new cron entry.** `vercel.json` already has 25 and nearly every hour slot 0-23 is taken.
The house pattern is to piggyback (`cron/sequences/route.ts:20` does exactly this for calendar
reminders). The acquisition dispatcher will hang off `/api/cron/platform-crm` (`0 5 * * *`),
which is semantically its home: that cron already IS CRWN's own artist-acquisition pipeline.

---

## Files

```
src/lib/acquisition/
  types.ts                 the contracts. Read this first.
  fieldRegistry.ts         SECURITY BOUNDARY. What Claude may write.
  stateMachine.ts          pure. CRWN decides.
  decisionSchema.ts        SECURITY BOUNDARY. Prompt-injection blast door.
  claudeDecisionService.ts cannot throw, cannot return an invalid decision
  fallbackDecision.ts      the complete no-model path
  identityResolution.ts    evidence, not authorization
  progressiveProfiling.ts  trust ordering
  toolAdapters.ts          the bridge to the 5 EXISTING lead magnets
  resultGeneration.ts      calls the existing engines; never computes
  leadScoring.ts           deterministic, explainable, Claude-bounded
  orchestration.ts         the deterministic order
  eventOutbox.ts           insert-as-claim idempotency
  db.ts                    the service-role client + kill switch
  prompts/leadDecision.ts  the system prompt + untrusted-data wrapper

src/lib/manychat/          verifyWebhook, schemas, responseMapper
src/lib/leadResults/       resultToken (opaque, hashed), resultAccess (claim)
src/lib/ai/anthropicClient.ts
src/lib/quests/destinationRegistry.ts   Claude picks an ID, CRWN picks the URL

src/app/api/integrations/manychat/webhook/route.ts   THE ONE DOOR
src/app/api/lead-results/[token]/claim/route.ts      the claim
src/app/(public)/tools/[slug]/result/[token]/page.tsx
src/app/claim/[token]/page.tsx

supabase/schema-phase2-instagram-acquisition-engine.sql
```

The five existing lead magnets are **not modified**. Not one line of `resultGenerators.ts`,
`leadCalculator.ts`, `WorthExperience.tsx`, or `leadMagnets/registry.ts` changes.
