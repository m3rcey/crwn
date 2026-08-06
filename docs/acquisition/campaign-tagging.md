# Campaign tagging: one link per video, all the way to money

**Status:** live, 2026-08-06. No migration. Existing untagged links keep working exactly as before.

This is the procedure for publishing the calculator videos so CRWN can tell you which one produced
**artists who got paid**, not which one produced views.

---

## 1. The canonical tagged link

```
https://thecrwn.app/tools/<calculator>?utm_source=<platform>&utm_medium=<channel>&utm_campaign=<campaign>&utm_content=<creative>&angle=<angle>&keyword=<keyword>
```

Standard UTM params carry four of the dimensions, because ManyChat, Instagram, TikTok and every
email client already pass them through untouched, and CRWN already parsed them end to end. Three
CRWN params carry what UTM has no slot for.

| Param | Meaning | Example | Rules |
|---|---|---|---|
| `utm_source` | **platform** | `instagram` | Allowlisted. Anything unrecognized becomes `other`. |
| `utm_medium` | **channel** | `organic` | Allowlisted. Anything unrecognized is dropped. |
| `utm_campaign` | **campaign** | `kcamp_streaming_loss` | Free-form, normalized to a slug, 64 chars. |
| `utm_content` | **creative / video id** | `kcamp_v1` | Free-form, normalized, 64 chars. |
| `angle` | content angle / calculator promise | `streaming_loss` | Free-form, normalized, 64 chars. |
| `keyword` | the ManyChat comment trigger | `vault` | Free-form, normalized, 32 chars. |
| `variant` | creative version or variation | `b` | Free-form, normalized, 32 chars. Optional. |
| `ref` | a real partner / referrer code | `lead-magnet` | Existing param, unchanged. |
| `from` | sub-avatar entry context | `rnb_empire_builder` | Existing param, unchanged. |

Plain-English aliases also work if you hand-write a link: `platform=`, `channel=`, `campaign=`,
`creative=`. Everything is optional. An untagged link still works; it just lands under `unknown`
and can never be compared to another video.

### Allowed values

**Channel** (`utm_medium`): `organic`, `paid`, `referral`, `partner`, `affiliate`, `email`, `sms`,
`direct`.

**Platform** (`utm_source`): `instagram`, `tiktok`, `youtube`, `x`, `facebook`, `threads`,
`snapchat`, `linkedin`, `reddit`, `twitch`, `pinterest`, `discord`, `podcast`, `email`, `manychat`,
`web`, `other`. Common shorthands are accepted and normalized: `ig`, `insta`, `reels` to
`instagram`; `tt` to `tiktok`; `yt`, `shorts` to `youtube`; `twitter` to `x`; `fb`, `meta` to
`facebook`; `dm` to `manychat`.

### Normalization rules

Every value is lowercased, spaces become hyphens, and anything outside `a-z 0-9 . _ -` is stripped.
So `K Camp Streaming Loss` is stored as `k-camp-streaming-loss`, and `<script>` cannot reach a
report. Values are length-capped (64 chars, 32 for keyword/variant). A value that normalizes to
nothing is simply absent, never stored as an empty string.

**Practical consequence: pick your names once and reuse them exactly.** `kcamp_v1` and `KCamp V1`
are two different rows (`kcamp_v1` and `kcamp-v1`).

---

## 2. How to build a link (do not hand-type them)

`/admin` → **Lead Magnets** → **Campaign link builder**. Pick the destination calculator, the
platform, the channel, and type the campaign / creative / angle / keyword. It emits the finished
URL and copies it. Everything it emits goes through the same normalizer the server parses with, so
a link built there can never produce a tag the reports silently drop.

Then tag the ManyChat flow that answers the comment keyword. **No ManyChat API integration is
required.** Section 2b is the click-by-click procedure, and there are two kinds of flow.

---

## 2b. Tagging a ManyChat flow, step by step

**Read this first.** You have two kinds of flow and they are tagged in completely different places.
Look at the flow in ManyChat and check whether it contains an **Actions → External Request** node
pointing at `thecrwn.app`.

