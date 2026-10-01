# Astra prompt: finish Prince Dre's ManyChat automations

**For:** GPT-6 Astra (computer use), driven by Josh.

**Where this picks up:** the first run (2026-10-01) built **VOTE** and set it Live, with the old
two-tap flow and old copy, and built no songs. This run starts by checking what already exists,
so it is safe to paste again after any interruption: it finishes VOTE, then builds whichever of
the 16 songs are missing, and skips anything already done.

**Before pasting:**

0. **Start a NEW Astra chat.** The earlier chat still holds the first prompt, whose rules ("the
   smoke test blocks the 16 copies", "the only DM is step 9") contradict this one, and Astra keeps
   following them. Also make sure your editor shows this version: the first line of this file
   reads "finish Prince Dre's ManyChat automations". If it does not, close the tab and reopen the
   file.
1. ManyChat open in a normal Chrome window on **Prince Dre's** account, on **Automation**, with
   the ManyChat tab selected. No Instagram tab is needed: this run sends no DMs.
2. Chrome maximized (not F11 full screen), the address bar visible, zoom 100% (Ctrl+0), in front,
   on the main monitor. No lock, no sleep.

**Astra pauses once, after VOTE, and asks you to test it.** It will not copy any song until you
answer in the same chat. When it asks:

1. In the Instagram **app**, signed in as **@thecrwnapp**, open the chat with **@1princedre** and
   send `VOTE`.
2. You should get "you pick which project i drop first tap the button and vote and i'mma send you
   a bonus song for it 👇🏾" with one button, **vote**.
3. Tap **vote** and check the vote page opens. **Do not vote, and do not type a name or email.**
4. Reply **`go`** if the button showed and the page opened. Reply **`no button`** if it did not,
   and tell Claude: every song copies VOTE, so it has to be fixed first.

**Re-pasting after an interruption, with VOTE already tested?** Type `VOTE already tested` on the
line above the prompt when you paste, and Astra skips the pause.

Paste everything below the line.

---

You are working in Prince Dre's ManyChat account, already open in **Josh's Chrome window that is
open on screen right now**. Do all of the work in that window. Do not open your own browser, a new
browser window, a new Chrome profile, or Incognito. A new tab inside that same window is fine. If
the window has been closed, stop and report.

This continues an earlier run. An automation named **VOTE** already exists and is Live. Your job:
bring VOTE to its final form, then build up to 16 song automations by duplicating it. Some of this
may already be done; check before you change anything, and only do what is missing. **Do not send
any DM, from any account.** Do not explore ManyChat settings, billing, other accounts, or anything
not named here. Do not read documentation.

## How to replace text in ManyChat (read this first)

Typing into a ManyChat field ADDS to what is already there. To replace a field: click into it,
press **Ctrl+A**, press **Backspace**, type the new value, then read the field back and confirm it
shows only the new value. Do this for every name, keyword, message and URL you change.

## Step 0: find out where things stand

Click **Automation** in the left navigation, then **My Automations**. Write down, for your report,
every automation listed and whether each is Live. Then:

- If there is more than one automation named VOTE, or more than one with the same song keyword,
  stop and report. Do not delete anything.
- Compare VOTE against "VOTE: the final form" below. If it already matches, go straight to the
  songs. If not, do "Finish VOTE".
- For the songs, skip every row whose automation already exists AND matches "Done means" below.
  An existing row that does not match: open it and fix it. A missing row: build it.

## VOTE: the final form

- Two triggers on the **When** node, unchanged from the first run: **User comments on your Post or
  Reel** (All Posts or Reels, keyword VOTE) and **User sends a message** (message contains VOTE,
  vote, Vote).
- The comment trigger's **Public Reply** has exactly these four variations, lowercase as written:
  `just dm'd you g`
  `sent it to you bro`
  `i just sent it to you`
  `i just dm'd you`
- ONE **Send Message** node, set **As private reply**, with exactly this text:
  `you pick which project i drop first tap the button and vote and i'mma send you a bonus song for it 👇🏾`
  and one button titled `vote` that opens the website `https://thecrwn.app/princedre/join/vote`.
- No second message node. Live and Saved.

## Finish VOTE

1. Search for `VOTE` and open it.
2. On the **When** node, open **User comments on your Post or Reel** and go to its **Public
   Reply** screen. Replace the replies with the four above, adding a fourth variation with its add
   control. Leave All Posts or Reels and the keyword VOTE alone. Save.
3. Click the **first Send Message** node (As private reply). Replace its text with the VOTE text
   above.
4. In that node, click its button (it may read `Send it`). If the click only ends text editing,
   click it again. In **Edit Button**, choose the **Open website** action, set **Button title** to
   `vote` and **Website URL** to exactly `https://thecrwn.app/princedre/join/vote`. Click **Done**.
   Keep the node **As private reply**.
5. If a **second Send Message** node still exists (old text "Pick which project drops first. Tap to
   hear all 3:" with a **Hear them** button), delete it with its own remove control.
6. Leave the **User sends a message** trigger as it is.
7. Make sure the top bar shows **Live** and **Saved**; if not, click **Set Live**.
8. Reopen VOTE and check it against "VOTE: the final form".
9. **Pause and ask Josh**, in exactly these words: "VOTE is done. Test it on your phone: DM VOTE
   to @1princedre from @thecrwnapp and tap the vote button. Reply go if the button showed and the
   page opened, or no button if it did not." Then wait. Do not start any song until he replies.
   - **go:** continue to the songs.
   - **no button**, or anything else: build nothing, and report.

If VOTE already matched its final form at Step 0, still ask the question in step 9 before the
first song, unless Josh's message that started this run says VOTE was already tested.

**If ManyChat will not allow a website button on the first node** (no Open website action, or an
error when you choose it): do not delete the second node. Put the first node's button back to
`Send it` connected to the second node, set the first node's text to the VOTE text above, set the
second node's text to `vote below and i'mma send you a bonus song for it 👇🏾` with its button
titled `vote` opening the vote link, keep Live, and note the exact ManyChat message. Then do steps
6 to 9 above (including the pause), and build the songs using the two-node notes in step 8 of the
song steps.

## The 16 songs

Done means, for each row: the automation is named the row's keyword and reads **Live**; its
**When** node has exactly one trigger, **User sends a message**, set to exact match, with only that
keyword; its message text is the row's text; its one button is titled `get it` and opens the row's
link; it has **no** comment trigger.

| # | Keyword | Link | Message text |
|---|---|---|---|
| 2 | ROUND | https://thecrwn.app/drop/princedre-round-here | tap the button and i'mma send you Round Here for free 👇🏾 |
| 3 | LETTER | https://thecrwn.app/drop/princedre-letter-to-la | tap the button and i'mma send you Letter To LA with JMoney for free 👇🏾 |
| 4 | SEND | https://thecrwn.app/drop/princedre-send-it-up | tap the button and i'mma send you Send It Up for free 👇🏾 |
| 5 | HOMMIE | https://thecrwn.app/drop/princedre-hommie | tap the button and i'mma send you Hommie for free 👇🏾 |
| 6 | MUNNA | https://thecrwn.app/drop/princedre-munnagang | tap the button and i'mma send you MunnaGang for free 👇🏾 |
| 7 | SAVAGE | https://thecrwn.app/drop/princedre-my-savages | tap the button and i'mma send you My Savages for free 👇🏾 |
| 8 | SEEK | https://thecrwn.app/drop/princedre-hide-n-seek | tap the button and i'mma send you Hide N Seek for free 👇🏾 |
| 9 | RIDAH | https://thecrwn.app/drop/princedre-im-a-ridah | tap the button and i'mma send you Im A Ridah for free 👇🏾 |
| 10 | FROM | https://thecrwn.app/drop/princedre-from-the-o | tap the button and i'mma send you From The O for free 👇🏾 |
| 11 | TURNT | https://thecrwn.app/drop/princedre-turntup4jmunna | tap the button and i'mma send you TurntUp4JMunna for free 👇🏾 |
| 12 | LIFE | https://thecrwn.app/drop/princedre-life-i-live | tap the button and i'mma send you Life I Live for free 👇🏾 |
| 13 | COME | https://thecrwn.app/drop/princedre-come-from | tap the button and i'mma send you Come From for free 👇🏾 |
| 14 | CHASIN | https://thecrwn.app/drop/princedre-chasin-dough | tap the button and i'mma send you Chasin Dough for free 👇🏾 |
| 15 | RELOADED | https://thecrwn.app/drop/princedre-reloaded | tap the button and i'mma send you Reloaded for free 👇🏾 |
| 16 | HIGH | https://thecrwn.app/drop/princedre-i-get-high | tap the button and i'mma send you I Get High for free 👇🏾 |
| 17 | MADE | https://thecrwn.app/drop/princedre-always-made-it | tap the button and i'mma send you Always Made It for free 👇🏾 |

Copy links and text character for character. Do not shorten, retype from memory, or "correct"
them. Do not type a dash of any kind.

### Steps, for each missing row in table order

1. Search for `VOTE` and open it.
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
7. Click the **Send Message** node, replace its text with the row's message text, then click its
   button (`vote`; click again if the first click only ends text editing). In **Edit Button**, set
   **Button title** to `get it` and **Website URL** to the row's link. Click **Done**.
8. Only if VOTE used the two-node fallback: set the FIRST node's text to the row's message text and
   keep its `Send it` button, then set the SECOND node's text to `here go it's yours 👇🏾` and its
   button to `get it` with the row's link.
9. Click **Set Live**. Wait until the top bar shows **Live** and **Saved**.
10. After every fourth automation, reopen those four and check them against "Done means". Fix any
    that differ, then carry on.

## Known problems and the exact fix

| What you see | What to do |
|---|---|
| A field shows the old and new text run together | It was appended. Ctrl+A, Backspace, type again, read it back. |
| Clicking the button does not open Edit Button | It only ended text editing. Click again. |
| "Manychat has been updated. Please, save your work and reload the page." | Make sure Saved shows, reload, reopen the automation and check your last change stuck. |
| "Keywords are not case-sensitive. You can remove the duplicates." | On VOTE, ignore it. On a song, keep only the row's keyword. |
| A copy still shows VOTE in its message trigger | Step 5 added instead of replaced. Remove every keyword except the row's. |
| An automation will not switch to Live | Report which one and its exact error. Do not touch the plan or billing. |
| "could not determine the current browser URL" | Click the ManyChat tab once, retry once, then stop and report. |
| "window capture timed out" or "FrameArrived timed out" | Bring Chrome to the front and retry. If it keeps failing, connect to the existing Chrome tabs through the browser extension, as the first run did. |

## Stop only if

- Josh stops you, or replies anything but go at the VOTE pause.
- ManyChat asks you to log in, for a code or 2FA, or to change, renew or buy a plan, or says the
  trial has ended.
- Two automations share a name (see Step 0).
- Something would delete or change an automation that is not VOTE or one of the 16 rows.
- The same step fails three times.
- You are close to running out of credits or usage. Follow "If you are about to run out".

Do not stop for anything else. The VOTE pause in step 9 is the one planned question; ask nothing
else.

## If you are about to run out

Stop building **before** your credits, usage or time run out, keeping enough for these three
things. Josh finishes by hand, or pastes this prompt again, from what you write.

1. **Leave nothing half built.** Finish the automation you are on (Live, checked) or make sure it
   is **not Live**, and say which. A half-edited copy that is Live can still answer VOTE.
2. **Give the usual report** for everything you reached.
3. **Write Josh the hand-build steps for one song**, using the exact labels you saw, including
   where Duplicate and the exact match option actually were, plus any trap you hit. Then list the
   rows still to build, with keyword, link and message text copied from the table.

## Never

- Never open your own browser, another browser window, another Chrome profile, or Incognito.
- Never use the account switcher, and never open another ManyChat account.
- Never send a DM, a test message or a broadcast, from any account.
- Never edit, pause or delete any automation other than VOTE and the 16 rows.
- Never change billing, the plan, team members, or Instagram connection settings, and never open
  ManyChat Settings.
- Never add a comment trigger to a song.
- Never change the copy beyond what this prompt says, and never type a dash of any kind.

## Report

First, what Step 0 found: every automation that existed when you started, and whether each was
Live.

Then one line each:

`VOTE | Live yes/no | changed: <what you changed, or "already final"> | one tap: yes, or fallback`

`<keyword> | Live yes/no | built/fixed/skipped | triggers: <count and type, matching> | text checked: yes/no | button: <title> -> <URL checked yes/no>`

Then:

- Where Duplicate and the exact match option actually were, in ManyChat's own words.
- The exact text of any error you saw.
- Confirmation that you sent no DM.
- If you stopped before finishing for any reason, the hand-build steps and the remaining rows.
