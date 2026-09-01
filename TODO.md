# TODO — Josh

Two lists. **Do Now** is one-shot work. **Ongoing** is never done.

A third list at the bottom, **On Claude's plate**, exists so you know what you are *not*
responsible for. Do not work those.

> **Done means DELETED.** Not ticked, not struck through, gone. Git remembers what was done and
> when; this file is only for what is still true. A list you have to read past is a list you
> stop reading.
>
> **Priority is not vibes.** P0 uses the definition from CLAUDE.md: *blocks artist acquisition
> or breaks money flows.* Everything else is P1 or P2.
>
> **Claude maintains this file.** Any time it creates work only you can do (a migration, an
> env var, a pricing call, a legal call), it must add it here in the same commit. If you find
> a founder-blocking task that is not in this file, that is a Claude bug, and say so.

---

## Do Now

### P0 — money flows or acquisition are blocked

- [ ] **Renew the ManyChat subscription. Every DM keyword is dead until you do, and posts are
      still going out promising a DM.** Confirmed 2026-08-26 by a real lead: @iamisaiahlee (7.2K
      followers) commented OWN on the Open Mike Eagle carousel, got the opener, tapped Show Me,
      and ManyChat answered with a bare "Automation powered by @Manychat" and nothing else. That
      stub with an empty body is what a lapsed plan sends. Your own OWN test then returned nothing
      at all, which rules out that one lead being unlucky.
      Nothing is wrong in CRWN: the webhook, the engine and the calculators are untouched, and the
      same flow ran end to end the night before.
      **This is the acquisition funnel, so it outranks everything else in this file.** Scheduled
      posts keep publishing on their own and every one of them ends with "comment OWN and I'll DM
      you the link", so each hour it stays lapsed spends real reach on a promise CRWN cannot keep.
      Either renew, or tell me and I will pause the queue until it is back.

- [ ] **To finish Team Splits I need a test-mode sandbox. This is the only thing left, and it is
      environment setup, not code.** Nothing to run in SQL.
      I checked rather than assumed: your Stripe key really is live (I asked Stripe, and the balance
      came back `livemode: true` on acct_1BO7MsEG40iT0MPS), there is no test key anywhere, there is
      no `STRIPE_WEBHOOK_SECRET` in .env.local at all, and the Supabase project is production. So the
      only canary I could run today would move real money through a real artist's Connect account.
      I did not create a single Stripe object.
      What I need, in one place that is NOT production:
        1. A Stripe **test-mode** secret key and publishable key (same Stripe account, just the test
           side). Put them in the sandbox environment the normal way; do not paste them to me.
        2. A `STRIPE_WEBHOOK_SECRET` for that environment. `stripe listen --forward-to
           localhost:3000/api/stripe/webhook` prints one.
        3. A Supabase project that is NOT ecpqtuidtsncjfwtkvwc. A free one is fine. I will replay the
           schema files from the repo into it.
      Why both, not just the Stripe key: the webhook refuses test events if EITHER the key is live OR
      the database is production. That guard is right and I am not touching it.
      Once those three exist I do the rest myself: create the test Express account, build the canary
      artist/fan/collaborator, and run all ten steps (first subscription charge, renewal, one-time
      purchase, two payments racing a cap, a payment that never settles, a partial refund, a refund
      replay, the artist surplus return, a dispute, and a collaborator cashout), then reconcile every
      cent and decide whether payouts turn on. **They stay off until that passes.**

- [ ] **Before carousel post #1: verify the six keyword flows in ManyChat and tag them at
      campaign level.** The repo side is done and tested: every batch keyword resolves to the
      right calculator (VAULT, OWN, DEMAND, TOUR, ROYALTY, LIVE, plus STACK and FREE/PLAN if
      used), no keyword maps to two tools, and the narrow-result-to-flagship bridge is live on
      every eligible calculator. What only you can check, in the ManyChat UI:
      1. Each keyword the batch uses has a LIVE, PUBLISHED flow, and (for engine flows) the
         External Request body's `lead_magnet_id` matches the keyword's tool:
         vault → vault-revenue-planner, own → own-your-fans-calculator,
         demand → proof-of-demand-test-builder, tour → between-tour-calculator,
         royalty → royalty-readiness-check, live → live-experience-calculator.
         A half-edited clone (keyword changed, id not) silently runs the wrong tool; the
         Vercel warning "[acquisition] session_start keyword ... maps to ..." is the tell.
      2. Tag each flow at CAMPAIGN level per Procedure A in
         [docs/acquisition/campaign-tagging.md](docs/acquisition/campaign-tagging.md)
         (utm_campaign = the angle, e.g. vault). Do NOT put one video's utm_content on a
         shared any-post flow; video stays honestly unknown for this batch (your call,
         2026-08-24: campaign-level attribution is sufficient).
      3. After tagging each flow, comment the keyword from a test account, run the DM to the
         result, and confirm the row appears in /admin → Lead Magnets → Content scorecard,
         grouped by Campaign. Until that row appears, the flow is not tagged.

### P1 — real risk or real friction, but nothing is on fire

- [ ] **Host the four VSL MP4s and paste four URLs. Nothing else turns the videos on.**
      The emails, the poster images, the watch page and the placements are all shipped and inert.
      Each video is dark until its `url` stops being null in
      [`src/lib/vsl/catalog.ts`](src/lib/vsl/catalog.ts). Do them one at a time as each cut is
      finished; a video with a null url renders nothing in the email and 404s on /watch, so a
      half-finished series is safe to leave sitting there.
      1. Upload the MP4 (R2 is already wired, same bucket pattern as audio) or drop it anywhere
         that serves a direct file URL over https.
      2. In that file set `url` for the slug, and set `minutes` to the real runtime so the email
         and the rail stop saying just "Watch".
      3. Slugs, in series order: `vsl-1-fan-worth`, `vsl-2-what-fans-pay-for`,
         `vsl-3-first-100-fans`, `vsl-4-if-nobody-buys`.
      Verify after: open https://thecrwn.app/watch/vsl-1-fan-worth and confirm it plays and the
      rail lists only the videos that are actually live.

- [ ] **Decide where the Calculator VSL sits on the calculator pages.**
      You said it plays after the result and the CTAs. That order is machine-pinned and
      mutation-tested in `src/lib/leadMagnets/pageComposition.test.ts` (result + email ask inside
      the hero, then LadderSection, then the builder, then CallRequestCard), so the video needs a
      decided slot in that sequence or the suite fails. Tell Claude which slot and it ships.

- [ ] **Run one SQL file to comp Executive Producer Sessions and DMs to GB while he stays on
      Launch.** Open and run:
      [`supabase/schema-phase2-artist-plan-overrides.sql`](supabase/schema-phase2-artist-plan-overrides.sql)
      One nullable jsonb column on artist_profiles, plus the override for slug `gb` ONLY
      (it fails loudly if that slug is missing). Nobody else is comped, and the column is
      server-only so no browser can read or appear to set its own capabilities.
      Why it is needed: GB's Gold rung promises Executive Producer Sessions and his Platinum
      rung promises direct interaction / Q&A. Both are live/DM features that Launch refuses
      server-side, so without this he would be selling a tier benefit CRWN declines to
      deliver. The override is ADDITIVE ONLY by construction (`applyPlanOverrides` ignores
      `false`), so it can grant a capability and can never quietly revoke one from an artist
      who is paying for a plan that includes it.
      Expected on success: one result row reading `plan overrides applied`, comped_artists = 1,
      comped_slug = gb.
      Verify after with: npm run verify:migrations (look for the "artist plan overrides" line)
      Until it runs, nothing breaks: a missing column reads as "no override" and GB simply
      stays on plain Launch limits.

- [ ] **Create GB's Platinum tier at $50/month.** No SQL and no code: he adds it himself in
      /account/tiers, or you do it from his account. His live ladder today is Economy (free),
      Silver $10, Gold $25, so Platinum is the missing fourth rung. Three paid tiers is the
      cap on EVERY plan, so this fits with nothing to spare and needs no upgrade.
      Note the price is deliberately HIS: CRWN's recommended ladder uses $100 for Platinum
      and `tierTemplate.test.ts` pins that default, so set $50 explicitly rather than
      applying the template. Renaming Economy to Bronze is optional and costs nothing.


