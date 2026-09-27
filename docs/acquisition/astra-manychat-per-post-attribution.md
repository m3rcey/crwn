# Astra prompt: ManyChat per-post attribution PILOT (Knxwledge post only)

For GPT-6 Astra (computer use). Revised 2026-09-26 after Josh confirmed ROYALTY and LIVE are on.
Nothing here changes what a lead sees. The remaining per-post automations are NOT in this prompt:
Claude writes that prompt only after the pilot passes every check below, from the live queue at
that time.

**Run order**
1. Paste everything below the line into Astra. Send Claude its report.
2. Only if the report says the pilot automation is Live with a passing Test Request: from your own
   Instagram `@m3rcey`, comment exactly `VAULT` on the Knxwledge post
   (instagram.com/p/Ddxa_ZfiV3g). Then:
   - count the DMs from @thecrwnapp (must be exactly ONE),
   - count the public replies under your comment from @thecrwnapp (must be exactly ONE),
   - check the DM reads the same as a normal VAULT DM,
   - tap Show Me, and answer the first question with anything,
   - tell Claude "pilot done" and the time you commented.
3. Claude checks all nine pass conditions below and answers PASSED or FAILED. Nothing else is
   built until it says PASSED.

**The nine pass conditions and who proves each**

| # | Condition | Proven by |
|---|---|---|
| 1 | One comment produces exactly one private DM | Josh counts; Claude reads the DM thread (IG API) |
| 2 | No duplicate DM | same |
| 3 | No duplicate public reply | Josh counts; Claude reads the post's comment replies (IG API) |
| 4 | `utm_content` = `39-knxwledge-half-a-million-beats` | Claude: the M3rcey `lead_sessions` row started AFTER the comment (the Test Request's own row is earlier and does not count) |
| 5 | `keyword` = `VAULT` | same row |
| 6 | `lead_magnet_id` = `vault-revenue-planner` | same row |
| 7 | The fallback did not overwrite it | Claude: exactly one M3rcey session after the comment, none carrying `utm_content: vault` |
| 8 | The funnel audit resolves it to the Knxwledge post, by tag | `node scripts/funnel-audit.mjs --since 2026-09-26 --include-founder` prints the row `-> 09-27T01:23 VAULT FEED via tag` |
| 9 | User-facing copy unchanged | Astra reports the source and copy opener text identical; Josh confirms the DM matches |

Any failure or ambiguity: stop, no further per-post automations.

---

You are operating my computer in ManyChat (manychat.com, already logged in to the CRWN Instagram
account @thecrwnapp). This is attribution setup only. You will (A) read six existing automations
and change one value in one of them, and (B) build ONE copy of the VAULT automation that listens
to ONE specific Instagram post. No message, button, question or copy changes anywhere. Do not
explore other automations, settings, billing, contacts, or documentation. Do not build any other
per-post automation, even if it looks useful.

## Done means

- Part A: WORTH, OWN, FREE, TOUR, DEMAND, ROYALTY, LIVE were read and reported. VAULT reads Live
  with the new body.
- Part B: an automation named `VAULT | 39-knxwledge-half-a-million-beats` exists, reads Live,
  listens only to the Knxwledge post, has no DM keyword trigger, and its Test Request passed.

## Part A: the existing keyword automations

These listen to ANY post or reel. For each, open it and, on the FIRST External Request (the
Actions node right after the opening message), Body tab, read the values. Never click the Headers
tab. The body ends with `"contact":`, then a Full Contact Data pill, then `}`. Match automations
by the keyword on their comment trigger, not by name.

| Automation | Must read Live | `lead_magnet_id` expected | `keyword` expected | Action |
|---|---|---|---|---|
| VAULT | yes | `vault-revenue-planner` | `VAULT` | **EDIT the body** (step A2) |
| WORTH | yes | `worth` | `WORTH` | VERIFY ONLY |
| OWN | yes | `own-your-fans-calculator` | `OWN` | VERIFY ONLY |
| FREE | yes | `opportunity-calculator` | `FREE` | VERIFY ONLY |
| TOUR | yes | `between-tour-calculator` | `TOUR` | VERIFY ONLY |
| DEMAND | yes | `proof-of-demand-test-builder` | `DEMAND` | VERIFY ONLY |
| ROYALTY | yes | `royalty-readiness-check` | `ROYALTY` | VERIFY ONLY |
| LIVE | yes | `live-experience-calculator` | `LIVE` | VERIFY ONLY |

A1. For every VERIFY ONLY row: confirm Live, read the whole body, and write it down exactly as
    shown (write the pill as `<pill>`). For ROYALTY and LIVE also write down the opening message
    text and its button label. If anything differs from the table (not Live, a different
    `lead_magnet_id`, a different `keyword`, or two automations listening to any post for the same
    keyword): change NOTHING, mark it NEEDS HUMAN REVIEW with what you saw, and continue. Never
    turn an automation on or off, never rebuild one.
A2. VAULT: write down its current body exactly as shown (pill as `<pill>`). If its
    `lead_magnet_id` is not `vault-revenue-planner` or its `keyword` is not `VAULT`, change
    nothing, mark NEEDS HUMAN REVIEW, and skip Part B. Otherwise replace the body using "How to
    write a request body" with this line:
    `{"event_type":"session_start","lead_magnet_id":"vault-revenue-planner","keyword":"VAULT","utm_content":"vault","consent_dm":true,"contact":`
    Run the Test Request. Save, then Publish. Confirm it still reads Live.

## Part B: the pilot automation (one post only)

The post: published 9/26 at 8:23 PM Central, a carousel. Its caption begins
`Comment "VAULT" for whether what's already on your drive is enough to run a vault` and it is
about Knxwledge and half a million beats. Link: instagram.com/p/Ddxa_ZfiV3g.

B1. First, open the VAULT automation's comment trigger WITHOUT changing it and write down: its
    keywords, its match type, whether "reply to their comment" is on, and the reply text(s).
    Also write down VAULT's opening message text and button label. Close it without saving.
B2. Automations list: open the "…" menu on **VAULT**, choose **Duplicate**. Rename the copy to
    `VAULT | 39-knxwledge-half-a-million-beats`. (If a copy with that name already exists from an
    earlier attempt, open it and continue from the first step it is missing.)
B3. Triggers do not survive duplication. Add ONE trigger: comment trigger ("Post or Reel
    comment"). Set "When someone comments on" to **a specific post or reel** and pick the
    Knxwledge post described above. Keywords, match type, and the reply-to-comment setting and
    text: exactly what you wrote down in B1.
B4. Do NOT add a DM keyword trigger. Never choose "any post or reel" or "next post" here.
B5. Do not change any message, button, question, condition, delay or link in the copy. Confirm
    the copy's opening message text and button label are identical to what you wrote down in B1.
B6. Open the copy's FIRST External Request, Body tab, and write the body using "How to write a
    request body" with this line:
    `{"event_type":"session_start","lead_magnet_id":"vault-revenue-planner","keyword":"VAULT","utm_content":"39-knxwledge-half-a-million-beats","consent_dm":true,"contact":`
B7. Response mapping tab: confirm these five rows exist, add any missing:
    `action → crwn_action`, `message → crwn_message`, `question_key → crwn_question_key`,
    `result_url → crwn_result_url`, `session_id → crwn_session_id`.
B8. Run the Test Request.
B9. Save. Publish / Set Live. In the Automations list confirm the copy reads Live AND VAULT still
    reads Live.
B10. Stop. Do not create anything else. Send the report.

## How to write a request body

In the FIRST External Request, Body tab:
1. Click in the body field, select all, delete.
2. Paste the one line given. It starts with `{` and ends with `"contact":`.
3. Click the **`+ Add Full Contact Data`** button. The pill lands at the cursor. Never type it,
   never put quotes around it.
4. Paste a single `}`.
Never touch the Headers tab (it holds a secret; never open, read, copy or report it). Never touch
the second External Request (the one whose body starts `{"event_type":"answer"`).

## How to run a Test Request

Same External Request editor. In "Contact for testing" (top right) select ONLY **M3rcey**
(Instagram `m3rcey`), the founder's own test contact. A Test Request runs a REAL session for
whoever is selected, so never select anyone else. If M3rcey is not listed, do not test, and
report "no M3rcey". Click **Test Request**. PASS when the status is 200 and the response contains
`"action": "ask_question"` or `"action": "send_result"`. Copy the returned `message` text into
your notes.

## Known errors and the exact fix (do not stop for these)

- `Invalid JSON: Unexpected non-whitespace character after JSON at position 12`: the leading `{`
  is missing. Select all, delete, write the body again.
- `Invalid JSON` / "Variables are not defined": M3rcey is not selected as the contact for
  testing. Select M3rcey, retry.
- `400` on Test Request: the JSON is broken (usually a smart quote or a missing comma). Write the
  body again from this prompt, retry.
- The copy is named "VAULT (copy)" or similar: just rename it.
- The post picker does not show the Knxwledge post: scroll or search the picker once. Still
  missing: leave the copy unpublished (do not delete it), mark BLOCKED, and send the report.
- ManyChat warns that the post is already used by another automation: do not publish, mark NEEDS
  HUMAN REVIEW, send the report.

## Stop the whole run and hand back ONLY if

- ManyChat asks you to log in, pay, upgrade, or change the plan.
- Anything asks you to delete, disconnect, or change the Instagram connection.
- A Test Request returns `503 engine_disabled`.
- The same step fails after two full retries.

Do not stop for anything else: mark the row and continue.

## Never

- Never change any opening message, button, question, condition, delay, result message, or link.
- Never turn an automation on or off, rebuild one, or delete one. The only edit to an existing
  automation is the VAULT body in A2.
- Never create any per-post automation other than the Knxwledge one.
- Never send a DM, comment, or post from any account.
- Never select any test contact other than M3rcey.
- Never open, read, copy, or report the Headers tab.

## Report (this format only)

    Time finished (Central): ...

    | Post | Keyword | Flow | utm_content | Action | Status | Issue |
    |---|---|---|---|---|---|---|
    | (any post) | VAULT | VAULT | vault | EDIT | FIXED / NEEDS HUMAN REVIEW | |
    | (any post) | WORTH | WORTH | (as seen) | VERIFY ONLY | VERIFIED / NEEDS HUMAN REVIEW | |
    | (any post) | OWN | ... |
    | (any post) | FREE | ... |
    | (any post) | TOUR | ... |
    | (any post) | DEMAND | ... |
    | (any post) | ROYALTY | ... |
    | (any post) | LIVE | ... |
    | Knxwledge 9/26 8:23 PM | VAULT | (the pilot copy) | 39-knxwledge-half-a-million-beats | CREATE ENTRY/TRIGGER | CREATED / BLOCKED / NEEDS HUMAN REVIEW | |

    Bodies as seen before any edit (one line each, pill as <pill>):
      VAULT: ...   WORTH: ...   OWN: ...   FREE: ...   TOUR: ...   DEMAND: ...   ROYALTY: ...   LIVE: ...
    ROYALTY opener: "..."  button: "..."
    LIVE opener: "..."  button: "..."
    VAULT comment trigger: keywords ..., match type ..., reply-to-comment on/off, reply text "..."
    Pilot copy comment trigger: specific post yes/no, keywords ..., match type ..., reply text "..."
    Pilot copy has a DM keyword trigger: yes/no (must be no)
    VAULT opener vs pilot copy opener identical: yes/no  (text: "...", button: "...")
    Test Request results (automation: status, action, message): ...
    Live in the list: VAULT yes/no, pilot copy yes/no
    Anything unexpected: ...
