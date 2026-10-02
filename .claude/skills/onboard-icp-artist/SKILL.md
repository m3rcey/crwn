---
name: onboard-icp-artist
description: Build a founder-assisted launch for a new ICP artist on CRWN: their identity, the Bronze/Silver/Gold/Platinum ladder, benefit cards, Tier Offer Experience sales pages, a draft drop-page funnel, and the vote lead magnet (fans hear 2-4 unreleased songs, tap one, and name + email cast the vote and join the free tier and the artist's Fan CRM). Use when the founder says an artist signed up and needs tiers and an offer page built, hands over a launch blueprint or an artist's brief, asks to "onboard", "set up", or "build out" a launch partner, or asks to add or open an artist's song vote. Not for artists building their own offer in the product (that is /build/experience), and not for uploading a catalog.
allowed-tools: Read, Grep, Glob, Bash, Edit, Write, AskUserQuestion
---

# Onboard an ICP artist (concierge launch)

Everything this skill produces is DATA in one config file plus ONE idempotent script:

- Config: `src/lib/offerExperience/reference/<artistKey>.ts`, registered in
  `src/lib/offerExperience/reference/launchPartners.ts`. Shape and validation:
  `src/lib/offerExperience/reference/launchPartner.ts` (`LaunchPartnerConfig`, `checkLaunchPartner`).
  Worked example: `src/lib/offerExperience/reference/princeDre.ts`.
- Writer: `scripts/onboard-launch-partner.mjs <artistKey>` (dry run) and `--apply`.

Never hand-write rows in SQL or a one-off script for a launch. If the script cannot express
something, extend the script and the config type, with a test.

All Node commands run inside WSL (`wsl.exe -d Ubuntu -- bash -lc "cd ~/workspace-crwn && ..."`);
from Git Bash they fake-pass or fail.

## 1. Establish reality first (never trust the brief's account state)

The founder's description of the account has been wrong before ("he already connected
Stripe" meant: stopped on the wizard's first screen, no artist row, no Connect account).
Probe production with the service role before writing anything:

1. Find the auth user: `db.auth.admin.listUsers` sorted by `created_at` desc (it paginates; the
   newest are not on page one by default), match on email or Google `full_name`.
2. `profiles` (role, display_name, onboarding_completed), `artist_profiles` by `user_id`
   (slug, stripe_connect_id, setup_completed), existing `subscription_tiers`, `fan_automations`.
3. Stripe: an artist has Connect only if `artist_profiles.stripe_connect_id` is set. No row means
   no Stripe, whatever the brief says. Tiers can still be built (null Stripe ids;
   `backfillTierPrices` creates prices when charges enable), so this is a hand-off, not a blocker.

Report the gap between the brief and production before building.

## 2. Write the config

Copy `princeDre.ts` to `<artistKey>.ts` and replace the content. Pin `userId` and `email` from
the probe. Rules the checks enforce (and why), so write them right the first time:

- **Rungs and prices are fixed**: Bronze free, Silver $10, Gold $25, Platinum $100 from
  `RECOMMENDED_LADDER`. A brief's own tier names (First Listen, Inner Circle, Vault...) are ROLES:
  map them onto the four rungs and keep the rung names.
- **Every benefit line must be deliverable today.** Map each to a SUPPORTED key in
  `src/lib/benefitRegistry.ts` (`recommended` or `additional`), one identity per distinct
  capability on the lowest rung that promises it. Lines with no key stay prose, but must still
  be true.
- **Leave out, and tell the founder you left out**: merch or anything physical (CRWN sells no
  physical goods), "limited"/scarcity (the only real cap is the Founder Window, opt-in in
  TierManager), "priority", any schedule ("monthly", "weekly"), rights/credits/royalties.
- **Offer pages**: benefit CTA (never "Join <tier>", never the tier name), every preview carries
  `truth: 'real' | 'example'`, and `real` only for something that exists in production today
  (nothing is uploaded at onboarding, so nearly everything is `example`). `vsl: { url: null }`
  until the artist records one.
- No em or en dashes anywhere. Lead with what the fan misses, not generic hype.
- Funnel: `funnelPrimary` / `funnelDownsell` pick the ladder a fan is sold right after they
  vote (and on the drop page): the primary rung's full offer page first, and "Not right now"
  rolls down to the downsell. The founder's default is GB's: **Platinum, then Gold**.
- Video: until the artist records their own, Platinum and Gold carry the same stand-in CRWN
  video GB does, with `isPlaceholder: true` (the page labels it an example). Silver has none.

### The vote magnet (`vote`)

The standard ICP lead magnet: fans hear 2-4 unreleased songs (typically one from each of
several projects), tap one, and a name + email form opens under the songs. Casting the vote
creates the captured contact, joins Bronze through the canonical `joinFreeTier`, and so puts
the fan in the artist's Fan CRM (`/studio/fans` reads `subscriptions`). It renders on Song
Lab's public ballot at `/<slug>/join/<offerSlug>` (`src/components/songlab/OfferLanding.tsx`);
each option's song is read through `tracks_public` AS THE VISITOR and played with
played through the app's one player (`usePlayer`, `MiniPlayer`), so only a FREE track ever plays.

- Copy: `headline`, `description`, `question`, and `winnerRung` (which rung the winning project
  drops on). The winner is the ARTIST's call and their promise; CRWN tallies, never picks, so
  word it as the artist's commitment ("the project with the most votes drops in the Vault").
- `options: []` is the valid PENDING state (songs not uploaded). The script builds everything
  else and prints `vote magnet WAITS`.
- When the founder hands over the songs (usually WAVs plus a cover each in `videos/output/`),
  set `options` IN THE ORDER THE FOUNDER GIVES (ask if not given):
  `{ label, trackTitle, file: 'videos/output/<song>.wav', artFile: 'videos/output/<cover>.jpg' }`.
  When fans vote between PROJECTS, `label` is the project name, `trackTitle` the song that
  represents it, and `artFile` the PROJECT's album cover, not a single's photo. Ask which
  project each song is from if the founder did not say. Each option renders as a card: the cover
  is the play button (the app's one player, so a second song stops the first, and the artist-page
  player bar shows), the project name is the choice, the song title sits beneath it.
  A cover that was wrong on an already-uploaded song: fix `artFile` and run with `--refresh-art`.
  The script uploads any song not already on the page exactly as Studio Music does (master to
  `audio`, cover to `album-art`, free forever, position = ballot order) and runs
  `scripts/transcode-audio.mjs --id` for the 128 kbps stream copy. A song already uploaded is
  matched by `trackTitle` (case-insensitive) and must be free, or it is refused (fans could not
  hear it). The songs also appear on the artist's public page as free tracks: that is the magnet.
- Once a poll has votes, the script never rewrites its options.
- After the vote, the SAME page becomes the offer: a "your vote is in" line, then the primary
  rung's Tier Offer Experience (previews, video, FAQ) with the shared purchase cluster
  (`useOfferPurchase`: checkout for a signed-in fan, an emailed code for a captured contact),
  and "Not right now" rolls down to the downsell. Stripe returns to the ballot link:
  `?subscription=success` shows the welcome, `?subscription=canceled` reopens the primary.
  Checkout needs the artist's Stripe connected; until then the button errors.
- **Never set a closing time on the vote.** A closed ballot shows "voting has ended" and stops
  capturing fans, and street-team and social traffic runs for weeks. Put the decision DATE in
  the copy instead ("the project with the most votes by October 1 unlocks for Gold"); the vote
  stays open and keeps feeding the list. To see the after-vote page without voting, open the
  ballot link with `?subscription=canceled`: it renders the primary offer and writes nothing.

**Fan cities (venue planning).** An online vote asks "Your city", pre-filled from the visitor's
Vercel location (`cityHintFromHeaders`) and editable, and stores what the fan submitted on the
artist's `fan_contacts.city` (`recordVoterContact`, tag `song-lab-vote`). Before this, a free
fan had no city at all: only paid checkouts carried one. To hand an artist the list:

    node scripts/fan-cities.mjs <artistSlug>          (table: fans and paying fans per city)
    node scripts/fan-cities.mjs <artistSlug> --csv    (for a sheet)

### More lead magnets: drop funnels (`drops`)

Besides the vote, a launch can run drop funnels (`/drop/<link>`), each with ONE song as the
magnet. `drops` is a LIST, one entry per song: `{ magnetTrackTitle, magnetTitle,
magnetDescription, live: true, linkSlug? }`. The script finds each song's funnel by its link,
then by its song, and creates one when neither exists, so adding an entry adds a funnel and
never repoints an existing link. Prince Dre runs two: "Round Here" (Gold) and "Letter To LA"
(Silver, `/drop/princedre-letter-to-la`). The fan gives name and email,
hears the song through a signed link that expires, joins Bronze, then meets the primary offer
(Platinum) with the downsell (Gold). **The song keeps its rung gate** on the artist page: pick
a paid-tier song (Prince Dre's is "Round Here", Gold) and the magnet is a taste of what Gold
holds, not a giveaway. The claim route is designed for exactly that (see its header).

**Every funnel link is personalized, never the random token** (founder, 2026-09-29). The script
sets the drop link to `/drop/<artist slug>-<magnet song>` (`dropLinkSlug`; Prince Dre's is
`/drop/princedre-round-here`), refusing one another funnel already uses. Name a different one
with that entry's `linkSlug`. Renaming kills the old link, so rename BEFORE the link is shared, and tell
the founder the new one. The token is a pointer, never authority: drafts still open only for
their owner, so a readable link exposes nothing.

**The opt-in button sits above the fold, and that is MEASURED** (founder, 2026-09-29). The
first screen shows the song LOCKED (`MagnetPlayer` without `src`: cover, lock, title, project,
length, and no audio in the page) above one name + email row and the Unlock button. Keep
`magnetDescription` to one short line: the player already names the song and project. After
any change to the drop page, measure every live funnel at 390x745 and 1280x590 with a CDP probe
that stamps `crwn_dnt` before navigating; the Unlock button's bottom must be under the fold
height. Measured 2026-09-29: 534px on a phone and 486px on a laptop, for both of Dre's funnels.

**The rule covers every screen AFTER the opt-in too** (founder, 2026-09-30): the drop's unlocked
screen and its Silver step, the vote page after a pick, and the Gold offer and downsell after a
vote. The unlocked song is ONE compact row (`MagnetPlayer layout="row"`), and the offer's hero
photo sits UNDER its buy button, which is what keeps that button on screen. Measure with
`node scripts/probe-fan-fold.mjs` (Windows node; `--host=http://localhost:<port>` for a local
`next dev`). It checks 390x745, 375x667, 1280x590 and 1920x872, stamps `crwn_dnt`, and blocks
every non-GET `/api/` call, answering the claim locally so the post-opt-in screens render with no
write. Measured 2026-09-30: every state passes at all four sizes.

### The ladder's music (`content`)

The standard ICP ladder (founder decision 2026-09-28, Prince Dre is the worked example) gives
every rung more of the one thing the fans asked for, usually the artist's unreleased music:

| Rung | Gets |
|---|---|
| Vote (free, no account) | one song from each project, heard before voting |
| Bronze | the sampler + a bonus unreleased song |
| Silver $10 | the archive pack: 2 more songs from each project |
| Gold $25 | the complete WINNING project, on the decision date |
| Platinum $100 | all projects complete, now, plus first listen to what comes next |

- `content.tracks`: `{ title, rung, file, artFile?, placeholder? }`. `rung` is the LOWEST rung
  that hears it; the script locks it to that rung and every rung above it (the gate is an exact
  match, there is no inheritance). Any audio type works: WAV/FLAC get a 128 kbps stream copy,
  MP3 is already one. A re-run only ever ADDS rungs to a track, never removes one.
- `content.projects`: `{ title, artFile, voteLabel, trackTitles }` becomes an album on the
  artist's page: the vote song free, the rest locked by rung.
- **Placeholders:** when the artist has not sent the songs, stand in beats from `videos/music/`
  under the titles the real songs will take, with `placeholder: true`, and add a P0 to TODO.md:
  **no paid tier may sell while a placeholder is behind it** (Stripe being unconnected is
  usually what holds that line; say so).
- **The Gold unlock:** on the decision date the artist records the winner in their Song Lab
  manager (CRWN never picks), then run the script with `--apply --unlock-winner`. It opens that
  project's Platinum-only tracks to Gold, additively.
- **The vote's bonus song arrives through the account email**, not on the after-vote screen: the
  voter is a captured contact with no session. Word the copy that way ("unlocks a bonus song in
  the free account we email you"), never "the moment you vote".

### A whole back catalog (founder, 2026-09-30; Prince Dre is the worked example)

When the founder hands over every project (`videos/<artist>/<project>/<n> - <song>.wav` plus a
cover), research BEFORE placing or writing a word of copy. Send a web-research subagent for, per
project: where it can be heard today, a 1-5 find-and-listen difficulty, and the two most-watched
YouTube videos of its songs (with view counts and links, official uploads first).

- **Place projects by difficulty:** the easiest to find go to Silver, the middle to Gold, the
  hardest to Platinum. The vote projects stay in Platinum (Gold gets the winner): that promise is
  already live and outranks the difficulty order.
- **The two most-watched songs of every project go to Bronze**, free. Only a video that verifiably
  is that project's song counts: pass over a likely remix or an unconfirmed match for the next one
  down, and write the counts and the passed-over videos in a comment beside the list
  (`DRE_BRONZE_SINGLES`).
- **Every Bronze single gets its own drop page** (`drops`, one entry each), so each video's
  audience has a link to send them to.
- **The research polices the copy.** Prince Dre's copy said "never on streaming" and
  "unreleased" until research found every project somewhere (Audiomack, YouTube, Apple Music,
  LiveMixtapes). Sell the COMPLETE project in one place, never scarcity it does not have;
  `princeDre.test.ts` refuses those phrases. Put every rights line the research finds (a label, a
  distributor, a co-owner) in TODO.md for the founder to confirm with the artist.
- **Two recordings with one title** (Prince Dre's "Ready For War" is on two projects) need two
  titles on the page; the script matches tracks by title. Retitle the later one
  (`Ready For War (Life I Live)`) and `checkLaunchPartner` refuses a duplicate.
- **Derive every count from the song lists** (`N[...]`), never type one: the founder caught a
  hand-typed total once.
- **The artist hears everything on their own page** without subscribing: the database already
  grants the owner, and the page trusts that grant. Nothing to configure.
- **The artist signs the artist terms** on their next visit (the rights warranty and the
  hold-harmless). Put the artist in the First Revenue Launch cohort
  (`artist_profiles.launch_partner = true`) when the founder is running that launch for them, and
  they sign the launch conditions too. Both are in `src/lib/legal/artistTerms.ts`.

Register the config in `launchPartners.ts`, then:

    npx vitest run src/lib/offerExperience/reference/

`launchPartner.test.ts` runs `checkLaunchPartner` on every registered artist. A failure names
the rule; fix the copy, never the check.

## 3. Dry run, then apply

    npx tsx scripts/onboard-launch-partner.mjs <artistKey>
    npx tsx scripts/onboard-launch-partner.mjs <artistKey> --apply

The dry run stops before the artist row exists on a first run; that is expected. The apply
ends with a READ-BACK (role promoted, four tiers, keys, offers normalized, funnel resolves to
the configured rungs, and when songs exist, `vote ballot: OPEN to anyone`). Run it twice: the
second run must report everything as existing and change nothing.

Creating the identity writes the artist's permanent public link (`slug`). Pick it from their
artist name; if it is taken or the name is ambiguous, ask the founder before applying.

**Profile photo:** if the founder sends one, set `photoFile` (repo-relative, e.g. in
`videos/output/`). The script crops it to a centered square and uploads it the way the setup
wizard does, only when the artist has no photo (or with `--refresh-art`). Open the uploaded
image and look at it before reporting: the face must survive the square crop.

**Offer art: every image slot is generated from a reference folder the founder names.** Each
paid offer takes a `heroImageUrl` (above the promise), session/video previews take a
`posterUrl` (a mock video with a drawn, non-clickable play mark), and the offer `vsl` takes a
`posterUrl` with `url: null` until the artist records their video. One command fills all five:

    bash -c 'source ./load-env.sh; npx tsx scripts/generate-offer-photos.mjs <artistKey> --refs "<folder>" [--room <file>] --upload'

- [scripts/generate-offer-photos.mjs](scripts/generate-offer-photos.mjs) writes
  `hero-platinum`, `hero-gold`, `session-listening`, `video-vault` and `vsl-thumb` (16:9 WebP)
  to `videos/output/<slug>-photos/`, and `--upload` puts each at
  `album-art/<artistId>/offer/photo-<slot>.webp`. Reference those URLs from the config the way
  `princeDre.ts` does (`OFFER_ART`). `--only a,b --force` regenerates one slot.
- REALISTIC photos of the artist in a recording studio (founder correction 2026-09-28: an
  artist's own page shows real-looking photos of them, NOT CRWN poster art; the brand-poster
  rule is for CRWN's marketing). Never DJ turntables.
- **The reference folder must hold the CURRENT look only.** Ask the founder, or look, and move
  other eras aside: a mixed folder blends two haircuts. A photo with no person (an empty studio)
  goes in `--room`, never `--refs`.
- **Look at every image before it goes live** (likeness, headcount, stray text, turntables); with
  several, a reviewer subagent that views each file against the references. Regenerate a slot
  with `--only <slot> --force`, then `--upload` again.
- Get the artist's team to approve AI images of their likeness before launch (a TODO item).

**Offer previews must read to a stranger.** Every card on an offer page is read by a fan who
has never heard the rung names. No process diagrams (a "Sampler, Archive pack, Winning
project" timeline was cut on 2026-09-28 for exactly this), no internal words. Show the real
thing instead: project cards with `artUrl` set to the album covers as served from the
artist's page.

## 4. Verify what a fan will see

- `curl -s https://thecrwn.app/<slug>` returns 200 and contains the Bronze and Gold promises.
- The drop funnel is a DRAFT: anonymous requests get the 404 page (status 200 is Next
  streaming it; check the body, not the code). Only the artist can preview it signed in.
- When the vote is live, check it from the server-rendered HTML (`curl` the ballot link): the
  headline, `Listen, then tap your pick`, one `aria-label="Play <song>"` per option in order, and
  every signed `/object/sign/audio/...-128.mp3?token=` link returning `206 audio/mpeg` (unescape
  `&` first or the token is clipped). Do not screenshot it from a browser without the
  `crwn_dnt` cookie (it counts as a view), and never submit a test vote with a real address: it
  creates a real user and membership only the founder may delete. The founder does the one tap test.
- **When the founder tests a vote from their own account** (they will, repeatedly), each vote
  is a real membership, a badge, a claim and a notification in the artist's inbox. Remove it:

      node scripts/remove-test-vote.mjs <artistSlug> <fanUserId>          (shows the rows)
      node scripts/remove-test-vote.mjs <artistSlug> <fanUserId> --apply  (deletes exactly those)

  It refuses anything but the synthetic free membership, so it can never delete a paid one.

## 5. Hand-offs (same commit as the build)

Add to `TODO.md`:
- **P0** if Stripe is not connected: the artist signs back in; the wizard resumes where they
  stopped, still requires ONE track and a photo, and its Stripe screen connects Connect.
  Re-running the script shows `stripe: yes` once prices are backfilled.
- **P1** for any delivery the artist's plan cannot do yet (Live listening sessions are Pro;
  the options are Pro, a `plan_feature_overrides` grant, or running it outside CRWN), and for
  the artist's team approving the tier lines in their config file.
- **On Claude's plate**: fill the vote songs and re-run when tracks arrive; open the funnel
  and flip previews from `example` to `real` as content lands.

Link every file path as a markdown link. Add a short note to
`docs/crwn-brain/32-TIER-OFFER-EXPERIENCE.md` naming the new reference config.

## Report back

Lead with what production actually held versus the brief, then the links (artist page,
draft drop page, ballot link if open), what was left out on purpose and why, and the
founder's hand-offs.