- **Has an External Request node** = a CRWN engine flow (the comment to DM conversation, the one in
  `manychat-setup-guide.md`). **There is no URL to paste.** The link it sends is
  `{{crwn_result_url}}`, which CRWN generates at runtime, so a pasted URL would be ignored. The tag
  goes in the **body of the External Request**. Use **Procedure A**.
- **No External Request node**, just a message with a button that opens a website = a simple link
  flow. **Use Procedure B**: paste the tagged URL into the button.

Do one flow at a time, all the way through the verify step, before starting the next.

### Procedure A: a CRWN engine flow (comment to DM)

Repeat these steps once per flow. One flow per video.

1. Open the **Campaign link builder** (`/admin` → Lead Magnets) and fill it in for this video
   anyway. You will not paste the URL, but the builder is what tells you the exact normalized
   values to type. Write down the four you need: **campaign**, **creative**, **platform**,
   **keyword**.
2. In ManyChat, open **Automation** and click the flow for this video's keyword.
3. Click the **Actions** node that runs right after the opening DM button. This is node 2 in the
   setup guide, the `session_start` External Request.
4. Click **External Request** inside it to open the request editor.
5. Open the **Body** tab.
6. Find the text you pasted when you built the flow. It starts:
   `{"event_type":"session_start","lead_magnet_id":"worth","keyword":"WORTH","consent_dm":true,"contact":`
7. Click just **before** `"contact":` and paste these four fields, exactly, with your own values:
   ```
   "utm_source":"instagram","utm_medium":"organic","utm_campaign":"kcamp_streaming_loss","utm_content":"kcamp_v1",
   ```
   Keep the trailing comma. Do not touch the `+ Add Full Contact Data` pill after `"contact":`, and
   do not retype it. If you delete that pill by accident, re-insert it with the button; it cannot be
   typed.
8. Check the whole body is still one line of valid JSON. It should now read:
   ```
   {"event_type":"session_start","lead_magnet_id":"worth","keyword":"WORTH","consent_dm":true,"utm_source":"instagram","utm_medium":"organic","utm_campaign":"kcamp_streaming_loss","utm_content":"kcamp_v1","contact": <Full Contact Data pill> }
   ```
9. Leave the **Headers** tab and the **Response mapping** tab completely alone. Five mapped fields,
   `x-webhook-secret` still set.
10. Click **Test Request**. A `503 engine_disabled` or a normal `200` are both fine. What you are
    checking is that it is **not** a `400`: a 400 means the JSON is broken, almost always a missing
    comma or a smart quote from pasting out of a document. Fix it before moving on.
11. Click **Save**, then **Publish** the flow.
12. Only node 2 needs this. Node 4 (`event_type: answer`) reads the session that node 2 created, so
    it inherits the tag. Do not add the fields there.
13. **Verify:** comment your keyword on the real post from a test account and run the DM to the
    result. Then open `/admin` → Lead Magnets → **Content scorecard**, group by **Video**, and
    confirm a row appears under your `utm_content` value. Until you see that row, the flow is not
    tagged.

**Note on the `angle` dimension.** This path has no `angle` field. Put the angle inside the campaign
name (`kcamp_streaming_loss` already carries it) and group by **Campaign** instead.

**Note on `source_post_id`.** If your flow already sends `source_post_id`, it WINS over
`utm_content` as the video dimension. Either remove it, or set it to the same value you use for
`utm_content` so the DM flow and any link version of the same video land on one row.

### Procedure B: a simple link flow (a button that opens a website)

1. Build the link in the **Campaign link builder** and click **Copy link**.
2. In ManyChat, open **Automation** and click the flow for this video's keyword.
3. Click the **Send Message** node that carries the link.
4. Click the **button** in that node (the one labelled something like "Send me the link").
5. Set the action to **Open Website** if it is not already.
6. Select the whole existing URL and **paste the tagged link over it**. Do not append it. Do not
   leave the old untagged URL anywhere in the flow.
7. If the same flow sends the link more than once (a follow-up message, a reminder), repeat steps
   3 to 6 for every one of them. A single untagged copy is enough to split the video's numbers
   across two rows.
8. Click **Save**, then **Publish**.
9. **Verify:** open the flow's Preview, tap the button, and check the address bar contains
   `utm_campaign=` and `utm_content=`. Then check the **Content scorecard** as in Procedure A
   step 13.

### Common mistakes

