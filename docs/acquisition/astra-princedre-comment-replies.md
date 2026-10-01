# Astra prompt: audit Prince Dre's comment replies

**For:** GPT-6 Astra (computer use), driven by Josh.

**Why:** every comment trigger should publicly reply to the fan in Dre's voice so they know to
check their DMs. A trigger seen on 2026-10-01 ("Post or Reel Comments #2") carried ManyChat's
default replies ("Check your DM's", "Sent you a DM", "Just DM'd you", "Just sent you a DM", "Check
your inbox") instead of Dre's four. This run checks every comment trigger on all 17 automations and
fixes the replies. It changes nothing else and sends nothing.

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

Your job: open every automation listed below, check every **comment** trigger on it, and make sure
each one publicly replies to the fan's comment with exactly Dre's four replies. **Do not send any
DM or comment.** Do not change any message, button, link, keyword or DM trigger. Do not explore
ManyChat settings, billing, other accounts, or anything not named here. Do not read documentation.

## The four replies

Every comment trigger's **Reply to their comment too** section (section 3 of the trigger) must be
switched ON and contain exactly these four replies, lowercase as written, and nothing else:

`just dm'd you g`
`sent it to you bro`
`i just sent it to you`
`i just dm'd you`

## The 17 automations

`VOTE`, `ROUND`, `LETTER`, `SEND`, `HOMMIE`, `MUNNA`, `SAVAGE`, `SEEK`, `RIDAH`, `FROM`, `TURNT`,
`LIFE`, `COME`, `CHASIN`, `RELOADED`, `HIGH`, `MADE`.

## How to replace text in ManyChat (read this first)

Typing into a ManyChat field ADDS to what is already there. To replace a field: click into it,
press **Ctrl+A**, press **Backspace**, type the new value, then read the field back and confirm it
shows only the new value.

## Steps, for each automation in the order above

1. Click **Automation** in the left navigation, then **My Automations**. Use **Search all
   Automations** to find it and open it. If it does not exist, note it and move on.
2. On the **When** node, look at every trigger whose title is **User comments on your Post or
   Reel** (inside, it is headed **Post or Reel Comments #1**, **#2**, and so on). Ignore **User
   sends a message** triggers completely.
3. If the automation has **no** comment trigger, note "no comment trigger" and move on. That is
   expected for songs whose post is not up yet. Do not add one.
4. For each comment trigger, open it and write down, for your report: which posts it listens to
   (**All Posts or Reels**, **Next Post or Reel**, or **Specific Post or Reel** plus the post's
   caption start), its keyword, and the replies it currently has in **Reply to their comment
   too**.
5. Scroll to **Reply to their comment too**. If it is switched off, switch it on. Make the replies
   exactly the four above: replace the text of existing replies one at a time (Ctrl+A, Backspace,
   type, read back), remove any extra replies with their own remove control, and add replies with
   the section's add control if there are fewer than four.
6. Do not change the trigger's post choice or keyword, even if it looks wrong. Note it instead
   (see "Report these, do not fix them").
7. Save the trigger. If the automation shows **Update** or an unsaved state, click it, and make
   sure the trigger you edited is still switched **on** afterwards (publishing and enabling a
   trigger are separate steps in this account). The top bar must end on **Live** and **Saved**.
8. Reopen the trigger and check the four replies by eye.

## Report these, do not fix them

- **VOTE** with anything other than exactly one comment trigger on **All Posts or Reels**, keyword
  VOTE.
- A song with a comment trigger on **All Posts or Reels** or **Next Post or Reel** (songs must only
  ever listen to a **Specific Post or Reel**).
- A comment trigger whose keyword is not the automation's own name.
- Two automations whose comment triggers listen to the same post with the same keyword.

## Known problems and the exact fix

| What you see | What to do |
|---|---|
| A reply shows old and new text run together | It was appended. Ctrl+A, Backspace, type again, read it back. |
| ManyChat will not allow a fourth reply, or has a different limit | Keep as many of the four as it allows, in the order listed, and report the limit. |
| "Manychat has been updated. Please, save your work and reload the page." | Make sure Saved shows, reload, reopen the trigger and check your change stuck. |
| "could not determine the current browser URL" | Click the ManyChat tab once, retry once, then stop and report. |
| "window capture timed out" or "FrameArrived timed out" | Bring Chrome to the front and retry. If it keeps failing, connect to the existing Chrome tabs through the browser extension. |

## Stop only if

- ManyChat asks you to log in, for a code or 2FA, or to change, renew or buy a plan, or says the
  trial has ended.
- The same step fails three times.
- You are close to running out of credits or usage: make sure the automation you are on ends Live
  and Saved, then report what you checked and which automations are left.

Do not stop for anything else.

## Never

- Never open your own browser, another browser window, another Chrome profile, or Incognito.
- Never use the account switcher, and never open another ManyChat account.
- Never send a DM, a comment or a broadcast.
- Never add, delete or re-point a trigger, and never change a keyword, message, button or link.
- Never edit any automation not in the list.
- Never open ManyChat Settings, billing, team or Instagram connection settings.
- Never type a dash of any kind, and never change the four replies' wording or capitals.

## Report

One line per automation, in the order above:

`<name> | Live yes/no | comment triggers: <count> | <for each: posts it listens to, keyword, replies before -> fixed / already right>`

Then:

- Everything from "Report these, do not fix them".
- The exact text of any error you saw.
- Confirmation that you sent nothing and changed only the comment replies.
