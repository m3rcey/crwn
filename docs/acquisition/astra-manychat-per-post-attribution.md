# Astra prompt: per-post ManyChat attribution for the content test (9/25 to 9/29)

For GPT-6 Astra (computer use). Written 2026-09-26 by Claude Code from the live `social_posts`
queue, `lead_sessions`, the Instagram API and the registry. Nothing here changes what a lead sees.

**How to run it**
1. **Run 1 (tonight):** paste everything below the line as is. Astra does Part A and Part B, then stops.
2. **Pilot check (Josh, 2 minutes):** from your own Instagram `@m3rcey`, comment `VAULT` on the
   Knxwledge post (instagram.com/p/Ddxa_ZfiV3g). Confirm you get exactly ONE DM and ONE public
   reply, tap Show Me, then tell Claude "pilot done". Claude reads your session and answers
   PASSED (utm_content = the Knxwledge slug) or FAILED.
3. **Every later run:** only after Claude says PASSED. Paste the same text with this line added
   at the very top: `PILOT PASSED`. Astra then skips A and B and binds every post that has gone
   live since the last run. Run it after each posting slot if you can, at minimum about 12:30 PM
   and 8:30 PM Central, through 9/29 8:30 PM. A late binding loses nothing: comments that arrive
   before it go to the keyword automation and the funnel audit attributes them by username.

Send Claude Astra's report after every run.

---

You are operating my computer in ManyChat (manychat.com, already logged in to the CRWN Instagram
account @thecrwnapp). The job is attribution setup only: some automations get a copy that listens
to ONE specific Instagram post and tags its request with that post's id. No message, button,
question or copy changes anywhere. Everything you need is below. Do not explore other automations,
settings, billing, contacts, or documentation.

**First, read the first line of the message this prompt came in.**
- If it is `PILOT PASSED`: skip Part A and Part B, do Part C only.
- Otherwise: do Part A, then Part B, then STOP and send the report. Do not start Part C.

## Done means

- Part A: every keyword automation below is Live with the exact request values in Table 1.
- Part B: automation `VAULT | 39-knxwledge-half-a-million-beats` exists, is Live, listens only to
  the Knxwledge post, and its Test Request passed.
- Part C: every row of Table 2 whose time has passed has its own Live automation, bound to that
  one post, with a passing Test Request. Rows still in the future are reported NOT YET PUBLISHED.

## Table 1: the keyword automations (these stay as they are, except where Action says EDIT)

These listen to ANY post or reel. Open each one, and on the FIRST External Request (the Actions
node right after the opening message), Body tab, read the values. Do not click into the Headers
tab. The body ends with `"contact":` followed by a Full Contact Data pill and `}`.

| Automation | Must read Live | `lead_magnet_id` must be | `keyword` must be | `utm_content` now | Action |
|---|---|---|---|---|---|
| VAULT | yes | `vault-revenue-planner` | `VAULT` | `vault-reel-sep26-1` | **EDIT** (step A2) |
| WORTH | yes | `worth` | `WORTH` | none | VERIFY ONLY |
| OWN | yes | `own-your-fans-calculator` | `OWN` | none | VERIFY ONLY |
| FREE | yes | `opportunity-calculator` | `FREE` | `free_v1` | VERIFY ONLY |
| TOUR | yes | `between-tour-calculator` | `TOUR` | `tour` | VERIFY ONLY |
| DEMAND | yes | `proof-of-demand-test-builder` | `DEMAND` | `demand` | VERIFY ONLY |
| ROYALTY | see A3 | `royalty-readiness-check` | `ROYALTY` | any | A3 decides |
| LIVE | see A3 | `live-experience-calculator` | `LIVE` | any | A3 decides |

The automation's name may differ slightly (e.g. "VAULT flow"); match by the comment keyword on
its trigger. If two different automations both listen to any post for the same keyword, do not
edit either: mark that row NEEDS HUMAN REVIEW.

## Table 2: one automation per post (Part B is row 9, Part C is every other row)

Times are US Central. "Opening words" are the start of the Instagram caption; "Tell it apart by"
separates look-alike captions. The automation name is `<Keyword> | <utm_content>`.

