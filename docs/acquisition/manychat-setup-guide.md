# ManyChat Setup Guide

> **This guide was rewritten from a WORKING integration on 2026-07-14.** The previous version
> was written from assumption, not from doing it, and it was wrong in five separate places.
> Every step below has been executed against the live ManyChat UI and a live CRWN webhook.
>
> If a step here contradicts your instinct, trust the step. Most of these were discovered the
> expensive way.

---

## 0. Read this first: the traps

Six things will waste hours if you do not know them. They are not obvious, they are not in
ManyChat's docs, and none of them fail loudly.

### Trap 1 — ManyChat **Pro** is mandatory ($39/mo)

Not Essential ($17). **Both** features CRWN needs are Pro-and-above:

| Feature | What it does | Plan |
|---|---|---|
| **External Request** | ManyChat calls CRWN. Without it, the engine never receives a single event. | **Pro** |
| **API key** | CRWN DMs the lead back. Without it, follow-up reaches nobody. | **Pro** |

Essential advertises "unlimited custom automations". That means unlimited *flows*, not
outbound HTTP. It **cannot reach CRWN at all.**

### Trap 2 — "Start From Scratch" is a dead end

It gives you the **Basic Builder** (a.k.a. Quick Automation): a fixed, link-only template with
an opening DM, two toggles, and "a DM with a link". **There is no way to add an action, and no
way to switch builders from inside it.** The ⋮ menu offers only "Delete".

**External Request lives ONLY in the Flow Builder**, and the only way in is to pick a template
that is **labelled `Flow Builder`** on its card. See step 3.

### Trap 3 — the `Contact Id` pill does not resolve

ManyChat's **Contact Id SYSTEM field**, inserted into an External Request body, sends the
**literal string `"Contact Id"`**. It does not substitute. System-field pills are not clickable
and have no options.

**Use `+ Add Full Contact Data` instead.** It works, and it carries everything.

### Trap 4 — pills cannot be typed

A pill is an **object inserted by the picker at your cursor**. Typing `{{contact_id}}`,
`<Contact Id>`, or `[Contact Id]` produces a plain string that ManyChat never substitutes.

CRWN now **rejects** unresolved placeholders with a 400 rather than accepting them, because
accepting one would have merged every lead in the funnel into a single identity. Silently.

### Trap 5 — an EMPTY custom field renders as `{{cuf_NNNN}}`

Not as an empty string. As its raw internal token. So a field that failed to populate arrives
at CRWN looking like a perfectly good non-empty value. CRWN rejects these too.

### Trap 6 — comments do not create contacts. DMs do.

Meta only forwards **direct messages** to ManyChat. A comment reaches ManyChat only via a
**live** comment-trigger automation. So you cannot create a test contact by commenting.

**DM the connected account from a different Instagram account.** The contact appears instantly,
with no automation live.

---

## 1. Prerequisites

- [ ] **ManyChat Pro** (see Trap 1)
- [ ] **Instagram Professional account** (Business or Creator) **linked to a Facebook Page you
      admin**. If Instagram does not appear as a connectable channel, this is why.
- [ ] Instagram app → **Settings → Messages and story replies → Message controls →
      "Allow access to messages" = ON.** Without it ManyChat is connected but deaf.
- [ ] **ManyChat → Settings → Channels → Instagram → Connect**

## 2. CRWN side (do this first)

1. **Run the migration** in the Supabase SQL editor:
   `supabase/schema-phase2-instagram-acquisition-engine.sql`
2. **Vercel env vars**, then **redeploy** (env vars do nothing until you do):

   | Var | Required | Where from |
   |---|---|---|
   | `MANYCHAT_WEBHOOK_SECRET` | **YES** | `openssl rand -hex 32`. **Save it** — you need it in ManyChat too, and if you mark it Sensitive, Vercel will never show it to you again. |
   | `MANYCHAT_API_TOKEN` | **YES** for follow-up | ManyChat → Settings → API → **Generate Your API Key** |
   | `ANTHROPIC_API_KEY` | Strongly recommended | console.anthropic.com |

3. **Verify:** `/admin` → **Acquisition**. The config strip must be **all green** with a
   **DARK** badge. It reports presence only, never values.

