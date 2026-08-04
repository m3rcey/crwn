# Lead Magnet Short-Form Script Writer

Write short-form "calculator" scripts that reveal how much money a named artist is
LOSING because they do not use one specific CRWN feature, then drive the viewer to a
free calculator via a comment keyword. These are calm, plain-English, talking-head
narration scripts (Josh to camera), NOT the AAVE paper/sharpie reels that
`/crwn-shortform` produces. The chosen **lead magnet** dictates the pain, the math,
and the keyword.

## Invocation

`/crwn-lead-magnet <lead-magnet> <artist>` or
`/crwn-lead-magnet <lead-magnet> <artist 1> | <artist 2> | <artist 3>`

- `<lead-magnet>` is one of: `share` (Share-to-Earn), `producer` (Executive Producer
  Sessions), `vault` (Vault), `worth` (Streaming Loss), `own` (Own Your Fans / Independence).
  Accept the keyword, the full name, or the comment word.
- `<artist>` is the famous artist the script is about. Multiple artists separated by `|`.
- If the lead magnet is omitted, ask which of the five (the ONLY thing to ask). Never
  ask anything else. Generate the full package for each artist in sequence.

## Output Location

Save each script to:
`/home/merce/workspace-crwn/videos/scripts/lead-magnets/[keyword]-[artist-slug].md`

- `[keyword]` is `share`, `producer`, `vault`, `worth`, `own`, or `live` (groups the folder by magnet).
- `[artist-slug]` is lowercase kebab of the artist name (`nicki-minaj`, `the-weeknd`,
  `t-pain`, `kanye-west`).
- Examples: `share-nicki-minaj.md`, `producer-drake.md`, `vault-eminem.md`.
- This folder is a distinct series from `videos/scripts/shortform/` (the numbered
  90-day calendar reels). Do NOT number these by the calendar. If a file already exists
  for that magnet+artist, append `-v2` rather than overwriting.

## Cross-Platform Audience — the overlap equation (MANDATORY wherever followers are counted)

A fan who follows the artist on two apps is ONE fan. Never add raw platform counts. Wherever a
magnet's math calls for "combined followers" (Vault, OWN, LIVE, and the all-in PLAN script),
build the audience base with this equation instead of a naive sum:

  **C = P1 + 0.4 × (P2 + P3 + ... + Pn)**

- **P1 is the artist's BIGGEST platform, counted in full** (those people are distinct by
  definition). Every OTHER platform contributes only **40%** of its count as new people: the
  default assumption is that roughly **60%** of a smaller platform's followers already follow
  the artist on the biggest one, because the same persona attracts the same superfans everywhere.
