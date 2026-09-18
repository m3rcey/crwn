# GPT-6 Calculator Bottleneck Audit: the test package

**Prepared 2026-09-18 against the working tree at `master` (production `sw.js` CACHE_NAME `crwn-v508`).**
Investigation and packaging only. Nothing in the product, the database, Stripe or the deploy was changed.
The one question this test answers:

> After watching the first five short-form videos or reading the first fifty carousel captions, what stops a
> new artist from getting a result they believe out of a CRWN calculator and carrying it into an account?

Sections: 1 what this package assumes and why, 2 founder setup before the run, 3 the copy-ready GPT-6 prompt,
4 what the report should look like, 5 design decisions the tester will flag that are NOT bugs, 6 cleanup.

The sibling package for everything after signup (setup wizard, Stripe, first paid fan) is
[docs/ASTRA_ACTIVATION_AUDIT.md](ASTRA_ACTIVATION_AUDIT.md). This one stops where that one starts.

---

## 1. What this package assumes (repo-verified 2026-09-18)

**Which content.** "The first five short-form scripts" are files 1 to 5 in
[videos/scripts/shortform/](../videos/scripts/shortform/) (Drake per-stream, Drake $2M deal, Drake 1% of 139M,
Kendrick's five Grammys, "Not Like Us"). "The first fifty carousel captions" are the first fifty entries, in air
order, of [videos/ideas/2026-06-04-instagram-carousel-captions.md](../videos/ideas/2026-06-04-instagram-carousel-captions.md)
(Jun 4 to Aug 29 2026). Both sets are embedded verbatim in the prompt because GPT-6 has no repo access. If you
meant the Fan Economy scripts ([videos/scripts/fan-economy/](../videos/scripts/fan-economy/)) or the Fan Economy
carousels, swap the two blocks in section 3; the rest of the prompt does not change.

**Where the viewer lands.** Every one of the 55 pieces ends with "Link in bio ... Free to start at thecrwn.app."
Not one names a calculator, and none carries a comment keyword, so the ManyChat DM path is out of scope for
this content. The bio link itself is an Instagram setting the repo cannot read; the prompt takes it as
`{{BIO_LINK_URL}}` and defaults to `https://thecrwn.app`, which IS the Opportunity Calculator
([src/app/HomeFunnel.tsx](../src/app/HomeFunnel.tsx) mounts the same component as
`/tools/opportunity-calculator`). The other three tools live only at `/tools/<slug>` and in the `/tools`
directory. **Whether a viewer can find Own Your Fans, the Vault planner or the demand test from the bio link is
itself the first thing under test.**

**The four calculators, as production serves them today** (source: `src/lib/leadMagnets/registry.ts`,
`PublicToolClient.tsx`, `deliverableSpecs.ts`, `continuationCta.ts`; all four are in the promoted set):

| Tool | URL | Wizard | Required | Skippable screens | Result hero | Gold CTA after result | Builder final action |
|---|---|---|---|---|---|---|---|
| Own Your Fans | `/tools/own-your-fans-calculator` | 2 screens, no review | followers, sold-before | none | "You're leaving roughly $X /mo" | "Build my fan page" | "Save my fan system" (4-step fan page builder; an A/B variant drops the preview step) |
| Opportunity Calculator | `/` and `/tools/opportunity-calculator` | 6 screens incl. review, 9 questions | followers only | owned, proof, vault, capacity | "You could build an estimated $LOW to $HIGH /mo" | "Build my CRWN plan" | "Save my CRWN plan" (5-step ladder builder) |
| Vault Revenue Planner | `/tools/vault-revenue-planner` | 6 screens incl. review, 14 questions | artist name, drop frequency | inventory, audience, positioning | **No dollar figure by design**: "{name}, your Vault is N% ready" | "Build my Vault" | "Save my Vault" (3 steps) |
| Proof of Demand Test Builder | `/tools/proof-of-demand-test-builder` | 5 screens incl. review, 7 questions | idea type, description, signal, threshold | details only | **No dollar figure by design**: "Your demand test is ready" | "Build my test" | "Save my test" (3 steps) |

Shared on all four: the result is never gated; the optional email capture ("Artist name" + "Email *" + consent
checkbox) sits inside the result hero under the gold CTA; "These are your numbers. Change an answer and
recalculate." sits under that; the builder's sticky footer ends in a push to
`/signup?tool=<slug>&ref=lead-magnet&result=<token>`; the call hand-raiser card renders ONLY on the
Opportunity Calculator (and `/worth`); the ladder section renders ONLY on the Opportunity Calculator. Production
runs email confirmation ON, so signup shows "Check Your Email" and nothing proceeds until the link is clicked.

**What the content promises, in the viewer's head.** The prompt makes GPT-6 build the full ledger itself, but
the load-bearing claims are fixed by the scripts: a fan is worth $10 a month; one fan equals 40,000 streams;
about 1% of followers would pay (video 3 works it for a 5,000-follower artist: 50 fans, $500 a month, $6,000 a
year); the label, the advance and the trophy are the loss; "Free to start". The three personas are sized so
each one can check the calculator's number against the number the video already gave them.

---

## 2. Founder setup before the run

1. **Confirm production is the code you think it is.** Open `https://thecrwn.app/sw.js` and check `CACHE_NAME`
   against [public/sw.js](../public/sw.js) in the tree you audited. The explainer video card under the
   result CTA (commit `352a71f1`) must be live or the tester will report a surface that does not exist.
2. **Pick one audit mailbox** you can log into from a browser, and give GPT-6 addresses of the form
   `<mailbox>+test-p1@gmail.com`, `+test-p2`, `+test-p3`, `+test-p4`. The `+test` marker is what the
   onboarding-reminder cron skips, and it is what the cleanup file matches on.
3. **Decide the two switches** in the run configuration: `CALL_REQUEST_ALLOWED` (the card on the Opportunity
   Calculator emails you and creates a server-scored lead; default NO) and `SUPPORT_CHAT_ALLOWED` (default YES,
   once per persona).
4. **Fill `{{BIO_LINK_URL}}`** with the exact URL in the Instagram bio today. If it is not `thecrwn.app` or a
   page on it, say so in the reply to the report, because the whole discovery phase depends on it.
5. **Record the start time** before the first page load. Anonymous event rows carry no id, so the time window
   is the only handle cleanup has on them (see section 6).
6. Do NOT waive the `crwn_dnt` hygiene step. The Astra run waived it and 56 analytics rows had to be deleted by
   hand.

---

## 3. Copy-ready GPT-6 prompt

Paste everything between the BEGIN and END lines. Replace every `{{PLACEHOLDER}}` first.

```text
=== BEGIN CALCULATOR AUDIT PROMPT ===

You are operating a real, live web application through your browser tools. You will act as three different
independent artists, one at a time, each of whom just consumed specific Instagram content and tapped the link
in the bio. You are NOT a QA engineer and NOT a developer. You never read source code, never open developer
tools except for the one hygiene step below, and never guess how the product is "supposed" to work. You learn
only from what the product shows you, plus what the Instagram content told you.

The product is CRWN (https://thecrwn.app), a fan-monetization app for independent artists. Your job is to find
every bottleneck between "I watched the video" and "I have an account with my plan in it", across four free
calculators, and to rank those bottlenecks by how many new artists they would stop.

-------------------------------------------------------------------------------
RUN CONFIGURATION (filled in by the founder)
-------------------------------------------------------------------------------
RUN_ID: {{RUN_ID}}
TIME_BUDGET: {{e.g. 4 hours}}
BIO_LINK_URL: {{the exact URL in the Instagram bio; default https://thecrwn.app}}
MAILBOX_URL: {{e.g. https://mail.google.com}}   MAILBOX_LOGIN: {{login}} / {{password}}
EMAIL_P1: {{mailbox}}+test-p1@gmail.com
EMAIL_P2: {{mailbox}}+test-p2@gmail.com
EMAIL_P3: {{mailbox}}+test-p3@gmail.com
EMAIL_P4: {{mailbox}}+test-p4@gmail.com     (spare, used only by Persona 1's second signup, see the matrix)
CALL_REQUEST_ALLOWED: {{YES or NO}}   (NO = you never press "Get a call now" or enter a phone number)
SUPPORT_CHAT_ALLOWED: {{YES or NO}}   (YES = at most one support message per persona, only when that persona would)
VIEWPORT: 390px wide, phone-shaped, for every run (Instagram traffic is a phone). If you cannot size the
   window, say so at the top of the report and run at desktop width; treat every "fits on the first screen"
   observation as NOT TESTED.

-------------------------------------------------------------------------------
THE CONTENT THESE ARTISTS JUST CONSUMED (read all of it before the first page load)
-------------------------------------------------------------------------------
Everything below is what CRWN has been posting on Instagram. A viewer who taps the bio link has just seen ONE of
the five videos or ONE of the fifty carousels, and probably several over the preceding weeks. Read it as the
audience, not as a copywriter. Your first deliverable (Task 0) is built from it.

--- THE FIRST FIVE SHORT-FORM VIDEOS (caption as posted, then the spoken script) ---

### Video 1: DRAKE $0.003 PER STREAM VS LABEL $0.007 PER STREAM

**Caption as posted:**

Drake Got Beat By His Own Label

Link in bio to turn streams into paying fans with CRWN. Free to start at thecrwn.app.

**Spoken script:**

This is what Drake makes per stream. And this is what his label makes. Drake is losing on his own song.

With every play and stream the label eats first. Yall don't see this part.

For every 10 streams, Drake earns 3 cents. His label earns 7. The label make more than the artist on they own song. A million streams sound like a lot. For Drake that's like $3,000. For the label that's $7,000. And Drake is the biggest artist in the game. What you think your numbers look like?

Here's the part labels don't want you to know about. If Drake has ownership he dont gotta share that money. When fans pay him directly the label dont get nothin.

One fan paying $10 a month is worth 40,000 streams of his catalog. Streams don't make artists rich. Fans do. Drake's whole catalog runs through a system that pays his label more than him. Streams build the label. Fans build the artist.

### Video 2: DRAKE'S FIRST DEAL: $2M ADVANCE AND 18% ROYALTIES

**Caption as posted:**

Drake Got A Loan, Not A Paycheck

Link in bio to skip the recoupment trap with CRWN. Free to start at thecrwn.app.

**Spoken script:**

What happens when you sign a $2 million record deal? Let's find out. Drake's first deal was $2M and 18%.

Free money? Nope. It's a loan. With interest that yall don't see.

The $2M is an advance. The label fronts the money. They take it back from his royalties before he sees any of it. 18% means out of every $100 the music make, Drake get $18. To recoup that $2M, his music gotta earn more than $11 million first. That's not a check. That's a debt.

This what they don't tell you. Even a deal everybody called a win is still a loan first. That $2M has to earn back before any royalty past it counts. The advance was always a debt.

Drake direct? 200,000 fans at $10 a month is $24 million a year. No recoupment no 18% or $2M to come out from. The label model say earn $11 million then get paid. The fan model say get paid first. Advances ain't a check. The fans are.

### Video 3: DRAKE'S 139M FOLLOWERS AT 1% PAYING $10/MO

**Caption as posted:**

If Drake Charged 1%, He'd Fire UMG

Link in bio to turn 1% of your followers into income with CRWN. Free to start at thecrwn.app.

**Spoken script:**

If 1% of Drake's fans paid $10 a month, then he wouldn't need a label. Yall ready for this math?

139 million people follow Drake. Most of em pay nothing. But watch what just 1% does to his bank account.

Drake got 139 million followers. We aint even talkin all of em. Just 1 out of every 100. That's 1.39 million people. Each one pays $10 a month. That's $13.9 million a month or almost $167 million a year. From his own fans. No label no deal or 18% cut.

Drake's whole record deal pays him like $80 million a year. The math of the fans is better than the math of the label. He just dont know it yet.

Yo 5,000 followers ain't 139 million. But 1% of 5,000 is 50 fans. 50 fans at $10 is $500 a month or $6,000 a year. 50 fans is real income most independent artists aint never gon see. Yea followers fill up ya screen. But the fans fill up ya wallet.

### Video 4: KENDRICK WON 5 GRAMMYS INCLUDING RECORD OF THE YEAR

**Caption as posted:**

Kendrick Won A Trophy, Not A Paycheck

Link in bio to get paid by fans, not by trophies, with CRWN. Free to start at thecrwn.app.

**Spoken script:**

Kendrick just swept the 2025 Grammys with 5 wins. Won Record of the Year too. The Grammy ain't a check though.

Yall think the Grammy comes with a bag. It dont.

A Grammy is a trophy. Not a paycheck. The Grammy comes with no check. None. The win gets you a streaming bump. The bump goes to the label first. Kendrick's per-stream rate is still pennies. Same as Drake. Same as you. The Grammy makes Interscope richer than it makes Kendrick. They get the marketing. He gets the trophy.

This what they don't tell you. Kendrick will sell more music after this Grammy. The label takes the biggest cut of all that new revenue. He won the Grammy. Interscope won the bag.

Awards bring prestige. They don't bring paychecks. Kendrick got 50 million listeners. 100,000 of em paying direct at $10 a month is $12 million a year. With or without a Grammy. The trophy sits on the shelf. The fans pay the bills.

### Video 5: HOW MUCH "NOT LIKE US" MADE AND WHO KEPT THE MONEY

**Caption as posted:**

Kendrick Wrote A Hit For Interscope

Link in bio to keep the money from your own music with CRWN. Free to start at thecrwn.app.

**Spoken script:**

Has anybody ever wondered how much "Not Like Us" actually made? Want to see who kept the bag?

The song did a billion streams. The label kept most of it. Watch the math.

More than a billion streams pays like $3 million total. Sounds like a lot. But the label takes the biggest cut. Like $2 million to Interscope. Like $1 million to Kendrick. The label takes twice what the artist takes. On Kendrick's biggest moment of the year. Add publishing. Add performance royalties. Kendrick might walk away with $1.5 million from the whole song.

This what they don't tell you. Kendrick wrote it and rapped every bar. Mustard made the beat. The label did nothing creative. But they took the bigger half.

If 500,000 of them listeners paid Kendrick $5 one time direct, that's $2.5 million. Same diss, no Interscope split. Labels eat off the hits. Fans feed the artist.

--- THE FIRST FIFTY CAROUSEL CAPTIONS, IN AIR ORDER ---

### Caption 1 (air date Thu Jun 4 2026, carousel 9, 9-1-fan-equals-40000-streams)

1 Fan Beats 40,000 Streams.

Everyone's chasing 100K monthly listeners.
100K listeners is 2 paying fans worth of income.
Plays make the platform money. Fans make you a living.

Link in bio to flip the metric from plays to paying fans with CRWN. Free to start at thecrwn.app.

### Caption 2 (air date Fri Jun 5 2026, carousel 11, 11-drake-streaming-vs-payout)

Drake Has 80M Listeners And Gets Paid Like A Day Job.

Spotify pays around $15M a year after splits.
80M listeners. That's 18 cents per fan per year.
Streaming pays in volume. Direct pays in depth.

Link in bio to turn your listeners into real income with CRWN. Free to start at thecrwn.app.

### Caption 3 (air date Sat Jun 6 2026, carousel 12, 12-drake-200k-fans-vs-streaming)

Drake Could Make $24M From 200K Fans.

He earns around $15M a year from Spotify after splits.
If just 0.25% of his 80M listeners paid $10 direct, he keeps $24M.
Same artist. Same audience. Different check.

Link in bio to do the same math on your own audience with CRWN. Free to start at thecrwn.app.

### Caption 4 (air date Sun Jun 7 2026, carousel 13, 13-kanye-gamma-distribution-deal)

Kanye Signed Distro Not A Record Deal.

A record deal means the label owns your masters.
A distro deal means you keep your masters. Gamma takes around 15% to push the music. Kanye keeps the rest.
Gamma is a vendor, not a boss.

Link in bio to keep your masters while you grow with CRWN. Free to start at thecrwn.app.

### Caption 5 (air date Thu Jun 11 2026, carousel 15, 15-distribution-deal-explained)

Distribution Deal Explained With Kanye And Gamma.

Record deals trade ownership for budget.
Distro deals trade budget for ownership.

Link in bio to skip a record deal and still reach fans with CRWN. Free to start at thecrwn.app.

### Caption 6 (air date Fri Jun 12 2026, carousel 18, 18-same-fan-333x-more-money)

Same Fan. 333x More Money.

Streaming was built to sell a million fans cheap.
Direct was built to sell one fan deep.

Link in bio to turn one true fan into real monthly income with CRWN. Free to start at thecrwn.app.

### Caption 7 (air date Sat Jun 13 2026, carousel 20, 20-kendrick-pglang-explained)

Kendrick Built A Company, Not A Label.

pgLang has one recording artist, Baby Keem. And that is a joint venture with Columbia, not a label deal.
Kendrick and Dave Free run it. Films, ads, albums, tours. One team, many products.
A label owns the artist. A company partners with the artist.

Link in bio to build a company around your music with CRWN. Free to start at thecrwn.app.

### Caption 8 (air date Sun Jun 14 2026, carousel 21, 21-masters-jay-z-roc-a-fella)

Jay-Z Fought 20 Years For His Masters.

A master is the recording itself, not the song.
Roc-A-Fella sold to Def Jam in 2004. The masters went with it.
Every time Hard Knock Life plays, Def Jam eats. Not Jay.
He spent decades and paid more to buy it back than he made selling it.

Link in bio to own your masters from day one with CRWN. Free to start at thecrwn.app.

### Caption 9 (air date Thu Jun 18 2026, carousel 24, 24-fans-spend-150-monthly)

Your Fan Spends $150 A Month On Music.

Concerts. Merch. Streaming. Vinyl. Tips.
Streaming is around $11 of that. Your cut is pennies.
The other $139 walks past you to somebody else.
Direct from one fan at $15 a month is $180 a year. No middleman.

Link in bio to get on your fan's full music budget with CRWN. Free to start at thecrwn.app.

### Caption 10 (air date Fri Jun 19 2026, carousel 27, 27-publishing-mase-bad-boy)

Mase Got $20K For 24 Years Of Hits.

Publishing is the money the song itself makes.
Radio, movies, samples. All of it pays whoever owns the publishing.
Bad Boy held Mase's publishing for 24 years. He said his total upfront was $20,000.

Link in bio to keep your publishing and own the song with CRWN. Free to start at thecrwn.app.

### Caption 11 (air date Sat Jun 20 2026, carousel 29, 29-drake-advance-vs-50k-fans)

Drake's $40M Advance Vs 50K Fans.

His UMG deal reportedly pays around $40M per album as an advance. Recoupable. A loan.
50,000 fans at $10 a month is $6M a year direct. None of it paid back.
Three years of fan income beats the advance.

Link in bio to turn 50K fans into a $6M year with CRWN. Free to start at thecrwn.app.

### Caption 12 (air date Sun Jun 21 2026, carousel 33, 33-advance-trinidad-james)

Trinidad Got A $2M Deal And Still Owed Money.

Reports say only around $500K was upfront. Another $500K was a recording budget. The rest tied to albums he hadn't made.
Every video, studio session, flight, promo run came out of that money.
Def Jam dropped him by 2014. The debt didn't.

Link in bio to make income that you actually own with CRWN. Free to start at thecrwn.app.

### Caption 13 (air date Thu Jun 25 2026, carousel 34, 34-big-sean-missing-millions)

Big Sean Said Millions Went Missing.

Platinum records. Hit features. Sold-out tours.
Under GOOD Music, the royalty numbers didn't add up. He had to lawyer up to see what his own music made.
Under a label deal you see a statement. Written by the same people counting the money.

Link in bio to see every dollar your fans pay you with CRWN. Free to start at thecrwn.app.

### Caption 14 (air date Fri Jun 26 2026, carousel 36, 36-content-vs-offers)

Content Builds Crowds. Offers Pay You.

Reels, shorts, freestyles, posts. That builds attention.
Attention doesn't pay bills.
The offer (a tier, a track, a bundle, a presale) is what turns the crowd into a check.
Most artists got one without the other.

Link in bio to turn your content crowd into paying fans with CRWN. Free to start at thecrwn.app.

### Caption 15 (air date Sat Jun 27 2026, carousel 39, 39-360-deal-drake-umg)

A 360 Deal Takes Everything Drake Earns.

Regular deals take a cut of music sales and streams. That's it.
360 deals take a cut of tours, merch, brand deals, sponsorships, acting.
Reports say Drake's UMG contract is a 360. Every dollar shared, not just the music.

Link in bio to keep tour merch and brand money for yaself with CRWN. Free to start at thecrwn.app.

### Caption 16 (air date Sun Jun 28 2026, carousel 42, 42-chris-brown-direct-to-consumer)

Chris Brown Broke The Industry.

His album is on Spotify (RCA collects). The same album is $55 vinyl direct on brown.live.
One vinyl sale equals 18,000 streams in money.
10,000 fans buying one is 180 million streams worth.
Streaming is the ad. The shop is the business.

Link in bio to open the shop your fans walk to with CRWN. Free to start at thecrwn.app.

### Caption 17 (air date Thu Jul 2 2026, carousel 43, 43-frank-ocean-endless-def-jam-trick)

Frank Ocean Tricked His Label Into Freeing Him

Link in bio to own your music from day one instead of buying it back with CRWN. Free to start at thecrwn.app.

### Caption 18 (air date Fri Jul 3 2026, carousel 46, 46-the-weeknd-built-a-year-before-signing)

The Weeknd Built A Year Before A Label Touched Him

Link in bio to build the audience that's actually yours with CRWN. Free to start at thecrwn.app.

### Caption 19 (air date Sat Jul 4 2026, carousel 49, 49-50-cent-grodt-12m-what-interscope-kept)

50 Cent Sold 12M. The Label Kept The Bigger Share.

Link in bio to keep the bigger share of what you sell with CRWN. Free to start at thecrwn.app.

### Caption 20 (air date Sun Jul 5 2026, carousel 50, 50-50-cent-vitamin-water-equity-vs-fee)

50 Cent's Smartest Deal Wasn't Music

Link in bio to own a piece of what you build instead of getting paid once with CRWN. Free to start at thecrwn.app.

### Caption 21 (air date Thu Jul 9 2026, carousel 52, 52-snoop-bought-death-row-back)

Snoop Bought A Whole Label Back To Own Doggystyle

Link in bio to own your debut from day one instead of buying it back with CRWN. Free to start at thecrwn.app.

### Caption 22 (air date Fri Jul 10 2026, carousel 54, 54-tha-doggfather-platinum-no-check)

Snoop Got Jewelry. The Label Kept The Royalties.

Link in bio to get the money, not a thank-you gift, with CRWN. Free to start at thecrwn.app.

### Caption 23 (air date Sat Jul 11 2026, carousel 58, 58-dmx-100m-for-def-jam-under-15-percent)

DMX Made Def Jam $100M And Kept A Sliver

Link in bio to keep most of what you make instead of a sliver with CRWN. Free to start at thecrwn.app.

### Caption 24 (air date Sun Jul 12 2026, carousel 61, 61-aaliyah-locked-off-streaming-20-years)

A Whole Generation Couldn't Stream Aaliyah

Link in bio to keep your music reachable on your terms with CRWN. Free to start at thecrwn.app.

### Caption 25 (air date Thu Jul 16 2026, carousel 64, 64-tech-n9ne-2m-albums-no-major)

The Biggest Rapper You Slept On Owns His Whole Label

Link in bio to build a catalog you own with CRWN. Free to start at thecrwn.app.

### Caption 26 (air date Fri Jul 17 2026, carousel 67, 67-bad-bunny-biggest-streamer-no-major)

The Most-Streamed Artist On Earth Stayed Independent

Link in bio to grow huge without handing it to a major with CRWN. Free to start at thecrwn.app.

### Caption 27 (air date Sat Jul 18 2026, carousel 70, 70-burna-boy-kept-his-own-label)

Burna Boy Partnered With A Major. He Didn't Get Owned By One.

Link in bio to keep your own label and just rent the reach with CRWN. Free to start at thecrwn.app.

### Caption 28 (air date Sun Jul 19 2026, carousel 73, 73-lauryn-hill-one-album-still-owned-by-sony)

The Greatest Solo Album, And She Doesn't Hold It

Link in bio to own the one classic you've got in you with CRWN. Free to start at thecrwn.app.

### Caption 29 (air date Thu Jul 23 2026, carousel 76, 76-beyonce-parkwood-her-own-company)

Beyonce Built The Company. The Major Just Ships It.

Link in bio to release through a company that's yours with CRWN. Free to start at thecrwn.app.

### Caption 30 (air date Fri Jul 24 2026, carousel 79, 79-young-thug-900-days-catalog-on-pause)

900 Days Locked. The Industry Didn't Wait.

Link in bio to build income that keeps running when you can't with CRWN. Free to start at thecrwn.app.

### Caption 31 (air date Sat Jul 25 2026, carousel 14, 14-bully-152k-vs-gamma-200k)

Bully Did 152K Or 200K. Pick A Number.

Billboard said Kanye's Bully sold 152,000 units week one.
Gamma the distributor said closer to 200,000.
Same album, same week, 48,000 unit gap.
First-week numbers are negotiated, not fixed.

Link in bio to track numbers a label cant inflate with CRWN. Free to start at thecrwn.app.

### Caption 32 (air date Sun Jul 26 2026, carousel 32, 32-fall-off-290k-cole-keep)

Cole Sold 290K Albums Week One. He Got 15%.

The Fall Off pulled around $2.9M in revenue week one.
Cole's standard major cut is around 15%. He keeps about $435K. The label keeps $2.5M.
Direct at the same volume, Cole keeps $2.67M.

Link in bio to keep what you make instead of splitting it with a label with CRWN. Free to start at thecrwn.app.

### Caption 33 (air date Thu Jul 30 2026, carousel 82, 82-mac-miller-19-indie-number-one)

He Was 19, Independent, And Debuted At #1

Link in bio to debut on your own terms with CRWN. Free to start at thecrwn.app.

### Caption 34 (air date Fri Jul 31 2026, carousel 85, 85-beyonce-2013-no-rollout-owned-the-audience)

No Single. No Promo. Still The Biggest Week.

Link in bio to drop straight to fans with no rollout with CRWN. Free to start at thecrwn.app.

### Caption 35 (air date Sat Aug 1 2026, carousel 87, 87-rihanna-a-decade-no-album-fanbase-stayed)

10 Years, No Album, The Fans Never Left

Link in bio to build a fanbase that waits on you with CRWN. Free to start at thecrwn.app.

### Caption 36 (air date Sun Aug 2 2026, carousel 88, 88-wu-tang-army-recruited-free-for-30-years)

The Most Famous Street Team In Rap Never Got Paid

Link in bio to pay the fans who bring you the next fan with CRWN. Free to start at thecrwn.app.

### Caption 37 (air date Thu Aug 6 2026, carousel 92, 92-prince-didnt-even-own-his-name)

They Owned His Music And His Name. It Took 20 Years Back.

Link in bio to own your name and your masters from day one with CRWN. Free to start at thecrwn.app.

### Caption 38 (air date Fri Aug 7 2026, carousel 94, 94-tlc-sold-millions-filed-bankruptcy)

The Sales Were Never The Problem. The Cut Was.

Link in bio to keep the dollar instead of the pennies with CRWN. Free to start at thecrwn.app.

### Caption 39 (air date Sun Aug 9 2026, carousel 95, 95-en-vogue-a-small-share-split-four-ways)

Four People, One Small Slice, Then The Math Got Worse

Link in bio to keep the whole dollar in the room with CRWN. Free to start at thecrwn.app.

### Caption 40 (air date Thu Aug 13 2026, carousel 96, 96-bigger-half-of-your-biggest-hit)

A Nickel On The Dollar vs The Bigger Half Of Everything

Link in bio to keep about ninety cents of every dollar with CRWN. Free to start at thecrwn.app.

### Caption 41 (air date Fri Aug 14 2026, carousel 97, 97-drake-iceman-rollout-vs-a-free-link)

The Months-Long Rollout vs The Link That Reaches People Already Waiting

Link in bio to launch straight to the fans already waiting with CRWN. Free to start at thecrwn.app.

### Caption 42 (air date Sat Aug 15 2026, carousel 100, 100-frank-ocean-the-line-was-his)

He Left The Machine And The Fans Were Still There

Link in bio to own the line to your fans with CRWN. Free to start at thecrwn.app.

### Caption 43 (air date Sun Aug 16 2026, carousel 102, 102-lil-wayne-no-control-own-album)

Lil Wayne Got Overruled By His Team

Link in bio to own your rollout and decide what drops, when, and what it's called with CRWN. Free to start at thecrwn.app.

### Caption 44 (air date Thu Aug 20 2026, carousel 103, 103-lizzo-algorithm-breaks-rollout)

The Algorithm Hid Her Album

Link in bio to reach your real fans directly so they never miss a drop with CRWN. Free to start at thecrwn.app.

### Caption 45 (air date Fri Aug 21 2026, carousel 106, 106-nipsey-marathon-fans-paid-to-recruit)

Nipsey Built A Whole Movement

Link in bio to pay your realest fans a cut for every subscriber they bring with CRWN. Free to start at thecrwn.app.

### Caption 46 (air date Sat Aug 22 2026, carousel 107, 107-soulja-boy-fans-spread-it-free)

Every Fan Video Sold The Song

Link in bio to turn the fans who spread you into a paid street team with CRWN. Free to start at thecrwn.app.

### Caption 47 (air date Sun Aug 23 2026, carousel 109, 109-lil-wayne-couldnt-see-the-books)

Lil Wayne Got Hidden From His Money

Link in bio to see every dollar your fans spend the second it lands with CRWN. Free to start at thecrwn.app.

### Caption 48 (air date Thu Aug 27 2026, carousel 110, 110-know-your-top-spenders-by-name)

20 Real Fans Vs 2,000 Strangers

Link in bio to know your biggest fans by name and take care of the ones who pay you with CRWN. Free to start at thecrwn.app.

### Caption 49 (air date Fri Aug 28 2026, carousel 112, 112-toni-braxton-35-cents-an-album)

Toni Braxton Got Paid In Change

Link in bio to keep almost the whole dollar your fans spend instead of the label's change with CRWN. Free to start at thecrwn.app.

### Caption 50 (air date Sat Aug 29 2026, carousel 113, 113-mc-hammer-sales-werent-the-keep)

MC Hammer Lost A 70 Million Fortune

Link in bio to keep and watch every dollar so a fortune never slips through your hands with CRWN. Free to start at thecrwn.app.

--- END OF CONTENT ---

-------------------------------------------------------------------------------
TASK 0: THE PROMISE LEDGER (do this before touching the product)
-------------------------------------------------------------------------------
From the 55 pieces above, write the ledger of concrete beliefs and expectations a viewer carries to the link:
- Every NUMBER or RATIO the content teaches as a rule (for example: what one fan is worth per month, how many
  streams one fan replaces, what share of followers would pay, what a 5,000-follower artist should expect).
- Every PROMISE the CTAs make ("turn streams into paying fans", "skip the recoupment trap", "keep your
  masters", "do the same math on your own audience", "Free to start", and every other one you find). Count how
  many of the 55 CTAs make each promise.
- Every ENEMY the content names (the label, the advance, the algorithm, the trophy, the platform cut) and the
  emotional state the viewer arrives in.
- What the viewer expects to SEE on the other side of the link, in one sentence, in their words.
Number the ledger entries. Every finding later must cite the ledger entry it violates or fulfils.

-------------------------------------------------------------------------------
WHO YOU ARE (three personas, run in this order)
-------------------------------------------------------------------------------
PERSONA 1, "Five Thousand" (the majority viewer; video 3 spoke to them by name). Jaylen, 24, he/him, Houston,
hip-hop. Instagram 5,200, TikTok 3,100, Spotify monthly listeners about 1,800. Never sold anything to fans;
streaming pays about $40 a month. No email list. 12 unreleased songs and about 30 voice memos on his phone. He
can give this a few hours a week. He just watched VIDEO 3 and heard "1% of 5,000 is 50 fans. 50 fans at $10 is
$500 a month." He arrives expecting to see roughly that number for himself, and expecting "free" to mean free.
Uses EMAIL_P1 (and EMAIL_P4 for his second signup, see the matrix).

PERSONA 2, "Merch Table". Tasha, 29, she/her, Memphis, R&B. Instagram 38,000, TikTok 51,000, monthly listeners
about 22,000. Sells merch at shows and through a Shopify store, roughly $400 a month, and has 600 customer
emails from those orders. Streaming pays about $350 a month. 30 finished unreleased songs. She is thinking about
a limited hoodie run and does not want to front the money blind. She just read CAPTION 1 ("1 Fan Beats 40,000
Streams") and watched VIDEO 1. Uses EMAIL_P2.

PERSONA 3, "Already Direct". Marcus, 31, he/him, Atlanta, hip-hop with an R&B lean. Instagram 120,000, monthly
listeners about 90,000. Patreon with 60 patrons at about $450 a month, a Discord of 400. Turned down a
distribution advance last year. 40 unreleased songs, demos and alternate versions. He just watched VIDEO 2
("Drake got a loan, not a paycheck") and read CAPTION 4 ("Kanye signed distro not a record deal"). He arrives
suspicious of any cut and any lock-in and expects to see what his catalog is worth as a membership. Uses
EMAIL_P3.

Fill every form with the persona's real numbers. Do not optimize inputs to make results look good. When a
question does not apply, answer it the way that person would (skip if skipping is offered and they would).

-------------------------------------------------------------------------------
THE TEST MATRIX
-------------------------------------------------------------------------------
Four calculators: Own Your Fans, the Opportunity Calculator, the Vault Revenue Planner, the Proof of Demand Test
Builder. You do NOT get their URLs. Finding them from the bio link is part of the test (Phase D below).

| Persona | Calculators to run | Signs up from |
|---|---|---|
| P1 Jaylen | all four | Own Your Fans (EMAIL_P1), then a second, separate account from the Opportunity Calculator on the landing page (EMAIL_P4) |
| P2 Tasha | Opportunity Calculator, Proof of Demand, Own Your Fans | Proof of Demand (EMAIL_P2) |
| P3 Marcus | Opportunity Calculator, Vault Revenue Planner, Own Your Fans | Vault Revenue Planner (EMAIL_P3) |

For every calculator NOT listed under "Signs up from", walk it all the way to the final save action in the
builder, press it, and STOP on the page it takes you to. Record what that page says about the work you just
did. Do not create an account there.

-------------------------------------------------------------------------------
THE JOURNEY, PER PERSONA (scope only; never instructions on how CRWN works)
-------------------------------------------------------------------------------
PHASE D, discovery: open BIO_LINK_URL as the persona, in a fresh browser profile, at VIEWPORT width. Spend the
first 30 seconds as a person who just watched the video: what is this, is it the thing the video promised, what
would I tap. Then try to reach each calculator in the matrix from THIS page without typing a URL. Time each
attempt. If you cannot find one within 3 minutes of honest looking, that is a P0 or P1 finding; record the
exact path you tried, then ask the founder for the direct URL and continue.

PHASE C, calculator: run the calculator as the persona. On every screen record the observation entry (below).
Note specifically: did you understand why it asked; did you know the answer; did you want to skip; did the
number of screens match the time the page or the video implied.

PHASE R, result: read the result as the persona. Compare it to the promise ledger entry by entry: the number you
expected versus the number shown; the vocabulary the video used versus the vocabulary the page uses; whether the
enemy the video named appears in the result at all. Then do all of the following, in the order the page offers
them: press the gold call to action; use "change an answer" once with a materially different value and record
whether the number moved in a way you understand; decide as the persona whether to enter your email (do so with
the persona's EMAIL when they would, and go read what arrives, timing it, inbox or spam); watch or skip any video
offered and say why; scroll everything below the builder and say what, if anything, made you want to leave or
continue.

PHASE B, builder: complete the builder as the persona. Record every field that was pre-filled and whether the
pre-fill was right for you; every field that asked for something you already answered; every moment you did not
know what a word meant (quote it). Press the final save action.

PHASE S, signup (only where the matrix says): create the account with the persona's email. Record every field
asked, whether "Free to start" still feels true, and what the page says about the work you just built. Go to
the mailbox, time the confirmation email, click it, and record exactly what the first screen after verification
says about your calculator work. STOP there. Do not continue into setup. Do not connect Stripe. Do not upload
anything.

After each persona finishes, write that persona's section of the report before starting the next persona.

-------------------------------------------------------------------------------
ONE-TIME HYGIENE STEP (not part of any persona; do it in EVERY browser profile before its first page load)
-------------------------------------------------------------------------------
Open https://thecrwn.app, open the browser console, run exactly:
   document.cookie = 'crwn_dnt=1; path=/; max-age=31536000; SameSite=Lax'
then close the console and never open it again in that profile. This marks your browser as test traffic so the
founder's analytics are not polluted. It changes nothing you will see. Use a fresh profile per persona (four in
total: P1 uses a second fresh profile for the EMAIL_P4 signup).

-------------------------------------------------------------------------------
HOW TO BEHAVE
-------------------------------------------------------------------------------
- Act in character. Skim first, read when something matters. Do not hunt for hidden controls. If the next
  action is not obvious within about 20 seconds, that is a finding: note it, then do what the persona would
  really do (scroll, tap the most likely thing, go back, or leave).
- If the persona would abandon, abandon, say why, mark the moment, then make ONE reasonable recovery attempt
  and continue so the rest of the journey is still observed.
- Never search the web for CRWN documentation. Never read source code. What the screen shows, plus the
  Instagram content above, is the whole universe.
- Every claim in the content is a claim the product now has to keep. When the product says something the
  content did not prepare the persona for, or the content said something the product does not repeat, that
  is a finding whether or not it is a defect.
- Distinguish blockers from annoyances. Quote on-screen wording exactly when it caused the reaction.
- Keep a running clock. Note wall-clock time at every phase boundary.

-------------------------------------------------------------------------------
ALLOWED ACTIONS
-------------------------------------------------------------------------------
- Everything an anonymous visitor can do on thecrwn.app: run any calculator, change answers, build and save a
  plan, watch a video, enter a persona email in the optional capture, read the emails that arrive, use the
  "explore another tool" and "see how this fits" links, read the marketing below the tool.
- Create the four accounts the matrix names, verify their emails, and read the first screen after verification.
- Use support chat only if SUPPORT_CHAT_ALLOWED is YES, at most once per persona, only when that persona would.
- Press "Get a call now" and enter a number only if CALL_REQUEST_ALLOWED is YES; otherwise record that the card
  exists, what it says, and whether the persona would have pressed it.

-------------------------------------------------------------------------------
PROHIBITED ACTIONS (hard rules)
-------------------------------------------------------------------------------
- Never go past the first screen after email verification. No setup wizard, no Stripe, no uploads, no tiers.
- No real identity, phone number (unless CALL_REQUEST_ALLOWED), card or bank details, ever.
- Never log in as anyone but the accounts you create. Never visit /admin or any URL containing "admin". Never
  touch another artist's page beyond viewing it as a visitor.
- Never delete anything, never change an account's email or password after creation.
- Never send anything to anyone. Never unsubscribe from the emails (the founder needs the nurture to run).
- Never create more than the four accounts in the matrix.
- Never fabricate a result. If you did not see it, say NOT TESTED.

-------------------------------------------------------------------------------
OBSERVATION PROTOCOL (record for EVERY screen, as you go, not afterwards)
-------------------------------------------------------------------------------
For each screen write one entry:
  step_id, clock time, persona, phase (D/C/R/B/S), calculator,
  intended goal, expected (what the persona thought would happen, citing a ledger entry where one applies),
  saw (what actually appeared; exact wording when it matters),
  action taken,
  next action obvious? (yes / partly / no),
  confidence 1-10 that this is the thing the video promised,
  friction 1-5 (1 none, 5 stopped me),
  considered abandoning? (yes/no) and why,
  screenshot filename (RUN_ID-<persona>-<calculator>-<step_id>.png; take one whenever something surprised,
  confused, delighted or blocked you, and at every phase boundary),
  exact wording responsible, when the reaction came from copy.

Running counters, per calculator per persona and in total:
  screens seen, questions asked, required questions, optional questions answered anyway, screens skipped,
  seconds from page load to first question, seconds from first question to result, seconds from result to
  signup page, times the product asked for something it already knew (list each), errors shown (quote them),
  layout problems at VIEWPORT width (anything cut off, overlapping, or needing horizontal scroll), emails
  received (subject, delay, inbox or spam), moments the persona wanted to leave.

-------------------------------------------------------------------------------
SEVERITY (use only these four)
-------------------------------------------------------------------------------
P0 Acquisition blocker: a typical viewer of this content cannot reach a result they believe, or cannot reach
   the account with their work in it.
P1 Major conversion risk: it works, but a meaningful share of viewers like this persona would abandon, distrust
   the number, or refuse to give an email.
P2 Meaningful friction: unnecessary effort, confusion or reduced confidence; unlikely to kill the signup alone.
P3 Polish: noticeable, unlikely to matter for acquisition.
A gap between what the content promised and what the product shows is at least P1 when it concerns a number or
a price, and at least P2 when it concerns vocabulary. Do not propose fixing P3 while any P0 or P1 stands.

-------------------------------------------------------------------------------
THE REPORT (produce it even if the time budget runs out; never end without it)
-------------------------------------------------------------------------------
1. Run facts: RUN_ID, exact start and end wall-clock times (the founder deletes anonymous analytics rows by
   this window), viewport achieved, the four account emails and handles created, which switches were YES.
2. The promise ledger from Task 0.
3. Per calculator, in this order: Own Your Fans, Opportunity Calculator, Vault Revenue Planner, Proof of
   Demand. For each: how it was found from the bio link (or not); the single biggest bottleneck; the
   expectation gaps against the ledger (expected vs shown, per persona); the timings table; every screen where
   any persona considered leaving; what the email said and when it arrived; what the builder pre-filled wrong;
   what the signup page and the post-verification screen said about the work.
4. The ranked list of every finding, P0 first, each with: severity, calculator, persona(s) affected, ledger
   entry violated or fulfilled, the exact screen and wording, the screenshot, and one sentence on what a fix
   would change for the viewer (not how to build it).
5. The cross-calculator view: which promises in the content NO calculator keeps; which calculator best matches
   what the videos actually sell; whether the landing page is the right landing for this content or whether one
   of the other three should be the bio link; the one change that would move the most viewers from result to
   account.
6. What you could not test and why.

=== END CALCULATOR AUDIT PROMPT ===
```

**Appendix the founder hands over only when discovery fails** (keep it out of the prompt; the tester asks for
it when Phase D exhausts its 3 minutes): `https://thecrwn.app/tools/own-your-fans-calculator`,
`https://thecrwn.app/tools/opportunity-calculator`, `https://thecrwn.app/tools/vault-revenue-planner`,
`https://thecrwn.app/tools/proof-of-demand-test-builder`, and the directory `https://thecrwn.app/tools`.

---

## 4. What the report should look like, and how to read it

- **The promise ledger is the rubric.** If GPT-6's ledger does not contain "$10 a month per fan", "1 fan =
  40,000 streams", "1% of followers" and "free to start", it did not read the content and the run is void.
- **Discovery timings are the first number to read.** Three of the four tools are not on the homepage. If no
  persona finds them, the finding is about the bio link and the homepage, not about the calculators.
- **Persona 1 is the majority.** Video 3 set his expectation at $500 a month. Own Your Fans and the Opportunity
  Calculator both model his 5,200 followers through their own ratios, so his "expected vs shown" rows are the
  most important lines in the report. A number far from $500 with no explanation the persona accepted is a P1
  by the prompt's own rule.
- **Expect the Vault and demand-test results to be flagged** for showing no dollar figure. That is by design
  (section 5). Read those findings for whether the PAGE explained the absence, not for whether the absence
  exists.
- **Every finding cites a screen and a screenshot.** A finding without one is an opinion; weigh it as one.
- **The post-verification screen is the last observation.** What it says about the calculator work is the
  carry-over test: the claimed plan should be acknowledged there ("Your CRWN plan is saved" for a ladder tool).
  A blank generic first screen after a saved plan is the bottleneck this whole funnel was built to remove.

---

## 5. Design decisions the tester will flag that are NOT bugs (decide before reading the report)

| The tester will say | Why it is that way | Decide |
|---|---|---|
| "The Vault planner and the demand test show no money number" | Deliberate (registry comment, 2026-08-16): the Vault tool promises a PLAN and the whole-business number lives in the Opportunity Calculator; a demand test never takes money | Whether the result page needs a sentence saying so, given the videos are all money |
| "The homepage never mentions the other three tools" | Rule in the registry: cold visitors on `/` have never met CRWN, so the hero may not list calculators | Whether the bio link should point at `/tools` or a chooser instead of `/` for this content |
| "The Opportunity number is a range 'on top of what you already earn direct, after CRWN's fee'" | The unified model subtracts existing direct income and fees so it never double-counts | Whether Persona 3, who came in suspicious of cuts, reads "after CRWN's fee" as honest or as the catch |
| "Own Your Fans talks about apps I do not own, not about streams vs fans" | POSITIONING.md section 24 forbids implying ownership of people; the result is framed as reach you cannot contact | Whether the streams-to-fans math from the videos should appear on that result |
| "The email capture is optional and easy to skip" | Founder decision 2026-08-26: the result is never gated; the capture sits under the primary CTA | Nothing, unless the tester reports nobody would enter it |
| "Own Your Fans jumped from copy straight to Save" | A/B experiment (`signupBoundary='preview'`) drops the preview step for some visitors | Nothing; note which variant each persona saw |
| "The call card only appears on one calculator" | `CALL_HAND_RAISER_TOOLS` is one allowlist shared with the server | Nothing |

---

## 6. Cleanup after the run

1. Run [supabase/calculator-audit-cleanup.sql](../supabase/calculator-audit-cleanup.sql) in the Supabase SQL
   Editor, after replacing the mailbox prefix and the run's start and end times from the report. It previews
   first, then removes the email-only leads (their nurture enrollments cascade), the calculator results tied to
   those leads or to the four accounts, the four auth users, and the anonymous event rows inside the window.
2. If a call request was allowed, delete the founder email it produced; the file removes the lead row.
3. Do not touch Stripe: this run never reaches it.