**Leave the engine DARK.** Being dark is a *testing asset*: a correct request returns
`503 engine_disabled`, which proves your URL, secret, and body are right **without writing a
single row.** A wrong body returns `400` with an `error_code` that names the field.

## 3. Create the automation — in the FLOW BUILDER

1. **Automation → + New Automation**
2. **DO NOT click "Start From Scratch"** (Trap 2)
3. In the template dialog, filter **By trigger → Post or Reel comment**
4. Pick a template whose card says **`Flow Builder`** at the bottom (not `⚡ Quick Automation`).
   **"Sell from Reel comments"** works.
5. You should land on a **visual canvas** with draggable nodes. If you see a
   "When someone… / They will get…" form instead, you are in the Basic Builder. Go back.

**Delete every node the template ships with.** Keep only the trigger.

## 4. Configure the trigger

- **When someone comments on:** `any post or reel` (works on every Reel, not just one)
- **And this comment has:** `worth, WORTH`
- **Reply to their comments under the post:** ON. e.g. "Check your DM!"

## 5. Custom fields

**Settings → Custom Fields → + New Custom Field.** All type **Text**. Exactly five:

| Field | Holds |
|---|---|
| `crwn_action` | What ManyChat should do next |
| `crwn_message` | The message to send her |
| `crwn_question_key` | Which question she is answering |
| `crwn_result_url` | Her personalized result link |
| `crwn_session_id` | CRWN's session reference (debugging) |

**Do not create a field for her answer.** ManyChat's Full Contact Data already carries
`last_input_text` = the last thing she typed, and CRWN reads it from there. Every pill you do
not create is a pill that cannot silently fail to resolve.

**Never put in a ManyChat custom field:** her email, her phone, monthly listeners, revenue,
lead score, segment, blocker, any CRWN database id, or the raw result token. ManyChat is a
third party and its fields are visible in its UI. The CRWN response payload deliberately
contains none of these.

---

## 6. The flow

Five nodes. Build them in this order.

```
Trigger (comment: worth/WORTH)
   ↓
[1] Send Message  ── As private reply
      "Want to see how much you're missing out on per month?"
      [ Send me the link ]  ← button
   ↓
[2] Actions → External Request   (event_type: session_start)
   ↓
[3] Send Message  ── Within messaging window
      Data Collection block: asks {{crwn_message}}, WAITS for her reply
   ↓                                                        ▲
[4] Actions → External Request   (event_type: answer)       │
   ↓                                                        │
[5] Condition:  crwn_action  is  send_result                │
      NO  ──────────────────────────────────────────────────┘  (re-ask)
      YES ↓
    Send Message: {{crwn_message}}
      [ See My Numbers ] → Open website → {{crwn_result_url}}
      (no next step — this branch ends)
```

### Node 1 — the opening DM

- **Send:** `As private reply` ← **required.** This is Meta's comment→DM mechanism. Get it
  wrong and the DM never sends.
- **Text:** `Want to see how much you're missing out on per month?`
- **+ Add Button** → label `Send me the link`. Click **Done without picking an action**, then
  drag its output circle to node 2 on the canvas.

Her tap is the Meta-required interaction **and** CRWN's consent gate. Everything hangs off it.

### Node 2 — External Request (session_start)

`+` → **Actions** → **+ Action** → **External Request**

**Method:** `POST`
**URL:** `https://thecrwn.app/api/integrations/manychat/webhook`

**Headers tab:**

| Key | Value |
|---|---|
| `Content-Type` | `application/json` |
| `x-webhook-secret` | your `MANYCHAT_WEBHOOK_SECRET` (the 64-char hex) |

**Body tab.** Clear it completely, then:

1. **Paste** (ends with a colon, no quote):
   ```
   {"event_type":"session_start","lead_magnet_id":"worth","keyword":"WORTH","consent_dm":true,"contact":
   ```
2. **Click `+ Add Full Contact Data`** — the pill drops in at the cursor. **No quotes around
   it**; it is an object.
3. **Paste:** `}`

