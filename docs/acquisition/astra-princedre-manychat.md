# Astra prompt: Prince Dre's ManyChat automations, one tap and in his voice

**For:** GPT-6 Astra (computer use), driven by Josh.
**Status:** VOTE exists and is Live from the first run (2026-10-01), but it still makes fans tap
twice and its copy is wrong ("Tap to hear all 3" promises three projects; the page plays one song
from each). This file has **two parts, pasted separately**:

- **Part 1** fixes VOTE: one tap, Dre's voice, true copy. Then Astra stops.
- **You test VOTE on your phone** (below).
- **Part 2** builds the 16 song automations by duplicating the fixed VOTE.

The test in between is the reason for two parts: every song copies VOTE, so a fault in VOTE would
be copied 16 times.

**Before Part 1:**

1. ManyChat open in a normal Chrome window on **Prince Dre's** account, on **Automation**, with
   the ManyChat tab selected. No Instagram tab is needed: neither part sends a DM.
2. Chrome maximized (not F11 full screen), the address bar visible, zoom 100% (Ctrl+0), in front,
   on the main monitor. No lock, no sleep.

**Between Part 1 and Part 2 (your phone test):**

1. In the Instagram **app**, signed in as **@thecrwnapp**, open the chat with **@1princedre** and
   send `VOTE`.
2. You should get, within a few seconds: "You pick which project I drop first. Tap the button and
   vote, I'mma send you a bonus song for it 👇" with one button, **Vote**.
3. Tap **Vote**. The vote page should open. **Do not vote, and do not type a name or email.**
4. If the reply has **no button** on your phone, do not run Part 2. Tell Claude.

Copy the part you are running: everything between its line and the next part's heading.

---

## PART 1: fix VOTE

You are working in Prince Dre's ManyChat account, already open in **Josh's Chrome window that is
open on screen right now**. Do all of the work in that window. Do not open your own browser, a new
browser window, a new Chrome profile, or Incognito. A new tab inside that same window is fine. If
the window has been closed, stop and report.

Edit the existing automation **VOTE** so a fan taps one button instead of two, and change its
words. Do not create any automation. **Do not send any DM.** Do not explore ManyChat settings,
billing, other accounts, or anything not named here. Do not read documentation.

**How to replace text in ManyChat:** typing into a field ADDS to what is already there. To replace
a field: click into it, press **Ctrl+A**, press **Backspace**, type the new value, then read the
field back and confirm it shows only the new value. Do this for every change.

1. Click **Automation** in the left navigation, then **My Automations**. Use **Search all
   Automations** to find `VOTE`, and open it. If there is more than one VOTE, stop and report.
2. On the **When** node, open **User comments on your Post or Reel**. Go to its **Public Reply**
   screen. Replace the three replies with exactly these four, one per variation (add a fourth
   variation with its add control):
   `just dm'd you g`
   `sent it to you bro`
   `i just sent it to you`
   `i just dm'd you`
   Keep them lowercase exactly as written. Leave "All Posts or Reels" and the keyword VOTE as they
   are. Save.