- [ ] **Fan Automations (artists' own comment-to-DM funnels) is BUILT and DARK. Two founder
      steps turn it on; until then artists keep renting this exact outcome from ManyChat.**
      Shipped 2026-08-29: an artist connects their own Instagram or Facebook Page, a fan's
      comment gets the one private reply Meta permits with a link to the artist's drop page,
      the email there delivers the lead magnet, joins the fan to the free tier, then offers
      Gold with a Silver downsell through the normal checkout. Full architecture:
      [docs/crwn-brain/31-FAN-AUTOMATIONS.md](docs/crwn-brain/31-FAN-AUTOMATIONS.md).
      **Step 1, five minutes: run
      [supabase/schema-phase3-fan-automations.sql](supabase/schema-phase3-fan-automations.sql)
      in the SQL Editor** (four closed tables; the proof-of-commit grid prints at the end),
      then run `npm run verify:migrations` or ask me to.
      **Step 2, the Meta app setup (your accounts, so only you can):**
      1. developers.facebook.com → your app (or a new Business-type app). Add the products
         **Instagram** (API setup with Instagram Login) and **Facebook Login for Business**
         plus **Webhooks**.
      2. Instagram → API setup with Instagram Login → add redirect URI
         `https://thecrwn.app/api/social-connect/callback/instagram`. Facebook Login →
         Settings → Valid OAuth Redirect URIs → add
         `https://thecrwn.app/api/social-connect/callback/facebook`.
      3. Webhooks: callback URL `https://thecrwn.app/api/webhooks/meta`, verify token = the
         value you set as `META_WEBHOOK_VERIFY_TOKEN` below, subscribe the **Instagram** object
         to the `comments` field and the **Page** object to the `feed` field. The app must be
         set **Live** for deliveries.
      4. In Vercel (Production), set these six and redeploy (values only you have; generate
         `SOCIAL_TOKEN_ENC_KEY` with:  openssl rand -base64 32 ):
           IG_APP_ID
           IG_APP_SECRET
           FB_APP_ID
           FB_APP_SECRET
           META_WEBHOOK_VERIFY_TOKEN
           SOCIAL_TOKEN_ENC_KEY
      5. Test dark with YOUR account first: give your own Instagram professional account an
         app role (App roles → add yourself), then connect it from /studio/automations and run
         one automation end to end. **Standard Access covers app-role accounts with no review**,
         so this whole test needs nothing from Meta.
      6. For real artists you need **Advanced Access via App Review + Business Verification**
         on: instagram_business_basic, instagram_business_manage_comments,
         instagram_business_manage_messages (and for Facebook Pages: pages_show_list,
         pages_read_engagement, pages_manage_engagement, pages_manage_metadata,
         pages_messaging). The review wants a screencast of the flow; the dark test in step 5
         is exactly that footage. Weeks, not days, so start it when you want artists on it.
      Until both steps land the feature is honestly dark: the artist screen says connections
      are not available, and nothing else in CRWN changes.

- [ ] **Watch the first machine-made silent video and say keep or fix.** The video pipeline is
      live: script → storyboard → your sharpie-style images → automated motion cut to your own
      instrumentals → finished 9:16 MP4, roughly $2 of API per video, no editing app involved.
      The first one is the Ryan Leslie script, rendered at
      videos/output/34-ryan-leslie-forty-thousand-numbers/render/final.mp4 (open it from
      Explorer via \\wsl.localhost\Ubuntu). Three verdicts you can give me: approve it, fix ONE
      scene ("regen scene 4"), or change the sound ("rerender with Makavhan"). Each of those is
      one command I run; nothing sends or posts anything on its own. How it works and every
      command: [docs/VIDEO_PIPELINE.md](docs/VIDEO_PIPELINE.md).

- [ ] **Run ONE ManyChat flow end to end. Every DM tool now asks a second question, and only a
      live run proves your flows loop.** No ManyChat edit should be needed: the Condition's
      if-not branch already loops back to the question node, which is the same path Royalty
      Readiness has always used. But three of these flows were cloned by hand, and a clone that
      lost that connection will now stall after question one instead of delivering the result.
      Openers were rewritten 2026-08-26, so this is now only about the WIRING.
      DM the `FREE` keyword from a test account and confirm you see, in order:
        1. The opener, naming no number of questions.
        2. "Roughly how many followers do you have across your socials?"
        3. "Last one: have your fans ever paid you directly? ..." (this is the new one)
        4. The topline plus the `See My Numbers` button.
      If it stops after step 1, that flow's Condition no-branch is not wired back to the
      question node. Fix it in ManyChat; there is nothing to change in the code.
      Why the second question exists: without it every DM lead scored as `monetization_unknown`,
      which caps the ICP fit at 60 and made `sales_priority` unreachable. That is the band that
      emails you a hot lead, and the band a "call me" request has to clear. It has never fired
      for an Instagram lead.
      Full note: [docs/acquisition/manychat-setup-guide.md](docs/acquisition/manychat-setup-guide.md) §12.


- [ ] **The full metrics wipe, in order (three files, run 1 and 2 now):**
      1. Run [supabase/wipe-analytics-keep-real-money.sql](supabase/wipe-analytics-keep-real-money.sql)
         in the SQL Editor. One transaction. It deletes the ENTIRE demo seed (the 20 fake fans,
         the $2,408 fake earnings, demo subscriptions), every behavioral analytics row (lead
         magnet events, funnel events, site visits, artist page visits, opportunity ledger,
         your lead and all results), and recomputes public play counts from what survives.
         It keeps real Stripe money and the analytics rows of real paying fans (your GB
         purchase and m3rcey's one real subscriber). Every table is copied to a
         wipe_backup_20260825_* table first, so nothing is unrecoverable.
      2. Run [supabase/schema-phase2-founder-test-exclusion.sql](supabase/schema-phase2-founder-test-exclusion.sql).
         The Acquisition Funnel and 90-day scorecard count ACCOUNTS, so they need your test
         accounts flagged, not deleted. It flags m3rcey and the '<their-real-slug>' placeholder
         account; edit the slug list in the file first if any other account (lago/lagoo?) is
         also you. Real artists (gb, julius-williams, lakes...) stay counted on purpose.
      3. Later, once the dashboards look right, run
         [supabase/drop-wipe-backups.sql](supabase/drop-wipe-backups.sql) to delete the safety
         copies.
      Future traffic: your logged-in admin session stamps the never-count cookie automatically;
      open the app once on your PC and once on your phone. A brand-new device or network can
      also visit /admin/forget-device to erase any residue it created before the cookie landed.

- [ ] **Build the page universe with the new Discover Big Pages tool (no SQL, no env var).**
      Your Brent Faiyaz test proved the point: global discovery returned accounts with 1K down
      to double-digit followers, while the index (2 pages) correctly surfaced @purestrap at
      1.2M. The bottleneck was never the finder; it was that the index only had 2 pages, and
      artist bootstrap cannot fill it because it rides the same weak global search. The fix is
      live: /admin, Distribution tab, Big Page Index panel, **Discover Big Pages**. Keep the tab
      open while each step runs.
      1. Press **Discover Pages** with the default topics (edit them freely; one per line).
         Cost is tiny: 7 searches, up to 175 candidates, under a dollar.
      2. Review the candidate table (all 50K+, public, not yet indexed, ranked by reach +
         corroboration). Untick anything you would not want distributing CRWN content, then
         press **Add Selected & Refresh Posts**. That both indexes them and caches their
         recent posts in one go.
      3. Optional: put @purestrap and @plugcaptions (and any other strong pages) into
         **Expand From Indexed Pages** and repeat the review. Each expansion is one seed lookup
         plus at most 100 enrichments, well under a dollar.
      4. Repeat discovery with more specific topics whenever you like (rap news, soul music,
         r&b singers, producers, etc.). The operating target is 250 to 500 meaningful pages;
         the panel tells you where you are.
      5. Then search Brent Faiyaz and Ryan Leslie (90 days, 50,000 minimum). The standard: would
         you genuinely send the carousel to the top rows because they have BOTH meaningful reach
         AND recent posts about that artist?

- [ ] **Start the TikTok and YouTube audits NOW. They are the long pole: 2 to 4 weeks of
      calendar time, and no code can shorten them.** Both adapters are built, tested and refuse
      to run until you record the audit as passed, because BOTH platforms force an unaudited
      client's posts to PRIVATE while reporting success. Publishing early would fill the queue
      with "published" rows nobody can see.
      TikTok: developers.tiktok.com, add the Content Posting API to your app, then request the
      audit under App review. Also add the R2 public domain under URL properties, or every pull
      fails with url_ownership_unverified. Note TikTok caps roughly 15 to 25 posts per account
      per day even once audited, shared across every API client.
      YouTube: console.cloud.google.com, enable YouTube Data API v3, create an OAuth client,
      then submit the API Services Audit and Quota Extension form.
      When each is APPROVED (not submitted), set in Vercel and redeploy:
        TIKTOK_AUDIT_PASSED=true
        YOUTUBE_AUDIT_PASSED=true
      Anything other than exactly true keeps the gate closed on purpose.

- [ ] **Add the credentials for each platform you want live, in Vercel, then redeploy.** Every
      value gets trimmed now, so a stray space cannot repeat the IG_USER_ID failure. Each adapter
      refuses cleanly and names the variable when one is missing, so add them as you go.
      Facebook (free, no review, shares your Meta app; needs a PAGE token, not a user token):
        FB_PAGE_ID
        FB_PAGE_ACCESS_TOKEN
      Threads (free, no review in dev mode, same as Instagram; note the 500-character cap means
      each carousel needs a short caption.threads.md beside caption.md, or the ingest refuses it):
        THREADS_USER_ID
        THREADS_ACCESS_TOKEN
      X (pay-per-use, about $0.015 a post and $0.20 if the caption has a link, so keep them
      link-free; needs billing enabled on the X developer account; Articles also need X Premium):
        X_API_KEY
        X_API_SECRET
        X_ACCESS_TOKEN
        X_ACCESS_SECRET
        X_USERNAME          (only used to build the permalink)
      TikTok (after audit):
        TIKTOK_ACCESS_TOKEN
      YouTube (after audit):
        YOUTUBE_CLIENT_ID
        YOUTUBE_CLIENT_SECRET
        YOUTUBE_REFRESH_TOKEN

- [ ] **Refresh IG_ACCESS_TOKEN before it expires around 2026-10-25.** Instagram long-lived
      tokens last about 60 days, and yours was issued 2026-08-26. When it dies, publishing stops
      and the only symptom is an auth error, so this is a diary item rather than something you
      will notice going wrong. Regenerate in the Meta app dashboard, exchange for a long-lived
      token, and replace the `IG_ACCESS_TOKEN=` line in `.env.local`. Nothing else changes.
      Check any time with a dry run, which posts nothing:
        node scripts/test-instagram-carousel-publish.mjs "/mnt/c/Users/Josh/Dropbox/nano banana output/Carousel Posts/Fan Economy/31-mach-hommy-he-set-the-price"
      It prints the account and the publishing quota if the token is alive.

- [ ] **ASK GB (and Julius) whether they want the "Day One A&R" badge at all, and under that
      name.** Nothing is broken; this is a naming and product call only CRWN's artists can make.
      CRWN chose that name, not them, and it appears in their account as if they wrote it, which
      is how you noticed it (it read like a tier next to "Economy"). Two honest problems with it:
      it fires on a fan's FIRST vote forever, so someone arriving in month six earns the same
      "Day One" as someone who was there at the start; and neither artist asked for a badge.
      As of 2026-08-21 it no longer notifies the artist (fans still get theirs), so it is quiet
      either way and there is no rush. Three options: keep as is, rename to their words, or drop
      it entirely and let the Lab's participation count be the recognition. Tell me which and it
      is a small change: the label lives in `fan_badges` plus the award call in
      [`src/lib/songLab/server.ts`](src/lib/songLab/server.ts).

- [ ] **Julius's Sept 26 night is configured. Two shows, one QR, and it runs itself.**
      (The email problem is fixed in the app, so there is **no Supabase setting to change**.
      An attendee taps CAST MY VOTE and the vote is counted immediately; the email that
      follows is the key to their free account, not a condition of the vote. Verified in
      production: a brand-new address voted, never opened the inbox, and the vote showed up
      in Results.)
      Live now: `thecrwn.app/julius-williams/join/st-james-live-sept-26-song-vote`.
      Show 1 is open and closes itself at **8:00 PM Eastern on Sept 26**; Show 2 opens at
      that moment and closes at **11:00 PM Eastern**. Both currently carry the same two
      songs ("I Like" and "Outstanding"); change either set independently in **/studio/lab**.
      The QR does NOT change between shows.
      1. Lead magnets tab: press the **QR button** and print the sheet (QR, camera
         instructions, and the typed-out address for people who will not scan).
      2. Projects tab: each show has its own line and says in plain words what it is doing
         ("Open now, closes 8:00 PM on its own"). If the set runs late, press **Extend**
         (+15/30/60 from now). If it runs early, **Open now**. To stop a vote at once,
         **Close now**. A closed vote reopens only through Reschedule, deliberately.
      3. After the night: **Results** tab shows each show separately with its own vote
         counts and percentages. They are never added together.
      One caution to pass on: reward content must be rights-cleared. Recordings of him
      covering Luther/Stevie/etc. need licenses CRWN cannot assume, so until he confirms
      rights, point the reward at his page (his original track "Magic" is already free there).

- [ ] **P1: Register the DMCA agent with the US Copyright Office, or the safe harbor does not
      exist.** The /dmca page and dmca@thecrwn.app are necessary but NOT sufficient: DMCA
      512(c) safe harbor requires the designated agent to be registered in the Copyright
      Office's online directory (dmca.copyright.gov, $6, renew every 3 years). Without it,
      hosting user-uploaded music has no takedown shield. Ten minutes, one form, entity
      JNW Creative Enterprises, Inc., agent email dmca@thecrwn.app.

- [ ] **P2: Read the new Partner Program Terms before recruiting anyone you don't know.**
      /partner and /recruit publicly promise cash and now link /partner-terms (qualifying
      rules, FTC disclosure duty for partner content, fraud, taxes, termination). It states
      rules, never rates: rates stay on the partner page so there is one source. If any rule
      there doesn't match what you intend to pay, tell Claude before the first stranger joins.

- [ ] **P2: Before the FIRST standard-price First Revenue Launch sale ($1,500+), the offer
      needs written service terms.** The homepage guarantee is live copy; the paid service
      behind it has no contract defining "qualified", the "required actions", or the remedy
      (rebuild + relaunch, not a refund). Beta deals traded for case-study rights need that
      in writing too. Say the word and Claude drafts it for your and a lawyer's review.

- [ ] **P2: Delete OPENAI_API_KEY from Vercel.** Nothing reads it since the synthetic sync
      generator was deleted (verified by scan and now enforced by a test). A live key nothing
      uses is pure attack surface.

- [ ] **A2P 10DLC campaign form: the legal pages are ready, here is exactly what to paste.**
      Both URLs are live and now carry every disclosure Twilio vets for. Paste them verbatim:
        Privacy Policy URL:        https://thecrwn.app/privacy
        Terms & Conditions URL:    https://thecrwn.app/terms
      The campaign description and sample messages must MATCH what those pages say, or the
      reviewer rejects it as conflicting information. Describe it as:
      *JNW Creative Enterprises, Inc., operating the CRWN platform (thecrwn.app), sends
      internal operational alerts to its own authorized personnel. When an artist requests a
      call through a CRWN calculator and qualifies, an alert with the lead's details and
      callback number is sent to an authorized representative so they can return the call.
      No messages are sent to artists, fans, prospects or customers.*
      For opt-in, point Twilio at the LIVE PAGE (this replaces the paper-form answer that
      was rejected):
        https://thecrwn.app/sms-alert-consent
      The exact wording to paste into "How do end-users consent to receive messages?" is
      in the item below. Your own consent is already recorded (2026-08-25), so a reviewer
      opening that page sees a working form backed by a real record.

- [ ] **P0: Paste this into Twilio's "How do end-users consent to receive messages?" field.**
      Copy it verbatim; it matches the live page, the privacy policy and the terms, and a
      mismatch between them is the rejection reason:
        Authorized personnel of JNW Creative Enterprises, Inc. opt in at
        https://thecrwn.app/sms-alert-consent, a publicly accessible web form. The person enters
        their mobile number and actively checks an unchecked consent box reading: "I agree to
        receive low-volume internal CRWN operational lead alerts by SMS from JNW Creative
        Enterprises, Inc. at the mobile number I provide. Message frequency varies. Message and
        data rates may apply. Reply STOP to opt out or HELP for help." The page identifies the
        sender, describes the program, links the Privacy Policy and Terms, and states consent is
        not a condition of purchase. We store the number, the exact consent language, its
        version, the timestamp and the IP address. Recipients are our own authorized personnel
        only; no messages are sent to artists, fans, prospects or customers.
      If the form offers an opt-in METHOD choice, select the web/online form option. Twilio's own
      documented campaign form asks you to DESCRIBE the process rather than pick from a list, so
      the text above is the answer that matters.

- [ ] **The internal alert still goes out by EMAIL. Nothing texts yet.** Registering the
      campaign does not make CRWN send an SMS. `/api/lead-magnets/call-request` alerts you
      through Resend, plus the optional `FOUNDER_ALERT_SMS_EMAIL` carrier gateway. Once the
      campaign is approved and you want a real Twilio send, tell me and I will build it as
      one server-only sender. Do not add `TWILIO_*` sending vars expecting it to start
      working on its own: no code reads them for outbound.

- [ ] **JUBO: you added the number, now add THREE more Vercel vars or nothing will reply.**
      I probed production after deploying: the route is still answering silence, which means
      `SMS_KEYWORD_ENABLED` and/or `TWILIO_AUTH_TOKEN` are not set (an unsigned POST returns
      an empty reply; once both are set it returns 403 instead, and I can re-probe to
      confirm). `TWILIO_JUBO_PHONE_NUMBER` is now wired and is the only number JUBO answers
      on. `TWILIO_PHONE_NUMBER` is untouched and the code is test-pinned never to read it.
      In Vercel Production, add:
        SMS_KEYWORD_ENABLED=true
        SMS_KEYWORDS=jubo:julius-williams
        TWILIO_AUTH_TOKEN=<the LIVE auth token, not the test one>
      The auth token matters: the one in .env.local is a TEST credential (Twilio error
      20008), and Twilio signs real webhooks with the LIVE token, so a test token means
      every inbound message is rejected as unsigned. Redeploy after adding them.
      Then, still in the Twilio Console for the JUBO number:
        1. Confirm "A message comes in" is Webhook, HTTP POST,
           `https://thecrwn.app/api/sms/inbound` (you said this is done).
        2. Turn ON **Advanced Opt-Out** so Twilio handles STOP/HELP. CRWN stays silent on
           those words deliberately.
        3. **A2P 10DLC registration** for the number (brand + campaign). Without it US
           carriers filter application-sent SMS, so replies can silently never arrive. Days,
           not minutes, plus small fees.
      **Do not print "Text JUBO" on a flyer until you have texted it yourself and got the
      link back.** The QR path is proven end to end and needs none of this.

- [ ] **Nothing to do here, just do not let anyone "fix" the middleware deprecation warning.**
      Next 16.3 prints `The "middleware" file convention is deprecated. Please use "proxy" instead.`
      on every build and suggests a codemod. **I tried it on 2026-08-24 and reverted it.** The
      rename builds GREEN, drops the warning, and still prints "Proxy (Middleware)" in the route
      summary, while compiling nothing at all: a clean build from `src/proxy.ts` produced an empty
      middleware manifest with no matcher and zero edge chunks, where the identical build from
      [src/middleware.ts](src/middleware.ts) produces both (1 entry, the api/-excluding matcher, 6
      edge chunks). Shipping it would have silently stopped every protected-page auth redirect and
      the email-verification (PKCE) exchange, with no error anywhere. Reasoning is recorded at the
      top of that file. Revisit on a later Next; the test is whether the BUILT MANIFEST still
      carries the matcher, never whether the build passes.

- [ ] **CSP: my recommendation is DO NOTHING, and here is why, so you can overrule it.**
      You asked what to do here. Short version: this is defence-in-depth against an attack surface
      you do not currently have, and doing it now risks breaking the site during a content launch.
      What is actually true in production today (checked, not assumed):
        - `Content-Security-Policy: frame-ancestors 'self'` is ENFORCED. Clickjacking is genuinely
          covered, by that plus `X-Frame-Options: SAMEORIGIN`.
        - `Content-Security-Policy-Report-Only` carries `script-src 'self' 'unsafe-inline'`, which
          means it blocks nothing and reports almost nothing. It is decorative.
        - The thing a real CSP would contain is XSS via injected HTML. **The app has ZERO uses of
          `dangerouslySetInnerHTML`** (all four matches in the repo are comments and a test that
          asserts it is never used). Every piece of fan and artist text renders through React,
          which escapes it. So the hole CSP would plug is not currently open.
      The cost of doing it: a per-request nonce minted in `src/middleware.ts`, which is the file
      that silently stopped compiling when it was renamed on 2026-08-24, plus roughly 20 minutes of
      YOUR time clicking through signup, a calculator, checkout, an artist page and /studio on a
      preview deploy with the browser console open, looking for `Refused to execute inline script`.
      If a page is missed, that page breaks in production for everyone.
      **Do it when one of these becomes true**, not before: you start rendering user-supplied HTML
      anywhere, you add a third-party script tag, or a partner security review asks for it.
      Nothing in the product claims CSP protects users, so there is no dishonest copy to fix.

- [ ] **Set HSTS `includeSubDomains` at the Vercel domain layer, not in code.** Production's
      `Strict-Transport-Security: max-age=63072000` comes from the Vercel edge, not from
      next.config.ts. Adding a second STS header from the app risks two competing values, and a
      browser processes only one, so a well-meant `includeSubDomains` could silently WEAKEN HSTS.
      It is also a two-year, hard-to-reverse commitment. A DNS probe of 18 likely subdomain names
      found only the apex resolving, so it looks safe, but that is a dictionary sample and not
      proof. Set it in the Vercel dashboard, then confirm exactly one STS header comes back:
        curl -sI https://thecrwn.app

- [ ] **Tag every calculator video link BEFORE you publish it.** An untagged link still works, it
      just lands under "unknown" forever and that video can never be compared to another one. No
      migration, nothing to deploy: build each link at /admin -> Lead Magnets -> **Campaign link
      builder**, then tag the matching ManyChat flow. **Two kinds of flow, tagged in different
      places:** a CRWN engine flow (has an Actions -> External Request node) takes the tag in the
      node-2 request BODY, not as a pasted URL, because the link it sends is `{{crwn_result_url}}`.
      A plain link flow takes the pasted URL in its button. Click-by-click: section 2b of
      [`docs/acquisition/campaign-tagging.md`](docs/acquisition/campaign-tagging.md). Read once:
      [`docs/acquisition/campaign-tagging.md`](docs/acquisition/campaign-tagging.md) (naming
      convention, allowed values, worked examples, and what CRWN can never see). Results land at
      /admin -> Lead Magnets -> **Content scorecard**.

- [ ] **Set up the Money Model tab** (its migration already ran; probe-verified). In
      /admin -> **Money Model**:
      1. Set your **founder hourly cost** (Cost assumptions box). No default exists on purpose;
         until you set it, labor cost and contribution margin read "missing", never zero.
      2. Create one engagement per launch partner (type the artist slug), enter the agreed fee,
         start date, and the allocated acquisition cost, and log your hours as you work.
      Recording the fee here does not charge anyone; the invoice stays manual in Stripe.

- [ ] **Launch content for the four avatar funnels. These are the exact links.** All four
      sub-avatars now point at the ALL-IN-ONE calculator, which leads with that avatar's
      questions and framing (spec: [`docs/SUB_AVATARS.md`](docs/SUB_AVATARS.md)). Paste these
      wherever that avatar's video, ad or bio link lives:
      - Empire builder (big audience, already sells direct)
        thecrwn.app/tools/opportunity-calculator?from=highest_priority_empire_builder
      - Established independent operator (years in, runs it themselves)
        thecrwn.app/tools/opportunity-calculator?from=established_independent_operator
      - Brand-led hip-hop artist (content engine, attention they do not own)
        thecrwn.app/tools/opportunity-calculator?from=brand_led_hip_hop_artist
      - R&B empire builder (devoted fans with nowhere to go deeper)
        thecrwn.app/tools/opportunity-calculator?from=rnb_empire_builder

      A typo in `?from=` is harmless: the calculator just asks in its normal order. Add
      `&utm_content=<video-label>` on each so the admin Avatars tab can compare creatives;
      both the avatar and first-touch UTMs now persist across the whole visit.

- [ ] **When you read the Avatars tab, read the genre rows, not just the cohort totals.**
      Nothing to do today; this is a one-time "how to not misread your own report". The
      qualification bar means every big seller lands in Highest Priority whatever their genre,
      so that cohort will always look richest: it is defined as your biggest artists. The
      comparison that actually tells you where to spend is the **"Who this funnel brought"** rows
      inside each cohort card (hip-hop vs R&B vs other, with the first-paid rate per genre), plus
      the genre filter at the top. And it only compares CONTENT if your links carry `?from=`;
      untagged traffic falls back to scoring, which compares artist size instead.

- [ ] **Run one real Fan Drive when your constraint says reach or first paid.** Nothing technical
      is outstanding: the migration is applied and production-verified. This is the product step.
      Open `/fan-campaigns`. If CRWN has diagnosed reach or first-paid you get a prefilled drive;
      if it has diagnosed an overdue promise or churn you get that priority instead and no drive,
      which is the gate working, not a bug. Send `thecrwn.app/<your slug>/campaign` to a handful of
      fans directly, not as a broadcast. **CRWN can only verify PAYING members brought in by a
      participant's link.** Free members are not attributable to anyone (the free join path records
      no referral), and the screen says so rather than showing you a zero. Until a drive closes,
      CRWN has no campaign outcome data at all, which is why this is worth doing once for real.

- [ ] **Decide what the public fan leaderboard is allowed to show.** Not urgent, and nothing is
      leaking now: the points total is no longer published, because it was exactly invertible
      back to a fan's lifetime spend given the referral, comment and like counts shipped beside
      it. The public list now shows rank, name, tier and those three counts, and it is still
      ORDERED by the full score (spend included) server-side. The open question is whether you
      want a visible number back, in which case the options are a bucketed score or a score with
      the spend term removed. Both change what the leaderboard means, so it is your call, not a
      bug fix. No migration.

- [ ] **Two one-click confirmations only you can do (both need a logged-in session), then tell me
      and I will delete this.**

      **1. Top up the DeepSeek balance. DIAGNOSED 2026-08-01: `HTTP 402 Insufficient Balance`.**
      The `DEEPSEEK_API_KEY` is valid and is reaching production. The account simply has no
      credit, which is the standard failure on a new DeepSeek key. There is nothing to fix in
      code.

      1. Log in at `platform.deepseek.com` with the account that owns the key.
      2. Billing (or "Top up"), add credit. Their minimum is a few dollars and the support
         assistant uses `deepseek-chat` with an 800-token cap per reply, so a small balance lasts
         a long time at CRWN's current volume.
      3. Send a message at `/support`. A real answer means it is working. As an admin you would
         see any remaining fault printed inline as `[admin only] ...`.

      Not urgent, because the chat is NOT dead: on any assistant fault it answers from the
      getting-started guides (no key, no balance, no network), and it still notifies you. You now
      get at most ONE "assistant is down" email per hour no matter how many people chat.

      **2. Stripe env wiring.** First just OPEN `/account/billing`. You are not actually on Pro:
      the row says `pro`/`active` but Stripe has no subscription behind it, and the SQL migration
      could not catch it because your `platform_stripe_subscription_id` is not null, it points at
      a subscription that no longer exists. The page now asks Stripe on load and corrects itself,
      so it should flip you to Launch and make Pro clickable.

      Then Pro → Upgrade. I verified the four live prices exist at the right amounts on the right
      products (CRWN Pro $49/$490, CRWN Scale $199/$1,990) and that ZERO artists sit on the old
      $9.99 price, so grandfathering is a closed question. What I cannot check is which price id
      each Vercel variable holds, because Sensitive vars are unreadable to me. If Stripe opens
      showing **$49.00 / month**, the wiring is right and I will delete this. If it errors, the
      wiring is wrong and the error is deliberate: checkout compares the live price to the code's
      $49 and refuses rather than charging the stale $9.99. Nothing can silently undercharge.

- [ ] **Wind down Twilio: the SMS feature is REMOVED from CRWN (your call, 2026-07-31, for
      compliance cost).** Code, routes, cron, tier copy, legal SMS program section: all gone.
      Hot-lead alerts now arrive by EMAIL always (plus the carrier-gateway text if
      `FOUNDER_ALERT_SMS_EMAIL` is set; that path is just email and needs no Twilio). In Twilio:
      release the number (+1 314 557 3549) and close or downgrade the account so it stops
      billing, and abandon the A2P campaign (no action needed, it just lapses). In Vercel you
      can delete `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`; nothing
      reads them anymore. KEEP `FOUNDER_ALERT_SMS_EMAIL` if you want hot-lead texts.
      The old `sms_*` tables keep their consent history; they are simply unused.

- [ ] **Optional, and much smaller than it used to sound: do you want the all-in-one calculator
      listed FIRST in the /tools directory?** The A/B test that used to block this was deleted on
      2026-08-24 (your call: content now sends a different calculator per carousel post, so there
      was no single stream of Own Your Fans traffic left to measure). Nothing blocks it now.
      What promoting it actually does, in full: it moves the all-in-one calculator to the top of
      the list at /tools and changes a label in the admin table. That is all. `promotion` and
      `promotionRank` are read by the directory sort and nothing else, so it does NOT change where
      any link, DM keyword or carousel CTA lands. Your funnels are unaffected either way.
      Say the word and I flip two lines in
      [`src/lib/opportunityFunnels/registry.ts`](src/lib/opportunityFunnels/registry.ts).

- [ ] **Point your video funnels at the all-in-one calculator (here is exactly where and how).**
      This is only about the LINKS you paste places, nothing inside CRWN or ManyChat flows
      changes. Wherever you currently paste a single tool's link (a video caption, your
      Instagram bio, a Linktree/link-in-bio button, a YouTube description), replace it with the
      matching line below. The calculator then opens leading with that video's topic before
      asking the rest:
      - Vault video → `thecrwn.app/tools/opportunity-calculator?from=vault-revenue-planner`
      - Streaming-pays-nothing video → `thecrwn.app/tools/opportunity-calculator?from=worth`
      - Share-to-Earn video → `thecrwn.app/tools/opportunity-calculator?from=share-to-earn-planner`
      - Clip-to-Earn video → `thecrwn.app/tools/opportunity-calculator?from=clip-to-earn-campaign-planner`
      - Own Your Fans video → `thecrwn.app/tools/opportunity-calculator?from=own-your-fans-calculator`
      - Producer session video → `thecrwn.app/tools/opportunity-calculator?from=executive-producer-session`
      - Live show video → `thecrwn.app/tools/opportunity-calculator?from=live-experience-calculator`
      A typo in `?from=` is harmless (the calculator just asks in its normal order). The old
      per-tool links keep working, so you can switch one video at a time. Do NOT touch the
      ManyChat keyword flows; those are separate and already live.