If the pill lands on its own line, **that is fine** — whitespace beside an object value is
legal JSON. (A newline *inside* a string is not, which is why the old `Contact Id` approach
kept breaking.)

**Response mapping tab** — five rows:

| Response key | → | Custom field |
|---|---|---|
| `action` | → | `crwn_action` |
| `message` | → | `crwn_message` |
| `question_key` | → | `crwn_question_key` |
| `result_url` | → | `crwn_result_url` |
| `session_id` | → | `crwn_session_id` |

**Contact for testing** (top right) — **required**, or pills cannot resolve and Preview will
say "Invalid JSON / Variables are not defined". Pick any contact (Trap 6 explains how to make
one).

**Test Request → expect `503 engine_disabled`.** Check the Request Body: `contact.id` must be
a **number**. If you see text, a pill was typed rather than inserted.

### Node 3 — ask the question and wait

`Next Step` → **Instagram → Send Message**

- **Send:** `Within messaging window` (she is mid-conversation now, not commenting)
- **Delete the empty Text block.**
- **Add one of the content blocks → `Data Collection`**
  - **Question:** insert the **`crwn_message` pill** via the `{}` button
  - **Contact's reply:** `Text` ← **not Number.** She will type "40k" or "about 40,000", and
    CRWN's parser handles those. A Number field would reject them.
  - It says *"Automation pauses until contact replies."* That is the whole point.

CRWN writes the question. ManyChat just displays it. So this node also asks the **retry hint**
if she fumbles, without you configuring anything.

### Node 4 — External Request (answer)

Same URL, same headers, same response mapping as node 2. Only the body differs:

1. **Paste:** `{"event_type":"answer","question_key":"`
2. **Insert pill:** `crwn_question_key`
3. **Paste:** `","contact":`
4. **Click `+ Add Full Contact Data`**
5. **Paste:** `}`

Note `crwn_question_key` **is** in quotes (a string). `Full Contact Data` is **not** (an object).

**Her answer needs no pill.** It arrives inside Full Contact Data as `last_input_text`.

**Testing this node standalone returns `400 unresolved_question_key`** — and that is CORRECT.
`crwn_question_key` is empty until node 2 populates it, and an empty ManyChat field renders as
`{{cuf_NNNN}}` (Trap 5). At runtime it will hold `monthly_listeners`. Save and move on.

### Node 5 — the Condition

`Next Step` → **Condition**

- **Field:** `crwn_action` (Custom User Fields)
- **Operator:** `is`
- **Value:** type `send_result` **as plain text.** It is not in any picker — ManyChat has no
  idea what values CRWN sends.

**Yes branch** → **Instagram → Send Message** (`Within messaging window`)
- Text: **`crwn_message` pill**
- **+ Add Button:** label `See My Numbers` → **Open website** → URL: **`crwn_result_url` pill**
- **No next step.** This branch ends.

**If-not branch** → drag back to **node 3**. That is the retry loop: it re-asks with CRWN's
updated `{{crwn_message}}`. After three unparseable answers CRWN stops asking and escalates her
to `/admin → Acquisition → Needs you` instead of looping forever.

---

## 6b. Deliver the full breakdown immediately, then optionally ask for email AFTER (never gate delivery)

**POLICY (2026-07-26, Josh): never ask for an email BEFORE delivering the thing the lead came for.**
The `send_result` response already carries the full `crwn_result_url`, so show it the moment the
number lands. An email ask, if you keep it, moves to AFTER the result and must be skippable. Gating
the breakdown behind an email is the OLD design and is retired. The previous "topline free,
breakdown gated" pattern below has been rewritten to match.

**WHY still capture email at all.** Meta's 24h window closes the Instagram DM. `personal_nudge`
(day 4), `offer_call` (day 7) and the no-show ladder are all out-of-window for an Instagram-only
lead, and most leads never gave an email, so those sends silently resolve `sent: false` and the
nurture reaches nobody. Capturing an email keeps the email fallback (no 24h window) alive. So we
still ask, just never as a toll gate before the deliverable, and the lead can skip it.

### Node 5 (Yes branch) — deliver the topline AND the breakdown button together

