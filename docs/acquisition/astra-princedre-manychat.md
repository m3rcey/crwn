# Astra prompt: build Prince Dre's 17 ManyChat automations

**For:** GPT-6 Astra (computer use), driven by Josh.
**Deadline:** VOTE must be live today (2026-10-01). The 16 song flows are same-day but second.

**Josh does these three things BEFORE pasting the prompt:**

1. Sign in to ManyChat, switch to **Prince Dre's** account, and leave the browser on
   **Automations**. Astra must never use the account switcher.
2. From Instagram as **@m3rcey**, send Prince Dre's account any DM (for example `hey`). Comments
   do not create ManyChat contacts, only DMs do, so without this there is no test contact in Dre's
   account and the smoke test cannot run.
3. Chrome maximized, in front, on the main monitor. Not Incognito. No lock, no sleep.

Paste everything below the line.

---

You are working in Prince Dre's ManyChat account, already open on the Automations page in Chrome.
Build 17 Instagram automations. Each one replies to a comment publicly, opens a DM, and sends one
link. Build **VOTE first and smoke-test it before building any other**, because the other 16 are
duplicates of it and will inherit any mistake. Do not explore ManyChat settings, billing, other
accounts, or anything not named in these steps. Do not read documentation.

## Done means

- **VOTE**: status reads **Live**. Triggers are exactly two: a comment trigger on **any post or
  reel** with keyword VOTE, and a DM keyword trigger for VOTE. DMing `VOTE` from @m3rcey returns
  the opening DM, and tapping its button returns a message with a link button to
  `https://thecrwn.app/princedre/join/vote`.
- **Each of the 16 song automations**: status reads **Live**. Its DM keyword trigger is its own
  keyword set to exact match. Its link button points at its own URL from the table. It has **no**
  any-post comment trigger and **no** other keyword.
- Nothing else in the account changed.

## The 17 values

Keyword, the exact link, and the line of DM text that sits above the link button.

| # | Keyword | Link | DM text |
|---|---|---|---|
| 1 | VOTE | https://thecrwn.app/princedre/join/vote | Pick which project drops first. Tap to hear all 3: |
| 2 | ROUND | https://thecrwn.app/drop/princedre-round-here | Round Here. Yours free: |
| 3 | LETTER | https://thecrwn.app/drop/princedre-letter-to-la | Letter To LA, with JMoney. Yours free: |
| 4 | SEND | https://thecrwn.app/drop/princedre-send-it-up | Send It Up. Yours free: |
| 5 | HOMMIE | https://thecrwn.app/drop/princedre-hommie | Hommie. Yours free: |
| 6 | MUNNA | https://thecrwn.app/drop/princedre-munnagang | MunnaGang. Yours free: |
| 7 | SAVAGE | https://thecrwn.app/drop/princedre-my-savages | My Savages. Yours free: |
| 8 | SEEK | https://thecrwn.app/drop/princedre-hide-n-seek | Hide N Seek. Yours free: |
| 9 | RIDAH | https://thecrwn.app/drop/princedre-im-a-ridah | Im A Ridah. Yours free: |
| 10 | FROM | https://thecrwn.app/drop/princedre-from-the-o | From The O. Yours free: |
| 11 | TURNT | https://thecrwn.app/drop/princedre-turntup4jmunna | TurntUp4JMunna. Yours free: |
| 12 | LIFE | https://thecrwn.app/drop/princedre-life-i-live | Life I Live. Yours free: |
| 13 | COME | https://thecrwn.app/drop/princedre-come-from | Come From. Yours free: |
| 14 | CHASIN | https://thecrwn.app/drop/princedre-chasin-dough | Chasin Dough. Yours free: |
| 15 | RELOADED | https://thecrwn.app/drop/princedre-reloaded | Reloaded. Yours free: |
| 16 | HIGH | https://thecrwn.app/drop/princedre-i-get-high | I Get High. Yours free: |
| 17 | MADE | https://thecrwn.app/drop/princedre-always-made-it | Always Made It. Yours free: |

Copy these links character for character. Do not shorten them, retype them from memory, or
"correct" them. Do not add any text to the DM lines. Do not use a dash of any kind in anything
you type.

## Stage A: build and test VOTE

1. Click **+ New Automation**. Choose a template whose card is labelled **Flow Builder**. If a
   dialog offers **Start From Scratch**, do not use it: it gives a fixed builder you cannot add
   blocks to, and its only menu option is Delete. If the only route in is a template gallery, pick
   any Instagram comment template labelled Flow Builder and delete the blocks you do not need.
2. Name it `VOTE`.
3. Set the trigger to an Instagram **comment** trigger. In "When someone comments on", choose
   **any post or reel**. Set the keyword to `VOTE`. Match on the specific word, not the whole
   message.
4. Turn on the public comment reply and give it these three variations, one per line:
   `Check your DMs 👑`
   `Sent 🔥`
   `In your DMs`
5. Opening DM text: `You asked for it. Tap below and I'll send it 👇` with one button labelled
   `Send it`. Leave it set to send **as a private reply**. Do not delete this node and do not turn
   it into a question: Instagram allows one private reply, and the fan must tap it before anything
   else is allowed to send.
6. On the node after the tap, set the text to row 1's DM text, and add a **URL button** labelled
   `Hear them` pointing at row 1's link.
7. Add a second trigger: a DM keyword trigger ("User sends a message") with keyword `VOTE`, plus
   the variants `vote` and `Vote`. For VOTE only, leave this matching as contains, not exact.
