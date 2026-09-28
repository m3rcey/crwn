# Astra prompt: turn on Fan Automations for Instagram (CRWN's own comment-to-DM)

For: GPT-6 Astra (computer use) on Josh's Windows machine, after Josh and Claude finish the
two short stages below. Scope: Instagram only. The Facebook Page half and Meta App Review are
separate, later tasks.

## How secrets are handled (why there are three stages)

Astra works from screenshots, and every screenshot leaves this machine. So Astra never sees a
secret. The rule: a secret moves only from one screen to a hidden terminal prompt, typed by
Josh, or from a file to Vercel through the CLI's stdin, run by Claude.

| Value | Secret? | Who handles it | How |
|---|---|---|---|
| `SOCIAL_TOKEN_ENC_KEY` | Yes (decrypts every artist's Instagram token) | Claude | Generated into the git-ignored `.env.fanautomations`, piped to Vercel as Sensitive. Never printed. |
| `IG_APP_SECRET` | Yes (signs webhooks, swaps OAuth codes) | Josh, then Claude | Josh reveals it in Meta with Astra NOT running and pastes it into a hidden prompt; Claude pipes it to Vercel. |
| `META_WEBHOOK_VERIFY_TOKEN` | Low (only answers Meta's one-time handshake; events still need the app secret's signature) | Astra pastes it by clipboard | Claude rotates it right after Astra finishes, so whatever Astra's screenshots saw is dead. |
| `IG_APP_ID` | No (it is in every Instagram login URL) | Josh, same prompt | Stored with the secret. |
| Passwords, 2FA codes | Yes | Josh only | Astra hands control back at every login screen. |
| m3rcey's Instagram access token | Yes | Nobody | CRWN's server receives it and stores it encrypted. It never appears on screen. |

## Stage 1: Josh, about 3 minutes, Astra NOT running

1. Ubuntu terminal:

       cd ~/workspace-crwn && npx vercel login

   Approve in the browser that opens. This lets Claude set Vercel variables without the
   dashboard.
2. developers.facebook.com → My Apps → **CRWN Publishing Engine** → Use cases → the Instagram
   use case → **Customize** → **API setup with Instagram login**. At the top: **Instagram app
   ID** and **Instagram app secret** (click Show). These are NOT the Meta App ID in the top bar.
3. Ubuntu terminal. Paste the app ID when asked, then the secret (the secret stays invisible,
   that is intended):

       cd ~/workspace-crwn && read -rp 'Instagram app ID: ' ID && read -rsp 'Instagram app secret (hidden): ' S && echo && printf 'IG_APP_ID=%s\nIG_APP_SECRET=%s\n' "$ID" "$S" >> .env.fanautomations && unset S ID && printf '' | clip.exe && echo saved

4. Reload the Meta page so the secret is masked again. Tell Claude "secrets in".

## Stage 2: Claude (DONE 2026-09-27: four vars added as Sensitive, redeployed, handshake 4242)

Links the repo to the `crwn` Vercel project, adds the four variables to Production as
Sensitive from `.env.fanautomations` via stdin (leaving an existing `SOCIAL_TOKEN_ENC_KEY`
untouched), redeploys the current production deployment, and confirms the webhook handshake
answers `4242`. Then tells Josh to start Astra.

## Stage 3: Astra

Paste everything below the line into Astra. When it finishes, send Claude the report, then
comment `CRWNTEST` on any m3rcey post from your phone with any account except m3rcey. Claude
checks the database for the private reply, then rotates the verify token.

---

You are operating my Windows computer to switch on one feature in my app CRWN (thecrwn.app):
Instagram comment-to-DM for artists. The server side is already configured. You will (A) finish
three settings in my existing Meta app **CRWN Publishing Engine** at developers.facebook.com,
then (B) connect my Instagram artist account **m3rcey** inside CRWN and create one test
automation. Do not explore, read documentation, or open anything not named here.

## Done means

1. In the Meta app, the redirect URI below is saved, m3rcey is an accepted Instagram Tester,
   and Instagram webhooks point at `https://thecrwn.app/api/webhooks/meta`, verified and saved,
   with the `comments` field subscribed.
2. At `https://thecrwn.app/studio/automations`, "Connected accounts" shows the Instagram
   account m3rcey, and an automation with keyword `CRWNTEST` is listed as active.

## Values

| What | Value |
|---|---|
| Meta app | CRWN Publishing Engine |
| Instagram account to connect and add as tester | m3rcey (a Business account) |
| OAuth redirect URI | `https://thecrwn.app/api/social-connect/callback/instagram` |
| Webhook callback URL | `https://thecrwn.app/api/webhooks/meta` |
| Webhook field to subscribe | `comments` |
| CRWN login | Josh's account (it owns the artist M3rcey) |
| Automation keyword | `CRWNTEST` |
| Automation private message | `Here it is. This is the test drop from my CRWN page.` |
| Gift name | `CRWN test drop` |
| Gift reason | `A private test of my CRWN drop page.` |
| Offer tier | Vault ($25) |
| Standout item title | `The monthly vault unlock` |
| Standout item description | `Unreleased music every month, before anyone else.` |
| Fallback tier | Silver ($10) |

## Steps

### A. Meta app (developers.facebook.com)

1. Go to developers.facebook.com, then **My Apps**, then open **CRWN Publishing Engine**. If
   you are not logged in, hand it back to me.
2. Left menu: **Use cases**. Open the Instagram use case (named like "Manage messaging &
   content on Instagram"), then **Customize**, then **API setup with Instagram login**.
   Do not click **Show** next to the app secret; you never need it.
3. Scroll to **Set up Instagram business login**. Open **Business login settings**. Under
   **OAuth redirect URIs**, add the redirect URI from the table if it is not already there.
   Leave every other URI as it is. Click **Save**.
4. Add m3rcey as a tester. Left menu: **App roles**, then **Roles**, then **Add People**, pick
   **Instagram Tester**, type `m3rcey`, submit. If that option is not offered, go back to
   **API setup with Instagram login**, step **Generate access tokens**, click **Add account**,
   and follow it for m3rcey. Never click **Remove** on any account already listed, and if a
   token is displayed at any point, close it without copying it.
5. Accept the invite on Instagram: go to `https://www.instagram.com/accounts/manage_access/`,
   open the **Tester invites** tab, click **Accept** on CRWN Publishing Engine. This must be
   done while logged in as **m3rcey**. If Instagram is logged in as a different account or asks
   for a password or code, hand it back to me with this step number.
6. Back on **API setup with Instagram login**, open **Configure webhooks**. If a Callback URL
   is already filled in with anything other than the value in the table, STOP and report what
   it says. Otherwise enter the Callback URL from the table. For **Verify token**, open the
   Ubuntu terminal (Start menu, "Ubuntu"), run this line, then paste into the field:

       cd ~/workspace-crwn && grep '^META_WEBHOOK_VERIFY_TOKEN=' .env.fanautomations | cut -d= -f2- | tr -d '\n' | clip.exe

   Click **Verify and save**. Then clear the clipboard:

       printf '' | clip.exe

7. In the **Webhook fields** list below it, find `comments` and switch **Subscribe** on.
   Change no other field.

### B. CRWN (thecrwn.app)

8. Go to `https://thecrwn.app/studio/automations`, logged in as me. If you are not logged in,
   hand it back to me.
9. If the page shows "Fan Automations is being switched on", stop and report it (the server
   side is not live yet; that is mine to fix).
10. Click **New automation**. On "Where should CRWN listen?" pick **Instagram**, then click
    **Connect Instagram**. Instagram opens. It must be the m3rcey account; if it shows another
    account or asks for a password or code, hand it back to me. Approve with every permission
    left ticked. You return to /studio/automations and m3rcey appears under "Connected
    accounts".
11. Click **New automation** again and fill it in with the table's values:
    - Where should CRWN listen?: **Instagram** (it now reads "Connected"). Continue.
    - Which posts?: **Any post**. Continue.
    - Which comments trigger it?: `CRWNTEST`. Continue.
    - What should people see after they comment?: leave empty. Continue.
    - What do you want CRWN to send them privately?: the private message from the table.
    - What can you give a fan right now?: **One of my tracks**. The gift itself: pick the
      first track in the list.
    - Name it: `CRWN test drop`. Why do they want it?: the gift reason from the table.
    - After the gift, what do you offer?: **Vault**. The standout item: title and
      description from the table.
    - If they say not now: **Silver**.
    - Look it over: click **Activate automation**.
12. Confirm the automation now shows in the list as active. If a toast says "Saved. Finish the
    missing piece to turn it on.", copy its exact text into the report and stop there.

## Known errors and the fix

- "Add to App Review", "Request advanced access", or a review/verification banner: that is for
  other artists later. Ignore it, do not click it, continue.
- Instagram screen "Invalid redirect_uri" or "redirect URI mismatch": step 3 was not saved
  exactly. Redo step 3, then step 10.
- Instagram screen "Invalid platform app" or "Invalid app ID": stop and report it (a server
  value is wrong; that is mine to fix).
- Instagram says the account is not a tester or not authorized: step 5 was not accepted. Redo
  step 5, then step 10.
- Meta "The URL couldn't be validated" on Verify and save: re-run the clipboard line in step 6,
  paste again, retry once. If it fails again, stop and report the exact text.

## Stop only if

- Any login, password, 2FA code, or "confirm it's you" screen appears (hand it back to me).
- Any screen asks for payment, a plan change, Business Verification, or switching the app
  between Development and Live.
- The webhook Callback URL is already set to something else (step 6).
- The same step fails after two retries.

Do not stop for anything else.

## Never

- Never click **Show** on the Instagram app secret, and never copy any access token.
- Never click **Remove**, disconnect, reset, or revoke on any Instagram account in Meta or in
  CRWN. The @thecrwnapp account on this app powers my scheduled posts and must keep working.
- Never open Vercel. Never open, print, or edit `.env.fanautomations`, `.env.local`, or
  `.env.instagram`; the only command that touches one is the clipboard line in step 6.
- Never submit App Review, start Business Verification, publish/unpublish the app, or change any
  other product, use case, or permission on the app.
- Never open ManyChat.
- Never post, comment, like, or DM on Instagram. I will leave the test comment myself.
- Never type, read out, or report any secret or token. In the report call them "the value".

## Report back in exactly this format

- Redirect URI saved: yes / was already there / failed (screen text)
- m3rcey tester: invited and accepted / invited, not accepted / failed (screen text)
- Webhook: verified and saved / failed (screen text); comments subscribed: yes / no
- CRWN banner "being switched on" absent: yes / no
- Instagram connected in CRWN as: (username shown) / failed (screen text)
- Automation CRWNTEST: active / draft (toast text) / failed (screen text)
- Anything unexpected, especially any warning about @thecrwnapp or the publishing token
