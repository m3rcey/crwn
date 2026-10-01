# Astra prompt: give Prince Dre's song automations their comment triggers

**For:** GPT-6 Astra (computer use), driven by Josh.

**Why:** the 16 song automations answer DMs only. Their keywords are short everyday words (LIFE,
COME, FROM, MADE, HIGH...), so a trigger on **all** posts would DM a song to anyone who comments
"come to chicago" or "made my day". Each song therefore listens on the specific post that asks fans
to comment its keyword. This run finds those posts in ManyChat's post picker and adds the trigger,
with Dre's 20 public replies. It is **re-runnable**: paste it again any time Dre puts up new song
posts, and it only adds what is missing.

**How Dre's caption has to read** for a post to be picked up: it must ask fans to comment the
keyword, for example "comment ROUND and i'mma send it to you". A post that only mentions the song
gets no trigger, because nobody will comment the keyword under it.

**Before pasting:**

0. Start a **new** Astra chat.
1. ManyChat open in a normal Chrome window on **Prince Dre's** account, on **Automation**, with the
   ManyChat tab selected.
2. Chrome maximized (not F11 full screen), the address bar visible, zoom 100% (Ctrl+0), in front,
   on the main monitor. No lock, no sleep.

Paste everything below the line.

---

You are working in Prince Dre's ManyChat account, already open in **Josh's Chrome window that is
open on screen right now**. Do all of the work in that window. Do not open your own browser, a new
browser window, a new Chrome profile, or Incognito. A new tab inside that same window is fine. If
the window has been closed, stop and report.

Your job: for each of the 16 song automations below, add a comment trigger on every one of Dre's
posts whose caption asks fans to comment that song's keyword, unless that trigger already exists.
**Do not send any DM or comment.** Do not change any message, button, link or DM trigger. Do not
explore ManyChat settings, billing, other accounts, or anything not named here. Do not read
documentation.

## The 16 songs

| Keyword | Song |
|---|---|
| ROUND | Round Here |
| LETTER | Letter To LA |
| SEND | Send It Up |
| HOMMIE | Hommie |
| MUNNA | MunnaGang |
| SAVAGE | My Savages |
| SEEK | Hide N Seek |
| RIDAH | Im A Ridah |
| FROM | From The O |
| TURNT | TurntUp4JMunna |
| LIFE | Life I Live |
| COME | Come From |
| CHASIN | Chasin Dough |
| RELOADED | Reloaded |
| HIGH | I Get High |
| MADE | Always Made It |

## Which post counts as a match

A post matches a keyword ONLY if its caption asks fans to **comment that exact keyword** (for
example "comment ROUND", "drop ROUND in the comments", "type ROUND below"). Capital letters do not
matter. These do NOT count, and get no trigger:

- A caption that names the song but does not ask for the keyword.
- A caption asking for a different word, or for VOTE.
- A post you cannot read the caption of in the picker.

If you are unsure whether a caption asks for the keyword, do not add a trigger; list the post in
your report with its caption start, and Josh decides.

## The 20 replies

Every trigger you add must have **Reply to their comment too** switched ON with exactly these 20
replies, in this order, lowercase and with the emojis exactly as written (the hand emojis are the
brown skin tone), and nothing else. 20 is ManyChat's cap, so they fit exactly.

1. `just dm'd you g`
2. `sent it to you bro`
3. `i just sent it to you`
4. `i just dm'd you`
5. `check your requests g`
6. `check your dms g`
7. `it's in your dms`
8. `sent it gang`
9. `it's in your message requests`
10. `just slid in your dms`
11. `in your dms bro`
12. `check the dm twin`
13. `i got you check your dms`
14. `sent it to you gang`
15. `you good check your dms`
16. `sent it check your requests bro`
17. `just dm'd you 🤝🏾`
18. `sent it to you bro 🔥`
19. `check your dms g 💯`
20. `i got you 👊🏾`