- [ ] **(Optional, low priority) Per-video attribution for "Highest Converting Video."** CONFIRMED
      2026-07-26: ManyChat's "any post or reel" comment trigger does NOT expose the triggering post id
      (the External Request field picker has no post/media field), so the catch-all flows CANNOT carry
      the video. CRWN accepts `source_post_id` (any string) and records it as the funnel's video
      dimension; without it, video just groups under "unknown" and the funnel still works by source /
      campaign / calculator. The ONLY way to get per-video data is a **per-post** automation (trigger on
      one specific post), where you hardcode a readable label in the External Request body, e.g.
      `,"source_post_id":"kendrick-producer-reel"` right before `,"contact":`. Not worth doing broadly
      (one automation per video, forever). Do it ONLY for a hero video you want to measure.

### P2 — worth doing, nothing breaks if you never do it

- [ ] **Build the two all-in-one ManyChat automations: FREE and PLAN.** Both route to the same
      tool (`opportunity-calculator`). Full step by step, including the exact one-line request
      bodies, is section 11 of
      [docs/acquisition/manychat-setup-guide.md](docs/acquisition/manychat-setup-guide.md).
      Short version: duplicate the **worth** automation twice, re-create BOTH triggers on each
      copy (they do not survive duplication) with whole-word matching, and edit only node 2's
      body so `lead_magnet_id` is `opportunity-calculator` and `keyword` is `FREE` / `PLAN`
      with `utm_content` `free_v1` / `plan_v1`. Node 4 needs no edit.
      Smoke test before publishing: node 2's Test Request must return `200` with
      `action: ask_question` and the message "Roughly how many followers do you have across
      your socials?". A monthly-listeners question means the body edit did not save and the
      copy is still running Worth.
      Repo side is done and verified 2026-08-25: the adapter exists, `free` and `plan` are in
      that tool's `dmKeywords` and no other tool claims either word, `acquisition_engine` is
      enabled in production, and the deployed webhook is at the current commit.

