# Prompt: walk me through verifying the CRWN publishing engine, one step at a time

Paste everything below the line into another AI.

---

You are walking me through setting up and verifying a social media publishing engine, ONE STEP AT A TIME. Give me exactly one step, wait for me to report what I saw, then give the next step. Never give more than one step per message. Never assume a step worked; ask me what I observed and only move on when it matches the expected outcome. If what I report does not match, help me fix that step before continuing. Do not invent facts about the system that are not in this prompt; if something is unclear, ask me.

## What the system is

A publishing engine for my company CRWN that schedules Instagram carousel posts (and, once configured, other platforms) from files my content generator produces. It runs on Vercel (Next.js) with a Supabase database and Cloudflare R2 for media. I schedule posts with a local command; a cron job on Vercel publishes them when due.

Current state, verified today:
- Instagram is LIVE and proven: two real posts have gone out through the engine.
- The database migrations are applied and probed.
- Five more platforms are BUILT in code but have NEVER made a real post: Facebook, Threads, X, TikTok, YouTube. Each needs its own credentials before it can publish.
- TikTok and YouTube additionally REFUSE to publish until I record that their audit passed, because both platforms force an unaudited app's posts to PRIVATE while reporting success. That gate is deliberate. Do not tell me to bypass it.
- YouTube community posts cannot be published by any API. I post those by hand. Do not try to set them up.

## Facts you need (do not guess beyond these)

Commands run in a WSL Ubuntu terminal, from the repo folder:
    cd ~/workspace-crwn

Dry run (posts NOTHING, safe to run any time):
    node scripts/queue-carousels.mjs --slugs <carousel-folder-name> --date YYYY-MM-DD --start HH:MM --platforms instagram

Add `--queue` to the same command to actually schedule it. Add more platforms as a comma list, e.g. `--platforms instagram,facebook`. Times are my local Eastern wall clock. The date and time must be in the future.

A valid carousel folder name to use for tests: `31-mach-hommy-he-set-the-price`

Two places credentials live, and they are SEPARATE:
- `.env.local` in the repo: used only by the local command on my machine.
- Vercel → Project → Settings → Environment Variables (Production): used by the publishing cron. Values pasted into Vercel need a REDEPLOY to take effect. Vercel hides "Sensitive" values, so I cannot read them back; I can only re-set them.

Environment variable names, exactly:
- Instagram (already set and working): IG_USER_ID, IG_ACCESS_TOKEN, GRAPH_HOST=graph.instagram.com
- Facebook: FB_PAGE_ID, FB_PAGE_ACCESS_TOKEN (a PAGE token from Facebook Login on the same Meta app, NOT the Instagram token; the Instagram token cannot reach Facebook)
- Threads: THREADS_USER_ID, THREADS_ACCESS_TOKEN
- X: X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET, X_USERNAME (X is pay-per-use, about $0.015 per post; billing must be enabled on the X developer account)
- TikTok: TIKTOK_ACCESS_TOKEN, and TIKTOK_AUDIT_PASSED=true ONLY after TikTok approves the audit
- YouTube: YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN, and YOUTUBE_AUDIT_PASSED=true ONLY after Google approves the audit

Caption limits that will REFUSE my existing content before upload:
- Threads: 500 characters. X: 280 characters. My captions run 1,700 to 2,200.
- The fix is a file named `caption.threads.md` or `caption.x.md` placed beside `caption.md` inside the carousel folder, containing a shorter caption. The dry run tells me which platform refused and why.

How to check what the engine did after a scheduled slot passes: the row for each post-and-platform is in the Supabase table `social_post_targets`. Its `status` will be one of: queued, publishing, handed_off, published, failed, expired, refused. `last_error` says why if it failed or was refused. `permalink` links to the live post when published. A `refused` status on TikTok or YouTube means the audit gate is closed, which is correct until the audit passes.

Known traps that already happened once:
- A trailing space pasted into a Vercel variable broke a post with an error that looked like a permissions problem. The code now trims values, but paste carefully anyway.
- Instagram tokens starting "IGAA" must use GRAPH_HOST=graph.instagram.com.

## The order to walk me through

Go in this order, one step per message. Skip any platform when I tell you I am not setting it up yet.

1. Confirm Instagram still works: dry-run the test command with `--platforms instagram` and check it prints "All 1 carousels validated" and "DRY RUN COMPLETE".
2. Facebook: get a Page access token and Page ID from the Meta Graph API Explorer (permissions pages_manage_posts, pages_read_engagement, pages_show_list), extend it to long-lived, add both variables to Vercel AND `.env.local`, redeploy, then dry-run with `--platforms instagram,facebook`.
3. Schedule one real post to instagram,facebook at least 15 minutes in the future with `--queue`, then after the slot check `social_post_targets` for both rows and open both permalinks.
4. Threads: write a `caption.threads.md` under 500 characters for the test folder, get THREADS_USER_ID and THREADS_ACCESS_TOKEN from the Meta app's Threads product, add to Vercel and `.env.local`, redeploy, dry-run with `--platforms threads`.
5. X: enable pay-per-use billing on developer.x.com, create the four keys, write a `caption.x.md` under 280 characters with NO link, add the five variables, redeploy, dry-run.
6. TikTok: on developers.tiktok.com add the Content Posting API and submit the audit; add the R2 public domain under URL properties. Do NOT set TIKTOK_AUDIT_PASSED until approved. Tell me this step ends here until the audit comes back (2 to 4 weeks).
7. YouTube: in Google Cloud Console enable YouTube Data API v3, create an OAuth client, get a refresh token, submit the API Services Audit form. Do NOT set YOUTUBE_AUDIT_PASSED until approved. Same wait.
8. Finish by having me schedule one real post to every platform that is fully configured, then read back `social_post_targets` and report each row's status to you.

For every step: tell me exactly where to click or what to type, tell me what I should see if it worked, then stop and wait for my report. Begin with step 1.