- **Pasting a URL into an engine flow.** It does nothing. The engine sends `{{crwn_result_url}}`.
- **Smart quotes.** Pasting the JSON snippet out of a word processor turns `"` into `"` and the
  request 400s. Paste into a plain-text editor first if you are unsure.
- **Typing a pill.** `{{cuf_1234}}` typed by hand is dead text. Pills only work when inserted with
  the `{}` or `+ Add Full Contact Data` buttons.
- **Editing the flow but not publishing.** ManyChat keeps serving the published version.
- **Reusing one flow for two videos.** Then both videos are one row forever. One flow per creative,
  or accept that you can only compare at the campaign level.
- **Changing the tag on a live flow.** The old value keeps its historic rows and the new value
  starts a fresh row. Neither is wrong, but the video now spans two rows. Pick names once.

---

## 3. Naming convention

- **campaign** = the content series or the subject: `kcamp_streaming_loss`, `vault_q3`,
  `rnb_fanstack`. One campaign usually spans several videos.
- **creative** = the specific video: `<campaign>_v1`, `<campaign>_v2`. Keep the campaign prefix so
  the video is readable on its own in a report.
- **angle** = the promise the content made: `streaming_loss`, `vault_unlock`, `share_to_earn`,
  `royalty_gap`. Reused across campaigns on purpose, so you can compare angles independent of
  subject.
- **variant** = only when you publish the same video two ways: `a` / `b`, or `hook2`.
- **keyword** = the exact ManyChat trigger word, lowercase.

---

## 4. Examples for the upcoming videos

**K Camp streaming-loss video, Instagram Reel, keyword VAULT:**
```
https://thecrwn.app/tools/worth?utm_source=instagram&utm_medium=organic&utm_campaign=kcamp_streaming_loss&utm_content=kcamp_v1&angle=streaming_loss&keyword=vault
```

**Same subject, second video, TikTok:**
```
https://thecrwn.app/tools/worth?utm_source=tiktok&utm_medium=organic&utm_campaign=kcamp_streaming_loss&utm_content=kcamp_v2&angle=streaming_loss&keyword=vault
```

**Vault Revenue Planner video, YouTube Short, keyword UNLOCK:**
```
https://thecrwn.app/tools/vault-revenue-planner?utm_source=youtube&utm_medium=organic&utm_campaign=vault_q3&utm_content=vault_q3_v1&angle=vault_unlock&keyword=unlock
```

**All-in-one calculator, Instagram, aimed at the R&B sub-avatar:**
```
https://thecrwn.app/tools/opportunity-calculator?utm_source=instagram&utm_medium=organic&utm_campaign=rnb_fanstack&utm_content=rnb_v1&angle=fan_stack&keyword=stack&from=rnb_empire_builder
```

**Two hooks on the same video, so you can tell them apart:**
```
...&utm_content=kcamp_v3&variant=a
...&utm_content=kcamp_v3&variant=b
```

---

## 5. What gets measured automatically

The in-product source of truth starts **when the tagged link is opened**. From there, every one of
these stages carries the campaign / video / platform / angle / keyword:

| Stage | Written by |
|---|---|
| Page viewed | calculator page beacon |
| Calculator started | wizard beacon |
| Calculator completed | result generation beacon |
| Result revealed | result beacon |
| Email captured | `/api/lead-magnets/capture` (server) |
| Call requested (hand-raiser) | `/api/lead-magnets/call-request` (server) |
| Account created / email verified | `/api/lead-results/auto-claim` (server) |
| Setup completed (launch) | `/api/artist/complete-setup` (server) |
| Stripe connected | `reconcileStripeConnect` (server) |
| Fans imported | `/api/fan-contacts/import` (server) |
| **First paid conversion** | every paid rail via `recordFirstPaidConversion` (server) |

Also stamped, for quality rather than volume:

- **ICP band**: recomputed server-side at email capture by the canonical lead scorer
  (`decideCallRequest` / `scoreCalculatorLead`). `sales_priority` is the count the scorecard shows
  as **ICP**. Nothing the browser sends can influence it.
- **Sub-avatar**: the acquisition cohort (`docs/SUB_AVATARS.md`), derived server-side.

### What still has to be measured outside CRWN