---

## Ongoing

Things that are never finished. Cadence, then the thing.

### Every time Claude ships

- **Apply any new SQL migration.** Claude cannot. It will always hand you the exact file path.
  If it shipped code that needs a migration and did not tell you, that is a bug.
- **Set any new env var** it names. It cannot touch Vercel.

### After every sales call

- **Mark whether they showed up.** `/admin` → **Acquisition** → **Calls**: **Showed up** or
  **No-show**. The buttons only appear once the call has actually finished, so there is nothing
  to mis-click beforehand. You can also tick **No-show** on the booking in Cal.com itself: same
  effect, same idempotency key, so using both places cannot double-send.

  **Nothing infers a no-show.** It fires only when *you* say so, because "sorry we missed you"
  sent to the artist who *was* on the call, and had a good conversation with you, is
  humiliating and unrecoverable. An unsent message costs nothing. A wrong one costs the artist.

  Mark it and the automation takes over: a warm no-guilt DM within the day, a second two days
  later naming the money, then a clean breakup on day five that offers to take her off the
  list. After that CRWN stops for good. Un-marking it (in either place) cancels the ladder, so
  a mis-click is recoverable until 5am, when the dispatcher runs.

### Daily-ish, now that the Instagram engine is LIVE

- **Queue the day's carousels.** From this machine, because the slides live in Dropbox. Times are
  your own clock. Dry run first, it writes nothing:
    node scripts/queue-carousels.mjs --range 31-40 --date 2026-08-27 --start 09:00 --end 12:00
  Add `--queue` when the schedule reads right, then close the laptop; the cron publishes without
  you. It refuses a carousel that is already published, a caption over 2,200 characters, and a
  `caption.md` that has drifted from its source in the repo.
  **Expect a post to land inside its slot, not on the minute.** Vercel cron timing on this plan is
  best-effort: the first scheduled post went out 26 minutes after its slot. Anything more than 90
  minutes late is dropped rather than published stale, which is deliberate.
  Check what happened: `/admin` has no screen for this yet, so ask me and I will read the queue.

