# Astra prompt: Meta App Review for Fan Automations (Instagram)

For: GPT-6 Astra (computer use) on Josh's Windows machine. Goal: any artist can connect their
Instagram to CRWN without Josh adding them as a tester first. Instagram only; the Facebook Page
half is deliberately left out of this review (five extra permissions to justify, and artists'
comment funnels are on Instagram).

Already done by Claude (2026-09-27):
- Privacy policy covers artist connections and fan comment data at
  `https://thecrwn.app/privacy#instagram-connections` (also the data deletion URL), and
  disconnecting erases the stored token, which is what that section promises.
- The first CRWNTEST automation is archived; the recording builds a fresh one on camera.
- Reviewer login `joshn.wms+metareview@gmail.com` exists with its email confirmed. Its password
  is in the git-ignored `~/workspace-crwn/.env.fanautomations` (META_REVIEWER_PASSWORD).
- Upload files for the reviewer's setup are in `C:\Users\Josh\Documents\meta-review\`
  (reviewer-photo.png, reviewer-track.mp3).

## Ranked quickest to longest

| # | Task | Your time | Waiting on Meta | Who |
|---|---|---|---|---|
| 1 | Archive the CRWNTEST automation | done | none | Claude archived it. Archive the one the recording creates after approval. |
| 2 | Record the screencast | 0 | none | Astra. |
| 3 | Request Advanced Access (App Review form) | 0 | usually a few days to 2 weeks | Astra, including the reviewer account and its Stripe setup (you: identity and bank only). |
| 4 | Business Verification (JNW Creative Enterprises Inc.) | about 2 min (drop documents in a folder) | 2 days to several weeks | Astra, uploading from the folder. |

**Start order is not the ranking.** Business Verification has the longest wait and Meta may not
let the App Review request be submitted until it clears, so Astra starts it first.

**Why the reviewer account needs Stripe:** an automation cannot be switched on until its offer
tier has a live price, and a price exists only after Stripe is connected. Without it, Meta's
reviewer stops at the last step and rejects with "could not reproduce".

## How sensitive things are handled

| Item | Handling |
|---|---|
| Your passwords, 2FA, SMS codes | You only. Astra hands back at every such screen. |
| Stripe identity (SSN, date of birth) and bank details | You only. Astra hands back for the whole identity and bank part. |
| Legal documents | Astra uploads them through the file picker and never opens or previews them. |
| EIN typed into a form | You, if Meta asks for it in a field. |
| Reviewer password | Astra pastes it by clipboard. It exists only to be given to Meta and the account holds no money of yours beyond its own test page. |
| Domain verification code | Not secret. Astra reports it; Claude publishes it on thecrwn.app. |

## Before you start Astra (about 2 minutes, you)

