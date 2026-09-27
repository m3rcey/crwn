# Astra prompt: ManyChat per-post automations for the rest of the content test

For GPT-6 Astra (computer use). Written 2026-09-26 after the Knxwledge pilot PASSED all nine
checks ([astra-manychat-per-post-attribution.md](astra-manychat-per-post-attribution.md)): one
comment gave one DM and one public reply, the only session after it carried the slug, keyword and
tool exactly, no fallback session appeared, and the funnel audit resolved it to the post `via tag`.
Rows and bodies were generated from the live `social_posts` queue, not typed by hand.

**How to run it.** The same text every time. It is safe to rerun: rows already done are only
checked, rows whose post is not out yet are skipped.
1. **Tonight:** paste it. Rows 1 to 8 (already live) get built; the rest report NOT YET PUBLISHED.
2. **Then after each posting slot** (9 AM, 12 PM, 3 PM, 6 PM, 8 PM Central; at minimum about
   12:30 PM and 8:30 PM) through 9/29 8:30 PM, paste it again.
Comments that land before a post is bound still get their DM from the keyword automation; the audit
attributes those by commenter username. Send Claude every report.

---

You are operating my computer in ManyChat (manychat.com, already logged in to the CRWN Instagram
account @thecrwnapp). The job: for each Instagram post in the table below, make ONE copy of its
keyword automation that listens only to that post, and put that post's id in one request field.
The same thing was already done once and verified (`VAULT | 39-knxwledge-half-a-million-beats`);
open it if you want to see a finished example, but change nothing in it. No message, button,
question or copy changes anywhere. Do not explore other automations, settings, billing, contacts,
or documentation.

## Done means

Every table row whose scheduled time is at least 30 minutes in the past has an automation named
exactly as in the table that reads Live, listens only to that one post, has no DM keyword trigger,
carries that row's body, and passed its Test Request. Rows still in the future are reported
NOT YET PUBLISHED and untouched.

## The posts (times are the SCHEDULED slot, US Central; the post appears 5 to 25 minutes later)

The source automation for each row is the existing automation with that row's keyword (VAULT,
WORTH, OWN, FREE, TOUR, DEMAND, ROYALTY, LIVE; all Live, all verified tonight). Never copy from
another per-post automation.