| # | Post time (Central) | Keyword | Opening words of caption | Tell it apart by | utm_content (exact) | Source automation |
|---|---|---|---|---|---|---|
| 1 | 9/25 9:20 AM (live) | VAULT | Comment "VAULT" for what the unreleased work you already got could be priced at | Mach-Hommy, $999 record | `31-mach-hommy-he-set-the-price` | VAULT |
| 2 | 9/25 12:11 PM (live, reel) | VAULT | Comment "VAULT" for what you're leaving unsold. | Reel, "90 projects or 400 copies" | `reel-fe-1-currensy-vs-westside-gunn` | VAULT |
| 3 | 9/25 6:23 PM (live) | VAULT | Comment "VAULT" for what your top fans could get that nobody else can | Nipsey Hussle, $100 | `33-nipsey-hussle-the-music-was-free` | VAULT |
| 4 | 9/25 8:23 PM (live) | VAULT | Comment "VAULT" for whether you got enough unreleased work to give your buyers something first | ends "lands for everybody at once"; Roc Marciano | `35-roc-marciano-thirty-dollars-to-hear-it-first` | VAULT |
| 5 | 9/26 9:20 AM (live) | DEMAND | Comment "DEMAND" for whether your people will actually buy it | Stove God Cooks, vinyl versions | `36-stove-god-cooks-the-same-album-nine-ways` | DEMAND |
| 6 | 9/26 12:11 PM (live, reel) | WORTH | Comment "WORTH" for what your listeners aren't paying you each month. | Reel, "indie out-earned the mogul" | `reel-fe-2-tech-n9ne-vs-50-cent` | WORTH |
| 7 | 9/26 3:06 PM (live) | DEMAND | Comment "DEMAND" for whether your buyers would fund it | Elzhi, Kickstarter | `37-elzhi-paid-for-a-record-that-didnt-exist` | DEMAND |
| 8 | 9/26 6:23 PM (live) | VAULT | Comment "VAULT" for whether the work you already finished is enough to run a vault | Boldy James, four albums | `38-boldy-james-four-albums-one-year` | VAULT |
| 9 | 9/26 8:23 PM (live) **PILOT** | VAULT | Comment "VAULT" for whether what's already on your drive is enough to run a vault | Knxwledge, half a million beats | `39-knxwledge-half-a-million-beats` | VAULT |
| 10 | 9/27 9:00 AM | TOUR | Comment "TOUR" for what the months between shows are worth | Oddisee | `40-oddisee-seven-hundred-a-show` | TOUR |
| 11 | 9/27 12:00 PM (reel) | OWN | Comment "OWN" for how many of your fans you can't reach. | Reel, Tee Grizzley vs Drake | `reel-fe-3-tee-grizzley-vs-drake` | OWN |
| 12 | 9/27 3:00 PM | VAULT | Comment "VAULT" for what the top of your catalog could be priced at | Wu-Tang, one copy | `41-wu-tang-one-copy` | VAULT |
| 13 | 9/27 6:00 PM | OWN | Comment "OWN" for how much of your audience you could still reach without the shelf you sell on | De La Soul | `42-de-la-soul-thirty-years-off-streaming` | OWN |
| 14 | 9/27 8:00 PM | DEMAND | Comment "DEMAND" for whether your own buyers would fund it | Lil Dicky | `43-lil-dicky-funded-before-anybody-knew-him` | DEMAND |
| 15 | 9/28 9:00 AM | OWN | Comment "OWN" for how much of your audience you can actually reach without asking a platform first | Noname, book club | `44-noname-a-book-club-in-four-countries` | OWN |
| 16 | 9/28 12:00 PM (reel) | FREE | Comment "FREE" for what you're missing out on every month. | Reel, Tobe vs Travis Scott | `reel-fe-4-tobe-vs-travis-scott` | FREE |
| 17 | 9/28 3:00 PM | TOUR | Comment "TOUR" for what the months off the road are worth | Atmosphere | `45-atmosphere-said-no-to-three-labels` | TOUR |
| 18 | 9/28 6:00 PM | VAULT | Comment "VAULT" for whether you got enough unreleased work to run a vault, before another year of counting plays | ends "counting plays"; 38 Spesh vs Snoop | `46-38-spesh-vs-snoop-a-thousand-buyers` | VAULT |
| 19 | 9/28 8:00 PM | VAULT | Comment "VAULT" for whether you got enough unreleased work to give your buyers something first | ends "sits there forever"; SAULT | `47-sault-free-for-five-days` | VAULT |
| 20 | 9/29 9:00 AM | ROYALTY | Comment "ROYALTY" for which royalty streams your songs already earned from | Del vs J. Cole | `48-del-vs-j-cole-nine-albums` | ROYALTY (from A3) |
| 21 | 9/29 12:00 PM (reel) | VAULT | Comment "VAULT" for what your unreleased songs are leaving unsold. | Reel, Rapsody 328 songs | `reel-fe-5-rapsody-328-songs` | VAULT |
| 22 | 9/29 3:00 PM | VAULT | Comment "VAULT" for what to charge the buyers who never get offered anything above a regular copy | Benny vs Post Malone | `49-benny-vs-post-malone-they-bought-it-twice` | VAULT |
| 23 | 9/29 6:00 PM | LIVE | Comment "LIVE" for what one real ticketed night a month is worth | Murs, 24 hours | `50-murs-twenty-four-hours` | LIVE (from A3) |
| 24 | 9/29 8:00 PM | VAULT | Comment "VAULT" for whether you got enough unreleased work to run a vault, before another year of it earns nothing | ends "earns nothing"; Curren$y vs Westside Gunn carousel | `1-currensy-vs-westside-gunn-volume-vs-scarcity` | VAULT |