- **Answer high-intent lead alerts.** The engine emails you (once per lead, ever) when a lead
  scores into `sales_priority`. It deliberately stops automating at that point because the lead
  is too warm for a robot. Go talk to them.

- **Work the "Needs you" queue.** `/admin` → **Acquisition** → **Needs you**. When CRWN cannot
  understand a lead's answers, it stops asking rather than looping, and hands them to a person.
  That person is you. Reply on Instagram, then hit **Handled** (or **Not a lead**, which stops
  every channel for them immediately).

- **Sanity-check the lead scores as real leads arrive.** The bands in `leadScoring.ts` were
  calibrated with zero data and have already been wrong once: the very first real lead (100k
  monthly listeners, opened her result, edited the assumptions) scored **20** and was filed
  **"unqualified"**, so no alert fired.

  Two bugs caused it, both fixed, and the model was rewritten to your customer avatar on
  2026-07-28 ([`docs/ICP.md`](docs/ICP.md)): proven direct sales is now 40% of the score and big
  reach with no sales history is a penalty rather than a bonus. **Keep watching.** The loss
  tools now ask whether they have ever sold to fans, but the `worth` funnel still cannot learn
  goal or blocker, so it must recognise a hot lead from reach, sales history and behavior alone.
  If a lead you would personally chase is banded `nurture` or `unqualified`, that is a scoring
  bug, not a bad lead. Tell Claude.