8. Set it **Live**.
9. **Smoke test.** From Instagram as **@m3rcey**, DM Prince Dre's account the word `VOTE`. You must
   receive the opening DM. Tap `Send it`. You must then receive row 1's text with a tappable button
   that opens the vote page. If no DM arrives, redo steps 7 and 8 at most twice, then stop and
   report.
10. **If the smoke test fails, stop and report. Do not build the other 16.**

## Stage B: the 16 song automations

Work in table order, rows 2 through 17. For each row:

11. Open the **VOTE** automation, open its ⋮ menu, and choose **Duplicate**.
12. Rename the copy to the row's keyword.
13. **Open the copy's triggers before adding anything.** A duplicate KEEPS both of VOTE's triggers.
    - **Delete** the comment trigger it carried over (the any-post one).
    - **Edit** the DM keyword trigger it carried: replace `VOTE` and its variants with the row's
      keyword only. Set it to **exact match** ("message is"), not contains. Do not add a second
      trigger beside it, or the copy also answers VOTE.
    - If that song's Instagram post already exists, also add one comment trigger set to **a
      specific post or reel**, pick that post, and use the row's keyword. If the post does not
      exist yet, add no comment trigger and say so in your report. Never set a song automation to
      **any post or reel**, and never to **next post**.
14. Change the text on the node after the tap to the row's DM text, and change the URL button to
    the row's link. The button label becomes `Get it`. Leave the opening DM and the three public
    reply variations exactly as VOTE has them.
15. Set it **Live**.
16. After every fourth automation, DM one of those four keywords from @m3rcey and confirm the right
    link comes back. If the wrong song's link comes back, the trigger edit in step 13 added a
    keyword instead of replacing one. Fix that automation, then carry on.

## Known problems and the exact fix

| What you see | What to do |
|---|---|
| A duplicate answers VOTE as well as its own keyword | Its carried trigger was added to, not edited. Open its triggers and delete every keyword except the row's. |
| The wrong song's link arrives | Same cause. Check that automation's triggers and its URL button. |
| Two automations both fire on one comment | One of them still has an any-post comment trigger. Only VOTE may have one. |
| An automation shows a bare "Automation powered by @Manychat" with an empty body | The ManyChat plan has lapsed. Stop and report. This is not fixable in the builder. |
| An automation will not switch to Live | Report which one and its exact error text. Do not touch the plan or billing. |
| "window capture timed out" or "FrameArrived timed out" | Chrome was hidden or the machine locked. Bring Chrome to the front and retry the same step. |
| Start From Scratch gave a builder with no way to add a block | Delete it and start again from a Flow Builder template. |
| The DM test gets no reply at all and the automation reads Live | Instagram message access may be off, which needs Dre's own login. Stop and report. |

## Stop only if

- Instagram or ManyChat asks you to log in, or for a code, or for 2FA.
- ManyChat asks you to change, renew or buy a plan.
- The VOTE smoke test in step 9 fails after two retries.
- Something would delete or change an automation that is not one of these 17.
- The same step fails three times.
- You are close to running out of credits or usage. Follow "If you are about to run out" below.

Do not stop for anything else.

## If you are about to run out

If you can tell that your credits, usage or time are running low, stop building **before** they
run out. Keep enough left to do the three things below, in order. Josh will finish the rest by
hand from what you write here, so this matters more than one more automation.

1. **Leave nothing half built.** If you are partway through a duplicate, either finish it (Live,
   tested) or switch it off so it is **not Live**, and say which. A half-edited copy that is Live
   can still answer VOTE, which sends fans to the wrong song.
2. **Give the usual report** (the format under "Report") for every row you reached.
3. **Write Josh the steps to build one more song automation himself.** Write them from what you
   actually saw on screen, not from this prompt: use the real button names, menu names and field
   names ManyChat showed you, and say where on the screen each one is. Number every click. Cover,
   in this order:
   - Finding the VOTE automation and duplicating it.
   - Renaming the copy.
   - Deleting the carried any-post comment trigger.
   - Editing the carried DM keyword trigger to the new keyword, with exact match, without adding
     a second trigger.
   - Adding a specific-post comment trigger, for when the song's post exists.
   - Changing the DM text and the link button, and the button label `Get it`.
   - Setting it Live.
   - Testing it by DMing the keyword from @m3rcey.
   Add any trap you hit during this run and how you got past it. Then list the rows Josh still has
   to build, with their keyword, link and DM text copied from the table, so he works from one
   list.

## Never

- Never use the account switcher, and never open another ManyChat account.
- Never change billing, the plan, team members, or Instagram connection settings.
- Never edit, pause or delete an automation that is not one of these 17.
- Never send a broadcast, and never send a test message to any contact other than @m3rcey.
- Never change the copy beyond what the table says, and never type a dash of any kind.
- Never open ManyChat Settings, and never reveal or copy an API key or token.

## Report

One line per automation, in table order:

`<keyword> | Live yes/no | triggers: <count and type> | link tested: pass/fail/not tested | post trigger: yes/no`

Then:

- Which keywords have no comment trigger because that post does not exist yet.
- The exact text of any error you saw.
- Confirmation that @m3rcey is the only contact you messaged.
- If you stopped before row 17 for any reason, the hand-build steps and the remaining rows from
  "If you are about to run out", even if credits were not the reason.