| # | Scheduled (Central) | Keyword | Caption begins | Tell it apart by | Automation name (exact) |
|---|---|---|---|---|---|
| 1 | 9/25 9:00 AM (live, instagram.com/p/DdtqT1-liue) | VAULT | Comment "VAULT" for what the unreleased work you already got could be priced at | Mach-Hommy, $999 record | `VAULT \| 31-mach-hommy-he-set-the-price` |
| 2 | 9/25 12:00 PM (live reel, instagram.com/reel/Ddt9iLrCtBH) | VAULT | Comment "VAULT" for what you're leaving unsold. | reel, "90 projects or 400 copies" | `VAULT \| reel-fe-1-currensy-vs-westside-gunn` |
| 3 | 9/25 6:00 PM (live, instagram.com/p/DduoeHmlSU-) | VAULT | Comment "VAULT" for what your top fans could get that nobody else can | Nipsey Hussle, $100 | `VAULT \| 33-nipsey-hussle-the-music-was-free` |
| 4 | 9/25 8:00 PM (live, instagram.com/p/Ddu2MbXkSGC) | VAULT | Comment "VAULT" for whether you got enough unreleased work to give your buyers something first | ends "lands for everybody at once"; Roc Marciano | `VAULT \| 35-roc-marciano-thirty-dollars-to-hear-it-first` |
| 5 | 9/26 9:00 AM (live, instagram.com/p/DdwPGOnlN6m) | DEMAND | Comment "DEMAND" for whether your people will actually buy it | Stove God Cooks, vinyl | `DEMAND \| 36-stove-god-cooks-the-same-album-nine-ways` |
| 6 | 9/26 12:00 PM (live reel, instagram.com/reel/DdwiY-DDtCY) | WORTH | Comment "WORTH" for what your listeners aren't paying you each month. | reel, "indie out-earned the mogul" | `WORTH \| reel-fe-2-tech-n9ne-vs-50-cent` |
| 7 | 9/26 3:00 PM (live, instagram.com/p/Ddw2rtVCQQe) | DEMAND | Comment "DEMAND" for whether your buyers would fund it | Elzhi, Kickstarter | `DEMAND \| 37-elzhi-paid-for-a-record-that-didnt-exist` |
| 8 | 9/26 6:00 PM (live, instagram.com/p/DdxNPc7lFjJ) | VAULT | Comment "VAULT" for whether the work you already finished is enough to run a vault | Boldy James, four albums | `VAULT \| 38-boldy-james-four-albums-one-year` |
| 9 | 9/27 9:00 AM | TOUR | Comment "TOUR" for what the months between shows are worth | Oddisee | `TOUR \| 40-oddisee-seven-hundred-a-show` |
| 10 | 9/27 12:00 PM (reel) | OWN | Comment "OWN" for how many of your fans you can't reach. | reel, Tee Grizzley vs Drake | `OWN \| reel-fe-3-tee-grizzley-vs-drake` |
| 11 | 9/27 3:00 PM | VAULT | Comment "VAULT" for what the top of your catalog could be priced at | Wu-Tang, one copy | `VAULT \| 41-wu-tang-one-copy` |
| 12 | 9/27 6:00 PM | OWN | Comment "OWN" for how much of your audience you could still reach without the shelf you sell on | De La Soul | `OWN \| 42-de-la-soul-thirty-years-off-streaming` |
| 13 | 9/27 8:00 PM | DEMAND | Comment "DEMAND" for whether your own buyers would fund it | Lil Dicky | `DEMAND \| 43-lil-dicky-funded-before-anybody-knew-him` |
| 14 | 9/28 9:00 AM | OWN | Comment "OWN" for how much of your audience you can actually reach without asking a platform first | Noname, book club | `OWN \| 44-noname-a-book-club-in-four-countries` |
| 15 | 9/28 12:00 PM (reel) | FREE | Comment "FREE" for what you're missing out on every month. | reel, Tobe vs Travis Scott | `FREE \| reel-fe-4-tobe-vs-travis-scott` |
| 16 | 9/28 3:00 PM | TOUR | Comment "TOUR" for what the months off the road are worth | Atmosphere | `TOUR \| 45-atmosphere-said-no-to-three-labels` |
| 17 | 9/28 6:00 PM | VAULT | Comment "VAULT" for whether you got enough unreleased work to run a vault, before another year of counting plays | ends "counting plays"; 38 Spesh vs Snoop | `VAULT \| 46-38-spesh-vs-snoop-a-thousand-buyers` |
| 18 | 9/28 8:00 PM | VAULT | Comment "VAULT" for whether you got enough unreleased work to give your buyers something first | ends "sits there forever"; SAULT | `VAULT \| 47-sault-free-for-five-days` |
| 19 | 9/29 9:00 AM | ROYALTY | Comment "ROYALTY" for which royalty streams your songs already earned from | Del vs J. Cole | `ROYALTY \| 48-del-vs-j-cole-nine-albums` |
| 20 | 9/29 12:00 PM (reel) | VAULT | Comment "VAULT" for what your unreleased songs are leaving unsold. | reel, Rapsody 328 songs | `VAULT \| reel-fe-5-rapsody-328-songs` |
| 21 | 9/29 3:00 PM | VAULT | Comment "VAULT" for what to charge the buyers who never get offered anything above a regular copy | Benny vs Post Malone | `VAULT \| 49-benny-vs-post-malone-they-bought-it-twice` |
| 22 | 9/29 6:00 PM | LIVE | Comment "LIVE" for what one real ticketed night a month is worth | Murs, 24 hours | `LIVE \| 50-murs-twenty-four-hours` |
| 23 | 9/29 8:00 PM | VAULT | Comment "VAULT" for whether you got enough unreleased work to run a vault, before another year of it earns nothing | ends "earns nothing"; Curren$y vs Westside Gunn carousel (not the reel in row 2) | `VAULT \| 1-currensy-vs-westside-gunn-volume-vs-scarcity` |

(In the names, `\|` is just the character `|`: type `VAULT | 31-mach-hommy-he-set-the-price`.)

## The exact body line for each row

Each starts with `{` and ends with `"contact":`. Paste it exactly; do not edit it.