Put your legal documents for JNW Creative Enterprises Inc. in
`C:\Users\Josh\Documents\meta-review\`: the articles or certificate of incorporation, and the
IRS EIN letter (147C). Name files clearly; Astra picks them by name.

**Address decision (2026-09-27):** every Meta address field uses the address printed on these
documents (all of them still show it), so the typed address and the documents always match. If
Meta ever asks for proof of a newer address, resubmit with a document that shows it. Then paste everything below the line into Astra.

**Right before pasting:** open M3rcey's Security Center (developers.facebook.com/apps → CRWN
Publishing Engine → App roles → Roles → **Edit roles in Meta Business Suite** → **Security
Center**). Keep Chrome maximized, in front, on your main monitor; do not lock the screen, let
it sleep, or use the computer while Astra runs. A hidden or locked screen makes Astra fail with
"window capture timed out".

---

You are operating my Windows computer to get Meta to approve my app **CRWN Publishing Engine**
for Advanced Access on three Instagram permissions. Do the parts in order: A (Business
Verification), B (set up a reviewer test account), C (record a screencast), D (App Review
request), then report. Do not explore, read documentation, or open anything not named here.
Hand control back to me at every point this prompt names; then wait.

## Done means

1. Business Verification for the business portfolio **M3rcey** is submitted (status "In review"
   or "Verified"), or you are waiting on me for one named thing.
2. The CRWN account `joshn.wms+metareview@gmail.com` has finished setup as the artist
   **Meta Reviewer** with Stripe connected.
3. A screen recording exists in `C:\Users\Josh\Videos\Captures` showing the flow in part C.
4. An App Review request for the three permissions is submitted, or saved with every field
   filled and the only blocker named.

## Values

| What | Value |
|---|---|
| Meta app | CRWN Publishing Engine |
| Business portfolio | M3rcey |
| Legal business name | `JNW Creative Enterprises Inc.` (no comma: exactly as the Missouri certificate and the IRS letter print it) |
| Website | `https://thecrwn.app` |
| Privacy policy URL | `https://thecrwn.app/privacy` |
| Terms URL | `https://thecrwn.app/terms` |
| Data deletion instructions URL | `https://thecrwn.app/privacy#instagram-connections` |
| Files folder | `C:\Users\Josh\Documents\meta-review\` |
| App icon file (only if the app has none) | `reviewer-photo.png` in the files folder |
| Contact email | `joshn.wms@gmail.com` |
| Permissions to request | instagram_business_basic, instagram_business_manage_comments, instagram_business_manage_messages |
| Reviewer CRWN login | `joshn.wms+metareview@gmail.com`, password by clipboard (below) |
| Reviewer artist name | `Meta Reviewer` |
| Reviewer track title | `Reviewer Track` |
| Artist Instagram account (recording) | m3rcey |
| Fan Instagram account (recording) | m3rcey__ |
| Test keyword | `CRWNTEST` |

To put the reviewer password on the clipboard, open the Ubuntu terminal (Start menu, "Ubuntu")
and run this, then paste. Afterwards clear it with `printf '' | clip.exe`.

    cd ~/workspace-crwn && grep '^META_REVIEWER_PASSWORD=' .env.fanautomations | cut -d= -f2- | tr -d '\n' | clip.exe

## Part A: Business Verification

1. I start you on M3rcey's **Security Center** in Meta Business settings (Chrome in front,
   maximized). If you are not on it: developers.facebook.com/apps → **CRWN Publishing Engine** →
   **App roles** → **Roles** → click **Edit roles in Meta Business Suite** (next to "This app is
   managed by M3rcey"), then **Security Center** in that page's left menu. Never use the
   business switcher to find M3rcey; this button already opens it. Click **Start verification**.
   If it already reads "Verified" or "In review", skip to part B.
2. Fill in the legal business name, website and contact email from the table. If it asks for
   an address, phone number or tax ID (EIN) that is not already shown, hand it back to me with
   the field names. I type the address exactly as the IRS EIN letter prints it under the
   company name, and the same address goes in EVERY Meta address field, including the
   portfolio's **Business info** address (step 2a).
   Upload the **Certificate of Incorporation** as the legal-name document and the **IRS EIN
   letter** as the address and tax ID document. The Articles only if it asks for more.
2a. In `https://business.facebook.com/settings` → **Business info**, check the business address.
   If it differs from the one I typed in step 2, hand it back to me to correct it. Never type
   an address yourself.
3. Documents: upload the incorporation document and the EIN letter from the files folder
   through the file picker. Do not open, preview or read any document.
4. If it offers **domain verification** for thecrwn.app, choose the **meta tag** method (or the
   HTML file method if meta tag is not offered). Put the tag, or the file name and content, in
   your report and hand it back to me: Claude publishes it. Do not click Verify until I say it
   is live. Continue with parts B to D while you wait.
5. If it offers email verification to an address at thecrwn.app, or a phone call or text code,
   hand it back to me.
6. Submit when every step is done.

## Part B: reviewer test account

7. Open a **Chrome Incognito window** (Ctrl+Shift+N). Go to `https://thecrwn.app/login`. Email
   `joshn.wms+metareview@gmail.com`; password: run the clipboard line, paste, sign in, then
   clear the clipboard.