Node 5's Yes branch is a SINGLE Send Message (`Within messaging window`): the `crwn_message` pill
(the headline, "about $X a month is on the table") **and** the `See My Numbers` button that opens
`crwn_result_url`. The lead gets the number and the full breakdown in one step, no email required.
Then optionally continue into node 6 (the post-delivery email ask). If you are not capturing email,
node 5 is the end of the flow.

### Node 6 (OPTIONAL, AFTER delivery) — ask for her email (Data Collection, in-window)

This node is optional and runs AFTER node 5 has already delivered the breakdown. It never gates
anything: the result is already in her hands, so this is a soft "keep a copy" ask she can skip.

`Next Step` → **Instagram → Send Message**

- **Send:** `Within messaging window`.
- **Delete the empty Text block.**
- **Add a content block → `Data Collection`**
  - **Question:** `Want me to email you a copy so it doesn't get buried in your DMs? Drop your best email, or just skip this.`
  - **Contact's reply:** `Email` ← ManyChat's Email input. It validates the address and stores it
    to the **system Email field**, which is exactly what `+ Add Full Contact Data` reads. Do NOT
    use Text here.
  - Leave *"Automation pauses until contact replies"* on.

### Node 7 — External Request (profile_update)

Same **URL** and **Headers** as nodes 2 and 4. Only the body differs:

1. **Paste:** `{"event_type":"profile_update","consent_email":true,"contact":`
2. **Click `+ Add Full Contact Data`** (drops in as an object, no quotes).
3. **Paste:** `}`

`consent_email` is a literal `true`. Her email rides inside Full Contact Data as `email`, so it
needs no separate pill. Every CRWN email that follows carries a one-click unsubscribe and a postal
address (`channels.ts`), so this opt-out-by-default is compliant without a follow-ups disclosure
in the DM.

**Response mapping:** the same five rows as node 2 are harmless, but you do not need to render any
of them. CRWN replies `{"action":"complete"}` and there is nothing for ManyChat to display.

**Test:** `503 engine_disabled` while dark, then `200` with `action: complete` once live. A `400`
means the body is off: `consent_email` must be a bare JSON boolean (outside any quotes) and Full
Contact Data must be an inserted pill, not typed text.

### Node 8 — deliver the breakdown

`Next Step` → **Instagram → Send Message** (`Within messaging window`)

- Text: `Perfect. Here's your full breakdown.`
- **+ Add Button:** label `See My Numbers` → **Open website** → URL: the `crwn_result_url` pill.
- **No next step.** The flow ends here.

**Phone/SMS:** the identical mechanism captures a phone (`consent_sms:true`, ManyChat `Phone`
input), and CRWN stores it, but SMS outbound is a disabled adapter today (`channels.ts`), so a
captured phone just sits unused. Skip the phone variant unless you are also turning on SMS.

---

## 7. Go live — order matters

**1. Flip the CRWN flag FIRST:**
```sql
UPDATE admin_settings SET value = '{"enabled": true}'::jsonb WHERE key = 'acquisition_engine';
```

**2. Then ManyChat → Set Live.**

If you go live while CRWN is dark, a real commenter gets a 503, `crwn_message` stays empty, and
she receives a **blank DM**.

**3. Test from a different Instagram account:** comment `worth` on your Reel.

**4. Watch `/admin` → Acquisition → Leads.**

**Kill switch** (instant, no deploy):
```sql
UPDATE admin_settings SET value = '{"enabled": false}'::jsonb WHERE key = 'acquisition_engine';
```

---

## 8. What the real payload looks like

Captured live. Do not guess at these field names; they are not what the docs imply.

```json
{
  "event_type": "answer",
  "question_key": "monthly_listeners",
  "contact": {
    "id": "713072115",              // the contact id. A STRING of digits.
    "key": "user:713072115",
    "ig_username": "m3rcey",        // NOT "username"
    "ig_id": 1416655297162108,      // NOT "user_id". And it is a NUMBER, not a string.
    "last_input_text": "100,000",   // WHAT SHE TYPED. This is the answer.
    "first_name": "M3rcey",
    "email": null,
    "phone": null,
    "custom_fields": []
  }
}
```