3. Click the **first Send Message** node (the one that says "You asked for it. Tap below and I'll
   send it", set **As private reply**). Replace its text with exactly:
   `You pick which project I drop first. Tap the button and vote, I'mma send you a bonus song for it 👇`
4. In that same first node, click the **Send it** button. If the click only ends text editing,
   click it again. In the **Edit Button** panel, change the action so the button **opens a
   website** (choose **Open website**). Set **Button title** to `Vote` and **Website URL** to
   exactly `https://thecrwn.app/princedre/join/vote`. Click **Done**. Keep the node set to **As
   private reply**.
5. Delete the **second Send Message** node (the one that says "Pick which project drops first. Tap
   to hear all 3:" with the **Hear them** button), using its own remove control. The first node
   must now connect to nothing.
6. Leave the **User sends a message** trigger (message contains VOTE, vote, Vote) as it is.
7. Make sure the top bar shows **Live** and **Saved**. If it shows Set Live or an unsaved state,
   click **Set Live**.
8. Reopen VOTE and check by eye: two triggers; four public replies exactly as above; ONE Send
   Message node, As private reply, with the new text and one button titled `Vote` that opens
   `https://thecrwn.app/princedre/join/vote`; no second node; Live.

**Known problems:**

| What you see | What to do |
|---|---|
| A field shows the old and new text run together | It was appended. Ctrl+A, Backspace, type again, read it back. |
| ManyChat refuses a website button on the first node, or offers no Open website action there | Do NOT delete anything else. Put the button back to `Send it` connected to the second node, leave the second node in place, change only the texts (step 3 text on the first node with `Send it` kept; second node text `Vote below and I'mma send you a bonus song for it 👇`, button `Vote`), keep Live, and report the exact message ManyChat showed. |
| "Manychat has been updated. Please, save your work and reload the page." | Make sure the top bar shows Saved, then reload and check your last change stuck. |
| "Keywords are not case-sensitive. You can remove the duplicates." | Ignore it. Leave VOTE's message trigger alone. |
| "could not determine the current browser URL" | Click the ManyChat tab once so it is selected, retry once, then stop and report. |
| "window capture timed out" or "FrameArrived timed out" | Bring Chrome to the front and retry. If native capture keeps failing, connect to the existing Chrome tabs through the browser extension. |

**Stop only if:** ManyChat asks you to log in, for a code or 2FA, or to change or buy a plan; the
same step fails three times; or you are close to running out of credits (then make sure VOTE is
Live and saved, and report exactly which of steps 2 to 8 are done). Do not stop for anything else.

**Never:** send a DM or broadcast; create, edit or delete any automation other than VOTE; open
ManyChat Settings, billing, team or Instagram connection settings; use the account switcher;
type a dash of any kind.

**Report:**

- `VOTE | Live yes/no | triggers: <count and type> | public replies: <the four as shown> | nodes: <count> | button: <title> -> <URL>`
- Whether the one-tap website button was accepted on the first node, or you used the fallback,
  and the exact text of any ManyChat message about it.
- Confirmation that you sent no DM and changed no other automation.

---

## PART 2: the 16 song automations

You are working in Prince Dre's ManyChat account, already open in **Josh's Chrome window that is
open on screen right now**. Do all of the work in that window. Do not open your own browser, a new
browser window, a new Chrome profile, or Incognito. A new tab inside that same window is fine. If
the window has been closed, stop and report.

An automation named **VOTE** exists, is Live, and has been tested on Josh's phone. Build 16 more by
duplicating it, one per row below, changing only the name, the trigger, the message text and the
button. **Do not send any DM in this run, from any account.** Do not explore ManyChat settings,
billing, other accounts, or anything not named here. Do not read documentation.

### Done means

- **Each of the 16 song automations** is named its keyword and reads **Live**. On its **When**
  node it has exactly one trigger, **User sends a message**, set to exact match, with only its own
  keyword. Its message text is the row's text. Its one button is titled `Get it` and opens the
  row's link. It has **no** comment trigger.
- **VOTE is unchanged.**
- Nothing else in the account changed.

### The 16 values

| # | Keyword | Link | Message text |
|---|---|---|---|
| 2 | ROUND | https://thecrwn.app/drop/princedre-round-here | Round Here, yours free. Tap the button and I'mma send it 👇 |
| 3 | LETTER | https://thecrwn.app/drop/princedre-letter-to-la | Letter To LA with JMoney, yours free. Tap the button and I'mma send it 👇 |
| 4 | SEND | https://thecrwn.app/drop/princedre-send-it-up | Send It Up, yours free. Tap the button and I'mma send it 👇 |
| 5 | HOMMIE | https://thecrwn.app/drop/princedre-hommie | Hommie, yours free. Tap the button and I'mma send it 👇 |
| 6 | MUNNA | https://thecrwn.app/drop/princedre-munnagang | MunnaGang, yours free. Tap the button and I'mma send it 👇 |
| 7 | SAVAGE | https://thecrwn.app/drop/princedre-my-savages | My Savages, yours free. Tap the button and I'mma send it 👇 |
| 8 | SEEK | https://thecrwn.app/drop/princedre-hide-n-seek | Hide N Seek, yours free. Tap the button and I'mma send it 👇 |
| 9 | RIDAH | https://thecrwn.app/drop/princedre-im-a-ridah | Im A Ridah, yours free. Tap the button and I'mma send it 👇 |
| 10 | FROM | https://thecrwn.app/drop/princedre-from-the-o | From The O, yours free. Tap the button and I'mma send it 👇 |
| 11 | TURNT | https://thecrwn.app/drop/princedre-turntup4jmunna | TurntUp4JMunna, yours free. Tap the button and I'mma send it 👇 |
| 12 | LIFE | https://thecrwn.app/drop/princedre-life-i-live | Life I Live, yours free. Tap the button and I'mma send it 👇 |
| 13 | COME | https://thecrwn.app/drop/princedre-come-from | Come From, yours free. Tap the button and I'mma send it 👇 |
| 14 | CHASIN | https://thecrwn.app/drop/princedre-chasin-dough | Chasin Dough, yours free. Tap the button and I'mma send it 👇 |
| 15 | RELOADED | https://thecrwn.app/drop/princedre-reloaded | Reloaded, yours free. Tap the button and I'mma send it 👇 |
| 16 | HIGH | https://thecrwn.app/drop/princedre-i-get-high | I Get High, yours free. Tap the button and I'mma send it 👇 |
| 17 | MADE | https://thecrwn.app/drop/princedre-always-made-it | Always Made It, yours free. Tap the button and I'mma send it 👇 |

Copy links and text character for character. Do not shorten, retype from memory, or "correct"
them. Do not use a dash of any kind in anything you type.

**How to replace text in ManyChat:** typing into a field ADDS to what is already there. To replace
a field: click into it, press **Ctrl+A**, press **Backspace**, type the new value, then read the
field back and confirm it shows only the new value. Do this for every change.

### Steps, for each row in table order

1. Click **Automation** in the left navigation, then **My Automations**. Use **Search all
   Automations** to find `VOTE` and open it. If a row's keyword already exists as an automation
   (from an interrupted run), open that one instead, check it against steps 4 to 8, fix what
   differs, and move to the next row. Never create a second automation with the same name.
2. In VOTE's top bar, open **More Actions** (the ⋮ at the far right, beside Saved) and choose
   **Duplicate**. If it is not there, go back to **My Automations**, open the ⋮ on VOTE's row, and
   choose **Duplicate**. Do not edit VOTE itself.
3. Open the copy. Click the **pencil** beside its name in the top bar, replace the name with the
   row's keyword, and press Enter.
4. On the **When** node, open **User comments on your Post or Reel** and **delete** that trigger
   from the copy. Only delete triggers inside the copy. Never delete the message node.
5. Open **User sends a message**. Replace its keywords (VOTE, vote, Vote) with only the row's
   keyword: clear the fields and remove the extra ones so exactly one keyword remains. Do not use
   **+ New Trigger** to add another message trigger.
6. In the same panel, change the matching selector from **message contains** to the exact match
   option (it may read **message is**). Save.
7. Click the **Send Message** node. Replace its text with the row's message text.
8. Click its button (`Vote`). If the click only ends text editing, click it again. In **Edit
   Button**, set **Button title** to `Get it` and **Website URL** to the row's link. Click
   **Done**.
9. Click **Set Live**. Wait until the top bar shows **Live** and **Saved**.
10. After every fourth automation, reopen those four and check by eye: name is the keyword; one
    trigger only, **User sends a message**, with only that keyword on exact match; message text
    from the table; one button `Get it` with the row's link. Fix any that differ, then carry on.

If Part 1 used the fallback (VOTE still has two message nodes), then in step 7 change the FIRST
node's text to the row's message text, keep its `Send it` button, and in step 8 change the SECOND
node's text to `Here go, it's yours 👇` and its button to `Get it` with the row's link.

### Known problems and the exact fix

| What you see | What to do |
|---|---|
| A field shows the old and new text run together | It was appended. Ctrl+A, Backspace, type again, read it back. |
| Clicking the button does not open Edit Button | It only ended text editing. Click again. |
| "Manychat has been updated. Please, save your work and reload the page." | Make sure Saved shows, reload, reopen the automation and check your last change stuck. |
| A copy still shows VOTE in its message trigger | Step 5 added instead of replaced. Remove every keyword except the row's. |
| Two automations with the same name | Stop and report which exist and whether each is Live. Do not delete either. |
| An automation will not switch to Live | Report which one and its exact error. Do not touch the plan or billing. |
| "could not determine the current browser URL" | Click the ManyChat tab once, retry once, then stop and report. |
| "window capture timed out" or "FrameArrived timed out" | Bring Chrome to the front and retry. If it keeps failing, connect to the existing Chrome tabs through the browser extension. |

### Stop only if

- ManyChat asks you to log in, for a code or 2FA, or to change, renew or buy a plan, or says the
  trial has ended.
- Something would delete or change VOTE or any automation not in the table.
- The same step fails three times.
- You are close to running out of credits or usage. Follow "If you are about to run out".

Do not stop for anything else.

### If you are about to run out

Stop building **before** your credits, usage or time run out, keeping enough for these three
things. Josh finishes by hand from what you write.

1. **Leave nothing half built.** Finish the copy you are on (Live, checked by eye) or make sure it
   is **not Live**, and say which. A half-edited copy that is Live can still answer VOTE.
2. **Give the usual report** for every row you reached.
3. **Write Josh the hand-build steps for one song**, using the exact labels you saw, including
   where Duplicate and the exact match option actually were, plus any trap you hit. Then list the
   rows still to build, with keyword, link and message text copied from the table.

### Never

- Never open your own browser, another browser window, another Chrome profile, or Incognito.
- Never use the account switcher, and never open another ManyChat account.
- Never send a DM, a test message or a broadcast, from any account.
- Never edit, pause or delete VOTE or any automation not in the table.
- Never change billing, the plan, team members, or Instagram connection settings, and never open
  ManyChat Settings.
- Never add a comment trigger to a song in this run.
- Never change the copy beyond what the table says, and never type a dash of any kind.

### Report

One line per row, in table order:

`<keyword> | Live yes/no | triggers: <count and type, matching> | text checked: yes/no | button: <title> -> <URL checked yes/no>`

Then:

- Where Duplicate and the exact match option actually were, in ManyChat's own words.
- The exact text of any error you saw.
- Confirmation that you sent no DM and did not change VOTE.
- If you stopped before row 17 for any reason, the hand-build steps and the remaining rows.