- **Streaming monthly listeners are NEVER added, not even at 40%.** Listeners overlap followers
  in an unknowable way (this is the shipped unified model's rule). The final audience base is
  `max(C, monthly listeners)`.
- Web-verify each platform count separately (IG, TikTok, YouTube, X, Facebook). **Skip any
  platform you cannot verify** rather than guessing a number for it.
- Say the rule out loud in the script in plain words, e.g.: "A fan that follow you twice aint
  two fans. So we count his biggest app in full, and only 40% of the rest as new people."
- This equation SUPERSEDES the older "combined followers across all socials" wording in the
  magnet sections below: wherever they say combined/C, compute C with this equation.
- Worked check: Akeem Ali, 1M IG + 533K TikTok + 223K YouTube → 1,000,000 + 0.4 × 756,000 =
  1,302,400 ≈ **1.3 million**, vs 161K listeners → base stays 1.3M.

## The all-in calculator — keyword `PLAN` (added 2026-08-04)

The sixth-plus magnet: the **CRWN Opportunity Calculator** (`/tools/opportunity-calculator`),
invoked as `all-in` / `plan` / `opportunity`. It models the WHOLE business at once and its math
MUST mirror `src/lib/opportunity/unifiedModel.ts` (expected scenario) exactly; when in doubt,
run `calculateUnifiedOpportunity()` in a throwaway vitest file and read the printed numbers.
Structure differs from the five single-loss scripts (per Josh's own edit, 2026-08-04): hook
names "[Artist] and artists like him", then "Fans LOVE [Artist]." (platform counts are NOT
spoken up top), then FOUR problem/solution pairs each with SPECIFICS but NO artist-specific
numbers (the pairs are universal; every current-income figure waits for the baseline block):
streaming "a fraction of a penny per stream and fans get nothing but a song" → the membership
ladder with named benefits: early drops, Q&As and listening sessions, video and song
commentary, vault, private posts, behind the scenes, direct line; fans promoting free →
Share-to-Earn; watch-only fans who "cant pitch a beat, cant
throw a hook idea, cant add they vocals" → Executive Producer Sessions where top members pitch
while the song gets made; free promo-only lives that vanish when they end → Live Experiences:
an intimate Tiny Desk-style paid stream with real-time shoutouts between songs, tips all night,
pulling a fan up on screen face to face, and the recording there for everyone who paid. The
LIVE magnet's no-fabrication rule applies here too: the replay is INCLUDED with the ticket or
membership, NEVER spoken as a separate replay purchase), then "Let's run it." opens the
breakdown WITH the platform counts
and the overlap equation spoken plainly, then a counts-only breakdown including the per-tier
headcounts ("Like 6,800 of em pay $10..."), with ALL dollar subtotals WITHHELD (fan counts and
prices may be spoken; computed dollars may not; the exception is the CURRENT-income baseline
since it is money he makes NOW: the WHOLE baseline including streaming ≈ 1 cent per monthly
listener goes AFTER the breakdown, NEVER inside the problem/solution pairs, as the held setup
right before the tension line: "remember: He got like 161,000 monthly listeners on Spotify.
That's only like $1,600 a month. But he makes money from touring and selling merch... So all
in, call it like $22,000 a month, which is like $264,000 a year. Hold that number." Touring
and merch get hedged round estimates only IF the artist verifiably tours/sells merch), then the
tension line ("When you add all this up, the amount he's missing out on is CRAZY."), then the
Sidenote opening "Before I reveal the big number here's a sidenote:", naming "[Artist] OR an
artist operating on his level", and CARRYING the tag CTA inside it ("Tag [Artist] or an artist
LIKE him in the comments so they can see this.") before "ANYWAY...", then a paragraph break,
the single total reveal, then the callback to the held baseline stating how many times MORE
total money he would have ((reveal + baseline) ÷ baseline, e.g. "over 11 times the money he got
now"), the disclaimer, the turn ("BUT, the bigger question is this...how much are independent
artists operating on his level (im talking to YOU) how much are you missing out on?"), CTA
(comment **PLAN**). The problem/solution block flows straight into "Let's run it." with just a
paragraph break, no bridge line between them. Never state touring/merch estimates as reported figures; they are "say/like" hedged
illustrations, and the reveal is never reduced by them (CRWN does not replace the road or the
merch table). Voice is the urban conversational register
from `/crwn-shortform`, not the neutral voice the five scripts above use. Reference script:
`plan-akeem-ali.md` (Josh-edited; copy its beats).

## The Five Lead Magnets (pick ONE per script; it drives everything)

Each magnet answers a different loss. Loss-framing is mandatory (see CLAUDE.md): lead
with what the artist LOSES by not doing it, never what they gain.

### 1. Share-to-Earn Calculator — keyword `SHARE`

- **Loss:** the artist's fans have no way to make money from bringing them new PAID
  members, so all that fan word-of-mouth dead-ends at streams that pay almost nothing.
- **CRWN capability shown (Group C):** share-and-earn referral. Each fan gets a personal
  share link and earns a recurring cut (~10%) for every subscriber they bring, for as
  long as that person stays a member. Fans become a paid street team.
- **Math (state every step out loud, one number per line):**
  1. Instagram followers (F).
  2. Only **3%** would share if they got paid → `0.03 × F` sharers.
  3. Each sharer reaches only **20** new people/month → `× 20` new people reached.
  4. Only **2%** of those join the paid monthly membership → `× 0.02` new members.
  5. Each member pays just **$10/month**.
  - **Monthly loss = F × 0.03 × 20 × 0.02 × 10 = F × 0.12.** Yearly = `× 12` (= F × 1.44).
  - Worked check: Nicki 224M → 6.7M share → 134M reached → 2.7M members → **$26.9M/mo,
    $322.6M/yr.** Beyoncé 300M → **$36M/mo, $432M/yr.**
- **Signature beat (Share only):** the Kai Cenat / clipping analogy. Streamers already
  turn fans into clippers, but clippers get paid per VIEW, and "a view may pay once, a
  paid member can pay every month."

### 2. Executive Producer Session Calculator — keyword `PRODUCER`

- **Loss:** fans can only WATCH the artist make music (free stream/Twitch). They cannot
  pitch a beat, submit vocals, suggest a hook, or take part, so paid seats to the process
  go unsold.
- **CRWN capability shown (paid live sessions):** private, ticketed live studio sessions
  ("Executive Producer Sessions") on CRWN's native livestream (LiveKit, tier-gated, with
  a guest "stage" role). Fans pay to join, pitch, and watch the song get made live while
  the artist keeps full creative control. Works at any size, no catalog needed.
- **Math:**
  1. Instagram followers (F).
  2. Only **0.3%** buy a seat each month → `0.003 × F` fans.
  3. Seat **price scales to stature** (see below).
  4. "Roughly two sessions each month" is NARRATIVE framing only, NOT a multiplier.
  - **Monthly loss = F × 0.003 × seatPrice.** Yearly = `× 12`.
  - Seat price bands: **$200** for solid stars (~5–25M), **$300** for large (~19–60M),
    **$400** for the very biggest (~65M+ or "one of the biggest in the world").
  - Worked check: T-Pain 5.5M → 16,500 → $200 → **$3.3M/mo, $39.6M/yr.** Drake 140M →
    420,000 → $400 → **$168M/mo, >$2B/yr.** Kendrick 19M → 57,000 → $300 → **$17.1M/mo.**
- **Optional 2-part split:** the reference set splits this magnet into two ~30s clips.
  Part 1 ends right after "let's assume only 0.3% of his audience buys a seat each month."
  Part 2 opens on "That is about [N] fans." Note the split point in the file; the stored
  SCRIPT is the full thing.

### 3. Vault Calculator — keyword `VAULT`

- **Loss:** years of unreleased work (unreleased songs, old demos, voice notes, iPhone
  notes, written lyrics, early drops) sit locked on a phone/hard drive. Fans would pay to
  unlock it. A "Vault" is a paid place for exactly that.
- **CRWN capability shown (Group B):** the Vault, a tier-gated paid space where an artist
  safely shares unreleased songs, demos, voice notes, iPhone notes, lyrics, early drops,
  and private content with paying fans.
- **Math (use COMBINED followers across all socials, not just Instagram):**
  1. Combined followers across IG/X/TikTok/YouTube/Facebook (C).
  2. Only **1 out of every 10,000** followers pays for access → `C / 10,000` fans.
  3. Each pays **$10/month**.
  - **Monthly loss = C × 0.0001 × 10 = C × 0.001** (i.e. **$1 per 1,000 followers**).
    Yearly = `× 12`.
  - Worked check: Ye 65M → 6,500 → **$65K/mo, $780K/yr.** Lil Wayne 118M → 11,800 →
    **$118K/mo, $1.4M/yr.** Nas 7M → 700 → **$7K/mo, $84K/yr.**
- **Signature beat (Vault only):** hold the total, then "how much money is sitting on YOUR
  hard drive?" / "on your phone and hard drive?" Close on the artist's own catalog age
  ("over 20 years", "over 30 years", "decades") to make the buried-work number feel real.

### 4. Streaming Loss Calculator — keyword `WORTH`

- **Loss:** the artist leans on streaming, which pays a fraction of a cent per play, instead
  of giving fans direct ways to pay (paid memberships + special content). The direct-support
  money dwarfs the streaming money, several times over.
- **CRWN capability shown (Group B/E):** paid memberships (Free + tiers), special content,
  fan events, and direct fan access.
- **Math (state each step; numbers are illustrative, keep the reference's rounding):**
  1. Monthly Spotify listeners → streaming income ≈ **one cent per monthly listener**
     (e.g. 68M listeners ≈ $710k/mo). This is the small baseline to beat.
  2. Instagram followers → only **15%** reachable → `× 0.15` fans.
  3. Only **3%** of those would pay directly → paying supporters.
  4. Split the supporters across three memberships: **~80% at $10, ~15% at $25, ~5% at
     $100**, plus a little **special content** each month.
  - **Monthly loss ≈ (supporters split × prices) + special content**, which lands at a
    figure several times the streaming income. Yearly = `× 12`. Also state the multiple
    ("about 6 times his streaming money"). Worked check: Kendrick 44M IG → 6.6M reach →
    198k supporters (158k/$10, 30k/$25, 10k/$100) → **$4.3M/mo, ~$52M/yr, ~6x streaming**.
    Beyoncé 300M IG → 45M reach → 1.35M supporters → **$29M/mo, $350M/yr, ~47x**.
- **Signature beat:** the closer contrasts the direct total against streaming ("that is
  about N times his estimated monthly streaming money"), then turns to "how much are YOU
  leaving on the table BEYOND streaming?" CTA: free **Streaming Loss Calculator**, comment
  **WORTH**.

### 5. Own Your Fans / Independence Calculator — keyword `OWN`

- **Loss:** the artist's entire audience lives on platforms the artist does not control (the
  distributor, streaming apps, social apps). Any one can change owners, change payouts, or
  change what fans see, and the artist owns almost none of the people who made their career.
  They rent them. A platform change can erase a chunk of the business overnight.
- **CRWN capability shown (owned relationship, LIVE today):** the owned fan CRM: real contacts
  (names, emails, phones the artist keeps), free + paid memberships that turn followers into
  members, and direct messaging. The fans live with the artist, not the platform. Do NOT promise
  a data-export button in the script (not confirmed shipped); the fix is owning the relationship.
- **News hook (REQUIRED, and it must be honest and specific):** the timely reason this matters is
  the DistroKid acquisition. **Name the firm and the distributor explicitly: CVC signed to acquire
  a majority stake in DistroKid; Insight Partners keeps a minority stake; expected to close in the
  third quarter of 2026.** Use it as context, never as a villain, and never claim the featured
  artist uses DistroKid. **NO time-specific words** ("this week", "recently", "just", "today"):
  the video is evergreen and has no known air date. Say "A private equity firm, CVC, has agreed to
  buy a majority stake in DistroKid" with no time marker.
- **Math (use COMBINED followers across all socials, like Vault):**
  1. Combined followers across IG/X/TikTok/YouTube (C).
  2. Only **20%** could realistically become contacts the artist OWNS → `C × 0.20` ownable fans.
  3. Only **3%** of those owned fans would pay directly → `× 0.03` paying supporters.
  4. Each pays **$10/month**.
  - **Monthly loss = C × 0.20 × 0.03 × 10 = C × 0.06** (i.e. **6 cents per follower/month**).
    Yearly = `× 12`. This mirrors the code adapter (`ownYourFans`) exactly.
  - Worked check: Russ 12M combined → 2.4M ownable → 72,000 pay → **$720K/mo, $8.64M/yr.**
    Drake 150M combined → 30M ownable → 900,000 pay → **$9M/mo, $108M/yr.**
- **Signature beat (OWN only):** the rented-vs-owned turn. "These are fans you OWN. Not fans an app
  is renting to you." Close the personal turn on "how much of YOUR career is sitting on apps that
  could change owners tomorrow?"
- **CTA:** free **Own Your Fans Calculator**, comment **OWN**.

### 6. Live Experience Calculator — keyword `LIVE`

- **Loss:** the artist only goes live to promote a release. They pull up for a few minutes,
  thank everybody, and disappear for weeks. Every stream is free, unticketed, and gone the
  second it ends, so there is nothing to buy, nothing to unlock, and no reason for a fan to
  clear their night for the next one.
- **CRWN capability shown (all LIVE today):** scheduled live sessions with a **ticket price**,
  **tip goals** the room funds together during the stream ("$500 unlocks the unreleased song"),
  and the stream **recording itself** so the replay is there for the members who paid.
- **DO NOT promise, in the script or the math: standalone post-show replay sales, or brand
  sponsorship of a live.** Neither is built. The replay exists, but it comes WITH the ticket
  or the membership; there is no separate "buy the replay for $10" checkout. Naming either one
  sends the artist looking for a button that is not there.
- **Math (use COMBINED followers across all socials, like Vault and OWN):**
  1. Combined followers across IG/X/TikTok/YouTube (C).
  2. Only **15%** are actually reachable → `C × 0.15` reachable fans.
  3. Only **1%** of reachable fans buy a **$15** ticket to one exclusive live a month.
  4. About **1 in 4** people in the room tips, averaging **$5**.
  - **Monthly = (C × 0.15 × 0.01 × 15) + (C × 0.15 × 0.01 × 0.25 × 5) = C × 0.0225 + C × 0.001875**
    ≈ **C × 0.0244** (about **2.4 cents per follower/month**). Yearly = `× 12`.
    This mirrors the code adapter (`liveExperience`) exactly.
  - Worked check: SZA 25M combined → 3.75M reachable → 37,500 tickets = **$562,500**, plus
    9,375 tippers × $5 = **$46,875** → **about $609K/mo, $7.3M/yr.**
- **Signature beat (LIVE only):** the live Tiny Desk turn. Describe the event they are NOT
  putting on: a stripped-down set, the story behind each song, questions answered live,
  unreleased music, and the room tipping to unlock what happens next.
- **CTA:** free **Live Experience Calculator**, comment **LIVE**.

## Script Skeleton (shared; the magnet fills the slots)

Keep the reference structure. Roughly 150–260 spoken words (Share/Vault ~150–220;
Producer runs longer and can split). Order:

1. **Hook question** — "How much money could [Artist] be missing/losing/leaving on the
   table because [the loss, in the magnet's own words]?" Always a question, always
   loss-framed, always names the artist in sentence 1.
2. **"Let's look at the numbers." / "Let's break it down." / "Let's run the numbers."**
3. **The setup** — what the fans already do (share, clip, watch, spread) and why it
   dead-ends (streams pay very little / fans can only watch / work stays locked away).
4. **The better way** — name the model plainly (paid monthly membership / Executive
   Producer Sessions / a Vault) and what fans get for it.
5. **The walk-through** — the magnet's math, ONE number per line, each line a short
   sentence. State every assumption and label it conservative ("let's keep this low",
   "only 3%", "just 0.3%", "one in 10,000").
6. **Signature beat** — Share: the Kai Cenat clipping analogy. Producer: "not just for
   big artists, no catalog needed." Vault: catalog age + "hold the total for a second."
7. **The CRWN Sidenote** — the ONLY CRWN mention in the body, delivered as an aside:
   "Sidenote: [the exact feature] is exactly what an artist can build on the CRWN app.
   ANYWAY..." Keep the literal "Sidenote:" open and "ANYWAY..." close.
8. **The total** — "[Artist] could be missing about **$X each month** and about **$Y each
   year** because [restate the loss]." Bold the two figures.
9. **The disclaimer** — "The real number may be higher or lower. This is a plan, not a
   promise." (Verbatim; it keeps the claim honest.)
10. **The turn** — "BUT... how much money could YOUR fanbase be leaving on the table?"
11. **The CTA** — "I built a free [Calculator name]. Comment "[KEYWORD]" and I'll DM you
    the link." Keyword is `SHARE` / `PRODUCER` / `VAULT` to match the magnet.

## Voice & Style (different from /crwn-shortform — read this)

- **Plain, calm, neutral English.** NOT AAVE. These are patient "here are the numbers"
  explainers, not hype reels. Josh reads them straight to camera.
- **5th-grade reading level.** Short words, short sentences. No sentence over ~15 words.
- **Never use em dashes** anywhere (CLAUDE.md rule). Rewrite with a comma, colon, or two
  sentences.
- **Loss-framed throughout** (missing / losing / leaving on the table), never gain-framed.
- Numbers as digits with the reference's rounding ("$26.9 million", "about 6.7 million",
  "$3.3 million"). Keep the friendly "about / roughly / only / just" hedges.
- Refer to any artist as **they/them** in your own notes; in-script, use the artist's
  publicly-known pronouns as the reference scripts do.
- **Do the arithmetic on every line before saving.** F × 0.12 (share), F × 0.003 × seat
  (producer), C × 0.001 (vault). If the followers and the total do not multiply out, one
  of them is wrong. Fix it so the monthly, the yearly (× 12), and every intermediate
  count (sharers, reach, members / seats / vault fans) are internally consistent.

## Fact Check (before drafting AND before saving)

Follower counts move constantly. **Web-search the current Instagram follower count** (and
for Vault, the combined cross-platform total) for each artist before locking the math.
Do not trust memory. If a count is uncertain, use "roughly / about" and a round number.
Do not invent a follower figure. Re-run every multiplication after you set the count.

## Nano Banana image prompt (one per script)

Each script gets ONE paper/sharpie hero image in the established CRWN style. **The
Story-First Composition rules in `/crwn-image-gen` GOVERN this image.** Study the channel's
best posts before building a prompt (Berner "what did Berner build", Mariah "label torch",
Ice Cube "paid for the hits"). Match that bar on all five points below. The Nicki drafts
failed several of these, do not repeat them.

1. **Header = the hook QUESTION, LOSS-FRAMED, ≤40 characters, hand-lettered huge at the
   top.** Never a category label ("SHARE-TO-EARN"), never gain/neutral framing ("WHAT ARE
   X'S FANS WORTH?", "WHAT DOES X MAKE?"). Name the LOSS. Consistent pattern
   `WHAT'S [SHORT] LOSING [reason]?`:
   - Share: `WHAT'S [SHORT] LOSING ON UNPAID FANS?`
   - Producer: `WHAT'S [NAME] LOSING NOT ALLOWING FAN INPUT ON MUSIC?`
   - Vault: `WHAT'S [SHORT] LOSING ON LOCKED MUSIC?`
   - Streaming: `WHAT'S [SHORT] LOSING RELYING ON STREAMS?`
   - Own: `WHAT'S [SHORT] LOSING ON RENTED FANS?`
   Use the artist's SHORT name (Nicki, Ye, Drake). Prefer ≤40 chars, but Josh has approved
   longer headers (producer/streaming run 42-51) when they read clearer; the prompt tells
   the model to wrap the header across 2-3 lines, which renders fine in the paper style.
2. **WITHHOLD THE PAYOFF. Never put the computed loss total on the image.** The dollar
   answer ($26.9M/month, etc.) is the video's payoff; showing it kills the reason to watch.
   The channel's images hint and withhold: Berner shows a cash bag with NO number, Mariah
   shows the inputs but never the total torched, Ice Cube shows "3,000,000 SOLD" huge and
   the shameful "$32K" tiny. Do the same: setup/input facts can show; the final total never
   does. Pose the gap with a single "$?" on the cash, nothing more. (The SCRIPT still
   reveals the number out loud, that is the spoken payoff. Only the IMAGE withholds it.)
3. **The artist is the BIGGEST element on the page** — a full or near-full-length
   recognizable figure filling roughly HALF the frame, performing one vivid action. Not a
   mid-size half-figure, not a stick figure, not dwarfed by text.
4. **~1/3 of the page is solid black, for strong contrast.** Fill the artist's clothing,
   hair, a large object (cash bag / vault / record pile), and a dense crowd with heavy
   hand-colored black. The reference images are roughly a third black; thin line-art on
   white reads sparse and weak. Paper background still stays pure white.
5. **One dramatized scene + expressive secondary cartoon or crowd**, plus a tidy left-side
   column of input hints AND two or three small supporting script facts scattered in the
   open space (setup/contrast lines, like the Mariah "1 ALBUM DELIVERED / 4 ALBUMS LEFT" or
   Ice Cube "3,000,000 SOLD / TOUR $650K" annotations). **NEVER the CRWN app and NEVER a
   dollar total.** **No bottom takeaway/lesson line** (Josh cut it). Use the free real
   estate so the page feels full like the reference posts, but the artist still dominates.

Template (fill the brackets; keep the exact first and last sentences):

```
Flat scan of a white sheet of paper filling the entire frame. No desk, no surface, no edges visible, just white paper. Black sharpie marker handwriting and clean bold hand-drawn comic line art with heavy solid-black fills, so that roughly a third of the page is solid black for strong contrast (the artist's clothing and hair, a large object, and a dense crowd), while the paper background stays pure white. At the very top, the hook as large hand-lettered black sharpie capitals, 40 characters or fewer (thick uneven hand-drawn marker strokes, NOT a printed, bold, or display font): "[HOOK QUESTION]". [ONE DRAMATIZED HERO SCENE. The artist is the single LARGEST element on the page, a full or near-full-length recognizable figure filling roughly half the frame, dressed in heavy solid black, performing the action]. Down the left side, hand-letter this short stack of small notes, one per line, each appearing exactly once: [DATA COLUMN]. Do NOT write or reveal the total dollars lost anywhere on the page; that final number is the video's payoff and must be withheld, use only a single small "$?" on the cash to pose the question. In the open space around the scene, hand-letter these short notes, each appearing exactly once and tucked in tidily so they do not crowd the artist: [SUPPORTING FACTS]. Render only the exact words given inside quotation marks; never draw any instruction words, labels, or parentheses from this prompt, and never repeat a line. Do NOT add a bottom takeaway or lesson line. The artist is the biggest thing on the page; keep everything else small and uncluttered. The artist is a recognizable portrait in bold black sharpie line work (not photo-real, not a stick figure); any secondary characters are expressive simple cartoons. Solid black fills look hand-colored with visible directional marker streaks. The background is pure white (#FFFFFF). The image is shot perfectly straight on, no angle, no shadow, no background elements. Pure white paper fills the entire 3:4 frame edge to edge.
```

Per-magnet hero scene + column + takeaway:
- **Share** (loss: fans could bring paid members but have no reason to, so the money is
  never made): hero = the artist drawn very large, full-length in a heavy solid-black
  outfit, gesturing at a big dense crowd of fans behind them drawn as a heavy black mass
  curving into the distance (the untapped street team); the nearest fan holds up a glowing
  "SHARE" phone; a fat cash bag beside the artist marked only "$?". Label the crowd once,
  small: "[FANBASE]".
  column = "[F] FOLLOWERS / 3% WOULD SHARE / x20 REACH / 2% JOIN / $10 A MONTH".
  supporting facts = "STREAMS PAY PENNIES", "A VIEW PAYS ONCE. A MEMBER PAYS MONTHLY.",
  "MEMBERS GET NEW MUSIC + EARLY DROPS + PRIVATE POSTS".
- **Producer** (loss: fans watch free, can't pay in): hero = the artist drawn very large,
  full-length in heavy solid black at a mixing board wearing headphones; behind a glass
  studio wall a dense black crowd of fans presses in waving cash, held back by a shut door
  marked "STUDIO" with a small sign "SEATS $[SEAT]" and "0 SOLD"; a cash bag by the door
  marked only "$?".
  column = "[F] FOLLOWERS / 0.3% BUY A SEAT / [FANS] FANS / $[SEAT] A SEAT".
  supporting facts = "FANS CAN ONLY WATCH", "THEY CANT PITCH A BEAT OR ADD VOCALS",
  "WORKS AT ANY SIZE, NO CATALOG NEEDED".
- **Vault** (loss: unreleased work locked on a hard drive): hero = the artist drawn very
  large, full-length in heavy solid black, standing beside a giant solid-black locked safe
  marked "VAULT" with a big padlock, overflowing with cassette tapes, a hard drive, a phone
  reading "VOICE NOTES" and lyric sheets; a line of fans waits at the locked door holding
  up "$10" bills; a cash bag locked inside marked only "$?".
  column = "[C] FOLLOWERS / 1 IN 10,000 PAY / [FANS] FANS / $10 A MONTH".
  supporting facts = "[TENURE] OF UNRELEASED WORK", "DEMOS, VOICE NOTES, iPHONE NOTES, LYRICS",
  "FANS WOULD PAY TO UNLOCK IT" (TENURE = 20+ YEARS / 30+ YEARS / DECADES per artist).
- **Own Your Fans** / OWN (loss: the whole audience lives on apps the artist does not control):
  header = "WHAT'S [SHORT] LOSING ON RENTED FANS?". hero = the artist drawn very large,
  full-length in heavy solid black, in the foreground clutching a single glowing phone to their
  chest marked "MY FANS", reaching back toward a big dense black crowd of fans trapped behind a
  tall solid-black brick wall with a locked gate and a heavy chain; a fat cash bag sits on the far
  side of the wall with the crowd, marked only "$?". Label the wall once, small: "RENTED APPS".
  column = "[C] FOLLOWERS / YOU OWN 0 / 20% OWNABLE / 3% PAY / $10 A MONTH".
  supporting facts = "YOUR AUDIENCE LIVES ON RENTED LAND", "ONE OWNER CHANGE CAN ERASE IT",
  "OWN THE FANS, NOT JUST THE FOLLOWERS".
- **Live Experience** / LIVE (loss: only goes live to promote, so every stream is free,
  unticketed, and gone when it ends): header = "WHAT'S [SHORT] LOSING GOING LIVE FOR FREE?".
  hero = the artist drawn very large, full-length in heavy solid black, mid-performance on a
  stool with a mic, singing to ONE small camera on a tripod; behind the camera a big dense black
  crowd of fans is held back behind a rope line, the nearest few holding up bills marked "$15";
  a fat cash bag sits on the crowd's side marked only "$?". Label the rope once, small: "NO TICKET".
  column = "[C] FOLLOWERS / 15% REACHABLE / 1% BUY A TICKET / $15 A TICKET / 1 IN 4 TIPS $5".
  supporting facts = "A FREE STREAM SELLS NOTHING", "ONE NIGHT, ONE TICKET, ONE ROOM",
  "THE ROOM TIPS TO UNLOCK THE SONG".
- **Streaming Loss** / WORTH (loss: leans on streaming pennies instead of direct paying
  fans): header = "WHAT'S [SHORT] LOSING RELYING ON STREAMS?". hero = the artist drawn very large,
  full-length in heavy solid black, stepping AWAY from a lone small coin on the ground marked
  just "STREAMS" (dwarfed by the crowd) toward a big dense black crowd of paying supporters,
  the nearest few holding up bills marked "$10", "$25" and "$100"; a fat cash bag by the
  crowd marked only "$?" (the withheld direct total). Keep the streaming dollar figure ONLY
  in the left column (once), not on the coin; NEVER show the direct total.
  column = "[LISTENERS] LISTENERS / STREAMS $[STREAMK]/MO / [IG] FOLLOWERS / 15% REACHED / 3% PAY".
  supporting facts = "STREAMS PAY A FRACTION OF A CENT", "FANS PAY $10, $25, $100 A MONTH",
  "PLUS SPECIAL CONTENT".

Non-negotiables (from `/crwn-image-gen`): every character hand-drawn sharpie, NEVER
typeset; write the headline as "large hand-lettered black sharpie capitals (thick uneven
hand-drawn marker strokes, NOT a printed, bold, or display font)"; solid fills look
hand-colored with marker streaks; pure white #FFFFFF; 3:4 vertical. The pipeline
auto-fetches the artist's face ref from `known-people.json` and binds a portrait directive,
so name the artist in the prompt (do NOT `skip-people`).

## Generating the image

Reuse the existing pipeline verbatim. Write the prompt(s) into
`/home/merce/workspace-crwn/generate-images.mjs` (3:4, `responseModalities:["IMAGE"]`,
style + person refs as that script already does) and run:

`bash -c 'source /home/merce/workspace-crwn/load-env.sh; node generate-images.mjs'`
(timeout 600000). Output filename `[keyword]-[artist-slug].jpg`, saved flat in
`/mnt/c/Users/Josh/Dropbox/nano banana output/Shortform Posts/`. 8s delay between
requests. If the artist is not yet in `known-people.json`, add them (slug, Brave search
query, Wikipedia page, aliases) before running. Retry once on failure; if it still fails,
print the full prompt so it can be pasted manually.

## Stored file format

```
# [ARTIST] — [Lead Magnet Name]

**Lead magnet:** [Share-to-Earn | Executive Producer Sessions | Vault] · **Comment keyword:** [SHARE|PRODUCER|VAULT]
**Followers used:** [F or combined C, with source/date]
**Math:** [the one-line formula with the artist's numbers]
**Loss:** ~$[X]/month · ~$[Y]/year

---

**CAPTION:**

[One loss-framed line + comment CTA, e.g. "Your fans have no reason to share you. Comment SHARE and I'll DM you the free Share-to-Earn Calculator."]

---

**SCRIPT:**

[The full spoken script, top to bottom, following the skeleton.]

---

**NANO BANANA PRO PROMPT:**

[The full 3:4 hero prompt.]

---

**NOTES:** [split point if Producer; any hedged/uncertain facts to re-verify.]
```

## Workflow

1. Parse the lead magnet + artist(s). If the magnet is missing, ask which of the five.
2. For each artist:
   a. Web-verify the current follower count(s) for that magnet.
   b. Run the magnet's math; check monthly, yearly, and all intermediate counts multiply.
   c. Draft the SCRIPT on the shared skeleton in plain neutral voice, loss-framed, no em
      dashes.
   d. Build the caption (loss line + Comment KEYWORD).
   e. Build the Nano Banana hero prompt (Story-First; artist performs the loss action).
   f. Re-check every number and every fact before saving.
   g. Save to `videos/scripts/lead-magnets/[keyword]-[artist-slug].md` in the format above.
   h. Print the CAPTION + SCRIPT to chat, then a clickable markdown link to the file.
3. Only generate the image when asked (or when the user says to). Reuse the pipeline above.

## User Argument

$ARGUMENTS
