# Astra prompt: build the TOUR and DEMAND ManyChat automations

For GPT-6 Astra (computer use). Paste everything below the line. Deadline: TOUR must be live
before **9:00 AM Central, 9/27** (first TOUR post). DEMAND before 8:00 PM Central, 9/27.

---

You are operating my computer to finish ONE task in ManyChat (manychat.com, already logged in to
the CRWN Instagram account @thecrwnapp): create two new automations, TOUR and DEMAND, by
duplicating the existing VAULT automation and editing it. Everything you need is below. Do not
explore other automations, settings, billing, or documentation. Work TOUR first, then DEMAND.

## Done means

For each of TOUR and DEMAND: the automation exists, is LIVE (published/active), its comment
trigger listens to any post or reel for its keyword, its DM keyword trigger exists, its opener
text and button are exactly as given, and its smoke test (step 7) passed. Then send the report.

## Values (copy exactly; these are the only values that change)

| | TOUR | DEMAND |
|---|---|---|
| Automation name | `TOUR` | `DEMAND` |
| Comment keywords | `tour, TOUR, Tour` | `demand, DEMAND, Demand` |
| DM keyword trigger | `tour, TOUR, Tour` | `demand, DEMAND, Demand` |
| Opener text (first message) | `Here comes what the months between your shows are costing you.` | `Here comes whether your buyers would fund your next release, before you pay for it yourself.` |
| Opener button label | `Show Me` | `Show Me` |
| Body line (step 5a) | see step 5 | see step 5 |

## Steps (per automation; TOUR first)

1. **Automations** list, find the automation for **VAULT**, open its "…" menu, **Duplicate**.
   Rename the copy to the automation name in the table.
2. **Triggers do NOT survive duplication. Re-create both on the copy:**
   - **Comment trigger** (Instagram "Post or Reel comment"): set "When someone comments on" to
     **any post or reel** (not a specific post: the posts it must catch are not published yet).
     Keywords: the table's comment keywords. Match type: the same as the VAULT automation's
     (if you must choose, pick whole word / "is", never "contains"). Copy VAULT's public
     "reply to their comment" setting and text exactly.
   - **DM keyword trigger** (Instagram "User sends a message" with keywords): the table's DM
     keywords.
3. **Node 1, the opening message** (the first Send Message, sent "As private reply"): replace
   ONLY the text with the table's opener text. Keep the button, and set its label to `Show Me`.
   Do not add a question, a number, or anything else.
4. Leave every other message node alone. Do not touch the second External Request (the one whose
   body starts `{"event_type":"answer"`). It needs no change.
5. **The FIRST External Request (Actions node right after the opener) → Body tab.** The body must
   be rebuilt in three moves, never one paste:
   a. Click in the body field, select all, delete. Then paste the ONE line for this automation.
      It starts with `{` and ends with a colon, with no closing brace:
      - TOUR:
        `{"event_type":"session_start","lead_magnet_id":"between-tour-calculator","keyword":"TOUR","consent_dm":true,"utm_source":"instagram","utm_content":"tour","contact":`
      - DEMAND:
        `{"event_type":"session_start","lead_magnet_id":"proof-of-demand-test-builder","keyword":"DEMAND","consent_dm":true,"utm_source":"instagram","utm_content":"demand","contact":`
   b. Click the **`+ Add Full Contact Data`** button (the pill lands at the cursor; never type it,
      never put quotes around it).
   c. Paste a single `}`.
   Do not open or change the Headers tab. It contains a secret; never read it aloud, copy it,
   or include it in your report.
6. **Response mapping tab** of that same request: confirm these five rows exist (they carry over
   from the duplicate). If one is missing, add it:
   `action → crwn_action`, `message → crwn_message`, `question_key → crwn_question_key`,
   `result_url → crwn_result_url`, `session_id → crwn_session_id`.
7. **Smoke test.** Same request. In "Contact for testing" (top right) select ONLY the founder's
   own test contact, **M3rcey** (Instagram `m3rcey`). The test runs a
   REAL session for whoever is selected, so never pick a lead. If that contact is not listed,
   skip the test and report it. (Run on 2026-09-27 with "any contact"; Astra picked a real lead.)
   Click **Test Request**. PASS when the response shows status 200 and
   `"message": "Roughly how many followers do you have across your socials?"`
   (and, if shown, `"action": "ask_question"`).
8. **Publish / Set Live** the automation. Confirm its status reads Live/Active in the list.

## Known errors and the exact fix (do not stop for these)

- `Invalid JSON: Unexpected non-whitespace character after JSON at position 12`: the leading
  `{` is missing. Select all in the body, delete, redo step 5 a, b, c.
- `Invalid JSON` / "Variables are not defined" on Test Request: no test contact is selected.
  Select any contact, retry.
- The smoke test returns a question about **unreleased songs / your vault**: the body edit did not
  save and it is still running VAULT. Redo step 5, save, retest.
- `503 engine_disabled`: stop and report (the CRWN side is switched off; not yours to fix).
- A duplicate is named "VAULT (copy)" or similar: just rename it.
- The trigger picker offers only specific posts: look for "any post or reel" / "all posts" in the
  same dropdown before concluding it is missing.

## Stop and hand back to me ONLY if

- ManyChat asks you to log in, pay, upgrade, or change the plan.
- Test Request still fails after two full retries of step 5.
- Anything asks you to delete, disconnect, or change the Instagram connection, or to edit the
  VAULT, WORTH, OWN or FREE automations themselves.
- The VAULT automation does not exist.

Do not stop for anything else: use the fixes above and continue.

## Never

- Never edit or turn off any existing automation (only the two new copies).
- Never send a DM, comment, or post from any account.
- Never change the opener text beyond the exact words in the table.

## Report (short, this format only)

    TOUR:   live yes/no | comment trigger any-post yes/no | DM trigger yes/no | smoke test PASS/FAIL (message returned: "...")
    DEMAND: live yes/no | comment trigger any-post yes/no | DM trigger yes/no | smoke test PASS/FAIL (message returned: "...")
    Test contact used for the smoke test (name or IG handle): ...
    Anything unexpected: ...