8. You land on the setup wizard. Fill it:
   - Artist name: `Meta Reviewer`. Link: accept the suggested one.
   - Photo: upload `reviewer-photo.png` from the files folder.
   - Tier ladder: accept the recommended ladder as it is.
   - Promises screen: accept as it is.
   - Stripe screen: click the connect button. Stripe opens. Click through choices that are not
     personal data (country United States, "Individual" or the business type shown). Hand it
     back to me as soon as Stripe asks for a phone code, identity details (name, date of birth,
     SSN, address) or bank details. When I return control you will be back on the wizard.
   - Content: choose one featured track; upload `reviewer-track.mp3` from the files folder;
     title `Reviewer Track`.
   - Shop: **Skip for now**.
   - Finish with **Launch my CRWN**.
9. Go to `https://thecrwn.app/account/tiers`. Confirm the paid tiers show prices and no
   "connect Stripe" warning. If Stripe shows "under review" or prices are missing, report the
   exact text and continue with part C anyway.
10. Close the Incognito window.

## Part C: screencast (one continuous recording)

Use your normal Chrome window (signed in to CRWN as me), maximized, tabs only (the recorder
records one window). Pause about two seconds on every screen so a reviewer can read it.

11. Check the recorder: press Win+G; if the Xbox Game Bar opens, press Win+G again to close it.
    If it does not open, report it and skip to part D.
12. Check Instagram: on instagram.com you must be able to **Switch accounts** between m3rcey and
    m3rcey__. If switching asks for a password, hand it back to me. End signed in as m3rcey.
13. Open `https://thecrwn.app/studio/automations`. Press **Win+Alt+R** to start recording.
14. Under "Connected accounts", disconnect m3rcey (expected; you reconnect it next).
15. Click **New automation**, pick **Instagram**, click **Connect Instagram**. Instagram's
    consent screen shows the permissions: pause on it three seconds, then approve. You return
    with m3rcey connected.
16. Click **New automation** and build it on camera: Instagram; **Any post**; keyword
    `CRWNTEST`; public reply `Check your DMs 👑`; private message
    `Here it is. This is the test drop from my CRWN page.`; **One of my tracks** and the first
    track; name `CRWN test drop`; reason `A private test of my CRWN drop page.`; offer
    **Vault** with item `The monthly vault unlock` / `Unreleased music every month, before anyone else.`;
    fallback **Silver**; then **Activate automation**. It shows as active in the list. (An
    older CRWNTEST automation marked archived is expected; ignore it.)
17. New tab: instagram.com. **Switch accounts** to m3rcey__. Open any recent m3rcey post and
    comment `CRWNTEST`.
18. Wait up to one minute and reload: "Check your DMs 👑" appears under the comment.
19. Open m3rcey__'s **Messages**: the private message from m3rcey with the drop link. Click the
    link: the CRWN drop page opens. Pause three seconds.
20. Press **Win+Alt+R** to stop. Switch Instagram back to m3rcey.
21. Confirm the newest file in `C:\Users\Josh\Videos\Captures` plays and is at least 60
    seconds. If recording never started, redo 13 to 20 once (archive the extra CRWNTEST
    automation it creates).

## Part D: App Review request

22. developers.facebook.com → My Apps → **CRWN Publishing Engine** → **App settings** →
    **Basic**. Fill any empty field from the table (privacy URL, terms URL, data deletion
    instructions URL, contact email, category "Business" if blank, the icon only if none).
    Save. Change nothing that is already filled.
23. **Use cases** → the Instagram use case → **Customize** → **Permissions and features**. For
    each of the three permissions, click **Request advanced access** or **Add to App Review**.
    Those only add it to a draft request; click them and close any pop-up form.