**The request body line for each source automation** (paste it with `<utm_content>` replaced by
the row's exact utm_content; it starts with `{` and ends with a colon, no closing brace):

| Source | Body line |
|---|---|
| VAULT | `{"event_type":"session_start","lead_magnet_id":"vault-revenue-planner","keyword":"VAULT","utm_content":"<utm_content>","consent_dm":true,"contact":` |
| WORTH | `{"event_type":"session_start","lead_magnet_id":"worth","keyword":"WORTH","consent_dm":true,"utm_source":"instagram","utm_campaign":"streaming_loss","utm_content":"<utm_content>","contact":` |
| OWN | `{"event_type":"session_start","lead_magnet_id":"own-your-fans-calculator","keyword":"OWN","utm_content":"<utm_content>","consent_dm":true,"contact":` |
| FREE | `{"event_type":"session_start","lead_magnet_id":"opportunity-calculator","keyword":"FREE","consent_dm":true,"utm_source":"instagram","utm_campaign":"all_in_one_calculator","utm_content":"<utm_content>","contact":` |
| TOUR | `{"event_type":"session_start","lead_magnet_id":"between-tour-calculator","keyword":"TOUR","consent_dm":true,"utm_source":"instagram","utm_content":"<utm_content>","contact":` |
| DEMAND | `{"event_type":"session_start","lead_magnet_id":"proof-of-demand-test-builder","keyword":"DEMAND","consent_dm":true,"utm_source":"instagram","utm_content":"<utm_content>","contact":` |
| ROYALTY | `{"event_type":"session_start","lead_magnet_id":"royalty-readiness-check","keyword":"ROYALTY","consent_dm":true,"utm_source":"instagram","utm_content":"<utm_content>","contact":` |
| LIVE | `{"event_type":"session_start","lead_magnet_id":"live-experience-calculator","keyword":"LIVE","consent_dm":true,"utm_source":"instagram","utm_content":"<utm_content>","contact":` |

Example, finished, for row 9 (this is the only row where the value is written out in full):
`{"event_type":"session_start","lead_magnet_id":"vault-revenue-planner","keyword":"VAULT","utm_content":"39-knxwledge-half-a-million-beats","consent_dm":true,"contact":`

## How to write a request body (used in A2 and step 6 below)

In the FIRST External Request of the automation, Body tab:
1. Click in the body field, select all, delete.
2. Paste the one body line. It ends with `"contact":`.
3. Click the **`+ Add Full Contact Data`** button. The pill lands at the cursor. Never type it,
   never put quotes around it.
4. Paste a single `}`.
Never touch the Headers tab (it holds a secret; never open, read, copy or report it). Never touch
the second External Request (the one whose body starts `{"event_type":"answer"`).

## How to run a Test Request (the smoke test)

Same External Request editor. In "Contact for testing" (top right) select ONLY **M3rcey**
(Instagram `m3rcey`), the founder's own test contact. A Test Request runs a REAL session for
whoever is selected, so never select anyone else. If M3rcey is not listed, skip the test and
report "no M3rcey". Click **Test Request**. PASS when the status is 200 and the response contains
`"action": "ask_question"` or `"action": "send_result"`. Copy the returned `message` text into
your notes.

## Part A: the keyword automations (Run 1 only)

A1. For every row of Table 1 except ROYALTY and LIVE: open it, confirm it reads Live, read the
    three values, compare to the table. Any mismatch in Live, `lead_magnet_id` or `keyword`:
    change nothing, mark the row NEEDS HUMAN REVIEW with what you saw, continue.
A2. VAULT only: before editing, write down the body text exactly as shown (describe the pill as
    `<pill>`). Then write the body with this line:
    `{"event_type":"session_start","lead_magnet_id":"vault-revenue-planner","keyword":"VAULT","utm_content":"vault","consent_dm":true,"contact":`
    Run the Test Request. Save, then Publish. Confirm it still reads Live. (The old value named one
    reel for comments from every post, which is wrong; `vault` means "post unknown".)
A3. ROYALTY, then LIVE. Look in the automation list for one whose comment trigger keyword is that
    word.
    - **It exists, reads Live, and `lead_magnet_id` matches Table 1:** VERIFY ONLY. Copy its
      opening message text and button label into your notes. Change nothing.
    - **It exists but is Off/Draft, or `lead_magnet_id` does not match:** do not edit or turn it
      on. Create a new one as below, named `ROYALTY v2` / `LIVE v2`.
    - **It does not exist:** create a new one as below, named `ROYALTY` / `LIVE`.
    To create: in the Automations list open the "…" menu on **VAULT**, **Duplicate**, rename.
    Triggers do NOT survive duplication, so add both:
      - Comment trigger ("Post or Reel comment"), **any post or reel**. Keywords:
        `royalty, ROYALTY, Royalty` or `live, LIVE, Live`. Match type the same as VAULT's (if
        you must choose: whole word / "is", never "contains"). Reply-to-comment setting and text
        exactly as VAULT's.
      - DM keyword trigger ("User sends a message"), same keywords.
    Opening message (the first Send Message, "As private reply"): replace ONLY its text with
      - ROYALTY: `Here comes which royalty streams your songs already earned that nobody is collecting.`
      - LIVE: `Here comes what a year of free promo streams is costing you, next to one ticketed night a month.`
    Keep its button and set the label to `Show Me`. Leave every other node alone.
    Body: write it with the ROYALTY or LIVE line from the body table, using `royalty` or `live`
    as the utm_content (for example `..."utm_content":"royalty","contact":`).
    Response mapping tab: confirm these five rows exist, add any missing:
    `action → crwn_action`, `message → crwn_message`, `question_key → crwn_question_key`,
    `result_url → crwn_result_url`, `session_id → crwn_session_id`.
    Run the Test Request. Publish / Set Live. Confirm Live in the list.