CRWN accepts three shapes, so any of these work:
`{ manychat_contact_id }` · `{ contact: { id } }` · `{ id }` at top level.

## 9. Troubleshooting

| Symptom | Cause |
|---|---|
| **401** on every request | Secret mismatch, or `MANYCHAT_WEBHOOK_SECRET` unset in Vercel, or you did not redeploy. It fails closed on purpose. |
| **503 `engine_disabled`** | 🎉 **Success while dark.** URL, secret, and body are all correct. |
| **400 `unresolved_contact_id_placeholder`** | A pill was typed, not inserted. Use the picker. |
| **400 `unresolved_question_key`** | `crwn_question_key` is empty, so it rendered as `{{cuf_NNNN}}`. Expected in a standalone test; a bug at runtime. |
| **400 `missing_contact_id`** | The body has no contact. Use `+ Add Full Contact Data`. |
| Preview: *"Variables are not defined"* | No **Contact for testing** selected. |
| Preview: *"Bad control character in string literal"* | A pill landed on a new line **inside quotes**. Backspace to join the lines. |
| **429** | More than 20 requests/minute from one contact. Almost always a ManyChat loop misconfiguration. |
| The same question repeats forever | `crwn_message` is not mapped, or node 3 is not looping back correctly. |
| No contact exists | You commented instead of DMing. See Trap 6. |

---

## What must stay in CRWN, always

Do not move any of this into ManyChat, however convenient it looks:

- deciding which question to ask next
- deciding when there is enough data
- **any** calculation of money, fans, or projections
- the lead score
- which lead magnet to run
- account claiming
- consent as a source of truth
- conversation state

ManyChat holds five thin fields and forwards messages. Keeping it that way is what lets you
change CRWN's logic without rebuilding a single ManyChat flow.

---

## 10. Adding a NEW lead magnet + cloning its flow: the complete checklist

Every item below is a trap that cost real time during the Vault/Proof build (2026-07-16). Do
them in order; do not publish until the smoke test passes.

### Backend first (Claude's part)

1. **Registry entry** in `src/lib/leadMagnets/registry.ts` with `dmKeywords` set. This is the
   single source of truth for keywords: the orchestrator builds its keyword-pivot map from it
   automatically (typing a keyword mid-conversation switches tools), so there is no second list
   to forget. The ManyChat trigger keywords MUST equal `dmKeywords`.
2. **Adapter** in `src/lib/acquisition/toolAdapters.ts`:
   - `requiredFields` = the one or two inputs the DM collects. If the topline needs money, one
     of them must be an audience field; a tool that cannot show a dollar figure breaks the hook.
   - Override `headline` with a LOSS-FRAMED dollar line ("About $X ... is sitting ..."), never
     the engine's readiness copy. Conservative rates, documented inline.
   - Review the engine's sections for thin-DM-input artifacts. The Vault shipped "You is opening
     a private Vault" (an empty artist-name default in a third-person template) and a one-item
     "first five drops" (the DM collects a total, the engine builds drops from a breakdown).
     Fix such artifacts with section overrides in the adapter.
3. **Deploy, then VERIFY the deploy is live** before anyone tests:
   `curl https://thecrwn.app/api/integrations/manychat/webhook` returns `rev` = the deployed
   commit sha; compare to `git rev-parse --short HEAD`. Testing before propagation makes correct
   code look broken, and it burned hours.

### ManyChat clone (Josh's part)

4. **Duplicate** the Vault automation. Three edits only; everything else carries over,
   including the whole email gate.
5. **Trigger. It does NOT survive duplication.** Re-create both: the comment trigger (pick the
   post, set the keyword) AND a DM keyword trigger with the same keyword plus case variants. The
   DM trigger is both a real entry point and your unlimited test path (comment triggers fire
   once per person per post; you WILL run out of posts).
6. **Opening message = a BRIDGE, not a question and not a re-pitch.** The lead already said yes
   by commenting (the Reel made the pitch), so never re-ask ("Want to see...?" is a double-ask).
   The node itself cannot be deleted: Meta permits one private reply to a comment and the lead
   must TAP it before anything else may send. So the copy assumes the yes and promises speed:
   "30 seconds, two questions, and you'll see what's sitting in your vault." [Show me my number].
   And never hand-type a CRWN question here; the real questions arrive via `crwn_message` one
   node later, so a typed one shows doubled.