- **Sanity-check the Constraint Engine's verdicts as real artists accumulate data.** Live since
  2026-08-03. Since 2026-08-13 the engine's verdict IS Rise Mode's next move when it has enough
  evidence, and the roadmap milestone leads when it does not. Every threshold is a first guess made
  with zero cohort data, in one file:
  [`src/lib/constraint/thresholds.ts`](src/lib/constraint/thresholds.ts). Same situation as the
  lead score bands, and they were wrong once.

  **If you see an artist told to fix something you would not have told them to fix, that is a
  threshold bug, not a bad artist. Tell Claude.** The likeliest first offenders: the free-capture
  floor (2% of visitors joining) and the retention multiplier (1.5x the platform average) will
  both behave oddly while the platform has few artists, because the benchmark is computed from
  everyone. Nothing here can change an artist's tiers, prices, promises or campaigns; it only
  recommends.

### Weekly

- **Check the "Failed" tab.** `/admin` → **Acquisition** → **Failed**. Should be empty. Each
  row has a **Retry** button. A pile of `dm_rejected` means the ManyChat token is wrong.

- **Watch for the onboarding canary email.** `/api/cron/onboarding-health` runs daily at 07:00
  and emails joshn.wms@gmail.com **the moment the artist signup path breaks.** It exists
  because that path once broke silently for months. **If it emails you, drop everything.**
  Silence is good news; the alarm is the whole product.

### Monthly

- **Rotate `MANYCHAT_WEBHOOK_SECRET`** (Vercel + the ManyChat header). Cheap, and the webhook
  is an unsigned shared-secret endpoint by necessity: ManyChat cannot HMAC-sign.

- **Skim the lead score bands.** The thresholds in `leadScoring.ts` are conservative first
  guesses made with zero real leads. Once you have 50, they are tunable with evidence. One
  file, one place.

### Whenever you add a cron

- **Never more frequent than daily.** Vercel Hobby blocks *all* deployments if you do.
  `vercel.json` already has 25 entries and nearly every hour slot is taken. The house pattern
  is to **piggyback** an existing cron, not add one.

---

## On Claude's plate (not yours)

- **Flip `ALLOW_UNSIGNED_LEGACY_LINKS` to false, NOT BEFORE 2026-09-24 (30 days).** The signing
  half shipped 2026-08-24: all four fan/prospect senders now emit signed unsubscribe links, so
  nothing NEW carries a bare row id. The flag stays true until the unsigned generation ages out of
  inboxes, because flipping early refuses the unsubscribe link in every email already sent, which
  is a worse compliance failure than the one it closes. 30 days is the CAN-SPAM floor; I will take
  90 unless you want it sooner. Nothing for you to do. What the flip buys: today anyone holding a
  send id can load the confirm page (the GET mints the token); after it, an unsigned link is
  refused outright.

- **Single-offer entry bridge: SHIPPED 2026-08-16.** An artist who came in through the Vault
  Revenue Planner, the Live Experience Calculator or the Executive Producer Session now gets told
  where the one thing they planned lands and what keeping only that thing costs them, on the
  restored-plan intro and again on the ladder screen. The Vault they named and priced before
  signup now opens ON the Gold rung instead of being replaced by a stock one. To be clear about
  what was NOT broken: every entry path already reached the ladder screen and already got all four
  rungs, because the setup gate wins over the journey resolver. What was missing was the argument.
  Widened the same day once I found the class was bigger than those three: MOST tools model no
  ladder (missions, demand tests, leaderboards, royalty checks), and every one of their artists hit
  the identical silence, so they now get the argument too. The Vault residue is closed as well: the
  drop cadence they chose in the planner seeds the promise screen instead of being asked again and
  ignored, and their first 30 days show up there. **Nothing for you to do.**

- **Post-Win Referral V1: SHIPPED 2026-08-12.** Both your decisions are implemented and pinned by
  test: unpaid forever, never retroactively commissionable, and structurally incapable of touching
  the recruiter rail (the link uses `artist_ref`, not `ref`, precisely so it can never end up one
  branch from that $50 fee). When an artist gets their first paid member on CRWN, they see one
  pop-up that copies a share link; whoever they send it to lands on the calculator, and CRWN can
  follow that person all the way to their own first paid member.
  **Nothing to do, but one thing to know:** it will not fire until an artist actually records a
  first paid conversion, which has happened **0** times so far. That is the correct behavior, not a
  bug. Related: your P1 item about tagging calculator video links is the same underlying gap, since
  the attribution carrier is wired correctly and simply has never received a tagged visit.

- **Promise Calendar + email: reconciled 2026-08-11.** Your artists were getting two emails about
  the same promise, three hours apart, because two systems both owned it and neither could see the
  other's dedupe. Now one owner: `promiseReminders` sends fan-promise reminders (honouring the
  per-promise lead times you can set), and the calendar reminder is fan-only for livestreams and
  deadlines. Also worth knowing: I checked the lifecycle emails against all 9 of your artists and
  **they are already state-aware**. A Stripe-connected artist genuinely cannot receive the
  connect-Stripe nudge, because having the milestone is what disqualifies them. I did not invent
  personalization work for a system that already had it.
  (The direct-notification-writer gap this note used to flag was closed 2026-08-12: every
  artist-facing CRWN notification now goes through the governed chokepoint, and a source-walking
  test enforces the boundary.)

- **Rise Mode Resume: reconciled 2026-08-11, and one question is yours.** The prompt's plumbing was
  already right (it reads canonical quest state, matches Rise Mode's own selector, ranks below
  Stripe, caps at 3 shows / 4 days, works cross-device, stores nothing). What was wrong was the
  sentence: it said "You left something half done" when CRWN has no way to know that. Quest progress
  is computed from live database state, so it rises when the ACCOUNT changes, not when an artist
  opens anything. In production all 16 eligible quests were of that kind, including "Reach $1,000
  per month in recurring support" at **4%** and "Reach 25 supporters" at 40%. Those are goals that
  grow with the business, not tasks anybody abandoned. Copy now claims only that a goal is partway,
  which is true at 4% and at 90%.
  **Your call:** do you want CRWN to actually record when an artist starts a quest? That is the only
  way the prompt could honestly say "continue where you left off" and the only way to answer
  "does resuming increase completion". It means one new signal on quest engagement. I did not add
  it because nothing yet proves it is worth the persistence, and the prompt has never once fired in
  production (zero `artist_resume_rise` impressions), so there is no evidence of demand either.