## Part B: the pilot (Run 1 only)

Do the per-post procedure below for **row 9 only**, then STOP and send the report. Do not create
any other per-post automation in this run.

## Part C: every other row (only when the message starts with `PILOT PASSED`)

Go through Table 2 in order. For each row:
- If an automation with that exact name already exists and reads Live: open it, check that its
  trigger is that one specific post and the body carries that row's utm_content. Mark VERIFIED
  (or NEEDS HUMAN REVIEW if either is wrong; change nothing). Next row.
- If the post time is less than 30 minutes ago or still in the future: mark NOT YET PUBLISHED,
  touch nothing. Next row.
- If the row's source automation is ROYALTY or LIVE: use whichever one Part A left Live
  (`ROYALTY v2` / `LIVE v2` if one was created).
- Otherwise do the per-post procedure.

## The per-post procedure (one row)

1. Automations list: open the "…" menu on the row's **source automation**, **Duplicate**. Rename
   the copy to `<Keyword> | <utm_content>`, e.g. `VAULT | 39-knxwledge-half-a-million-beats`.
   (If an unfinished copy with that name exists from an earlier run, open it and continue there.)
2. Add ONE trigger only: comment trigger ("Post or Reel comment"). Set "When someone comments on"
   to **a specific post or reel**, and pick the post that matches the row's opening words, time and
   "tell it apart by". Keywords, match type, and the reply-to-comment setting and text: exactly the
   same as on the source automation's comment trigger.
