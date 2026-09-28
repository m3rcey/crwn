# Astra prompt: Meta App Review for Fan Automations (Instagram)

For: GPT-6 Astra (computer use) on Josh's Windows machine. Goal: any artist can connect their
Instagram to CRWN without Josh adding them as a tester first. Instagram only; the Facebook Page
half is deliberately left out of this review (five extra permissions to justify, and artists'
comment funnels are on Instagram).

Already done by Claude (2026-09-27): the privacy policy covers artist connections and fan
comment data at `https://thecrwn.app/privacy#instagram-connections` (also the data deletion
URL), and disconnecting erases the stored token, which is what that section promises.

## Ranked quickest to longest

| # | Task | Your hands-on time | Waiting on Meta | Who |
|---|---|---|---|---|
| 1 | Archive the CRWNTEST automation | 1 min | none | Astra. Do it LAST, after approval (you may need to re-record). |
| 2 | Record the screencast | 15 min | none | Astra drives, you pre-log both Instagram accounts. |
| 3 | Request Advanced Access (App Review form) | 30 min | usually a few days to 2 weeks | Astra fills it; you type the reviewer password. |
| 4 | Business Verification (JNW Creative Enterprises, Inc.) | 20 min | 2 days to several weeks, sometimes a document round-trip | Astra fills fields; YOU upload the legal documents. |

**Start order is not the ranking.** Business Verification has the longest wait and Meta may not
let the App Review request be submitted until it clears, so Astra starts it first, then records,
then fills App Review (submitting if Meta allows, otherwise saving it for one short re-run).

## How sensitive things are handled

| Item | Handling |
|---|---|
| Instagram and Meta passwords, 2FA | You only. Log both Instagram accounts in before Astra starts. |
| Reviewer test account password | You create it and type it into Meta's form yourself when Astra hands back. |
| Legal documents (EIN letter, articles) | You upload them yourself when Astra hands back. They carry the EIN and address, and Astra's screenshots leave the machine. |
| Domain verification code from Meta | Not secret. Astra reports it; Claude publishes it on thecrwn.app. |

## Before you start Astra (about 15 minutes, you)

1. **Reviewer account.** In a private window, sign up at `https://thecrwn.app/signup` with
   `joshn.wms+metareview@gmail.com` and a new password (save it in your password manager).
   Finish the setup wizard as an artist named `Meta Reviewer` (any photo, any short track).
   Meta needs a login that is not yours to test the flow.
2. **Both Instagram accounts in Chrome.** On instagram.com, make sure you can use **Switch
   accounts** between `m3rcey` and `m3rcey__` without a password (log both in once). End signed
   in as `m3rcey`.
3. **Screen recorder.** Press Win+G once; if the Xbox Game Bar opens, close it. That confirms
   Win+Alt+R will record.
4. **Legal documents ready** in one folder: articles of incorporation (or certificate of
   incorporation) and the IRS EIN confirmation letter (CP 575 or 147C) for JNW Creative
   Enterprises, Inc.

Then paste everything below the line into Astra.

---

You are operating my Windows computer to get Meta to approve my app **CRWN Publishing Engine**
for Advanced Access on three Instagram permissions. Do the four parts in order: A (Business
Verification), B (record a screencast), C (App Review request), D (report). Do not explore,
read documentation, or open anything not named here. Hand control back to me at every point
this prompt names; then wait.

## Done means

1. Business Verification for the business portfolio **M3rcey** is submitted (status "In review"
   or "Verified"), or you are waiting on me for documents or a domain code.
2. A screen recording exists in `C:\Users\Josh\Videos\Captures` showing the flow in part B.
3. An App Review request for the three permissions is submitted, or saved with every field
   filled and the only blocker named.

## Values

| What | Value |
|---|---|
| Meta app | CRWN Publishing Engine |
| Business portfolio | M3rcey |
| Legal business name | JNW Creative Enterprises, Inc. |
| Website | `https://thecrwn.app` |
| Privacy policy URL | `https://thecrwn.app/privacy` |
| Terms URL | `https://thecrwn.app/terms` |
| Data deletion instructions URL | `https://thecrwn.app/privacy#instagram-connections` |
| App icon file (only if the app has none) | `\\wsl.localhost\Ubuntu\home\merce\workspace-crwn\public\apple-touch-icon.png` |
| Contact email | `joshn.wms@gmail.com` |
| Permissions to request | instagram_business_basic, instagram_business_manage_comments, instagram_business_manage_messages |
| Artist Instagram account | m3rcey |
| Fan Instagram account (comments) | m3rcey__ |
| Test keyword | `CRWNTEST` |
| Reviewer login email | `joshn.wms+metareview@gmail.com` (I type the password) |

## Part A: Business Verification

1. Go to `https://business.facebook.com/settings`, pick the business portfolio **M3rcey**, then
   **Security Center** (or **Business info**), then **Start verification**. If it already reads
   "Verified" or "In review", skip to part B.
2. Fill in: legal business name, address, phone and website from what I have on screen or the
   table. If a field needs information you do not have (address, phone), hand it back to me
   with the field names.
3. When it asks for documents, hand it back to me: "Upload your legal documents now". Wait.
4. If it offers **domain verification** for thecrwn.app, choose the **meta tag** method (or the
   HTML file method if meta tag is not offered). Copy the tag or the file name and content into
   your report and hand it back to me: Claude will publish it. Do not click Verify until I say
   it is live.
5. If it offers email verification to an address at thecrwn.app, or a phone call or text, hand
   it back to me.
6. Submit when every step is done.

