# Acquisition Engine — Deployment, Rollback, and Privacy

Three short docs in one, because three separate files would say the same thing three times.

---

## 1. Deployment checklist

The engine ships **dark**. Deploying it changes nothing until you flip a flag.

- [ ] **Code is on master.** `npm run build` passes (WSL). `npm test` passes (49 tests).
- [ ] **Run the migration** in the Supabase SQL editor:
      `supabase/schema-phase2-instagram-acquisition-engine.sql`
      It self-verifies. Expect: `OK: acquisition engine tables + RLS + indexes created. Flag is OFF (dark).`
- [ ] **Set `MANYCHAT_WEBHOOK_SECRET`** in Vercel (`openssl rand -hex 32`). Redeploy.
      Without it, the webhook rejects **every** request. That is intended.
- [ ] *(Optional)* **Set `ANTHROPIC_API_KEY`.** Without it the engine still runs end to end,
      using deterministic question ordering. Add it when you want the DM to read like a person.
- [ ] *(Optional but this is the one that matters for follow-up)* **Set `MANYCHAT_API_TOKEN`.**
      This is what lets CRWN send an outbound Instagram DM. **Without it, follow-up reaches
      almost nobody**, because a cold Instagram lead has no email and email is the only other
      channel. Get it from ManyChat → Settings → API.
      Optionally `MANYCHAT_MESSAGE_TAG` — leave it unset unless you have confirmed with Meta
      which tag your use case legitimately qualifies for. Unset means in-window sends only,
      which is the safe default.
- [ ] **Configure ManyChat** per `manychat-setup-guide.md`.
- [ ] **Smoke test with the flag still OFF.** Every External Request should return
      **503 / `engine_disabled`**. This proves URL + secret + mapping are correct while CRWN
      refuses to write a single row.
- [ ] **Flip the flag:**
      ```sql
      UPDATE admin_settings SET value = '{"enabled": true}'::jsonb WHERE key = 'acquisition_engine';
      ```
- [ ] **Run one real lead through end to end.** Comment → DM → question → result link → open
      it → claim it.
- [ ] **Verify the data:**
      ```sql
      SELECT state, status, lead_magnet_id FROM lead_sessions ORDER BY started_at DESC LIMIT 5;
      SELECT field_key, raw_value, extraction_method FROM lead_answers ORDER BY answered_at DESC LIMIT 10;
      SELECT total_score, band, components FROM lead_score_history ORDER BY created_at DESC LIMIT 3;
      ```
- [ ] **Confirm the five existing tools still work.** `/worth`, `/` (the homepage renders
      `WorthExperience`), and the four `/tools/[slug]` pages. None were modified, but look anyway.
- [ ] **Check the follow-up dispatcher ran.** It piggybacks `/api/cron/platform-crm` at
      `0 5 * * *`, so it runs once daily. After the first run, its report is in the cron's
      JSON response (`acquisition: { swept, drained, sent, skipped, deadLettered, redacted }`).
      To trigger it by hand:
      ```
      curl -H "Authorization: Bearer $CRON_SECRET" https://thecrwn.app/api/cron/platform-crm
      ```
- [ ] **Watch the dead-letter queue** for the first week. It should be empty:
      ```sql
      SELECT event_name, last_error_code, attempt_count, created_at
      FROM acquisition_events WHERE status = 'dead_letter' ORDER BY created_at DESC;
      ```
      A pile of `dm_rejected` means the ManyChat token is wrong. A pile of
      `outside_messaging_window` should NOT appear (that reason is terminal, not retried) and
      if it does, the classifier missed a Meta error string.

### Production reminder

thecrwn.app deploys from **master**, not from the working branch. Pushing the branch does not
reach production until master fast-forwards.

---

## 2. Rollback

### Instant, no deploy

```sql
UPDATE admin_settings SET value = '{"enabled": false}'::jsonb WHERE key = 'acquisition_engine';
```

