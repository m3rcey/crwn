# Prompt: get Claude a read-only Instagram token (computer use)

For an agent that can use my computer (GPT-6 Astra). Paste everything below the line into it.
Its job ends with a verified token saved locally. Claude then builds the read-only tool that uses it.

---

You are operating my Windows computer to finish one setup task: give my existing Meta app the
permissions it needs to READ my Instagram comments, DMs and stats, generate one access token,
save it to a local file, and prove it works. Do as much as you can yourself. Stop and hand
control to me only at the points listed under "Hand it back to me".

## What is already true (do not re-verify, do not change)

- My Instagram account is connected to a Meta app called **CRWN Publishing Engine** at
  developers.facebook.com. That app PUBLISHES my scheduled Instagram posts in production
  using its own token, which is stored in Vercel as `IG_ACCESS_TOKEN`. That token and the
  publishing it powers must keep working after you finish.
- The app uses "Instagram API with Instagram login" (host graph.instagram.com), not Facebook
  Login. No Facebook Page is involved.
- My code lives in WSL Ubuntu at `~/workspace-crwn`. Files named `.env*` there are already
  ignored by git.

## Never do any of these

- Never click **Remove** (or disconnect, reset, or revoke) on my Instagram account anywhere in
  the Meta dashboard or in Instagram's settings. That would break production publishing.
- Never untick a permission on Instagram's approval screen, and especially never untick content
  publishing (`instagram_business_content_publish`).
- Never touch Vercel, never change `IG_ACCESS_TOKEN`, and never edit `.env.local`.
- Never switch the app between Development and Live mode, never submit anything for App Review,
  never start Business Verification, and never change any other use case or product on the app.
- Never post, comment, like, reply, or send a DM on Instagram. Every API call you make is a GET.
- Never type, paste, or print the token into this chat, a screenshot description, a text box
  on a website, or a file other than `~/workspace-crwn/.env.instagram`. When you report,
  refer to it as "the token".
- Never enter my passwords or 2FA codes yourself. Hand those to me.

## Steps

**1. Open the app.** In the browser, go to developers.facebook.com, then My Apps, and open
**CRWN Publishing Engine**. If I am not logged in, hand it back to me.

**2. Add the read permissions.** In the left menu open **Use cases**, open the Instagram use case
(named something like "Manage messaging & content on Instagram"), then **Customize** and the
**Permissions** list. Make sure all five of these are present. Click **Add** next to any
that are missing and change nothing else:
- instagram_business_basic
- instagram_business_content_publish (should already be there; leave it alone)
- instagram_business_manage_comments
- instagram_business_manage_messages
- instagram_business_manage_insights

If one of the three read permissions is not offered at all, or adding it requires review,
verification, or a mode change, stop and report exactly what the screen says.

**3. Allow message access on the Instagram side.** The messages API returns nothing unless the
account allows it. On instagram.com (logged in as me), or in Instagram's settings, find
Messages and story replies, then Message controls, then **Connected tools**, and turn on
**Allow access to messages**. If you cannot find it, say where you looked and continue. Step
7 will show whether it matters.

**4. Generate the token.** Back in the use case, open **API setup with Instagram login**, then
**Generate access tokens**. My account should already be listed. Click **Generate token** next
to it (NOT Remove). An Instagram login and approval window opens. If it asks for my password or a
code, hand it back to me. On the approval screen, leave every permission ticked and approve.
When the token appears, click its **Copy** button. Do not read the token out or type it.

**5. Save it without showing it.** Open the Ubuntu terminal (Start menu, then "Ubuntu", or the
Ubuntu tab in Windows Terminal). Run this line, then paste the token when the cursor waits
(nothing will show; that is intended) and press Enter:

    cd ~/workspace-crwn && read -rs IGT && printf 'IG_READ_TOKEN=%s\n' "$IGT" > .env.instagram && chmod 600 .env.instagram && unset IGT && echo saved

Then clear the Windows clipboard so the token does not linger:

    printf '' | clip.exe

**6. Load it for the checks** (same terminal):

    T=$(grep '^IG_READ_TOKEN=' .env.instagram | cut -d= -f2-) && H=https://graph.instagram.com/v26.0 && echo ${#T}

It should print a number well above 100 (the token's length). If it prints 0, redo step 5.

**7. Prove each permission with a read-only call.** Run each line and note the result. Only ids,
counts and timestamps are requested, so no message text is shown.

a. Identity (basic):

    curl -s "$H/me?fields=user_id,username,account_type&access_token=$T"

Pass: my username appears and account_type is BUSINESS or MEDIA_CREATOR.

b. Recent posts (basic):

    curl -s "$H/me/media?fields=id,timestamp,comments_count&limit=5&access_token=$T"

Pass: a list of posts. Note the id of one post whose comments_count is above 0.

c. Comments (manage_comments). Replace MEDIA_ID with that id:

    curl -s "$H/MEDIA_ID/comments?fields=id,timestamp&limit=3&access_token=$T"

Pass: a `data` list (it may be empty only if that post truly has no comments).

d. DMs (manage_messages):

    curl -s "$H/me/conversations?platform=instagram&fields=id,updated_time&limit=3&access_token=$T"

Pass: a `data` list of conversation ids.

e. Stats (manage_insights):

    curl -s "$H/me/insights?metric=reach&period=day&access_token=$T"

Pass: a `data` list with values. If Meta answers that the metric or period is invalid but does
NOT mention permissions, also try:

    curl -s "$H/me/insights?metric=reach,accounts_engaged&period=day&metric_type=total_value&access_token=$T"

For any failure, record the error `code`, `type` and `message`. If a message quotes a URL, delete
the access_token part before you write it down. Common meanings: code 190 means the token is bad
(redo steps 4 and 5). Code 10 or 200 names a missing permission (redo step 2, then 4 and 5).
A messaging error that mentions access or connected tools means step 3.

Retry the steps above at most once per failure. Do not experiment beyond them.

**8. Close the terminal** so `$T` is gone from memory.

## Hand it back to me when

- Any login, password, 2FA code, or "confirm it's you" screen appears.
- Any screen asks for App Review, Business Verification, a mode change, payment, or removing
  or reconnecting my account.
- A permission in step 2 is missing or locked.
- Anything would contradict the "Never do" list.

When you hand it back, say exactly what is on screen and what you need me to do. Then wait.

## Report back in this format

- Permissions now on the app: list all five, each marked present or missing.
- Allow access to messages: turned on / was already on / could not find (and where you looked).
- Token saved to `~/workspace-crwn/.env.instagram`: yes or no, and the length printed in step 6.
- Checks a to e: PASS or FAIL each. For a FAIL, give the code, type and message (token removed).
- Anything you saw that surprised you, especially any warning about the existing publishing token.

Do not include the token, and do not include any comment or message text, in the report.