- **Needs You boundary: SHIPPED 2026-08-11.** The calculator mission block is out of Needs You,
  which now owns events and deadlines only, so nothing there can rank a growth opportunity beside a
  FULFILLMENT diagnosis any more. The calculator commitment itself is untouched and still lives in
  Rise Mode, which is also what tracks progress against it. Blast radius was **1 artist, 7 items**;
  nothing deleted. **`/action-plan` stays on purpose** and is not a tidy-up target: the tour id is a
  persistence key (renaming replays the tour for everyone who dismissed it) and the item ids carry
  historical analytics.

- **Communications Governor: G1 + G2 SHIPPED 2026-08-11. G3 (lifecycle email) is evidence-gated,
  not scheduled.** Governed today: artist-facing CRWN notifications, via one chokepoint, with no
  producer changes and no schema. Both your decisions are encoded and pinned by test (no global
  cross-channel cap; celebrations coexist but never displace an obligation).
  **G3 needs evidence first, and here is the specific evidence:** email has **no send-history
  table**, so governing it means either accepting per-sender local suppression as-is or adding
  persistence, which you ruled out for V1. I would want to see, from G2, either (a) growth
  notifications actually deferring in practice, which would show producers can supply cheap
  context, or (b) a real complaint about email volume. Absent one of those, G3 would add
  machinery against a collision nobody has observed. **G4 (cross-channel dedupe) needs a shared
  send log and is therefore blocked on the same decision you already made.** Ask and I will build
  G3 anyway if you would rather have it early.

- **Manager measurement loop: PARTIAL RETIREMENT SHIPPED 2026-08-11.** The learning half is gone
  (baseline capture, `outcome_delta`/`outcome_metrics` writes, `outcome_score`, the `pastOutcomes`
  prompt block and its "repeat what worked" instruction, and `snapshotMetrics.ts`, which had zero
  live callers left). The telemetry half is untouched: Manager still records what it did, when,
  and whether it worked mechanically. No history was deleted, no rows migrated, no migration run.
  Two legacy artifacts are deliberately LEFT IN THE DATABASE because removing them needs DDL for
  no safety benefit and nothing reads them any more: the `baseline_metrics` / `outcome_metrics` /
  `outcome_delta` columns on `artist_agent_actions`, and the `artist_action_outcomes` view with
  its `outcome_score` expression. If you ever want them gone, that is a cosmetic migration, not a
  correctness one.

- **Bespoke hero photos for the two single-opportunity calculators.** `fan-stack-calculator` and
  `between-tour-calculator` reuse the own-your-fans and live-experience photos (the registry's
  documented placeholder pattern). They are no longer avatar front doors, so this is cosmetic.
  Generate on-brand charcoal+gold images (artist 18-32 rule) and swap the two `hero.image` paths.

