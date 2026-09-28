# Astra prompt: finish the Meta App Review submission (screencast + submit)

For: GPT-6 Astra (computer use), continuing the run from
[astra-meta-app-review.md](astra-meta-app-review.md). State when written (2026-09-27): Business
Verification already verified; reviewer artist `Meta Reviewer` set up, Stripe-priced and hidden
from Explore (Claude verified in the database); App settings Basic filled; App Review draft
saved with the three permissions and their descriptions.

## Josh's three touches

1. **OBS, before pasting:** Settings → Output → Recording Format **mp4**. Add a **Display
   Capture** source for the main monitor. Do not start recording yet; Astra asks you to.
2. **Start and Stop** in OBS when Astra says so.
3. **Reviewer password:** when Astra asks, run in Ubuntu, and Astra presses Ctrl+V:

       cd ~/workspace-crwn && grep '^META_REVIEWER_PASSWORD=' .env.fanautomations | cut -d= -f2- | tr -d '\n' | clip.exe

   Afterwards: `printf '' | clip.exe`

Keep Chrome maximized, in front, on the main monitor, and do not touch the computer otherwise.

Paste everything below the line into Astra.

---

Continue the Meta App Review for my app **CRWN Publishing Engine**. Business Verification is done,
the reviewer account is done, App settings are done, and the App Review draft holds the three
permissions with their descriptions. You will (A) answer the remaining draft questions, (B)
perform the demo flow while I record it with OBS, (C) upload the recording, fill the reviewer
credentials, and submit. Do not explore or open anything not named here.

## A. Remaining draft questions

In the App Review draft (developers.facebook.com → My Apps → CRWN Publishing Engine → Review →
App Review), answer:

| Question | Answer |
|---|---|
| Does your app use Facebook Login? | No |
| Data processors or service providers with access to Platform Data? | Yes: Supabase (database hosting, United States) and Vercel (application hosting, United States) |
| Who is responsible for Platform Data? | JNW Creative Enterprises Inc., United States |
| Provided personal data to public authorities for national security requests in the past 12 months? | No |
| Policies/processes for requests from public authorities | None of the above |

Save. Leave the screencast and credentials for part C.

## B. Demo flow (I record it)

1. Open `https://thecrwn.app/studio/automations` in my normal Chrome window (signed in as me).
2. Check instagram.com in a second tab: **Switch accounts** must reach both m3rcey and m3rcey__.
   If it asks for a password, hand it back to me. End signed in as m3rcey, and return to the
   CRWN tab.
3. Tell me: "Start OBS recording now." Wait until I say it is recording.
4. Pause about two seconds on every screen from here on so a reviewer can read it.
5. Under "Connected accounts", disconnect m3rcey (expected).
6. Click **New automation**, pick **Instagram**, click **Connect Instagram**. On Instagram's
   permissions screen pause three seconds, then approve. You return with m3rcey connected.
7. Click **New automation** and build it: Instagram; **Any post**; keyword `CRWNTEST`; public
   reply `Check your DMs 👑`; private message
   `Here it is. This is the test drop from my CRWN page.`; **One of my tracks** and the first
   track; name `CRWN test drop`; reason `A private test of my CRWN drop page.`; offer **Vault**
   with item `The monthly vault unlock` / `Unreleased music every month, before anyone else.`;
   fallback **Silver**; **Activate automation**. It shows active. (An older archived CRWNTEST
   automation is expected; ignore it.)
8. instagram.com tab: **Switch accounts** to m3rcey__. Open any recent m3rcey post and comment
   `CRWNTEST`.
9. Wait up to one minute and reload: "Check your DMs 👑" appears under the comment.
10. Open m3rcey__'s **Messages**: the private message from m3rcey with the drop link. Click the
    link: the CRWN drop page opens. Pause three seconds.
11. Tell me: "Stop OBS recording now." Wait until I confirm. Switch Instagram back to m3rcey.

If step 9 or 10 shows nothing after two minutes, tell me to stop recording and report; do not
repeat the comment.

## C. Upload and submit

12. The recording is the newest `.mp4` in `C:\Users\Josh\Videos`. Upload it as the screencast
    for each of the three permissions.
13. Reviewer credentials: email `joshn.wms+metareview@gmail.com`. For the password, click the
    password field and tell me: "Put the reviewer password on the clipboard." When I confirm,
    press Ctrl+V. Then tell me to clear the clipboard.
14. Tick the agreement boxes and click **Submit for review**.

## Known labels and the fix

- "Add to App Review" or "Request advanced access": already done; ignore.
- Upload rejects the file size: report the size; do not re-encode.
- The automation wizard says "Connect Stripe so the offer has a live price": report it (that is
  M3rcey's setup, not the reviewer's).
- Any business picker: do not use it; report.

## Stop only if

- Any login, password, 2FA or "confirm it's you" screen appears.
- A question not in the part A table, or any payment screen.
- The same step fails after two tries.

Do not stop for anything else.

## Never

- Never click Show on an app secret or copy any access token.
- Never click Remove on @thecrwnapp. Never comment or message from @thecrwnapp.
- Never add a permission, never request a Facebook Page permission, never change App settings.
- Never type the reviewer password yourself or put it in the report.

## Report back in exactly this format

- Draft questions: answered / blocked by (question text)
- Demo flow: completed / failed at step (n) with (screen text)
- Screencast: file name, size, uploaded to all three permissions yes/no
- Credentials: filled yes/no
- Submitted: yes, status (text) / no, blocked by (exact text)