24. Open **Review** → **App Review** (or **Required actions**) and continue the request.
25. For each permission, paste the matching text below into "how will your app use this", and
    upload the part C recording as the screencast.

    **instagram_business_basic:**
    `CRWN is a platform where independent musicians sell memberships to their fans. An artist signs in to CRWN, opens Fan Automations, and connects their own Instagram professional account. We use instagram_business_basic to read the connected account's id and username so the artist can see which account is connected, and to list their recent posts so they can choose which posts a comment automation listens on. We only read the artist's own account.`

    **instagram_business_manage_comments:**
    `After an artist connects their account and turns on an automation (for example, keyword "DROP"), CRWN receives comment webhooks for the artist's own posts. When a comment matches the artist's keyword, CRWN posts one public reply the artist wrote (for example "Check your DMs") under that comment. We store the commenter's id, username and the first 200 characters of the comment to prevent duplicate replies and show the artist how many fans responded. We never reply to comments on accounts that are not connected, never reply twice, and skip the artist's own comments.`

    **instagram_business_manage_messages:**
    `For the same matching comment, CRWN sends exactly one private reply to the commenter using the private replies endpoint, containing the artist's message and a link to the artist's CRWN drop page, where the fan can claim the free download the artist offered. CRWN sends only this single reply per comment, does not start other conversations, and does not send follow-up messages. The screencast shows the full flow: connecting, a fan commenting the keyword, the public reply, and the private message arriving.`

26. **App verification / test instructions:** paste this; put the reviewer email and the
    clipboard password in the credential fields (clear the clipboard after):

    `Log in at https://thecrwn.app/login with the test account provided. It is an artist account (Meta Reviewer) with payouts already connected. Go to https://thecrwn.app/studio/automations, click New automation, choose Instagram, then Connect Instagram, and sign in with any Instagram professional account you control. Finish the wizard with a keyword (for example CRWNTEST), pick any paid tier as the offer, and click Activate automation. Then, from a different Instagram account, comment that keyword on one of the connected account's posts. Within a minute the post shows a public reply and the commenter receives one private message with a link to the artist's CRWN drop page.`

27. Tick the agreement boxes and click **Submit for review**. If Submit is blocked because
    Business Verification is not complete, leave everything saved and report exactly what the
    screen says.

## Known labels and the fix

- "Add to App Review" or "Request advanced access": adds to a draft. Click it, continue.
- A business picker appears anyway: go back and use the **Edit roles in Meta Business Suite**
  route in step 1 instead of the picker.
- A pop-up asks whether the app is for "your own business or clients": choose clients/other
  businesses (artists connect their own accounts).
- Meta asks to "complete data use checkup": complete it with the three permissions as "used".
- Setup wizard says "Not an artist? Continue as a supporter": never click it.
- Screencast upload rejects the file size: report the size; do not re-encode.

## Stop only if

- Any login, password, 2FA, SMS code, or "confirm it's you" screen appears (except the reviewer
  CRWN login, which you do with the clipboard).
- Stripe asks for identity or bank details, or Meta asks for an address, phone or EIN you do not
  have, or a domain code or email/phone verification is needed.
- Any screen asks for payment.
- The same step fails after two tries.

Do not stop for anything else.

## Never

- Never click Show on any app secret, and never copy any access token.
- Never click Remove on @thecrwnapp anywhere. It powers my scheduled posts.
- Never request any Facebook Page permission, and never add a permission not in the table.
- Never change the app between Development and Live, and never change an already-filled setting.
- Never open ManyChat, and never comment or message from @thecrwnapp.
- Never open or preview a legal document, never type a password, EIN, SSN or bank number
  yourself, and never put any of them or the reviewer password in the report.

## Report back in exactly this format

- Business Verification: submitted (status) / waiting on me for (what) / already verified
- Domain verification code for Claude: (meta tag or file name + content) / not needed
- Reviewer account: setup finished yes/no; Stripe: connected / under review (text) / failed (text)
- Screencast: file name, length in seconds / failed (why)
- App settings Basic: fields you filled (names only)
- App Review: submitted / saved, blocked by (exact screen text)
- Anything unexpected