- Platform views, impressions, watch time, comments, follows. CRWN never sees these. Read them in
  Instagram/TikTok/YouTube analytics and pair them with the CRWN row for the same `utm_content`.
- ManyChat DM opens and reply rates. Read them in ManyChat.
- Anything before the link is clicked.

---

## 6. Where the results appear

`/admin` → **Lead Magnets**:

- **Content scorecard**: one row per campaign / video / angle / platform / keyword / variant,
  walked all the way from views to first paid conversion, plus the ICP count, the hand-raiser
  count, the sub-avatar the content actually pulled, and the **biggest conversion drop** for that
  row. Sorted by artists who got paid, not by views.
- The existing headline tiles, per-calculator table, and completion-rate rankings, unchanged.

`/api/admin/funnel-events` also now breaks the whole 20-stage funnel down `byVideo` as well as
`byCalculator` / `byCampaign` / `byReferrer`.

---

## 7. Attribution persistence and the first-touch rule

Two different rules, deliberately:

- **Event level (each beacon): last touch.** A tagged value on the current URL wins; the stored
  first-touch snapshot only fills what the current URL leaves empty. This is the behavior that was
  already live and it is unchanged.
- **Persisted level (what survives signup): FIRST TOUCH.** The normalized tag is written onto the
  artist's own calculator **result row** (`lead_magnet_results.input_data._attribution`), which is
  the row the existing claim path binds to their account at signup. Merging never replaces a field
  that is already set, so a later untagged visit, a partially-tagged retry, or a malformed value
  can never erase the video that actually brought them. A later visit can only ADD a dimension the
  first one left empty.

Because the durable copy lives on a server row rather than in the browser, attribution survives:

- navigating calculator → result → builder → signup
- anonymous to authenticated conversion
- a tokenized result link opened days later
- delayed signup, including on a different device or in incognito (the claim matches on the
  verified email)
- email nurture followed by a later signup
- duplicate visits (first touch wins, per the rule above)

---

## 8. Data integrity

- Every externally supplied value is normalized to a slug, allowlisted where a closed set exists,
  and length-capped. HTML, quotes, and script fragments cannot survive normalization.
- A stored tag is re-normalized when it is read back. It is treated as untrusted on the way out as
  well as the way in.
- Attribution never touches calculator math, pricing, fees, commissions, payouts, lead scoring, or
  any authorization decision. It is a reporting dimension and nothing else.
- Funnel stage names stay server-controlled (`FUNNEL_STAGES`). A query string cannot inject a
  stage, a column, or a metric.
- The admin scorecard's group-by dimension is allowlisted server-side.
- No email, phone, consent text, or private artist data appears in any of it.

---

## 9. Known limitations

1. **CRWN sees nothing before the click.** Views, comments and DM opens stay in the platform's own
   analytics.
2. **A signup with no calculator run has no attribution.** The durable tag rides on a result row.
   Someone who lands on a tagged link, never runs a calculator and never saves a draft, then signs
   up later, is unattributed below signup.
3. **CRWN revenue per campaign is not yet a column.** The scorecard reports first paid conversions
   per campaign; the money totals (`opportunity_ledger`) carry artist and calculator dimensions,
   not campaign. Joining them needs a ledger dimension that does not exist yet.
4. **Historic rows are untouched.** Nothing was backfilled. Campaign values recorded before
   2026-08-06 keep their raw (unnormalized) form and may not group with a newly normalized value.
5. **A very long or oddly punctuated name can collide after normalization** (`kcamp v1` and
   `kcamp-v1` are the same row). Pick names once.
6. **The scorecard shows the top 100 rows** per dimension for the selected window.

---

## 10. Deferred (do NOT build these for this phase)

- The affiliate / partner acquisition funnel: distinct audience, message, qualification path and
  onboarding. `ref=` already exists and is captured; nothing else should be built until that
  funnel is actually a decision.
- Paid-ad attribution (click ids, conversion APIs, server-side pixel forwarding).
- A ManyChat API integration. The founder pastes a link; that is the whole contract.
- A campaign management system: budgets, schedules, approvals, per-campaign kill switches for
  organic content.
- A campaign dimension on `opportunity_ledger` (limitation 3 above). Real, but it is a schema
  change that should wait until there is enough per-campaign revenue to read.