Takes effect on the next request. The webhook returns 503 retry-later. Existing leads,
sessions, results, and links are untouched and keep working. **This is the first thing to
reach for.** It is a kill switch, not a delete.

### If the secret leaks

1. Rotate `MANYCHAT_WEBHOOK_SECRET` in Vercel. Redeploy.
2. Update the `x-webhook-secret` header in the ManyChat External Request.

Blast radius of a leaked secret: an attacker can **write** junk leads. They cannot **read**
anything (the response payload has no field that can carry PII) and cannot touch an account
(claiming requires a verified Supabase session).

### If a result link leaks

```sql
UPDATE lead_magnet_results SET revoked_at = now() WHERE id = '<result-id>';
```

The page immediately renders the same "no longer live" state as an expired or invalid token,
so a probe cannot distinguish revoked from never-existed.

### Full code rollback

Revert the commit and redeploy. The migration is **additive only**: every column added to
`lead_magnet_results` is nullable, and the new tables are standalone. Old code ignores them
entirely. **You do not need to drop anything.** If you want to, do it after, deliberately,
and not while firefighting.

---

## 3. Privacy and consent implications

> Documented, not decided. Legal policy changes need founder or counsel approval. This is the
> list of what the system now collects, so that conversation can be had with facts.

### What is newly collected

| Data | Where | Why |
|---|---|---|
| Instagram user id + username | `lead_identities` | To recognize a returning lead. |
| ManyChat contact id | `lead_identities` | The primary identity key. |
| Email / phone, if given | `lead_identities` | Only stored; **never** used to resolve identity unless verified. |
| Free-form DM answers | `lead_answers.raw_value` | Stored verbatim, before any AI touches them. |
| DM transcript | `lead_conversation_messages` | Minimum needed to resume a conversation and audit a decision. Redactable. |
| Artist metrics (listeners, followers, catalog, revenue) | `lead_profiles` | Inputs to the calculator the artist asked us to run. |
| AI-derived classifications (segment, blocker, stage) | `lead_profiles` | Routing and follow-up. |
| Lead score + components | `lead_profiles`, `lead_score_history` | Sales prioritization. |
| Behavioral events | `acquisition_events` | Conversion tracking. |

### Consent

- **DM consent** is captured before any question is asked, with its source and timestamp
  (`consent_dm`, `consent_source`, `consented_at`). CRWN refuses to proceed without it.
- **Email and SMS consent** are recorded separately. SMS is **not wired** in this phase.
- Instagram messaging windows are governed by **Meta**, not by CRWN. Outbound Instagram
  follow-up is modeled as a ManyChat action inside the permitted window. CRWN does not attempt
  to message Instagram directly.

### Disclosures likely needed in the privacy policy

Not written here. Flagged for counsel:

1. That commenting a keyword on an Instagram post starts an automated conversation with CRWN.
2. That answers are processed by a third-party AI (Anthropic) to extract structured fields.
3. That CRWN derives a lead score and a segment from those answers.
4. That an Instagram identity is retained even if the person never creates a CRWN account.
5. The retention period for DM transcripts, and how to request deletion.
6. That ManyChat is a processor in this flow.

### Retention — now enforced

`enforceRetention()` in `automationDispatcher.ts` runs daily on the piggybacked cron. DM
transcripts older than **90 days** have their `content` blanked and `redacted_at` stamped. The
event skeleton (who, when, which direction) survives for analytics; the literal text a stranger
typed into Instagram does not.

To change the window, edit `TRANSCRIPT_RETENTION_DAYS`. It is one constant, in one file, on
purpose.

### Deletion

An account-deletion request must also clear `lead_identities` for that user. The FK is
`ON DELETE SET NULL`, so deleting the auth user **unlinks but does not delete** the lead. That
is deliberate (it preserves attribution history) but it means a true erasure request needs an
explicit delete of the identity row. **Not automated yet.** Phase 2.
