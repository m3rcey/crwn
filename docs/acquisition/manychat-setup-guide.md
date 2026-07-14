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
