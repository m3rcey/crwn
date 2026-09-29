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