7. **Actions #3 body:** change BOTH `lead_magnet_id` (the registry slug) and `keyword`. The
   backend logs a loud warning when the two disagree (the half-edited-clone tell), but do not
   rely on it. Actions #4 needs NO changes: session routing owns the tool.
8. **Verify the response mapping rows survived the duplicate** (action / message / question_key
   / result_url / session_id), and that Send Message #1 renders the `crwn_message` pill.

### Smoke test (before publishing)

9. **Test Request on Actions #3** with a test contact. It MUST return `action: ask_question`
   with the NEW tool's question and the NEW `lead_magnet_id` echoed back. A Vault question or a
   Vault money line means the body edit did not save. Do not publish until this passes.
10. **Publish, then DM the keyword** and run it end to end: hook, question(s), loss-framed
    dollar topline, email ask, breakdown link. Open the result page and READ it once (the
    artifact check). No lead reset is ever needed: every session_start opens a fresh session,
    re-asks that tool's questions, and computes a fresh result.
11. **Stuck mid-flow?** A waiting question node swallows the next message. Typing any tool
    keyword escapes it (the backend pivots to that tool). That is also how leads hop between
    tools, so it is behavior, not a bug.

### Ask-in-opener (optional): one less tap

The opener can ASK the first question directly instead of showing a button, so the lead's very
first reply is already data. A one-question tool then goes comment -> reply -> result. The typed
reply satisfies Meta's interaction requirement the same way a tap does.