- **Avatar follow-ups, in order:** per-avatar hero copy on the all-in-one calculator page (today
  the entry context reorders the questions and shows its note, but the hero headline is still
  one shared line); per-avatar experiment experience keys in `src/lib/experiments/registry.ts`
  once there is a message variant worth testing; artist 30/60/90-day retention at cohort grain
  in the admin Avatars tab (needs a per-artist activity definition first, see the tab's "not
  measured" list).

- **Pre-signup live preview (the half of the preview ask that is still open).** The live fan
  preview now runs from the artist-link screen through launch, showing their real page in an
  iframe. It does NOT run on the calculator or builder pages, because before signup there is no
  page, no name, no photo and no music: the only fan-visible thing that exists is the tier ladder,
  and `TierCards` is wired to auth, router and live checkout, so reusing it there is not a small
  change. Showing a near-empty page at the moment of peak excitement is also a conversion risk
  worth measuring before building. The honest version is a ladder-only "what fans will see"
  card in `DeliverableBuilder`, reusing the tier presentation only. Mine, not urgent.

- **v2 interface redesign, remaining screens.** Landed 2026-08-02: tokens + the
  `.neu-raised`/`.neu-inset` surface treatment (75+ call sites upgraded through two classes), the
  nav rail marker (no more filled gold block), the spring motion vocabulary on every shared
  pressable class, `src/lib/contrast.ts` (tested) / `palette.ts` / `useLivingPhoto.ts`, the Home
  next-action card (the one structural change), and Rise Mode progressive disclosure. Landed
  2026-08-03: the whole artist page (accent wash, banner media card, tier cards, self-healing
  palette backfill, drag-to-reframe banner, measured-ink fixes, the contrast sweep dev tool,
  the sampler hue fix). All its migrations are applied and probe-verified. Still mine, in
  order: setup wizard composition (85KB file, one decision per screen with the desktop step
  rail), Studio Music + Fan CRM layout, the shared calculator-intro pattern, the homepage
  ambient layer (WebGL tier; the CSS pool shipped), the living-photo heroes, the player
  accent, and wiring the contrast sweep into CI. Each is its own session per the handoff's
  PR plan (`IMPLEMENTATION.md` in the design handoff).

- **NEXT UP: realign the quest catalog to the membership strategies, then flip the Quest Engine
  on.** The release strategy (`CRWN_UPDATED_RELEASE_STRATEGY.md`) is otherwise implemented end
  to end (2026-08-01): brain, content classes, declared facts, live templates, waterfall. The
  74-quest catalog still describes the pre-strategy journey, and quest progress is STORED, so
  the catalog must be rewritten BEFORE the engine goes live or artists accumulate XP against
  content about to change. The plan, so the next session starts cold: (1) rewrite
  `src/lib/quests/templates.ts` levels 5-10 around the strategy vocabulary (launch the monthly
  promise, first waterfall release, first live from a template, first vault unlock), reusing
  the existing DomainChecks plus `artist_promise_fulfilled`/`artist_first_visit`; (2) keep
  every existing template KEY that still fits (stored instances reference keys); (3)
  `npm run verify:quests` + tests; (4) ship the flag flip as a migration file in the same
  commit. One session, no migrations for Josh beyond the flip file.

- **Launch-spec remainders (each its own session, in this order).** Done this round: ladder
  prefill from the artist's own draft, per-tag segment targeting for imported contacts, the
  richer plan intro, cadence changes propagating to existing obligations, Share-to-Earn config
  restored at ladder create, the purchase-level obligation engine (shipped products and
  scheduled experiences create their fulfillment task at purchase; digital creates nothing),
  promise reminder delivery (daily digest, piggybacked on the 6am cron), per-promise prep
  time + delivery method + reminder schedule on the review screen, and staggered default
  first-due dates (no two promises default to the same day). Still mine:
  1. the quarterly live experience as a confirmable wizard component;
  2. OAuth import connectors (Mailchimp, Google, Shopify, Gumroad); CSV covers them today;
  3. warn-before-deleting future obligations in the Promise Calendar UI.

- **Rise Mode per-task dollar estimates (from your live-test list, deferred on purpose).** Each
  quest card should show the estimated extra $/month completing it unlocks, derived only from
  numbers CRWN really has (calculator payload, tier prices, member counts). Deferred rather than
  rushed because a per-quest estimate model done sloppily invents figures, and the house rule is
  show nothing over showing a made-up number. Its own session.

- **Full tour audit (the rest of your tour feedback).** Fixed this round: one auto-tour per
  session (no more tour chaining across tabs), community step mentions channels, home tour's
  dead final anchor. Still mine: audit all ~20 per-page tours against current selectors and
  features, and decide whether the artist-page tour should stop clicking through its own
  Music/Tiers/Community tabs (kept for now because each tab's content only mounts when active).

- **Make the roadmap fully adaptive, and wire it to the Quest Engine.** The ramp already re-plans
  from real pace and real MRR, shows one milestone at a time, and promotes the step the artist's
  entry calculator was about ([`docs/REVENUE_RAMP.md`](docs/REVENUE_RAMP.md)). What is still
  static: the milestone percentages are assumed rather than measured, and nothing weights release
  cadence, content output or hours available per week, because CRWN does not collect those yet.
  Mine to build, in that order. The levelling itself belongs to the Quest Engine, which is built
  and dark: a ramp step completing should award XP there rather than the ramp growing its own
  badges, or there will be two progression systems telling an artist different things.

- **Retarget the rest of the funnel to the customer avatar.** The scoring model, the homepage
  calculator, the loss tools' qualifying question, the nurture sequence and the brain doc are done
  (2026-07-28, [`docs/ICP.md`](docs/ICP.md)). Still mine to finish: the setup wizard assumes an
  artist with nothing (one free tier, first track free, no bulk catalog import) which is the wrong
  first run for someone with 40 to 300 released songs, and the loss engine still applies a flat
  1% to 3% conversion regardless of whether the artist has ever sold anything, which under-sells a
  proven seller. Neither blocks anything today.

- **The Artist Launch Wizard (your 10-phase spec, 2026-07-30) is COMPLETE: all nine stages
  are live.** The full record is [`docs/ARTIST_LAUNCH_WIZARD.md`](docs/ARTIST_LAUNCH_WIZARD.md).
  The journey now runs end to end: a signup with a claimed calculator result opens on "Your
  CRWN plan is saved" with their number; the wizard confirms the full ladder (with estimated
  buyers per tier from their own calculator); the promise-review screen shows the recurring
  workload before anything is created (one shared generator, dedup + inheritance, so
  "Everything in Gold" is real for Platinum members); Stripe connects in-wizard with exact-step
  return; the music step offers the full-catalog bulk path; every artist has a 5-stage roadmap
  derived through the Quest Engine's own checks; the fan import hub (with the Patreon on-ramp)
  and the Launch Kit (drafts only) cover the audience; and the wizard ends on the launch review
  (checklist with fix-it jumps, previews, "Launch my CRWN") with Rise Mode's roadmap card as
  the post-launch command screen (real members/paying/MRR-vs-goal numbers plus upcoming
  promises). No migrations, no env vars, nothing for you to run. Deliberately not built yet:
  OAuth import integrations, page-visit/checkout-start metrics on the command screen, and
  moving import/campaign into the wizard proper. Ask when you want any of those.

The Instagram acquisition engine is feature-complete and verified in production: ingress,
identity, Claude extraction with a complete deterministic fallback, the calculator handoff,
secure result links, claiming, the gated in-window email capture, follow-up automation with a
compliant unsubscribe, the tool-education drip, booking detection, the no-show ladder, retention,
and the admin panel. The privacy policy now discloses the funnel (live).

- **Announcement pop-ups: the Pop-up Engine is ON (you flipped it 2026-07-24).** Announcements now
  fire, each gated on its own feature flag. Verified against production 2026-08-12 with
  `npm run verify:flags`: `live_tips`, `producer_sessions`, `royalty_readiness`, `quest_engine`,
  `acquisition_engine`, `experiments` and `popup_engine` are ALL on, so
  `announce_live_tips`, `announce_producer_sessions`, `announce_royalty_readiness` and
  `announce_hub_navigation` are all live. When you add a new
  dark-launched feature's announcement, add its flag to `ANNOUNCEABLE_FLAGS` in
  `src/app/api/popups/route.ts` or the gate reads `false` forever. Remaining gap I can fix any
  time: `PopupContext` carries no account-creation date, so "existing users only" is approximated
  with a once-ever cap; say the word and I add `accountAgeDays`.

- **Artist dashboard is now 15 real screens, not a 16-tab strip.** `/profile/artist` is Rise Mode
  only; management lives in the hamburger (`/account/*`), tools live in Studio (`/studio/*`), and
  every screen wears `HubPage` (X in the top left, returns to the menu when it carries
  `?from=hub`). Nothing for you to run: no migration, no env var, no flag. (The
  `announce_hub_navigation` pop-up is now live: the Pop-up Engine flag is on. The seven Studio
  tiles that were emoji placeholders now carry real gold product photos, done 2026-07-26.)

- **Royalty / publishing intelligence, phase 1 shipped (the diagnostic).** The Royalty Readiness
  Check is built. The score-only **Royalty lead magnet** (keyword `ROYALTY`) is now LIVE (web tool
  + ManyChat DM flow, verified end to end 2026-07-27). What is deliberately NOT built, in the order
  I would build it: a **per-song registration tracker** (the check is artist-level today, tracks
  already carry an ISRC); a **composition record** separate from the recording, which is the real
  prerequisite for anything split-sheet shaped. CRWN should not become a publisher or administrator,
  and none of the above moves it toward being one.

- **Executive Producer Sessions: LIVE (2026-07-24).** The migration ran, the flag is on, and the
  fan submission agreement is final (`/submission-agreement`). Shipped and live: fan submissions
  (beats/vocals/ideas/references, private upload, deadline), the artist review queue, advisory
  polls, a public per-session sales page (`ProducerSessionOffer`), per-session stats
  (`/api/producer/analytics`), one-tap **Run it again** recurrence, free-entry seat count, a
  loss-framed announcement (`announce_producer_sessions`), and a live-ticket refund clause in the
  Terms.

  **Only two things are left, and I recommend NOT building either until you have run a real paid
  session.** Both are your decision, not more spec:
  - **Premium seat types** (a cheap viewer ticket + a few high-price producer seats sold
    separately). Lower risk, no legal, no moderation. My advice: build it the day a single-price
    session sells out, not before. Then: viewer ticket at the calculator's band price + 3 to 5
    premium seats at ~4x.
  - **Fans on mic/stage.** The bigger differentiator but the heaviest: needs a fan likeness release
    AND real-time moderation. The `stage` LiveKit role is scaffolded (types + grants + DB CHECK,
    nothing mints it). My advice: build it **invite-only, one fan at a time** (you pull up a
    specific fan), which sidesteps almost all the moderation surface. Blocked on your
    likeness-release call, and I would only start it after a session or two have run.

- **Automated lead deletion (erasure requests).** Ask me to build this when you want it. Today a
  "delete my data" request from a lead is MANUAL: `DELETE FROM lead_identities WHERE ...` in
  Supabase (it cascades). The privacy policy honestly describes this manual path, but a proper
  self-serve or one-command deletion is not built (it is Phase 2 in the checklist). Low volume
  today, so not urgent, but it is the one real gap behind the privacy disclosure.

- **Loss-revelation lead magnets: live, and one of them was NOT honest.** The house rule is that
  every tool's `fix` must point to a CRWN feature that actually exists. It is enforced by
  convention, not by code, and the **Executive Producer Session Calculator broke it**: its fix
  ended with "Fans pitch beats, vocals, and topics live", which nothing in the codebase does.
  Corrected and live on 2026-07-24, along with the hero, the cause paragraph and the email
  run-of-show, which all made the same promise. **I want to add a real check rather than trusting
  the convention a second time**, and I will unless you would rather I spent that time elsewhere.
  Every tool otherwise has a DM flow, a web page, a recovery-flow diagram, and the CRWN showcase.
  The 11th, **Own Your Fans** (keyword `OWN`, the DistroKid/independence angle), ships on today's
  owned-CRM features and reuses existing profile fields (no migration). Founder Window is a real
  feature now (cap + deadline + founder marking; migration run). The only deferred piece is
  **grandfathered/locked pricing** for founders, left out because it touches Stripe subscription
  pricing. Ask if you want it. (The ManyChat flows for the new tool keywords are now built and live.)


- **Prospect nurture (email-only calculator leads): LIVE (migrations run 2026-07-30).** A lead
  who runs a calculator, asks for the result by email, but does not sign up now enters a versioned,
  calculator-aware, consent-gated sequence (v2: 25 emails over ~12 months), and exits the instant
  they create an account. It reuses the existing Resend sender, the global suppression gate, the daily
  cron scheduler, and the lead tables (no parallel system). The Instagram unsubscribe route's
  suppression write also works properly now (the `reason='unsubscribe'` CHECK is in place).
  Deliberately NOT built yet, in the order I would build them: **Phases 4-9** (objections → mechanism →
  proof → re-engagement → authority → evergreen), which slot into the same code array with no schema
  change; and wiring the external **`/worth`** (Streaming Loss) tool to enroll (only registry wizard
  tools enroll today). Full spec + admin controls: [`docs/PROSPECT_NURTURE.md`](docs/PROSPECT_NURTURE.md).

(A note here used to say `/signup` ignores `?next`. Stale since the Song Lab build on
2026-08-20: signup now validates `?next=` with `safeInternalPath`, rides it through email
verification as `user_metadata.pending_next`, and `/verify` honors it. Calculator auto-claim
still uses `ClaimRedeemer`; both paths coexist. `/welcome` was retired 2026-07-30.)