If ManyChat pre-fills its own replies ("Check your DM's", "Sent you a DM", "Just DM'd you", "Just
sent you a DM", "Check your inbox"), delete them first: they are not Dre's voice.

## How to replace text in ManyChat (read this first)

Typing into a ManyChat field ADDS to what is already there. To replace a field: click into it,
press **Ctrl+A**, press **Backspace**, type the new value, then read the field back and confirm it
shows only the new value.

## Step 0: survey the posts once

1. Click **Automation** in the left navigation, then **My Automations**, search for `ROUND` and open
   it.
2. On the **When** node, click **+ New Trigger**, choose **Post or Reel Comments**, then **Specific
   Post or Reel**. This opens the post picker. Scroll through **every** post it lists and write
   down, for each one whose caption asks for one of the 16 keywords: the keyword, the caption's
   first few words, and the post's date if shown. Also note any post whose caption asks for VOTE.
3. **Close the picker without saving the new trigger.** Leave ROUND exactly as it was. If ManyChat
   left an empty unsaved trigger behind, remove it with its own remove control before leaving.
4. If no post asks for any of the 16 keywords, stop here and report the survey. That is a normal
   result: Dre has not posted the song posts yet.

## Steps, for each keyword that has at least one matching post

1. Search for the keyword and open its automation.
2. Look at its **When** node. If it already has a **User comments on your Post or Reel** trigger
   for a matching post, open it, check it against steps 4 to 6, fix the replies if needed, and
   skip to the next post or keyword. Never add a second trigger for the same post.
3. Click **+ New Trigger**, choose **Post or Reel Comments** (subtitle "User comments on your Post
   or Reel"), then **Specific Post or Reel**, and pick the matching post. Never choose **All Posts
   or Reels** or **Next Post or Reel**.
4. On the screen headed **What will start your DM automation?**, choose **Specific Keywords** /
   **Comments include these Keywords**, click **+ Keyword**, and enter only the row's keyword.
5. On **Reply to their comment too**, switch it ON and enter the 20 replies above, in order.
6. Save. If the automation shows **Update** or an unsaved state, click it, then make sure the new
   trigger is switched **on** (publishing and enabling a trigger are separate steps in this
   account). The top bar must end on **Live** and **Saved**.
7. Reopen the trigger and check by eye: the right post, only the row's keyword, all 20 replies.
8. If two posts ask for the same keyword, give that automation one trigger per post.

Leave every automation's **User sends a message** trigger exactly as it is.

## Known problems and the exact fix

| What you see | What to do |
|---|---|
| A reply or keyword shows old and new text run together | It was appended. Ctrl+A, Backspace, type again, read it back. |
| The picker shows no captions, only thumbnails | Hover or open each post in the picker to read its caption. If captions cannot be read at all, stop and report. |
| "Manychat has been updated. Please, save your work and reload the page." | Make sure Saved shows, reload, reopen the trigger and check your change stuck. |
| An empty unsaved trigger is left on an automation | Remove it with its own remove control. Never remove a saved trigger. |
| "could not determine the current browser URL" | Click the ManyChat tab once, retry once, then stop and report. |
| "window capture timed out" or "FrameArrived timed out" | Bring Chrome to the front and retry. If it keeps failing, connect to the existing Chrome tabs through the browser extension. |

## Stop only if

- ManyChat asks you to log in, for a code or 2FA, or to change, renew or buy a plan, or says the
  trial has ended.
- The same step fails three times.
- You are close to running out of credits or usage: make sure the automation you are on ends Live
  and Saved with no empty trigger left behind, then report what you did and what is left.

Do not stop for anything else.

## Never

- Never open your own browser, another browser window, another Chrome profile, or Incognito.
- Never use the account switcher, and never open another ManyChat account.
- Never send a DM, a comment or a broadcast.
- Never set a song's comment trigger to All Posts or Reels or Next Post or Reel.
- Never add a trigger on a post whose caption does not ask for that exact keyword.
- Never delete or change a saved trigger, a message, a button, a link, or a DM trigger.
- Never edit VOTE, and never edit any automation not in the table.
- Never open ManyChat Settings, billing, team or Instagram connection settings.
- Never type a dash of any kind, and never change the replies' wording, capitals or emojis.

## Report

First, the survey from Step 0: every post whose caption asks for one of the 16 keywords or for
VOTE, with its keyword, caption start and date.

Then one line per keyword, in table order:

`<keyword> | Live yes/no | comment triggers: <count> | <for each: post caption start, added / already there / replies fixed>`

Then:

- Posts you were unsure about, with their caption start.
- Keywords with no matching post yet.
- The exact text of any error you saw.
- Confirmation that you sent nothing and left every DM trigger, message, button and link alone.