- **Node 1** (still `As private reply`): a **Data Collection** block whose question is the bridge
  plus the first question, e.g. "One question and you'll see how much demand you're sitting on:
  roughly how many followers do you have across your socials?" Reply type **Text**, never Number
  (Trap: "50k" and "about 50,000" fail a Number field; CRWN's parser handles them). NOTE: this
  duplicates the question text in ManyChat; if the question changes in `fieldRegistry.ts`,
  update the opener by hand.
- **Actions #3 body** adds the field the opener asked:
  `{"event_type":"session_start","lead_magnet_id":"...","keyword":"...","question_key":"social_followers","consent_dm":true,"contact": <Full Contact Data> }`
  The reply itself rides in `last_input_text`; no extra pill.
- **Rewire Actions #3's Next Step to the CONDITION** (not to the question node), because
  session_start can now return `send_result` directly. Two-question tools still work: the
  response is `ask_question` for question two, the Condition's no-branch shows it, and the
  normal loop continues.
- Button-style flows are unaffected: without a `question_key` in the body, the backend ignores
  `last_input_text` entirely (it is stale there, usually the comment keyword itself).
- If ManyChat refuses a Data Collection block on the private-reply node, keep the button opener
  for comment triggers; the pattern still works for DM-keyword automations.

---

## 11. The two all-in-one clones: FREE and PLAN (2026-08-25)

Two automations, both routing to the **same** tool (`opportunity-calculator`, the all-in-one
calculator). They exist as two flows and not one because a ManyChat comment trigger cannot tell
CRWN which word fired it: the `keyword` and `utm_content` in the body are what separate the two
hooks in `/admin` → Lead Magnets → Content scorecard. One flow serving both words would collapse
them into a single row forever.

**The backend needs no change.** Verified 2026-08-25:

- `opportunity-calculator` is a live adapter (`toolAdapters.ts`), one required field
  (`social_followers`), so it is a ONE question DM.
- `free` and `plan` are already in that tool's `dmKeywords` (`registry.ts`), so the orchestrator's
  keyword pivot already knows them and no other tool claims either word.
- `acquisition_engine` is **enabled** in production. A correct Test Request returns `200`, not the
  `503` the earlier sections describe. A `400` is still the only failure that matters.

### Clone procedure (per flow, twice)

1. Duplicate the **worth** automation. Name the copies `ALL-IN-ONE / FREE` and `ALL-IN-ONE / PLAN`.
2. **Re-create both triggers. They do not survive duplication** (Trap in section 10, step 5):
   - Comment trigger: `any post or reel`, comment has `free, FREE` (or `plan, PLAN`).
     Set the match to the **whole word**, not "contains". `free` is a common comment word and a
     substring match will DM people who wrote "free game".
   - DM keyword trigger with the same word plus case variants. This is the unlimited test path;
     comment triggers fire once per person per post.
3. **Node 2 (Actions, `session_start`) body.** Build it in THREE moves, never one paste. Click
   into the body field, select all, delete, then:

   **a.** Paste this. It ends with a colon and no quote, and it MUST start with `{`:

       {"event_type":"session_start","lead_magnet_id":"opportunity-calculator","keyword":"FREE","consent_dm":true,"utm_source":"instagram","utm_medium":"organic","utm_campaign":"all_in_one_calculator","utm_content":"free_v1","contact":

   **b.** Click **`+ Add Full Contact Data`**. The pill drops in at the cursor. No quotes around
   it, and it can never be typed.

   **c.** Paste a single `}`.

   PLAN is identical except `"keyword":"PLAN"` and `"utm_content":"plan_v1"`.

   **`Invalid JSON: Unexpected non-whitespace character after JSON at position 12` means the
   leading `{` is missing.** The arithmetic is exact: without the brace the parser reads
   `"event_type"` (12 characters, positions 0 to 11) as a complete JSON document, then trips on
   the `:` at position 12. It is the signature of pasting into a field that was not fully
   cleared, or of a paste that clipped the first character. Nothing else in the body is wrong
   when you see that number. Select all, delete, and redo a, b, c.

   Confirm the exact normalized `utm_campaign` / `utm_content` values in the Campaign link builder
   (`/admin` → Lead Magnets) rather than inventing them; that builder is the normalizer.
4. **Node 4 (`answer`) needs no edit.** Session routing owns the tool.
5. **Node 1 copy** is a bridge, never a re-ask. The lead already said yes by commenting. Something
   like: "One question and you'll see the whole picture: what you're leaving on the table every
   month." Do not hand-type a CRWN question here; the real question arrives as `crwn_message`.
6. **Verify the five response-mapping rows survived** the duplicate (action / message /
   question_key / result_url / session_id).

### Smoke test before publishing

Test Request on node 2 with a test contact must return `200` and:

- `action`: `ask_question`
- `message`: `Roughly how many followers do you have across your socials?`

A **listeners** question ("monthly listeners") means the body edit did not save and the flow is
still running Worth. Do not publish until the followers question comes back.

Then DM the keyword and run it end to end. The result topline is the unified model's own line
("You could build an estimated $X to $Y a month..."), and the button opens
`https://thecrwn.app/tools/opportunity-calculator/result/<token>`.

---

## 12. EVERY tool is now a two-question DM (2026-08-26)

Every flow asks its own question, then one more: **"have your fans ever paid you directly?"**
(`monetization_status`, always LAST in `requiredFields`). Nothing in ManyChat changes. The
Condition's if-not branch already loops back to the question node, which is the same path a
two-question tool has always taken (§10).

**Why it was added.** `leadScoring` weights direct monetization history at 40 of 100 and caps the
whole fit at 60 while it is unknown, so a DM lead who only ever gave a follower count could not
reach `sales_priority` no matter how large their audience was. That is the band that fires the
founder's high-intent alert (`rescore.ts`) and the band a call request must clear
(`decideCallRequest`). Every WEB calculator has asked this question since the avatar landed; the
DM did not, so the highest-intent channel CRWN has was producing its least actionable leads.

**What changes in a smoke test.** After the first answer the response is `ask_question` again,
carrying the proof question, and only the second answer returns `send_result`. A flow that ends
after one answer is a flow whose Condition no-branch is not wired back to the question node.

**The answer is read without a model call.** `fieldRegistry.aliasPatterns` resolves the sentences
people actually type ("yeah, patreon every month", "just merch at shows", "nah, only streaming"),
so the retry ladder is not spent on a parser gap. Anything genuinely unreadable falls through to
Claude, then to the retry hint, then to `/admin` → Acquisition → Needs you, as before.
