# Astra prompt: turn on Fan Automations for Instagram (CRWN's own comment-to-DM)

For: GPT-6 Astra (computer use) on Josh's Windows machine. No deadline, but every day it stays
dark, artists keep renting this from ManyChat.
Scope: Instagram only. The Facebook Page half and Meta App Review are separate, later tasks.
When it finishes: send Claude Astra's report, then comment `CRWNTEST` on any m3rcey post from
your phone (any account except m3rcey). Claude checks the database and confirms the DM went out.

Paste everything below the line into Astra.

---

You are operating my Windows computer to switch on one feature in my app CRWN (thecrwn.app):
Instagram comment-to-DM for artists. You will (A) finish the setup of my existing Meta app
**CRWN Publishing Engine** at developers.facebook.com, (B) add four environment variables to
my Vercel project **crwn** and redeploy, (C) connect my Instagram artist account **m3rcey**
inside CRWN and create one test automation. Do them in that order: C needs B, and the webhook
step in A needs B too. Do not explore, read documentation, or open anything not named here.

## Done means

1. Vercel project `crwn`, Production environment, has all four: `IG_APP_ID`, `IG_APP_SECRET`,
   `META_WEBHOOK_VERIFY_TOKEN`, `SOCIAL_TOKEN_ENC_KEY`, and a Production redeploy finished
   after they were set.
2. The terminal check in step 12 prints exactly `4242`.
3. In the Meta app, Instagram webhooks point at `https://thecrwn.app/api/webhooks/meta`,
   verified and saved, with the `comments` field subscribed.
4. At `https://thecrwn.app/studio/automations`, "Connected accounts" shows the Instagram
   account m3rcey, and an automation with keyword `CRWNTEST` is listed as active.

## Values

| What | Value |
|---|---|
| Meta app | CRWN Publishing Engine |
| Instagram account to connect and add as tester | m3rcey |
| OAuth redirect URI | `https://thecrwn.app/api/social-connect/callback/instagram` |
| Webhook callback URL | `https://thecrwn.app/api/webhooks/meta` |
| Webhook field to subscribe | `comments` |
| Vercel project / environment | crwn / Production only |
| CRWN login | Josh's account (it owns the artist M3rcey) |
| Automation keyword | `CRWNTEST` |
| Automation private message | `Here it is. This is the test drop from my CRWN page.` |
| Gift name | `CRWN test drop` |
| Gift reason | `A private test of my CRWN drop page.` |
| Offer tier | The Vault |
| Standout item title | `The monthly vault unlock` |
| Standout item description | `Unreleased music every month, before anyone else.` |
| Fallback tier | Inner Circle |

Two values are secrets that already exist in a file on this machine. You never see them: a
terminal command puts each one on the clipboard and you paste it. The Instagram app secret is
copied from Meta with its copy action and pasted the same way.

## Steps

### A. Meta app (developers.facebook.com)

1. Go to developers.facebook.com, then **My Apps**, then open **CRWN Publishing Engine**. If
   you are not logged in, hand it back to me.
