# ManyChat Setup Guide

> Exact enough to configure ManyChat without recreating any CRWN logic. Follow it in order.
> If a step feels like it is asking you to put business logic in ManyChat, you have misread
> it: ManyChat only carries messages. CRWN does all the thinking.

---

## 0. Before you touch ManyChat

Three things must be true first.

### 0.1 Run the migration

In the Supabase SQL editor, run:

```
supabase/schema-phase2-instagram-acquisition-engine.sql
```

It ends with a `DO $$ … RAISE EXCEPTION … $$` block, so a partial apply fails **loudly**
rather than half-landing. If it prints `OK: acquisition engine tables + RLS + indexes
created. Flag is OFF (dark).` you are good.

### 0.2 Set the environment variables in Vercel

| Variable | Required | What it is |
|---|---|---|
| `MANYCHAT_WEBHOOK_SECRET` | **YES** | `openssl rand -hex 32`. Without it the webhook rejects **every** request (fail-closed). |
| `ANTHROPIC_API_KEY` | No | Without it the engine still works, using deterministic question ordering instead of natural conversation. Add it when you want the DM to feel human. |
| `ANTHROPIC_MODEL` | No | Defaults to `claude-opus-4-8`. |
| `ANTHROPIC_DECISION_TIMEOUT_MS` | No | Defaults to 8000. |
| `MANYCHAT_WEBHOOK_TOLERANCE_SECONDS` | No | Defaults to 600. |
| `LEAD_RESULT_TOKEN_TTL_SECONDS` | No | Defaults to 30 days. |
| `NEXT_PUBLIC_APP_URL` | Should | Defaults to `https://thecrwn.app`. |

Redeploy after adding them.

### 0.3 Leave the engine OFF for now

The migration inserts `admin_settings.acquisition_engine = {"enabled": false}`. While it is
false the webhook returns **503 retry-later** and writes nothing. That is deliberate: you can
wire up and test the ManyChat flow without it creating junk leads. You flip it on in step 6.

---

## 1. Custom fields to create in ManyChat

Settings → Custom Fields. Create exactly these nine. **No more.**