3. Do NOT add a DM keyword trigger to this copy. Never choose "any post or reel" or "next post"
   here.
4. Do not change any message, button, question, condition or delay in the copy.
5. Open the FIRST External Request, Body tab.
6. Write the body (see "How to write a request body") with the source's line and this row's
   utm_content.
7. Response mapping tab: the five rows listed in A3 exist (add any missing).
8. Run the Test Request with M3rcey. PASS as defined above.
9. Save. Publish / Set Live. Confirm it reads Live in the Automations list, and that the source
   automation still reads Live too.
10. Record the row, then go to the next.

## Known errors and the exact fix (do not stop for these)

- `Invalid JSON: Unexpected non-whitespace character after JSON at position 12`: the leading `{`
  is missing. Select all, delete, write the body again.
- `Invalid JSON` / "Variables are not defined" on Test Request: M3rcey is not selected as the
  contact for testing. Select M3rcey, retry.
- `400` on Test Request: the JSON is broken (usually a smart quote or a missing comma). Write the
  body again from the table, retry.
- `503 engine_disabled`: stop the whole run and report (the CRWN side is off; not yours to fix).
- The Test Request returns a question about unreleased songs on a copy whose source is NOT VAULT:
  the body did not save. Write it again, save, retest.
- The copy is named "VAULT (copy)" or similar: just rename it.
- The post picker does not show the row's post although its time passed 30+ minutes ago: scroll
  or search the picker once. Still missing: mark NOT YET PUBLISHED, leave the copy unpublished
  (do not delete it), next row.
- Two posts in the picker look alike: use the time and the "tell it apart by" words. Still unsure:
  NEEDS HUMAN REVIEW, leave the copy unpublished, next row.
- ManyChat warns the post is already used by another automation: do not publish; NEEDS HUMAN
  REVIEW, next row.

## Stop the whole run and hand back ONLY if

- ManyChat asks you to log in, pay, upgrade, or change the plan.
- Anything asks you to delete, disconnect, or change the Instagram connection.
- A Table 1 automation other than ROYALTY/LIVE does not exist.
- `503 engine_disabled`.

For anything else, mark the row (BLOCKED after two full retries of the same step, NEEDS HUMAN
REVIEW for anything that does not match this prompt) and continue with the next row.

## Never

- Never change any opening message, button, question, condition, delay, result message, or link,
  except the ROYALTY/LIVE opener text given in A3 when creating those two.
- Never edit, turn off, or delete an existing automation, except the VAULT body edit in A2.
- Never add a DM keyword trigger or an "any post" trigger to a per-post copy.
- Never send a DM, comment, or post from any account.
- Never select any test contact other than M3rcey.
- Never open, read, copy, or report the Headers tab.

## Report (this format only)

    Run: 1 (Parts A+B)  or  PILOT PASSED rerun      Time finished (Central): ...

    | Post | Keyword | Flow | utm_content | Action | Status | Issue |
    |---|---|---|---|---|---|---|
    (one line per Table 1 row you handled, then one line per Table 2 row you handled.
     Action: VERIFY ONLY / EDIT / CREATE AUTOMATION / ASSOCIATE POST / SKIP.
     Status: VERIFIED / FIXED / CREATED / BLOCKED / NOT YET PUBLISHED / NEEDS HUMAN REVIEW.)

    VAULT body before the A2 edit: ...
    ROYALTY: existed yes/no, was Live yes/no, opener text: "...", button: "..."
    LIVE:    existed yes/no, was Live yes/no, opener text: "...", button: "..."
    Test Request messages returned (row: message): ...
    Totals: audited N, already correct N, fixed N, created N, blocked N, not yet published N, needs review N
    Anything unexpected: ...