## Part B: screencast (one continuous recording)

Use one Chrome window, maximized, tabs only (the recorder records one window). Speak nothing.
Move slowly: pause about two seconds on every screen so a reviewer can read it.

7. Open `https://thecrwn.app/studio/automations` (logged in as me). Press **Win+Alt+R** to start
   recording.
8. Under "Connected accounts", disconnect m3rcey (this is expected; you reconnect it next).
9. Click **New automation**, pick **Instagram**, click **Connect Instagram**. Instagram's
   consent screen shows the permissions: pause on it three seconds, then approve. You return
   with m3rcey connected. Close the wizard.
10. In the automation list, the CRWNTEST automation now reads paused. Click its **Activate**
    (play) button so it reads active.
11. New tab: instagram.com. **Switch accounts** to m3rcey__. Open any recent m3rcey post and
    comment `CRWNTEST`.
12. Wait up to one minute and reload: the reply "Check your DMs 👑" appears under the comment.
13. Open m3rcey__'s **Messages**: the private message from m3rcey with the drop link. Click the
    link: the CRWN drop page opens. Pause three seconds.
14. Press **Win+Alt+R** to stop. Switch Instagram back to m3rcey.
15. Confirm the newest file in `C:\Users\Josh\Videos\Captures` plays and is at least 60
    seconds. If recording never started, redo 7 to 14 once.

## Part C: App Review request

16. developers.facebook.com → My Apps → **CRWN Publishing Engine** → **App settings** →
    **Basic**. Fill any empty field from the table (privacy URL, terms URL, data deletion
    instructions URL, contact email, category "Business" if blank, the icon only if none).
    Save. Change nothing that is already filled.
17. **Use cases** → the Instagram use case → **Customize** → **Permissions and features**. For
    each of the three permissions, click **Request advanced access** or **Add to App Review**.
    Those only add it to a draft request; click them and close any pop-up form.
18. Open **Review** → **App Review** (or **Required actions**) and continue the request.
19. For each permission, paste the matching text below into "how will your app use this", and
    upload the Part B recording as the screencast.

    **instagram_business_basic:**
    `CRWN is a platform where independent musicians sell memberships to their fans. An artist signs in to CRWN, opens Fan Automations, and connects their own Instagram professional account. We use instagram_business_basic to read the connected account's id and username so the artist can see which account is connected, and to list their recent posts so they can choose which posts a comment automation listens on. We only read the artist's own account.`

    **instagram_business_manage_comments:**
    `After an artist connects their account and turns on an automation (for example, keyword "DROP"), CRWN receives comment webhooks for the artist's own posts. When a comment matches the artist's keyword, CRWN posts one public reply the artist wrote (for example "Check your DMs") under that comment. We store the commenter's id, username and the first 200 characters of the comment to prevent duplicate replies and show the artist how many fans responded. We never reply to comments on accounts that are not connected, never reply twice, and skip the artist's own comments.`

    **instagram_business_manage_messages:**
    `For the same matching comment, CRWN sends exactly one private reply to the commenter using the private replies endpoint, containing the artist's message and a link to the artist's CRWN drop page, where the fan can claim the free download the artist offered. CRWN sends only this single reply per comment, does not start other conversations, and does not send follow-up messages. The screencast shows the full flow: connecting, a fan commenting the keyword, the public reply, and the private message arriving.`

20. **App verification / test instructions:** paste this, then hand it back to me to type the
    reviewer password into the password field:

    `Log in at https://thecrwn.app/login with the test account below. Go to https://thecrwn.app/studio/automations and click New automation, choose Instagram, then Connect Instagram, and sign in with any Instagram professional account you control. Finish the wizard with a keyword (for example CRWNTEST) and click Activate automation. Then, from a different Instagram account, comment that keyword on one of the connected account's posts. Within a minute the post shows a public reply and the commenter receives one private message with a link to the artist's CRWN drop page.`

21. Tick the agreement boxes and click **Submit for review**. If Submit is blocked because
    Business Verification is not complete, leave everything saved and report exactly what the
    screen says.

## Known labels and the fix

- "Add to App Review" or "Request advanced access": adds to a draft. Click it, continue.
- "Get started" on Business Verification that asks you to pick a business: pick M3rcey.
- Screencast upload rejects the file size: report the size; do not re-encode.
- Meta asks you to "complete data use checkup" or "annual data use checkup": complete it with
  the permissions above as "used", then continue.
- A pop-up asks whether the app is for "your own business or clients": choose clients/other
  businesses (artists connect their own accounts).

## Stop only if

- Any login, password, 2FA, or "confirm it's you" screen appears.
- A document upload, a domain code, an email or phone verification, or the reviewer password is
  needed (the hand-backs above).
- Any screen asks for payment.
- The same step fails after two tries.

Do not stop for anything else.

## Never

- Never click Show on any app secret, and never copy any access token.
- Never click Remove on @thecrwnapp anywhere. It powers my scheduled posts.
- Never request any Facebook Page permission, and never add a permission not in the table.
- Never change the app between Development and Live, and never change an already-filled setting.
- Never open ManyChat, and never comment or message from @thecrwnapp.
- Never type a password, EIN, or document contents yourself, and never put them in the report.

## Report back in exactly this format

- Business Verification: submitted (status) / waiting on me for (what) / already verified
- Domain verification code for Claude: (meta tag or file name + content) / not needed
- Screencast: file name, length in seconds / failed (why)
- App settings Basic: fields you filled (names only)
- App Review: submitted / saved, blocked by (exact screen text)
- Anything unexpected