| Field name | Type | Written by |
|---|---|---|
| `crwn_session_id` | Text | CRWN response |
| `crwn_lead_magnet` | Text | CRWN response |
| `crwn_question_key` | Text | CRWN response |
| `crwn_last_answer` | Text | ManyChat (the user's reply) |
| `crwn_action` | Text | CRWN response |
| `crwn_message` | Text | CRWN response |
| `crwn_result_url` | Text | CRWN response |
| `crwn_status` | Text | CRWN response |
| `crwn_error_code` | Text | CRWN response |

### What must NEVER go in a ManyChat custom field

ManyChat is a third-party system and its fields are visible in its UI. Do not create fields
for, or map CRWN responses into:

- the artist's email or phone
- monthly listeners, revenue, or any profile value
- lead score, segment, blocker, or any AI classification
- any CRWN database id (identity id, result id, user id)
- the raw result token (it only ever travels inside `crwn_result_url`)

The CRWN response payload deliberately contains none of these. If you find yourself wanting
one, the answer is to read it in the CRWN admin, not to copy it into ManyChat.

---

## 2. The Instagram comment trigger

Instagram → Growth Tools → **Comment Reply**.

1. **Trigger post:** pick the Reel or post.
2. **Keyword:** e.g. `WORTH`. (Whatever you choose, put the same word in the `keyword` field
   of the payload in step 4, so attribution is recorded.)
3. **Private reply message:** short, and it must earn the click.
   > "Sent it. Tap below and I will show you what your fanbase is actually worth."
4. **Button:** "Show me" → starts the DM flow below.

Meta requires the user to interact before you may DM them. The private reply plus their tap
IS that interaction. Do not try to route around it.

---

## 3. The opt-in step

First DM step. One question:

> "Cool if I ask you two quick questions to run your numbers?"

Buttons: **Yes** / **Not now**.

- **Not now** ends the flow. Do not nag.
- **Yes** sets `consent_dm = true` and continues to step 4.

CRWN records consent, its source, and its timestamp. If you skip this step, CRWN will ask for
consent itself on the first call and refuse to proceed without it.

---

## 4. The External Request (this is the whole integration)

Add an **External Request** action.

- **Method:** `POST`
- **URL:** `https://thecrwn.app/api/integrations/manychat/webhook`
- **Headers:**

  | Key | Value |
  |---|---|
  | `Content-Type` | `application/json` |
  | `x-webhook-secret` | the value of `MANYCHAT_WEBHOOK_SECRET` |

- **Body:**

```json
{
  "event_type": "session_start",
  "event_id": "{{contact_id}}-{{message_id}}",
  "manychat_contact_id": "{{contact_id}}",
  "instagram_user_id": "{{ig_id}}",
  "instagram_username": "{{ig_username}}",
  "keyword": "WORTH",
  "source_post_id": "REPLACE_WITH_POST_ID",
  "creator_account": "thecrwn",
  "campaign_key": "ig-worth-jan",
  "lead_magnet_id": "worth",
  "consent_dm": true,
  "opt_in_source": "instagram_comment",
  "sent_at": "{{current_time_iso}}"
}
```

**`event_id` must be unique per delivery.** It is the idempotency key. If ManyChat retries,
CRWN sees the same `event_id`, does zero work, and replays its original answer. If you
hardcode it, or reuse it, retries will silently return a stale response.

### Response mapping

Map the JSON response into your custom fields:

| Response field | ManyChat field |
|---|---|
| `session_id` | `crwn_session_id` |
| `action` | `crwn_action` |
| `message` | `crwn_message` |
| `question_key` | `crwn_question_key` |
| `result_url` | `crwn_result_url` |
| `status` | `crwn_status` |
| `error_code` | `crwn_error_code` |
| `lead_magnet_id` | `crwn_lead_magnet` |

---

## 5. Branch on `crwn_action`

This is the only logic ManyChat needs. Everything else CRWN decided already.

| `crwn_action` | What ManyChat does |
|---|---|
| `ask_question` | Send `crwn_message`. Capture the reply into `crwn_last_answer`. Loop back to step 4 with `event_type: "answer"` and `question_key: {{crwn_question_key}}`, `answer: {{crwn_last_answer}}`. |
| `send_result` | Send `crwn_message`, then send `crwn_result_url`. End the flow. |
| `send_message` | Send `crwn_message`. End. |
| `request_account` | Send `crwn_message` + `crwn_result_url`. End. |
| `offer_call` | Send `crwn_message` + your Cal.com link. |
| `nurture` | Send `crwn_message`. End. |
| `human_review` | Send `crwn_message`. Tag the conversation for you to read. |
| `retry_later` | Wait 1 minute, retry the same External Request **with the same `event_id`**. Retry at most 3 times, then stop. |
| `complete` | End. |

The **answer loop** is the whole conversation: ask → capture → post → CRWN decides → ask
again, until CRWN returns `send_result`. ManyChat never decides what to ask next, never
decides when there is enough data, and never computes a number.

---

## 6. Test, then go live

1. **With the flag still OFF**, run the flow on your own Instagram. Every External Request
   should return HTTP **503** with `error_code: "engine_disabled"`. That proves your URL,
   secret, and mapping are right and CRWN is refusing to write. If you get **401**, the
   secret is wrong. If you get **400**, read `error_code`: it names the bad field.
2. Flip the flag in Supabase:
   ```sql
   UPDATE admin_settings SET value = '{"enabled": true}'::jsonb WHERE key = 'acquisition_engine';
   ```
3. Run the flow again for real. You should get a question, then a result link.
4. Check the data landed:
   ```sql
   SELECT state, status, lead_magnet_id FROM lead_sessions ORDER BY started_at DESC LIMIT 5;
   SELECT field_key, raw_value FROM lead_answers ORDER BY answered_at DESC LIMIT 5;
   ```

### Kill switch

Anything goes wrong, at any time:

```sql
UPDATE admin_settings SET value = '{"enabled": false}'::jsonb WHERE key = 'acquisition_engine';
```

Takes effect on the next request. No deploy needed. Existing leads and results are untouched.

---

## 7. Troubleshooting

| Symptom | Cause |
|---|---|
| Every request 401s | `MANYCHAT_WEBHOOK_SECRET` unset in Vercel, or the header value does not match. It fails closed on purpose. |
| Every request 503s | The engine flag is still `false`. |
| 400 `missing_event_id` | Your body has no `event_id`, or it rendered empty. |
| 400 `missing_question_key` | An `answer` event without `question_key`. Map `{{crwn_question_key}}` into the loop-back body. |
| The same question repeats forever | You are not sending the artist's reply. Check `answer: {{crwn_last_answer}}` is populated. |
| A retry returns a stale message | Correct behavior. A duplicate `event_id` replays the original response by design. Use a fresh `event_id` per delivery. |
| 429 | More than 20 requests per minute from one contact. Almost always a ManyChat loop misconfiguration. |

---

## What stays in CRWN, always

Do not be tempted to move any of this into ManyChat, even when it looks easier:

- deciding which question to ask next
- deciding when there is enough data
- **any** calculation of money, fans, or projections
- the lead score
- which lead magnet to run
- account claiming
- consent as a source of truth
- conversation state

ManyChat holds nine thin fields and forwards messages. That is its whole job, and keeping it
that way is what lets you change CRWN's logic without rebuilding a single ManyChat flow.