1. `{"event_type":"session_start","lead_magnet_id":"vault-revenue-planner","keyword":"VAULT","utm_content":"31-mach-hommy-he-set-the-price","consent_dm":true,"contact":`
2. `{"event_type":"session_start","lead_magnet_id":"vault-revenue-planner","keyword":"VAULT","utm_content":"reel-fe-1-currensy-vs-westside-gunn","consent_dm":true,"contact":`
3. `{"event_type":"session_start","lead_magnet_id":"vault-revenue-planner","keyword":"VAULT","utm_content":"33-nipsey-hussle-the-music-was-free","consent_dm":true,"contact":`
4. `{"event_type":"session_start","lead_magnet_id":"vault-revenue-planner","keyword":"VAULT","utm_content":"35-roc-marciano-thirty-dollars-to-hear-it-first","consent_dm":true,"contact":`
5. `{"event_type":"session_start","lead_magnet_id":"proof-of-demand-test-builder","keyword":"DEMAND","consent_dm":true,"utm_source":"instagram","utm_content":"36-stove-god-cooks-the-same-album-nine-ways","contact":`
6. `{"event_type":"session_start","lead_magnet_id":"worth","keyword":"WORTH","consent_dm":true,"utm_source":"instagram","utm_medium":"organic","utm_campaign":"streaming_loss","utm_content":"reel-fe-2-tech-n9ne-vs-50-cent","contact":`
7. `{"event_type":"session_start","lead_magnet_id":"proof-of-demand-test-builder","keyword":"DEMAND","consent_dm":true,"utm_source":"instagram","utm_content":"37-elzhi-paid-for-a-record-that-didnt-exist","contact":`
8. `{"event_type":"session_start","lead_magnet_id":"vault-revenue-planner","keyword":"VAULT","utm_content":"38-boldy-james-four-albums-one-year","consent_dm":true,"contact":`
9. `{"event_type":"session_start","lead_magnet_id":"between-tour-calculator","keyword":"TOUR","consent_dm":true,"utm_source":"instagram","utm_content":"40-oddisee-seven-hundred-a-show","contact":`
10. `{"event_type":"session_start","lead_magnet_id":"own-your-fans-calculator","keyword":"OWN","consent_dm":true,"utm_content":"reel-fe-3-tee-grizzley-vs-drake","contact":`
11. `{"event_type":"session_start","lead_magnet_id":"vault-revenue-planner","keyword":"VAULT","utm_content":"41-wu-tang-one-copy","consent_dm":true,"contact":`
12. `{"event_type":"session_start","lead_magnet_id":"own-your-fans-calculator","keyword":"OWN","consent_dm":true,"utm_content":"42-de-la-soul-thirty-years-off-streaming","contact":`
13. `{"event_type":"session_start","lead_magnet_id":"proof-of-demand-test-builder","keyword":"DEMAND","consent_dm":true,"utm_source":"instagram","utm_content":"43-lil-dicky-funded-before-anybody-knew-him","contact":`
14. `{"event_type":"session_start","lead_magnet_id":"own-your-fans-calculator","keyword":"OWN","consent_dm":true,"utm_content":"44-noname-a-book-club-in-four-countries","contact":`
15. `{"event_type":"session_start","lead_magnet_id":"opportunity-calculator","keyword":"FREE","consent_dm":true,"utm_source":"instagram","utm_medium":"organic","utm_campaign":"all_in_one_calculator","utm_content":"reel-fe-4-tobe-vs-travis-scott","contact":`
16. `{"event_type":"session_start","lead_magnet_id":"between-tour-calculator","keyword":"TOUR","consent_dm":true,"utm_source":"instagram","utm_content":"45-atmosphere-said-no-to-three-labels","contact":`
17. `{"event_type":"session_start","lead_magnet_id":"vault-revenue-planner","keyword":"VAULT","utm_content":"46-38-spesh-vs-snoop-a-thousand-buyers","consent_dm":true,"contact":`
18. `{"event_type":"session_start","lead_magnet_id":"vault-revenue-planner","keyword":"VAULT","utm_content":"47-sault-free-for-five-days","consent_dm":true,"contact":`
19. `{"event_type":"session_start","lead_magnet_id":"royalty-readiness-check","keyword":"ROYALTY","consent_dm":true,"utm_content":"48-del-vs-j-cole-nine-albums","contact":`
20. `{"event_type":"session_start","lead_magnet_id":"vault-revenue-planner","keyword":"VAULT","utm_content":"reel-fe-5-rapsody-328-songs","consent_dm":true,"contact":`
21. `{"event_type":"session_start","lead_magnet_id":"vault-revenue-planner","keyword":"VAULT","utm_content":"49-benny-vs-post-malone-they-bought-it-twice","consent_dm":true,"contact":`
22. `{"event_type":"session_start","lead_magnet_id":"live-experience-calculator","keyword":"LIVE","consent_dm":true,"utm_content":"50-murs-twenty-four-hours","contact":`
23. `{"event_type":"session_start","lead_magnet_id":"vault-revenue-planner","keyword":"VAULT","utm_content":"1-currensy-vs-westside-gunn-volume-vs-scarcity","consent_dm":true,"contact":`

## For each row, in table order

- **The scheduled time is less than 30 minutes ago, or in the future:** mark NOT YET PUBLISHED,
  touch nothing, next row.
- **An automation with that exact name exists and reads Live:** open it and check three things:
  its only comment trigger is that one specific post, it has no DM keyword trigger, and its first
  External Request body is that row's line. All true: VERIFIED. Any false: NEEDS HUMAN REVIEW,
  change nothing. Next row.
- **An automation with that exact name exists but is not Live** (an unfinished earlier attempt):
  open it and continue the steps below from the first one it is missing.
- **Otherwise:** do the steps below.

1. Open the SOURCE automation's comment trigger without changing anything and write down its
   keywords, match type, whether "reply to their comment" is on, and the reply text(s). Close
   without saving.