2. Left menu: **Use cases**. Open the Instagram use case (named like "Manage messaging &
   content on Instagram"), then **Customize**, then **API setup with Instagram login**.
3. At the top of that page are **Instagram app ID** and **Instagram app secret**. These are
   NOT the Meta App ID shown in the top bar; they are different numbers. Keep this tab open.
4. Scroll to **Set up Instagram business login** (step 3 on that page). Open **Business login
   settings**. Under **OAuth redirect URIs**, add the redirect URI from the table if it is not
   already there. Leave every other URI as it is. Click **Save**.
5. Add m3rcey as a tester. Left menu: **App roles**, then **Roles**, then **Add People**, pick
   **Instagram Tester**, type `m3rcey`, submit. If that option is not offered, go back to
   **API setup with Instagram login**, step 1 **Generate access tokens**, click **Add account**,
   and follow it for m3rcey (never click **Remove** on any account already listed).
6. Accept the invite on Instagram: go to `https://www.instagram.com/accounts/manage_access/`,
   open the **Tester invites** tab, click **Accept** on CRWN Publishing Engine. This must be
   done while logged in as **m3rcey**. If Instagram is logged in as a different account or asks
   for a password or code, hand it back to me with this step number.
7. Do NOT do the webhook section yet. Go to part B.

### B. Vercel (vercel.com)

8. Open vercel.com, project **crwn**, then **Settings**, then **Environment Variables**.
   Search the list for each of the four names first and note which already exist.
9. Add each variable with **Environments: Production only** (untick Preview and Development).
   Leave "Sensitive" on if Vercel offers it. For each one:
   - `IG_APP_ID`: copy the Instagram app ID from the Meta tab (step 3) and paste.
   - `IG_APP_SECRET`: on the Meta tab click **Show** or the copy icon next to Instagram app
     secret, copy it, paste it here. If Meta asks for a password, hand it back to me.
   - `META_WEBHOOK_VERIFY_TOKEN` and `SOCIAL_TOKEN_ENC_KEY`: open the Ubuntu terminal (Start
     menu, "Ubuntu"). Run the line for that variable, then paste into the Vercel value box:

         cd ~/workspace-crwn && grep '^META_WEBHOOK_VERIFY_TOKEN=' .env.fanautomations | cut -d= -f2- | tr -d '\n' | clip.exe

         cd ~/workspace-crwn && grep '^SOCIAL_TOKEN_ENC_KEY=' .env.fanautomations | cut -d= -f2- | tr -d '\n' | clip.exe

   If a variable already exists:
   - `SOCIAL_TOKEN_ENC_KEY` already exists: do NOT change it. Skip it and say so in the report.
   - Any of the other three already exists: edit it and replace its value with the new one.
10. Redeploy: when Vercel shows "A new deployment is needed" with a **Redeploy** button, use
    it. Otherwise go to **Deployments**, open the menu (three dots) on the top deployment
    marked **Production**, click **Redeploy**, and confirm. Wait until it reads **Ready**.
11. Clear the clipboard in the Ubuntu terminal:

        printf '' | clip.exe

12. Check the deploy picked up the token (Ubuntu terminal). It prints only the number:

        cd ~/workspace-crwn && T=$(grep '^META_WEBHOOK_VERIFY_TOKEN=' .env.fanautomations | cut -d= -f2-) && curl -s "https://thecrwn.app/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=$T&hub.challenge=4242"; echo; unset T

    Pass: it prints `4242`. If it prints `{"error":"Verification failed"}`, the redeploy has not
    finished or the value was pasted with extra characters: re-copy it (step 9), save, redeploy,
    check again. At most two retries, then report.

### A, continued. Meta webhook

13. Back on **API setup with Instagram login**, open **Configure webhooks** (step 2 on that
    page). If a Callback URL is already filled in with anything other than the value in the
    table, STOP and report what it says. Otherwise enter the Callback URL from the table. For
    **Verify token**, run the META_WEBHOOK_VERIFY_TOKEN line from step 9 again and paste.
    Click **Verify and save**. Then clear the clipboard (step 11).
14. In the **Webhook fields** list below it, find `comments` and switch **Subscribe** on.
    Change no other field.

### C. CRWN (thecrwn.app)

15. Go to `https://thecrwn.app/studio/automations`, logged in as me. If you are not logged
    in, hand it back to me.
16. If the page shows "Fan Automations is being switched on", part B has not reached
    production: repeat step 12, then reload. Do not continue past this while it shows.
17. Click **New automation**. On "Where should CRWN listen?" pick **Instagram**, then click
    **Connect Instagram**. Instagram opens. It must be the m3rcey account; if it shows another
    account or asks for a password or code, hand it back to me. Approve with every permission
    left ticked. You return to /studio/automations and m3rcey appears under "Connected
    accounts".
18. Click **New automation** again and fill it in with the table's values:
    - Where should CRWN listen?: **Instagram** (it now reads "Connected"). Continue.
    - Which posts?: **Any post**. Continue.
    - Which comments trigger it?: `CRWNTEST`. Continue.
    - What should people see after they comment?: leave empty. Continue.
    - What do you want CRWN to send them privately?: the private message from the table.
    - What can you give a fan right now?: **One of my tracks**. The gift itself: pick the
      first track in the list.
    - Name it: `CRWN test drop`. Why do they want it?: the gift reason from the table.
    - After the gift, what do you offer?: **The Vault**. The standout item: title and
      description from the table.
    - If they say not now: **Inner Circle**.
    - Look it over: click **Activate automation**.
19. Confirm the automation now shows in the list as active. If a toast says "Saved. Finish the
    missing piece to turn it on.", copy its exact text into the report and stop there.

## Known errors and the fix

- "Add to App Review", "Request advanced access", or a review/verification banner: that is for
  other artists later. Ignore it, do not click it, continue.
- Instagram screen "Invalid redirect_uri" or "redirect URI mismatch": step 4 was not saved
  exactly. Redo step 4, then step 17.
- Instagram screen "Invalid platform app" or "Invalid app ID": `IG_APP_ID` holds the Meta App
  ID instead of the Instagram app ID. Fix it in Vercel (step 9), redeploy (step 10), redo 17.
- Instagram says the account is not a professional account, or cannot be used with this app:
  stop and report it. Do not change the account type yourself.
- Instagram says the account is not a tester or not authorized: step 6 was not accepted. Redo
  step 6, then step 17.
- Meta "The URL couldn't be validated" on Verify and save: step 12 did not print 4242. Fix B
  first, then redo step 13.
- Vercel "A variable with this name already exists": follow the "already exists" rule in step 9.

## Stop only if

- Any login, password, 2FA code, or "confirm it's you" screen appears (hand it back to me).
- Any screen asks for payment, a plan change, Business Verification, or switching the app
  between Development and Live.
- The webhook Callback URL is already set to something else (step 13).
- The same step fails after two retries.

Do not stop for anything else.

## Never

- Never click **Remove**, disconnect, reset, or revoke on any Instagram account in Meta or in
  CRWN. The @thecrwnapp account on this app powers my scheduled posts and must keep working.
- Never change `IG_ACCESS_TOKEN` or any Vercel variable not named above. Never touch Preview or
  Development variables. Never edit or delete `.env.fanautomations`, `.env.local`, or
  `.env.instagram`.
- Never submit App Review, start Business Verification, publish/unpublish the app, or change any
  other product, use case, or permission on the app.
- Never open ManyChat.
- Never post, comment, like, or DM on Instagram. I will leave the test comment myself.
- Never type, read out, or report any secret or token. In the report call them "the value".

## Report back in exactly this format

- Redirect URI saved: yes / was already there / failed (screen text)
- m3rcey tester: invited and accepted / invited, not accepted / failed (screen text)
- Vercel vars: for each of the four, `added` / `replaced` / `already existed, left alone`
- Redeploy: Ready at (time) / failed
- Step 12 printed: (exact output)
- Webhook: verified and saved / failed (screen text); comments subscribed: yes / no
- CRWN banner "being switched on" gone: yes / no
- Instagram connected in CRWN as: (username shown) / failed (screen text)
- Automation CRWNTEST: active / draft (toast text) / failed (screen text)
- Anything unexpected, especially any warning about @thecrwnapp or the publishing token