2. Automations list: "…" menu on the source automation, **Duplicate**. Rename the copy to the
   row's exact name.
3. **The copy KEEPS the source's triggers.** Open the copy's triggers:
   - Delete every DM keyword trigger ("User sends a message") on the copy.
   - Edit its comment trigger (do not add a second one): set "When someone comments on" to
     **a specific post or reel** and pick the row's post, using the caption, the time and "tell
     it apart by". Keywords, match type, and reply-to-comment setting and texts: exactly what you
     wrote down in step 1.
   - The copy must end with exactly ONE trigger: that post's comment trigger. Never "any post or
     reel", never "next post".
4. Change no message, button, question, condition, delay or link in the copy. Confirm its opening
   message text and button label read the same as the source's.
5. Open the copy's FIRST External Request (the Actions node right after the opening message),
   Body tab:
   a. click in the body, select all, delete;
   b. paste the row's body line;
   c. click **`+ Add Full Contact Data`** (the pill lands at the cursor; never type it, never
      quote it);
   d. paste a single `}`.
   Never touch the Headers tab (it holds a secret; never open, read, copy or report it). Never
   touch the second External Request (the one whose body starts `{"event_type":"answer"`).
6. Response mapping tab: confirm these five rows exist, add any missing:
   `action → crwn_action`, `message → crwn_message`, `question_key → crwn_question_key`,
   `result_url → crwn_result_url`, `session_id → crwn_session_id`.
7. **Test Request.** "Contact for testing" (top right): select ONLY **M3rcey** (Instagram
   `m3rcey`), the founder's own test contact; a Test Request runs a REAL session for whoever is
   selected, so never anyone else. If M3rcey is not listed, skip the test and note "no M3rcey".
   PASS = status 200 and the response contains `"action": "ask_question"` or
   `"action": "send_result"`. Note the returned `message`.
8. Save. Publish / Set Live. In the Automations list confirm the copy reads Live AND the source
   automation still reads Live.
9. Record the row, next row.

## Known errors and the exact fix (do not stop for these)

- `Invalid JSON: Unexpected non-whitespace character after JSON at position 12`: the leading `{`
  is missing. Select all, delete, redo step 5.
- `Invalid JSON` / "Variables are not defined": M3rcey is not selected. Select M3rcey, retry.
- `400` on Test Request: broken JSON (smart quote or missing comma). Redo step 5 from the line
  above, retry.
- "Field is missing" when publishing from the Basic Builder view: publish from the Flow Builder
  canvas instead, changing nothing.
- The Test Request returns "How many unreleased songs, demos, and ideas are sitting in your
  vault?" on a row whose keyword is NOT VAULT: the body did not save. Redo step 5, save, retest.
- The copy is named "VAULT (copy)" or similar: rename it.
- The post is not in the picker although its slot was 30+ minutes ago: scroll or search once.
  Still missing: leave the copy unpublished (never delete it), mark NOT YET PUBLISHED, next row.
- Two posts in the picker look alike: use the time and "tell it apart by". Still unsure: NEEDS
  HUMAN REVIEW, leave the copy unpublished, next row.
- ManyChat warns the post is already used by another automation: do not publish, NEEDS HUMAN
  REVIEW, next row.

## Stop the whole run and hand back ONLY if

- ManyChat asks you to log in, pay, upgrade, or change the plan.
- Anything asks you to delete, disconnect, or change the Instagram connection.
- A Test Request returns `503 engine_disabled`.
- A source automation (VAULT, WORTH, OWN, FREE, TOUR, DEMAND, ROYALTY, LIVE) is missing or not Live.

For anything else, mark the row (BLOCKED after two full retries of the same step, NEEDS HUMAN
REVIEW for anything that does not match this prompt) and continue.

## Never

- Never edit, turn off, or delete any existing automation, including the eight source automations
  and `VAULT | 39-knxwledge-half-a-million-beats`. Only the new copies change.
- Never change any opening message, button, question, condition, delay, result message, or link.
- Never leave a DM keyword trigger or an "any post" trigger on a copy.
- Never send a DM, comment, or post from any account.
- Never select any test contact other than M3rcey.
- Never open, read, copy, or report the Headers tab.

## Report (this format only)

    Time finished (Central): ...

    | Post | Keyword | Flow | utm_content | Action | Status | Issue |
    |---|---|---|---|---|---|---|
    (one line per table row, all 23, in order. Action: ASSOCIATE POST / VERIFY ONLY / SKIP.
     Status: CREATED / VERIFIED / NOT YET PUBLISHED / BLOCKED / NEEDS HUMAN REVIEW.)

    For each CREATED row: copy triggers after step 3 (count, type, which post), Test Request
    status + action + message, Live yes/no, source still Live yes/no.
    Totals: created N, verified N, not yet published N, blocked N, needs review N
    Anything unexpected: ...
