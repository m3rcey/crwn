# GPT-6 Calculator Bottleneck Audit: the test package

**Prepared 2026-09-18 against the working tree at `master` (production `sw.js` CACHE_NAME `crwn-v508`).**
Investigation and packaging only. Nothing in the product, the database, Stripe or the deploy was changed.
The one question this test answers:

> After watching the first five Fan Economy videos or reading the Fan Economy carousels, what stops a new
> artist from getting a result they believe out of a CRWN calculator and carrying it into an account?

Sections: 1 what this package assumes and why, 2 founder setup before the run, 3 the copy-ready GPT-6 prompt,
4 what the report should look like, 5 design decisions the tester will flag that are NOT bugs, 6 cleanup.

The sibling package for everything after signup (setup wizard, Stripe, first paid fan) is
[docs/ASTRA_ACTIVATION_AUDIT.md](ASTRA_ACTIVATION_AUDIT.md). This one stops where that one starts.

---

## 1. What this package assumes (repo-verified 2026-09-18)

**Which content.** The five videos are files 1 to 5 in [videos/scripts/fan-economy/](../videos/scripts/fan-economy/)
(Curren$y vs Westside Gunn, Tech N9ne vs 50 Cent, Tee Grizzley vs Drake, Tobe Nwigwe vs Travis Scott, Rapsody's
328 songs). The carousels are every file in [videos/carousels/fan-economy/](../videos/carousels/fan-economy/):
there are 31 (numbers 1 and 31 to 60), not 50, and all 31 are embedded. Both sets are in the prompt verbatim
because GPT-6 has no repo access.

**How this content sends a viewer to a calculator.** Unlike the Drake and Kendrick set, every piece here ends
with a COMMENT KEYWORD and names the tool: "I built a free Own Your Fans Calculator ... Comment OWN and I'll DM
you the link." The keyword drives the Instagram to ManyChat to CRWN path, and that path does NOT hand over the
calculator page. It asks the calculator's questions inside the DM, replies with the headline number, and sends a
"See My Numbers" button to a tokenized result page (`/tools/<slug>/result/<token>`), which renders the stored
result, a "sharpen your answers" link into the live calculator pre-filled, the email and claim call to action,
the explainer video card, and (Opportunity Calculator only) the ladder and the call card. A commenter therefore
meets the RESULT before they ever meet the wizard. That is deliberate (delivery-first, 2026-07-26) and it is the
first thing under test.

| Keyword | Tool it routes to (`dmKeywords` in the registry) | Videos | Carousels |
|---|---|---|---|
| VAULT | Vault Revenue Planner | 1, 5 | 12 |
| OWN | Own Your Fans | 3 | 8 |
| DEMAND | Proof of Demand Test Builder | none | 4 |
| FREE | Opportunity Calculator | 4 | **none** |
| WORTH | `/worth` (Streaming Loss Calculator) | 2 | 1 |
| TOUR / ROYALTY / LIVE | Between Tours, Royalty Readiness, Live Experience | none | 3 / 2 / 1 |

Two consequences for the test. **No carousel routes to the Opportunity Calculator**, so the only ways a viewer of
this content reaches it are video 4's FREE keyword, the bio link (the homepage IS the Opportunity Calculator:
[src/app/HomeFunnel.tsx](../src/app/HomeFunnel.tsx) mounts the same component as `/tools/opportunity-calculator`),
or the "See how this fits your whole fan economy" bridge under the other three tools' builders. And the seven
carousels that route to TOUR, ROYALTY, LIVE and WORTH point outside the four tools you asked about; the prompt
has the tester note the promise those make and follow only WORTH once, for comparison.

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
the load-bearing claims are fixed by the scripts and captions: streaming pays about a penny a month per monthly
listener; one member is worth a large multiple of listeners (1,071 people at $4 equals about 428,000 listeners;
one member is about 1,500 listeners); "you don't need to market to fans, you need a market FOR fans"; CRWN is "a
ladder of membership tiers with a vault at the top"; "costs nothing to start, and it only takes a cut when you
get paid"; the unreleased catalog is inventory; "you can't email a stream, you can email a member". The
personas are built so each can check the calculator against the specific promise the piece they saw made.

---

## 2. Founder setup before the run

1. **Confirm production is the code you think it is.** Open `https://thecrwn.app/sw.js` and check `CACHE_NAME`
   against [public/sw.js](../public/sw.js) in the tree you audited. The explainer video card under the
   result CTA (commit `352a71f1`) must be live or the tester will report a surface that does not exist.
2. **Decide whether the DM path runs** (`DM_PATH_ALLOWED`). YES needs a throwaway Instagram account the tester
   can log into (`IG_TEST_HANDLE`) and creates real ManyChat contacts and `lead_identities` rows under that
   handle; the cleanup file removes them. Before saying YES, open ManyChat and confirm EVERY automation reads
   Live: a lapsed plan switches them all off and renewing does not switch them back on (thirteen days dark in
   August). The comment trigger is "any post or reel", so the tester comments on the most recent CRWN post;
   comment triggers fire once per person per post, so each keyword goes on a different post. NO means the DM
   phase is reported NOT TESTED and the tester starts at the calculator page instead, which is a weaker test
   because the DM delivers a result, not a calculator.
3. **Pick one audit mailbox** you can log into from a browser, and give GPT-6 addresses of the form
   `<mailbox>+test-p1@gmail.com`, `+test-p2`, `+test-p3`, `+test-p4`. The `+test` marker is what the
   onboarding-reminder cron skips, and it is what the cleanup file matches on.
4. **Decide the other two switches**: `CALL_REQUEST_ALLOWED` (the card on the Opportunity Calculator emails you
   and creates a server-scored lead; default NO) and `SUPPORT_CHAT_ALLOWED` (default YES, once per persona).
5. **Fill `{{BIO_LINK_URL}}`** with the exact URL in the Instagram bio today. The prompt defaults it to the
   homepage.
6. **Record the start time** before the first page load. Anonymous event rows carry no id, so the time window
   is the only handle cleanup has on them (see section 6).
7. Do NOT waive the `crwn_dnt` hygiene step. The Astra run waived it and 56 analytics rows had to be deleted by
   hand. Note that the DM path is NOT covered by the cookie (ManyChat calls the server directly), which is why
   the cleanup file deletes by Instagram handle.

---

## 3. Copy-ready GPT-6 prompt

Paste everything between the BEGIN and END lines. Replace every `{{PLACEHOLDER}}` first.

```text
=== BEGIN CALCULATOR AUDIT PROMPT ===

You are operating a real, live web application (and, if permitted, a real Instagram account) through your
browser tools. You will act as three different independent artists, one at a time, each of whom just consumed
specific Instagram content and did what it told them to do: comment a keyword, or tap the link in the bio. You
are NOT a QA engineer and NOT a developer. You never read source code, never open developer tools except for
the one hygiene step below, and never guess how the product is "supposed" to work. You learn only from what
the product shows you, plus what the Instagram content told you.

The product is CRWN (https://thecrwn.app), a fan-monetization app for independent artists. Your job is to find
every bottleneck between "I watched the video" and "I have an account with my plan in it", across four free
calculators, and to rank those bottlenecks by how many new artists they would stop.

-------------------------------------------------------------------------------
RUN CONFIGURATION (filled in by the founder)
-------------------------------------------------------------------------------
RUN_ID: {{RUN_ID}}
TIME_BUDGET: {{e.g. 4 hours}}
BIO_LINK_URL: {{the exact URL in the Instagram bio; default https://thecrwn.app}}
CRWN_INSTAGRAM: {{the CRWN Instagram handle whose posts carry the keywords}}
DM_PATH_ALLOWED: {{YES or NO}}
IG_TEST_HANDLE: {{throwaway Instagram login, only if DM_PATH_ALLOWED is YES}} / {{password}}
MAILBOX_URL: {{e.g. https://mail.google.com}}   MAILBOX_LOGIN: {{login}} / {{password}}
EMAIL_P1: {{mailbox}}+test-p1@gmail.com
EMAIL_P2: {{mailbox}}+test-p2@gmail.com
EMAIL_P3: {{mailbox}}+test-p3@gmail.com
EMAIL_P4: {{mailbox}}+test-p4@gmail.com     (spare, used only by Persona 3's second signup, see the matrix)
CALL_REQUEST_ALLOWED: {{YES or NO}}   (NO = you never press "Get a call now" or enter a phone number)
SUPPORT_CHAT_ALLOWED: {{YES or NO}}   (YES = at most one support message per persona, only when that persona would)
VIEWPORT: 390px wide, phone-shaped, for every run (Instagram traffic is a phone). If you cannot size the
   window, say so at the top of the report and run at desktop width; treat every "fits on the first screen"
   observation as NOT TESTED.

-------------------------------------------------------------------------------
THE CONTENT THESE ARTISTS JUST CONSUMED (read all of it before the first page load)
-------------------------------------------------------------------------------
Everything below is what CRWN has been posting on Instagram. A viewer has just seen ONE of the five videos or
ONE of the thirty-one carousels, and probably several over the preceding weeks. Read it as the audience, not as
a copywriter. Your first deliverable (Task 0) is built from it. Notice that every piece ends by telling the
viewer to comment ONE WORD, and names the free calculator that word unlocks.

--- THE FIRST FIVE FAN ECONOMY VIDEOS (spoken script) ---

### Video 1: Curren$y vs Westside Gunn: 90 projects or 400 copies

**Spoken script:**

Curren$y has put out over 90 projects. Westside Gunn put out 400 copies of 1 project.
Which one's fans are actually worth more, and by how much? 
The answer should change how independent artists like them price everything.

Let's break it down.

Curren$y might be the most prolific rapper alive. He put out over 90 projects since 2009. Jet Life is a whole world and the day ones been living in it 15 years.
His model is volume. Keep feeding them, dont disappear, letcha catalog stack up.
And it works. He sits around 1.5 million monthly listeners.

Westside Gunn runs the opposite play.
He dont release records, he releases artifacts. Numbered pressings. Colored variants. Runs as small as 400 copies. One signed edition numbered out of 187.
His model is scarcity. Make less of it, make it matter.

Now here's the thing nobody puts side by side.
Streaming pays about a penny a month per monthly listener. That's the discovery engine doing its job, and 1.5 million of them is real reach.
But them 400 copies? Go look at what they trade for now. Them records got a second life on the resale sites, and the people buying aint casual.
Two totally different fanbases. One is wide. One is deep.

So I priced them against each other. One pressing against a million and a half listeners.
When the two numbers landed next to each other I had to sit back and look at it again.

Hold that thought.
You dont need to market to fans. You need a market FOR fans.
Reach and depth aint the same job, and most artists only got tools for the first one.
Knowing which of your people actually buy, and giving them something only they can get, is what the CRWN app is built around: your membership tiers and a vault your top members get into.
ANYWAY.

So which fanbase is actually worth more, and by how much?
Them 400 records go for around $300 a copy on resale.
So one pressing is about $120,000 of fan money moving.
1.5 million monthly listeners generate roughly $15,000 a month from streaming.
Which means 400 people spent what a million and a half listeners spend in eight months.

And the 400 aint just worth more.
One collector paying $300 is the same money as 30,000 people listening for a month.
Except the 30,000 is anonymous, and the 400 got names and addresses.
One of them groups you can call. The other one has to come back on they own, and that's how streaming was built for everybody, Curren$y included.

Now to be fair, Curren$y's volume is what built the catalog people collect in the first place, so this aint volume versus scarcity as good versus bad.
But if you're an independent artist on either of they levels, the question is the same one:
you know how many people hear you, but do you know which ones would pay $300 to have what nobody else got?

I built a free Vault Revenue Planner that prices exactly that for your catalog.
Comment VAULT and I'll DM you the link.

128 👑  (visual end-card, not spoken)

### Video 2: Tech N9ne vs 50 Cent: the year the indie out-earned the mogul

**Spoken script:**

There was a year Tech N9ne made more money from music than 50 Cent did.
The number that made that possible is one every independent artist should run on they own audience.

Let's look at it.

Forbes puts out a hip hop earnings list every year, the Cash Kings.
Tech N9ne landed on it year after year. One of them years he pulled around $7.5 million and finished ahead of 50 Cent, Mac Miller and Rick Ross.
No major label. His own company, Strange Music, out of Kansas City.

And before anybody starts: 50 Cent's whole empire is way bigger than his music, and everybody knows it.
That's actually the point. This is about what the MUSIC business paid each of them that year, and the indie won that line.

So how? He aint have the biggest audience. He still dont.
About 3 million people a month press play on Tech N9ne. That's a fraction of what a star like 50 Cent reaches.
What he had was 132 shows in a single year, the most of anybody on that whole list. Sold-out rooms. VIP packages. And merch reportedly doing around $6 million a year.

Here's the thing them two businesses actually measure.
One is built on how many people know the songs. The other is built on how many people show up and spend.
Attention and a buying habit is two different currencies, and everybody keeps scoring both on the same scoreboard.

So I worked out Tech N9ne's rate. Out of everybody who hears him, how many actually buy something?
That rate is the whole trick, and it's small enough that it should give you hope.

Quick detour.
You dont need to market to fans. You need a market FOR fans.
Tech N9ne aint have more reach than 50 Cent, he had somewhere for his people to spend.
Memberships, a vault, ticketed live rooms, all in your name: that's what artists set up on the CRWN app.
ANYWAY.

So what is the rate that did it?
Tech N9ne moved roughly 250,000 tickets in a single year against about 3 million monthly listeners.
That's a little over 8 out of every 100 turning into somebody who shows up and pays.
Eight percent. That's what beat a global superstar on a Forbes list.

And here's the part that should stick with you.
He never had to win the attention war. He was never gonna win it.
While everybody else fought over hundreds of millions of casual ears, Tech N9ne got rich being unavoidable to a couple hundred thousand people who knew exactly where the show was.
The reach he was missing never mattered, cause the 8 percent did.

Them Forbes numbers is from his peak touring years and I rounded to make the point.
So run it on yourself. Whatever your audience is right now, what's your 8 percent?
And more important, if they wanted to hand you money today, where exactly would they go?

I built a free calculator that shows what the direct-support side of your audience could be worth next to your streaming.
Comment WORTH and I'll DM you the link.

128 👑  (visual end-card, not spoken)

### Video 3: Tee Grizzley vs Drake: 90,000 members or 100 million listeners

**Spoken script:**

Drake just crossed 100 million monthly listeners. Tee Grizzley has 90,000 people paying him every month.
What them two numbers are actually worth next to each other is something every independent artist should see before they chase another follower.

Let's run it.

Tee Grizzley built something that dont look like music at all.
Grizzley World RP, his own Grand Theft Auto roleplay server, top 10 in the world.
Reportedly around 90,000 members paying monthly and buying items to live inside his world.

Drake is the biggest streaming artist in rap history. A hundred million people a month, the first rapper ever to touch that.
And to be clear, Drake's business is enormous and streaming is the smallest part of it. Touring, brands, the whole machine.
So this aint who makes more. This is one question: what does a listener pay, and what does a member pay?

Cause them is two different units and everybody counts them like they the same.
A listener is somebody who pressed play. A member is somebody with a card on file who decided you're worth a line item every month.

So I put the two side by side. What 100 million listeners pay in a month, against what Tee Grizzley says 90,000 members bring him.
I knew a member was worth more. I did not know it was like this.

Hold that thought.
You already know how to market to fans. Now you need a market FOR fans.
Reach aint the problem, and Drake proves reach is real. Having nowhere for reach to turn into a membership is the problem.
Memberships, a vault, your fan list in your name: that's what artists run on the CRWN app.
ANYWAY.

So what are them two numbers actually worth next to each other?
Streaming pays out around a penny a month per monthly listener, so 100 million is roughly $1 million a month.
Tee Grizzley has said Grizzley World brings in about $200,000 a month.
So 90,000 people pay him about a fifth of what 100 million people pay the biggest streaming artist alive.
One paying member is worth about 222 listeners. Which means Tee's 90,000 members price out like 20 million monthly listeners.

But the money aint even the sharpest part.
Tee Grizzley can name his 90,000. He can message them, price them, watch them come back.
Nobody can name they streaming listeners though. Not Drake, not me, not you: Spotify wasnt built to hand a relationship over, so it dont.
Reach that big is a miracle. It's just rented, for everybody, at every size.

Tee's figures is his own reported numbers, and 100 million listeners is a thing almost nobody on earth will ever build.
So the question aint who's winning. It's this:
you dont need 100 million. What would 1,000 members be worth to you, and where would they even sign up today?

I built a free calculator that shows what the audience you already own could be worth.
Comment OWN and I'll DM you the link.

128 👑  (visual end-card, not spoken)

### Video 4: Tobe Nwigwe vs Travis Scott: built or bought

**Spoken script:**

Travis Scott has one of the best machines in music behind him, and Tobe Nwigwe built 2 million followers with his wife and a camera for an amount of money that should embarrass the whole industry.

Let's break it down.

Tobe Nwigwe started getTWISTEDsundays. One new video, every Sunday, shot with his family.
No label. No PR. No marketing money.
By April 2018 that ritual alone had him past 100,000 followers. Today he's at 2 million, with a Reebok deal, and co-signs from Erykah Badu to Michelle Obama.

Now the machine side, and I want to be honest about it: a rollout like Travis Scott's is the most effective thing in the business.
Budget, placement, brand partners, a release treated like a national event.
It works. It moves numbers nobody can move on they own.

But look at what each fanbase actually IS.
One got assembled. One got recruited.
An assembled audience found you because something put you in front of them. A recruited one showed up because a person they trust dragged them in.

So I went back and worked out what Tobe's whole fanbase cost to build.
Not what it's worth. What it COST. And the number is the reason I keep telling artists this.

Hold that thought.
Your problem aint marketing to fans. It's that you need a market FOR fans.
Tobe built the relationship first and the business after, which is the harder order and the one that lasts.
Memberships, a vault, your fan list in your name: that's what artists run on the CRWN app.
ANYWAY.

So what did that whole fanbase cost to build?
Two million people. Zero dollars of marketing.
The entire cost was a camera, a Sunday, and showing up every week for years without missing.
There aint a line item anywhere. He paid for it in consistency instead of cash.

And here's why that matters more than the zero.
A bought audience stops the day the budget stops. A built one keeps working when you go quiet.
Tobe didnt chase the Reebok deal either. It came to him, because a fanbase that shows up for a Sunday video is proof of something a media buy can never prove.

Obviously Travis Scott's scale is a different sport, and most artists will never touch either number.
But if you're an independent artist with no marketing budget, that aint your disadvantage:
what would happen if you gave your people ONE thing to show up for every week, and never missed?

I built a free calculator that maps out what your whole fan business could look like.
Comment FREE and I'll DM you the link.

128 👑  (visual end-card, not spoken)

### Video 5: Rapsody's 328 songs nobody has heard

**Spoken script:**

Rapsody wrote 350 songs for one album and put out 22, and what them other 328 could be worth to her realest fans is a number most artists never even think about.

Let's find out what it is.

For Please Don't Cry, Rapsody wrote over 350 songs.
Three hundred fifty. The album that came out has 22 on it.
So one of the best pens in hip hop made 328 songs that almost nobody on earth has ever heard.

And that aint a Rapsody problem, that's every artist reading this.
The verses on your phone. The hooks in the voice notes. The joints that aint make the project.
We been trained to think unreleased means unfinished, so it sits there.

Now look at what her people already do.
That album ran limited vinyl, including an exclusive pressing of just 500 copies.
Five hundred fans stepped up for a physical object that does the exact same thing as the free stream, except it was scarce and it was hers.
So her core dont just listen. They collect.

So put the two facts next to each other.
328 songs that exist and cant be heard, and a fanbase that already pays for scarce.
That's not an archive on a hard drive. That's inventory.
And when I priced what that inventory could do in a year, the number wasnt small.

One more thing before I give it to you.
Your problem aint marketing to fans. It's that you need a market FOR fans.
On the CRWN app the vault is a real feature: tier-gated, sitting inside your membership ladder, so the unreleased work lives somewhere only paying members get to go.
ANYWAY.

So what are those 328 songs worth for Rapsody?
Let's say only 750 of them collectors join at $20 a month for the vault.
That's $15,000 a month, or $180,000 a year.
Off work that is already finished, already paid for, and currently earning nothing.

But the money is not the wild part.
328 songs is more music than most artists will release in an entire career.
She already made a second catalog. Nobody ever told her it was one, so it's been sitting there like a folder instead of a business.

Obviously that's a planning number, not a promise.
But if you been recording for years, do the same count on yourself:
how many finished songs are on your drive right now, and what would the people who already buy from you pay to finally hear them?

I built a free Vault Revenue Planner that prices exactly that.
Comment VAULT and I'll DM you the link.

128 👑  (visual end-card, not spoken)

--- THE THIRTY-ONE FAN ECONOMY CAROUSEL CAPTIONS (carousel number order) ---

### Caption 1 (carousel 1: Curren$y vs Westside Gunn: volume or scarcity)

Comment "VAULT" for what you lose leaving your best material unreleased.

Curren$y put out 90+ projects. Westside Gunn put out 400 copies of one project. Which one's fans are actually worth more, and by how much?

Before the math: Snoop reposted one of these when I broke down his own catalog. Lyfe Jennings, LL Cool J, Jagged Edge and Carl Thomas follow the CRWN app. Artists who lived through the label era are watching this shift closely.

Curren$y might be the most prolific rapper alive, around 1.5 million monthly listeners, and his model is volume. Westside Gunn runs the opposite play: he releases artifacts instead of records, pressings as small as 400 copies, one signed edition out of 187.

Nobody puts these two next to each other, so here goes. Streaming pays about a penny a month per listener, which is the discovery engine doing its job. But them 400 copies? Go look at what they trade for now.

One is wide. One is deep. So I priced them against each other, and when the numbers landed side by side I had to look again.

Hold that thought. You don't need to market to fans. You need a market FOR fans. Reach and depth ain't the same job, and most artists only got tools for the first. That's what the CRWN app is built around: membership tiers and a vault your top members get into. It's free to start, and it only takes a cut when you actually get paid.

ANYWAY.

So which fanbase is worth more, and by how much?

Them records go for around $300 a copy, about $120,000 on one pressing. 1.5 million monthly listeners generate roughly $15,000 a month. So 400 people spent what a million and a half spend in eight months.

And here's the crazy part. One collector paying $300 is 30,000 people listening for a month, except the 30,000 are anonymous and the 400 got names and addresses.

You know how many people hear you. Do you know which ones would pay $300 for what nobody else got?

I built a free Vault Revenue Planner that shows what sitting on it is costing you.

Comment "VAULT" before another year of it earns you nothing, and I'll DM you the link.

### Caption 2 (carousel 31: Mach-Hommy: he set the price himself)

Comment "VAULT" for what you give up every time somebody else sets your price.

Mach-Hommy sold a CD for $300 a copy. Then he put out a record for $999. Was he overcharging?

Most artists find out what their music is worth after the fact. You put it out, the market decides, and that's what you get.

Mach decides first. 187 copies of H.B.O. at $300 apiece in 2016, no auction and no bidding war, he just named the number. Then The G.A.T. in 2017, vinyl only, at $999, and most of his catalog never went to streaming.

People said he was crazy. A thousand dollars for a record when the industry trained everybody to expect it free.

Now put that against what happened next. That same record came up for auction in November 2025, so go look at what it went for. He wasn't guessing at that price, but he was wrong about it.

Hold that thought. You don't need to market to fans. You need a market FOR fans. Most artists got tools for getting heard and nothing for pricing what they own. The CRWN app is built for exactly that: tiers your fans join, and a vault behind one of them. Free to start, and it only takes a cut once the money actually comes in.

ANYWAY.

So was he overcharging at $999?

It sold for $24,400.

And it gets worse. He undercharged by about 24 times. The man they called crazy for asking $999 priced it too low, and them 187 CDs came to $56,100 from one release.

To be fair, streaming is how most of us found Mach at all. Discovery did its job.

But if you own something nobody else can sell, the real question is whether you ever asked for enough.

I built a free Vault Revenue Planner that shows what underpricing is costing you.

Comment "VAULT" before you price the next one too low, and I'll DM you the link.

### Caption 3 (carousel 32: Open Mike Eagle: four dollars a month)

Comment "OWN" for how many of your listeners will never pay you a cent as things stand.

Open Mike Eagle charges $4 a month. Just over a thousand people pay it. How many monthly listeners would he need to make that same money?

$4 is nothing, it's a coffee, and 1,071 people pay it every month whether he puts out a record or not.

That last part is the whole thing. Most artists only get paid when they release: you drop, you spike, the spike fades, and you go make another one to eat. His money shows up on the first either way. He's put 656 posts behind that paywall, so the membership is the product.

Now set that against the other number. Streaming pays about a penny a month per listener, which is the discovery engine doing its job. So a thousand people at $4 is worth how many of them? Go do that division before I say it.

Hold that thought. You don't need to market to fans. You need a market FOR fans. Most artists are growing the top number when the bottom one is what pays rent. That's the shape of the CRWN app, a ladder of membership tiers with a vault at the top. Costs nothing to start, and it only takes a cut when you get paid.

ANYWAY.

So how many monthly listeners does 1,071 people at $4 equal?

About 428,000.

And here's what got me. That's 400 times fewer people for the same money. A thousand he can name and email, against four hundred thousand he'd never meet. His pay again next month, and the rest have to come back on they own.

To be fair, $4 is his floor and not his average, so the real number is higher than my math. And streaming is how most of them found him.

So how many of the listeners you already got would pay $4, and why have you never asked?

I built a free Own Your Fans Calculator that shows how many of yours are unreachable.

Comment "OWN" before another month of listens pays you nothing, and I'll DM you the link.

### Caption 4 (carousel 33: Nipsey Hussle: the music was free)

Comment "VAULT" for what your top fans would have paid if you had ever given them the chance.

Nipsey Hussle put Crenshaw out for free. Same day, he sold physical copies for $100 each. So how many people paid $100 for music they could already have for nothing?

October 2013. He pressed a thousand CDs, priced them at a hundred apiece, and called it Proud2Pay. Everybody said it was arrogant, a hundred dollars for a mixtape from an unsigned rapper when the free version was going up online twelve hours later.

And it did go up. Free, no paywall, no trick, the exact same music.

So what were the thousand actually buying? They already had the songs, or they could get them by dinner. They was buying the object, a ticket to the show, and his signature on it. One is a file. One is a thing. I keep coming back to how fast it went.

Hold that thought. You don't need to market to fans. You need a market FOR fans. Most artists put the music behind the paywall and got nothing else to sell, so when it leaks the business is over. That's the whole idea behind the CRWN app: membership tiers, and a vault only your top members get into. It's free to start, and it only takes a cut when you actually get paid.

ANYWAY.

So how many paid $100 for free music?

All thousand, sold out in twenty four hours. A hundred thousand dollars in a day.

That's not even the part that got me. Jay-Z bought a hundred copies himself. Ten thousand dollars from one person, for a tape that was free on the internet.

The other half of this is that the free version is what made the paid one worth buying. Everybody who downloaded it and told a friend built the thing the thousand paid for. Discovery did its job and he let it.

But if the music was free and they still paid, what do you have that only your people can get?

I built a free Vault Revenue Planner that shows what having nothing to sell them costs.

Comment "VAULT" before your next drop gives them nothing to buy, and I'll DM you the link.

### Caption 5 (carousel 34: Ryan Leslie: forty thousand numbers in his phone)

Comment "OWN" for how many of your fans you could never contact without the platform.

Ryan Leslie gave forty thousand fans his actual phone number. Then he sold to fifteen thousand of them. How much did that come to?

Quick context: when I did the numbers on Snoop, he reposted it. Four artists who were selling records before streaming existed follow the CRWN app. The people who survived three versions of this business are paying attention to the fourth.

Most artists have followers, and a follower is a number on a screen that a platform lets you rent. You don't have their name, you can't reach them without paying somebody, and the day the algorithm changes they're gone.

Ryan went the other way and collected phone numbers, real ones, about forty thousand of them in a real address book. Fifteen thousand of them bought something. Not fifteen million, fifteen thousand. One number you rent, one you own, so go guess what that came to before I say it.

Hold that thought. You don't need to market to fans. You need a market FOR fans. Reach you can't contact is reach you're renting, and most artists are renting all of it. That's what the CRWN app is built around: membership tiers and a vault your top members pay to get into. Free to start, and it only takes a cut once the money actually comes in.

ANYWAY.

So what did fifteen thousand people spend with him?

Over two million dollars.

And here's what got me. That's about a hundred and thirty three dollars a person. The same fifteen thousand as monthly listeners generate about a hundred and fifty dollars a month, total, for everybody. Not each.

In fairness to the platforms, he found a lot of them on the same platforms everybody else uses. Discovery did its job. The difference is he didn't leave them there.

But if fifteen thousand people you can reach is worth two million, how many could you text right now, and why is that number zero?

I built a free Own Your Fans Calculator that shows how many you would lose overnight.

Comment "OWN" before the next algorithm change takes them, and I'll DM you the link.

### Caption 6 (carousel 35: Roc Marciano: thirty dollars to hear it first)

Comment "VAULT" for what you lose every time your day ones hear it at the same time as strangers.

Roc Marciano sold an album on his own site before anybody else could hear it. Not the vinyl, the download. So what did he charge just to hear it early?

Every artist has the same day circled. Release day, everybody gets it at once, everybody pays the same, which is nothing. Your biggest fan and somebody who never heard your name get the identical thing at the identical second.

Roc runs it different. RR2 went up on his own site first, direct, no store in between. If you wanted it before the world had it, you could have it, you just had to pay.

And he wasn't selling a rare object. No numbered vinyl, no signed jacket, no box. It was a file, the same file everybody else would get free on streaming a few weeks later. He was selling the date. Go guess the number before I say it.

Hold that thought. You don't need to market to fans. You need a market FOR fans. Every artist already has something to sell and gives it away by accident: being first. That's what the CRWN app is built around: membership tiers and a vault your top members pay to get into, and early access is one of the things you can put in them. Costs nothing to start, and it only takes a cut when you get paid.

ANYWAY.

So what did he charge for early access to a download?

Thirty dollars.

And that ain't even the wild part. Thirty dollars for a file, when a digital album went for about ten and free if you waited. They wasn't paying for the music, they was paying for three weeks.

One thing worth saying: the wide release is what pays the rest of the year, and streaming is how most people ever found Roc Marciano. Discovery did its job. He just stopped giving the first day away.

But if your day ones would pay to hear it before anybody, what is being first worth, and why does everybody get it at the same second?

I built a free Vault Revenue Planner that shows what treating them all the same costs.

Comment "VAULT" before your next release lands for everyone at once, and I'll DM you the link.

### Caption 7 (carousel 36: Stove God Cooks: the same album, nine ways)

Comment "DEMAND" for what a pressing run costs you when nobody wanted it.

Stove God Cooks put out one album called Reasonable Drought. Then he pressed it again. And again. How many versions of the same record did people buy?

Most artists press one vinyl. One colour, one jacket, one run. If it sells out that's the end of it, and the fans who missed it just missed it.

Reasonable Drought didn't work like that. The first press alone was five versions of the same record: twenty test presses, a hundred and twenty clear with fruit punch, three hundred and thirty five with a Japanese obi strip, three hundred and forty splatter, four hundred and sixty fruit punch. Then more came after, two hundred, four hundred, five hundred, and a run of a hundred and fifty with a holographic jacket.

Same songs, same tracklist, same everything you can actually hear. One album, many objects. Go count how many that is before I say it.

Hold that thought. You don't need to market to fans. You need a market FOR fans. Most artists sell one thing one time and wonder why the same fan never spends again. It's what the CRWN app does: membership tiers, with a vault sitting behind one of them. It's free to start, and it only takes a cut when you actually get paid.

ANYWAY.

So how many versions of one album is that?

Nine we can count, and the first press was five by itself.

And here's the crazy part. Collectors buy more than one. The same person owns the splatter and the obi strip, of the same album, with the same songs on it. He wasn't selling the music nine times, he made nine different objects that happen to play it.

This only works because the record is good and people wanted it. Scarcity on something nobody wants is unsold stock in your closet. And streaming is how most people heard it at all.

But if your real fans will own the same record twice, what could you make that the same person would buy again?

I built a free Proof of Demand Test Builder that tells you before you press anything.

Comment "DEMAND" before you pay for stock that sits, and I'll DM you the link.

### Caption 8 (carousel 37: Elzhi: they paid for a record that didn't exist)

Comment "DEMAND" for what it costs to fund a project your fans were never asked about.

In 2013 Elzhi asked his fans to pay for an album he hadn't made yet. No song, no tracklist, no release date. How many people sent money for nothing?

Every artist thinks the order is fixed. Make the thing, then find out if anybody wants it. Record it, pay for the mixing, press it, and then pray. All the risk sits on you, up front, before one person has said yes.

Elzhi flipped it. He put up a Kickstarter for an album that did not exist and asked people to fund it. No product, just his name and a promise.

And this wasn't label money or an advance he'd owe back forever. It was his own people, one at a time, paying in advance for a record they could not hear yet. A loan is money you pay back. This they were never getting back, and they sent it anyway. Go guess how many before I say it.

Hold that thought. You don't need to market to fans. You need a market FOR fans. Most artists carry all the risk themselves and find out at the end whether anybody cared. The CRWN app exists for that, membership tiers your people pay into and a vault they get access to. Free to start, and it only takes a cut once the money actually comes in.

ANYWAY.

So how many people paid for a record that didn't exist?

More than seven hundred, and about thirty seven thousand dollars.

And it gets worse. That record took nearly three years. Lead Poison finally arrived in 2016, and he was open about why: depression, and how hard the writing got. Most of them waited anyway.

The honest part is that the wait was hard on people and some were angry, and that's the other half of this. Money up front is a promise, and a promise you can't keep on time costs more than the money was worth. Take the pre-orders, then put the delivery date somewhere you can't lose it.

But if seven hundred people will pay for something that doesn't exist, how many of yours would fund it right now, and have you ever asked?

I built a free Proof of Demand Test Builder that tells you before you spend a dollar.

Comment "DEMAND" before you fund the next one alone, and I'll DM you the link.

### Caption 9 (carousel 38: Boldy James: four albums in one year)

Comment "VAULT" for what your back catalog stops earning the week after release.

In 2020 Boldy James put out more albums than most artists manage in five years. In one year, with a different producer on every one. How many?

The industry teaches one album every two years. Build up to it, roll it out, tour it, disappear, come back. That schedule wasn't built for the artist, it was built for a supply chain that had to ship plastic to shops.

Boldy ignored it completely. Different producer every time, months apart, no rollout, no wait.

Everybody measures that as output, as how much he made. Almost nobody measures it as inventory, and every one of them is still a thing a fan can buy today, years later.

Hold that thought. You don't need to market to fans. You need a market FOR fans. Most artists have a catalog sitting there doing nothing, because the only thing they ever did with it was upload it. That's what we built the CRWN app around: tiers people subscribe to, and a vault for the ones who go deepest. Costs nothing to start, and it only takes a cut when you get paid.

ANYWAY.

So how many albums did he put out in that one year?

Four. The Price of Tea in China with Alchemist in February. Manger on McNichols with Sterling Toles in July. The Versace Tape in August. Real Bad Boldy to close it.

And here's what got me. Six years later every one of them is still for sale, and the streaming on all four together is a few thousand a month split between them. Four things a fan can still buy, and the only thing anybody ever did with them was upload them.

Before anybody copies this, most artists can't work that fast and shouldn't try. Four rushed projects is worse than one finished one. And streaming carried those records to people who'd never have found them.

But if you already have a catalog nobody's paying for, what's already sitting there, and why is none of it behind a door?

I built a free Vault Revenue Planner that shows what your older work stopped earning.

Comment "VAULT" before the next one goes quiet too, and I'll DM you the link.

### Caption 10 (carousel 39: Knxwledge: half a million beats)

Comment "VAULT" for what an unpriced drive costs you every single month.

Knxwledge has put out more music than most labels release in a decade. Somebody asked him how many beats he's actually made. How many you think he said?

Why me on this: Snoop put his name on the last breakdown I did about him. Four artists who were selling records before streaming existed follow the CRWN app. Not because of me, because of where the money is moving in 2026.

He's been uploading since before most people had a Bandcamp. The Hexual Sealings run, the WrapTapes, the karma loops, dozens of releases on his own page with no label deciding when. That's the part people know. Prolific. Fine.

But released is not the same as made. Everything on that page is what he decided to put out, and behind it is the drive. One is a shop window. One is the warehouse. Go guess the number before I say it.

Hold that thought. You don't need to market to fans. You need a market FOR fans. Almost every artist has the same thing sitting there and treats it like a graveyard instead of a shelf. That's what the CRWN app is built around: membership tiers and a vault your top members pay to get into. It's free to start, and it only takes a cut when you actually get paid.

ANYWAY.

So how many beats has he made?

He estimated about half a million.

And here's the crazy part. He can't release half a million beats. No feed on earth could carry it and no fan could listen to it. But the people who love him would pay to get inside the drive. Not to own it. Just to be let in.

I should say, most of that is loops and sketches rather than finished songs, and half a million of anything is an estimate rather than a receipt. A beat with no home isn't automatically worth money, it's worth money to the people who already care.

But if what you already made is bigger than what you'll ever release, who would pay to see what's already on the drive?

I built a free Vault Revenue Planner that shows what leaving it unpriced costs.

Comment "VAULT" before another year of it sits there, and I'll DM you the link.

### Caption 11 (carousel 40: Oddisee: seven hundred a show)

Comment "TOUR" for what the months between shows cost you right now.

Before anybody knew his name, Oddisee was booking his own shows across Europe. No label, no agent, sleeping on promoters' floors. So what was he getting paid a night?

Most artists wait to be picked. Wait for the booking agent, the support slot, somebody with a spreadsheet deciding your city is worth the risk. And while you wait nothing happens, because nobody is coming.

Oddisee didn't wait. He got a rail pass and went country to country, playing rooms where nobody knew who he was, staying on the floor of whoever booked him.

That reads like paying dues, like a hard-luck story, and it wasn't. Every one of them rooms was him buying something, and it wasn't the fee. Go guess what a night was paying before I say it.

Hold that thought. You don't need to market to fans. You need a market FOR fans. A show isn't a payday, it's the only place you meet the people who'll pay you for the next twenty years. The CRWN app is built for exactly that: tiers your fans join, and a vault behind one of them. Free to start, and it only takes a cut once the money actually comes in.

ANYWAY.

So what was he getting a night?

About seven hundred dollars a show.

That's not even the part that got me. Seven hundred is nothing once you take out the travel, and he did it anyway, for years. What he was collecting was a room full of people in a city he could come back to. He built an audience one town at a time and it's still his.

It cuts both ways. Seven hundred with somebody else covering travel is a different job to seven hundred with you covering it, and plenty of artists can't afford that trade. This ain't a suggestion to go lose money on tour.

But if the room is worth more than the fee, did you leave with any way to reach the people who came?

I built a free Between-Tour Revenue Calculator that shows what the gap is costing you.

Comment "TOUR" before the next long gap, and I'll DM you the link.

### Caption 12 (carousel 41: Wu-Tang: one copy)

Comment "VAULT" for what you lose by having nothing only one person can own.

In 2015 Wu-Tang made an album and pressed exactly one copy. Not a limited run. One. So what did that single copy sell for?

Once Upon a Time in Shaolin. One album, one physical copy, in a silver box. And a legal condition attached: it cannot be released commercially until the year 2103. Not a typo. So whoever owns it owns the only way to hear it, and they can't sell you a copy even if they wanted to.

Every other album ever made was priced by dividing it. Press a hundred thousand, charge ten each. This one couldn't be divided, because there was nothing to divide. I still can't get over what happened to it after.

Hold that thought. You don't need to market to fans. You need a market FOR fans. Everybody's fighting to be heard by more people, and almost nobody asks what one person would pay for something nobody else has. That's the shape of the CRWN app, a ladder of membership tiers with a vault at the top. Costs nothing to start, and it only takes a cut when you get paid.

ANYWAY.

So what did one copy sell for?

Two million dollars, in 2015, through an auction house.

And that ain't even the wild part. The US government seized it and resold it for $2,238,482.30. Then a collective bought it for about four million. The same object, sold three times, and not one owner can legally put it out for another seventy odd years.

None of this works in a vacuum. It only worked because Wu-Tang spent twenty years making people care first. Every free listen built the name that made one box worth millions. Scarcity on something nobody wants is a box in a closet.

But if one object can be worth that, have you ever made a single thing only one person can own?

I built a free Vault Revenue Planner that shows what having no top rung costs you.

Comment "VAULT" before your biggest fan pays the same as everyone else, and I'll DM you the link.

### Caption 13 (carousel 42: De La Soul: thirty years off streaming)

Comment "OWN" for how many of your people you would lose if your catalog vanished tomorrow.

For about thirty years you could not legally stream De La Soul's classic albums. Not one of them. Then in March 2023 the catalog finally landed, so how many streams did it do in week one?

3 Feet High and Rising came out in 1989 and is one of the most loved rap records ever made. And for three decades it was not on Spotify, not on Apple, nowhere. Sample clearances and label disputes kept the early catalog locked, and a whole generation had no legal way to press play.

Every artist alive is told the same thing: if you're not on the platforms you don't exist, you'll be forgotten, the algorithm is the audience. De La Soul ran that experiment for thirty years by accident. Go guess what week one did before I say it.

Hold that thought. You don't need to market to fans. You need a market FOR fans. Most artists confuse the shelf with the demand, and the shelf is the part somebody else owns. That's the whole idea behind the CRWN app: membership tiers, and a vault only your top members get into. It's free to start, and it only takes a cut when you actually get paid.

ANYWAY.

So how many streams did thirty years of pent-up demand do in seven days?

Twelve and a half million in the US alone.

And here's what got me. 3 Feet High and Rising went straight back onto the Billboard charts, number eight on Top R&B and Hip-Hop Albums with 26,000 equivalent units, in 2023, off a record from 1989. The audience never left. It just had nowhere to go.

Worth saying plainly: thirty years off streaming cost them enormous money and reach, and nobody should copy that. It happened to them, they didn't choose it. And streaming is exactly what let that stored demand cash out in a week.

But if an audience can wait thirty years, could you reach anybody at all if the shelf disappeared?

I built a free Own Your Fans Calculator that shows how many you would lose with it.

Comment "OWN" before somebody else decides what happens to it, and I'll DM you the link.

### Caption 14 (carousel 43: Lil Dicky: funded before anybody knew him)

Comment "DEMAND" for what you pay out of pocket because you never asked them first.

In November 2013 a rapper nobody had heard of asked strangers to fund his album. No label, no hits, no track record. How much did they give him?

Why me on this: Snoop put his name on the last breakdown I did about him. Four artists who were selling records before streaming existed follow the CRWN app. Not because of me, because of where the money is moving in 2026.

Every artist has the same idea of the order. Get famous first, then monetise. Build the following, wait until you're big enough, and only then feel entitled to ask. So most people ask for nothing for years, then wonder why nobody's in the habit of paying them.

And the thing he asked people to buy did not exist, with no evidence he could even make it. They were buying a promise off a stranger. Go guess the number before I say it.

Hold that thought. You don't need to market to fans. You need a market FOR fans. The permission you're waiting for doesn't come from a follower count, it comes from asking. It's what the CRWN app does: membership tiers, with a vault sitting behind one of them. Free to start, and it only takes a cut once the money actually comes in.

ANYWAY.

So how much did strangers give a rapper nobody knew?

$113,017, from 2,813 people.

And that ain't even the wild part. That's about forty dollars a head from people with no idea whether he'd deliver, and 2,813 people is nothing. A small club, not a stadium, not a chart position. It funded the thing that started the whole career.

He wasn't starting from nothing. The attention was real first. The videos did that work, and the internet put him in front of those people. Crowdfunding is not a substitute for anybody caring.

But if 2,813 strangers will fund somebody with no track record, how many people already care about you, and why have you never asked one of them for anything?

I built a free Proof of Demand Test Builder that tells you before you spend a dollar.

Comment "DEMAND" before you fund another one yourself, and I'll DM you the link.

### Caption 15 (carousel 44: Noname: a book club in five countries)

Comment "OWN" for what you lose by never giving your people somewhere to show up.

Noname runs a book club. Not a fan club, a book club, with chapters in five countries. So how many chapters does a rapper's reading group actually have?

She's independent. She self-released Sundial in 2023 and it topped Rolling Stone's rap albums list that year, and she's said out loud what pays for the records: ticket sales and vinyl.

The book club connects people inside and outside prisons with radical books, and everything it offers is free. There's no tier, no paywall, nothing to buy and nothing to upsell.

Every artist is told to build a community, and what they usually build is a group chat that goes quiet in a month. Hers meets in actual cities whether or not she puts a record out. Go guess how many chapters before I say it.

Hold that thought. You don't need to market to fans. You need a market FOR fans. The strongest thing you can offer is often not more music, it's a reason to be in a room with each other. The CRWN app exists for that, membership tiers your people pay into and a vault they get access to. Costs nothing to start, and it only takes a cut when you get paid.

ANYWAY.

So how many chapters does the book club have?

Twenty four. Twenty in the United States, plus London, Lagos, Accra and Nairobi.

That's not even the part that got me. Every one is free, and they're why her audience is an audience instead of a follower count. When she tours those are the rooms, and when she presses vinyl those are the buyers. The free thing is what makes the paid thing possible.

One caveat: a book club is hers specifically and copying it exactly would be nonsense. This ain't a template. And streaming is how most people found the music first.

But if a free reading group in five countries is what holds an audience together, what would your people show up for if you never released another song?

I built a free Own Your Fans Calculator that shows what having no room costs you.

Comment "OWN" before another year with nowhere for them to gather, and I'll DM you the link.

### Caption 16 (carousel 45: Atmosphere: they said no to three labels)

Comment "TOUR" for what every month off the road takes out of your pocket.

Interscope came for Atmosphere. So did Sony. So did Warner Brothers. They said no to all three. So what did they do instead?

By 2002 God Loves Ugly had done its work and the majors noticed. Three of the biggest in the business came knocking, and for most artists that call is the whole dream. Slug and Ant turned it down and kept building Rhymesayers, their own label.

Saying no to a major is easy to say and expensive to do. An advance is money somebody hands you. The other road is a bill you pick up yourself, and nobody is coming to save it. Go guess what they did instead before I say it.

Hold that thought. You don't need to market to fans. You need a market FOR fans. An offer is only worth what you'd give up to take it, and most artists have never priced the other side. That's what we built the CRWN app around: tiers people subscribe to, and a vault for the ones who go deepest. It's free to start, and it only takes a cut when you actually get paid.

ANYWAY.

So what did they do instead of signing?

They toured 60 shows in 71 days.

And here's the crazy part. Early on they drove Minneapolis to Dallas, about a thousand miles, to play one show for $250. Nobody does that for the fee. They did it because every room was a city they could come back to, and those rooms are still theirs. Rhymesayers became the blueprint half the independent labels in the country copied.

There's a catch. Turning down three majors is a decision you can only make if you already have something they want, and plenty of artists never get that call. And this was brutal. 60 shows in 71 days is not a lifestyle, it's a price.

But if the alternative to signing is that much work, what would you be handing over, and is it an audience you could have kept?

I built a free Between-Tour Revenue Calculator that shows what the months off cost.

Comment "TOUR" before your next stretch at home, and I'll DM you the link.

### Caption 17 (carousel 46: 38 Spesh vs Snoop Dogg: a thousand buyers)

Comment "VAULT" for what you lose counting plays instead of buyers.

Snoop Dogg said a billion streams paid him under forty five thousand dollars. 38 Spesh pressed a thousand records.

Which one made more?

Snoop said it publicly and threatened court if nobody explained the math. There's splits and labels and publishers between an artist and that money, so treat his figure as his claim, not a receipt.

A billion plays. The biggest number in this business, the one everybody is chasing.

38 Spesh runs his own label out of Rochester. He put out a twelve inch limited to a thousand copies, and records in that catalogue run about thirty dollars.

Here's the thing nobody puts side by side.

One of those numbers is a million times bigger than the other one.

One is reach. One is a customer list.

Go do that math before I say it.

Hold that thought. You don't need to market to fans. You need a market FOR fans. Reach and revenue are two different systems and almost nobody has been shown the second one. The CRWN app is built for the second one: tiers your fans join, and a vault behind one of them. It's free to start, and it only takes a cut when you actually get paid.

ANYWAY.

So which made more, a billion streams or a thousand records?

A thousand records at about thirty dollars is roughly $30,000. Snoop said the billion paid under $45,000.

And here's the crazy part. The billion won, barely. It took a thousand million plays to beat a thousand people, by about the price of a used car. And 38 Spesh knows where all thousand of his went. Snoop can't name one of the billion.

Now to be fair, Snoop's catalog earns in ways a twelve inch never will, and streaming put him in front of more people than any format in history. And a thousand-copy run only works if a thousand people already care.

But if a thousand buyers can go toe to toe with a billion plays, the question ain't how do I get more streams. It's how many would buy the thing, and whether you've made one.

I built a free Vault Revenue Planner that shows what having no buyers costs you.

Comment "VAULT" before you chase another million plays, and I'll DM you the link.

### Caption 18 (carousel 47: SAULT: free for five days)

Comment "VAULT" for what you lose when nothing you make ever runs out.

In November 2022 SAULT put out five albums on the same day, for free. Free, but you needed a password, and it was only up for a few days. How long?

SAULT are anonymous on purpose. No interviews, no photographs, barely a face between them.

Then one day: five albums at once, download them all, pay nothing. Except you needed the password to open the folder, and the folder was not going to stay up.

Free usually means always available and worth nothing. That's the deal everybody made with the internet. This one didn't cost money, it cost attention. Go guess how long the window was before I say it.

Hold that thought. You don't need to market to fans. You need a market FOR fans. Price is only one lever. Time is another one, and hardly anybody touches it. The CRWN app is built for exactly that: tiers your fans join, and a vault behind one of them. Costs nothing to start, and it only takes a cut when you get paid.

ANYWAY.

So how long was five albums of free music available for?

Five days.

And here's what got me. Nothing was sold and everybody moved anyway. You had to be paying enough attention to know it was happening, get the password, and act inside five days. That's a filter, and everybody who came through it proved something a free download normally never proves.

This only works in context. They can do it because people were already watching closely. A five day window on music nobody's waiting for is just five quiet days. And the rest of their catalog lives on streaming, which is how most people found them.

But if free can still be scarce, has anything you put out ever had a reason to act now attached to it?

I built a free Vault Revenue Planner that shows what permanent availability costs.

Comment "VAULT" before the next one sits there forever, and I'll DM you the link.

### Caption 19 (carousel 48: Del vs J. Cole: nine albums)

Comment "ROYALTY" for the money your songs already earned that nobody is collecting.

Del the Funky Homosapien walked away from a major label. J. Cole built his own label inside one. Who has more albums out with no major label behind them?

Del put out two albums on Elektra, in 1991 and 1993, then left. Since 1997 it's been Hieroglyphics Imperium, the label he and his people built, and a lot of it straight self-released.

J. Cole pulls around thirty seven million listeners a month, and he built Dreamville too. He just built it inside the major system.

Here's the thing nobody puts side by side. Monthly listeners are rented, and they can drop next month without you doing anything wrong. A record on your own label is still under your name thirty years later. These two made opposite bets on that, and I promise you'll guess at least one of the numbers wrong.

Hold that thought. You don't need to market to fans. You need a market FOR fans. That's the whole idea behind the CRWN app: tiers your fans join, and a vault behind one of them. It's free to start, and it only takes a cut when you actually get paid.

ANYWAY.

So who has more albums out with no major label behind them, Del or J. Cole?

Nine of Del's eleven studio albums came out on his own label, self-released, or on an independent. J. Cole has none of his seven, and every one of them debuted at number one. So Cole went through the majors and came out with seven number ones, and Del walked away and came out with nine albums no major ever touched.

That's not even the part that got me. Two of Del's albums belong to a deal he signed as a teenager. The nine that came after are still out on his terms thirty years later.

So the question ain't how do I grow the number. It's how much of what you've made is really yours, and whether anybody is collecting what it earns.

I built a free Royalty Readiness Check that shows which royalty streams your songs have earned that nobody is collecting.

Comment "ROYALTY" before another year of it goes uncollected, and I'll DM you the link.

### Caption 20 (carousel 49: Benny vs Post Malone: they bought it twice)

Comment "VAULT" for what to charge the fans who never get offered anything above a regular copy.

Post Malone has more than sixty million monthly listeners and sells records off his own store. Benny the Butcher's first Stabbed & Shot with 38 Spesh sold out, and the sequel came in a stack of versions. Whose fans pay more for one copy of a record?

Sixty million a month is an audience the size of a country. Benny's sequel didn't come cheaper, and some of its versions were a lot rarer than others.

Here's the thing nobody puts side by side. You'd think the price follows the size of the crowd. I did too.

Hold that thought. You don't need to market to fans. You need a market FOR fans. A buyer can buy again, and buy up. The CRWN app is built for exactly that: tiers your fans join, and a vault behind one of them. It's free to start, and it only takes a cut when you actually get paid.

ANYWAY.

So whose fans really pay more for one copy, Post Malone's or Benny's?

Post's F-1 Trillion is $45.99 on his store, a double record, and nothing on his record shelf costs more. Benny's regular copies of Stabbed & Shot 2 run $29.98 to $34.98. So on a regular copy Post gets more, and he can sell it to sixty million people. But the store selling Benny's record listed five test pressings at $250 each, and every one is sold out. One of those cost more than five of Post's double records.

Now here's what got me. The first one sold out at $24.98. The sequel went to $34.98 on a regular copy and $250 on the rarest, and people kept buying. Nobody raises the price on people who barely wanted it the first time.

To be fair, five test pressings is five people. But the question ain't how many people heard it. It's whether anybody in your world has ever been given a second thing to buy, at a higher price.

I built a free Vault Revenue Planner that shows whether the unreleased songs nobody has heard are enough to run a Vault, and what to charge for it.

Comment "VAULT" before another fan leaves with nothing higher to buy, and I'll DM you the link.

### Caption 21 (carousel 50: Murs: twenty four hours)

Comment "LIVE" for what every year without one real night costs you.

In October 2016 Murs stood in front of a camera and rapped without stopping for over twenty four hours. A Guinness World Record, live on Twitch. So why would anybody do that?

Not a song, not an album. A record attempt, streamed live, that you either watched happen or you missed.

Roughly twenty songs an hour for over a day straight, about 480 songs worth of rapping. There is no version of it you can buy afterwards.

Every artist thinks the catalogue is what they sell and everything else is promotion for it. This was the other way round, and there was nothing to take home. Go think about why anybody sat and watched before I say it.

Hold that thought. You don't need to market to fans. You need a market FOR fans. The most valuable thing you have is often the thing that can only happen once and only with you. It's what the CRWN app does: membership tiers, with a vault sitting behind one of them. Costs nothing to start, and it only takes a cut when you get paid.

ANYWAY.

So how long did he actually go?

Over twenty four hours, nonstop, on a live stream.

And that ain't even the wild part. Nobody watched all of it and it didn't matter. What they were buying, with their time, was being there while it happened. The being-there is the product and it expires the second it's over. You can't download that, you can't pirate it, there's no cheaper version anywhere.

A stunt is not a business, though, and doing something exhausting isn't automatically valuable. Plenty of people have done hard things nobody cared about. It worked because he already had people who wanted to be in the room.

But if being there is the thing that can't be copied, what could you do once, that only you could do, that your people would clear their evening for?

I built a free Live Experience Calculator that shows what never doing one costs.

Comment "LIVE" before another year goes by without one, and I'll DM you the link.

### Caption 22 (carousel 51: Little Simz: eleven shows)

Comment "TOUR" for what you lose on every night you're not on stage.

In 2022 Little Simz had just won a BRIT and had eleven American dates on sale, Portland first. Then nothing. Why did she cancel all eleven?

Simz was not a small artist that year. Her album was on every list in the country, and millions of people were listening to her every month.

Here's the thing everybody assumes and gets wrong. When a tour gets pulled you think illness, or visas, or nobody bought a ticket. None of those. When I read the real reason I had to go back and read it again.

Hold that thought. You don't need to market to fans. You need a market FOR fans. Reach and revenue are two different systems and almost nobody has been shown the second one. The CRWN app is built for the second one: tiers your fans join, and a vault behind one of them. Free to start, and it only takes a cut once the money actually comes in.

ANYWAY.

So why did Little Simz cancel eleven shows weeks after winning a BRIT?

She was paying for the whole thing out of her own pocket, and she said going ahead would leave her in a huge deficit.

And it gets worse. The tickets were selling. The award was weeks old, the album was everywhere, and the arithmetic still came out negative before she played a single note. An artist with millions of listeners could not afford to go and stand in a room with them.

To be fair, streaming is how she got those listeners, and she went back out the following year and played the rooms.

But if a BRIT winner can be one tour away from losing money, the question ain't how do I get bigger. It's how many of your listeners have ever paid you anything, and whether you could reach them if you had to.

I built a free Between Tour Calculator that shows what the nights you're not on stage are costing you.

Comment "TOUR" before you plan another run that loses money, and I'll DM you the link.

### Caption 23 (carousel 52: Joe Budden vs Future: seventy thousand who pay)

Comment "WORTH" for what the paying fans inside your audience are worth every month nobody asks them.

Future has about 52 million monthly listeners. Joe Budden has about 70,000 members. Whose fans pay more every month?

Future is one of the most streamed rappers alive, and that reach took twenty years to build.

Joe Budden stopped rapping, built a show, put it behind a paywall, and asked the people already listening to pay him directly. About seventy thousand of them said yes.

Here's the part that never gets compared. One number is in the millions and the other is in the tens of thousands, and they get paid two completely different ways.

Hold that thought. You don't need to market to fans. You need a market FOR fans. Reach and revenue are two different systems, and the CRWN app is built for the second one: tiers your fans join, and a vault behind one of them. Free to start, and it only takes a cut once the money actually comes in.

ANYWAY.

So whose fans pay more every month, Future's or Joe Budden's?

Streaming pays about a penny a month per monthly listener, so 52 million listeners is roughly $520,000 a month. Joe Budden's network averages about $1.04 million a month from its members. That means 70,000 people pay about double what 52 million do. But Future's half shows up without him asking anybody, and Joe has to earn his back every month.

And here's the crazy part. One of Joe's members is worth about 1,500 of Future's listeners, with no album, no tour and no label behind it. And he can name every one of them, because they gave him their details to pay him.

To be fair, that penny is a rough number, and Future's catalog earns in ways a subscription never will. But the question ain't how do I get more listeners. It's how many of yours would pay you something small every month, and whether you've ever asked them.

I built a free calculator that shows what the paying group inside your audience is worth every month, and what it costs you to never ask.

Comment "WORTH" before another month goes by without asking, and I'll DM you the link.

### Caption 24 (carousel 53: Brent Faiyaz vs PARTYNEXTDOOR: the advance he refused)

Comment "OWN" for how many of your own listeners you still can't reach without a label in the middle.

PARTYNEXTDOOR was the first artist signed to Drake's OVO, with Warner behind it. Brent Faiyaz turned the majors down and started his own label.

Who got a top ten album faster?

A major deal is what every new R&B singer waits for, the machine and the rooms you can't get into alone, and PARTYNEXTDOOR's built a career most singers never touch.

Brent was unsigned, uploading records. The offers reportedly reached a quarter of a million up front, and his manager says one carried an 11 percent royalty. He said no and started Lost Kids.

Here's the thing nobody puts side by side. Saying no as a nobody sounds insane until you work out what a deal really sells. Time. I lined the dates up and counted twice.

Hold that thought. Your problem ain't marketing to fans. It's that you need a market FOR fans. The CRWN app is built for that: tiers your fans join, and a vault behind one of them. It's free to start, and it only takes a cut when you actually get paid.

ANYWAY.

So how long did each of them take to get a top ten album?

PARTYNEXTDOOR signed in 2013, and PARTYNEXTDOOR 3 went to number 3 in 2016. About three years. Brent started Lost Kids in 2016, and Wasteland went to number 2 in 2022. About six. The deal got PARTYNEXTDOOR there in half the time, which is what a deal is for. And Brent got there at number 2, on his own label.

Now here's what got me. That quarter of a million was a loan against his own royalties, and on the deals he was offered the label kept the recordings even after it was paid back. The three years a deal saves you are real. So is the price.

To be fair, that deal put PARTYNEXTDOOR in front of the world, and six years only work if you can survive them without the cheque.

If the biggest offer is your own money handed over early, the question ain't how do I get signed. It's how many of the people already listening you could reach yourself.

I built a free Own Your Fans Calculator that shows how much of your audience you can't reach without somebody in between.

Comment "OWN" before you take anybody's cheque, and I'll DM you the link.

### Caption 25 (carousel 54: Ledisi vs H.E.R.: the Grammy after she left)

Comment "OWN" for how much of the audience you already earned is still out of reach without somebody in the middle.

H.E.R. signed a major label deal at fourteen. Ledisi spent about ten years on Verve, then left and started her own label.

Whose first Grammy took more nominations to win?

Ledisi's Verve years were album after album, respect from everybody in the building, and nomination after nomination.

In January 2019 she left and started Listen Back Entertainment, her name on the paperwork.

Here's the thing nobody puts side by side. Everybody assumes the label is what gets you the trophy, and for one of these two women that turned out to be true. I counted the other one's nominations twice.

Hold that thought. You already know how to market to fans. Now you need a market FOR fans. The CRWN app is built for that: tiers your fans join, and a vault behind one of them. It's free to start, and it only takes a cut when you actually get paid.

ANYWAY.

So how many nominations did each need before one won?

H.E.R. was nominated five times her first year nominated, and won two that night. Ledisi was nominated twelve times across ten years on Verve and lost every one. Her thirteenth won, thirteen years after her first. H.E.R. got the fastest yes the Grammys give anybody, and Ledisi's yes came on a record that belongs to her.

But that ain't even the wild part. Twelve nominations means the room already knew who Ledisi was. The one that won, Anything for You, came out on the label she started after she left. Same voice, same woman, and the only thing that changed was who the record belonged to.

To be fair, Verve put Ledisi in front of audiences she'd have taken years to reach alone, and H.E.R.'s label is doing exactly what a label is for.

But if the trophy showed up two years after she left, the question ain't how do I get somebody to back me. It's what you already own, and whether the people who love it can pay you directly.

I built a free Own Your Fans Calculator that shows how much of your audience you still can't reach without a label or platform in between.

Comment "OWN" before another record goes out to fans you can't reach, and I'll DM you the link.

### Caption 26 (carousel 55: Freddie Gibbs: the same shelf)

Comment "ROYALTY" for the royalty streams your records have already earned that nobody is collecting.

Freddie Gibbs made Alfredo with Alchemist and put it out on ESGN, a label he owns himself. No major behind it.

How high did it chart?

A major label album gets radio, marketing, playlist relationships, a release date the whole industry moves around. Nobody is pretending that isn't an advantage.

Gibbs still needed distribution and used Empire for that, but the record belonged to him. No machine. A rapper and a producer with a release date.

Here's the thing nobody puts side by side. Everybody assumes independent means smaller rooms and lower shelves. Then you look at where it landed, and I had to read the chart twice.

Hold that thought. You don't need to market to fans. You need a market FOR fans. Reach and revenue are two different systems, and almost nobody has been shown the second one. The CRWN app is built for the second one: tiers your fans join, and a vault behind one of them. It's free to start, and it only takes a cut when you actually get paid.

ANYWAY.

So how high did Alfredo chart on his own label?

Number fifteen on the Billboard 200.

And here's the crazy part. It got nominated for Best Rap Album. It sat in the same category as Nas and Jay Electronica, and it came off a label one man owns. Same shelf. Very different split on every copy sold.

Now to be fair, a number fifteen peak is not a number one, and a major can move a record in ways an independent simply cannot. Gibbs also had fifteen years of records behind him before Alfredo, which is why anybody was waiting for it.

But if you can reach the same shelf on your own imprint, the question ain't how do I get somebody to put me there. It's what you keep when you arrive, and whether the people who bought it are yours or theirs.

I built a free Royalty Readiness Check that shows which royalty streams your music has earned from that nobody is collecting for you.

Comment "ROYALTY" before another record earns money nobody collects, and I'll DM you the link.

### Caption 27 (carousel 56: Big K.R.I.T. vs Gunna: six years)

Comment "OWN" for how many of your fans you can't reach on release day without asking anybody.

In 2016 Gunna signed to Young Thug's YSL Records, through 300 Entertainment. That same year Big K.R.I.T. walked away from Def Jam after six years.

Whose fans have gotten more albums since, Gunna's or K.R.I.T.'s?

Before Def Jam, K.R.I.T. was one of the most prolific rappers in the south, free projects back to back, many on his own beats. They signed a man who could not stop working. Six years there gave him two albums, both Top Five. Then he started Multi Alumni and took on everything a building used to do.

Here's the thing nobody puts side by side. One has a label that picks the date and pushes every record. The other picks his own date and pushes it himself. I counted what each one put out, then counted again.

Hold that thought. You don't need to market to fans. You need a market FOR fans. The CRWN app is built for that: tiers your fans join, and a vault behind one of them. It's free to start, and it only takes a cut when you actually get paid.

ANYWAY.

So whose fans got more albums since 2016?

Gunna has put out six studio albums, every one top three, two of them number one. Big K.R.I.T. put out four, on his own label, on nobody's schedule but his. For every three of Gunna's, K.R.I.T. made two while building the machine himself.

That's not even the part that got me. Two albums in six years on Def Jam. Four since he left. And the first one back was a double album, 22 tracks, eight produced by him. It was never a shortage of songs.

To be fair, Gunna's pace is a label working exactly as it should, and those number ones reach an audience four independent albums never would. And a roster means somebody decides who gets pushed when, a real constraint, not a conspiracy.

If you're on K.R.I.T.'s level, the question ain't how do I get on a roster. It's whether you can reach your own people the day you finish something, without asking anybody.

I built a free Own Your Fans Calculator that shows how much of your audience you can't reach without going through somebody else.

Comment "OWN" before another finished record waits on permission, and I'll DM you the link.

### Caption 28 (carousel 57: Tha God Fahim vs Playboi Carti: seventy tapes)

Comment "DEMAND" for what it costs you to make something nobody was going to buy.

Between 2015 and 2018, Playboi Carti made his fans wait for every record. Tha God Fahim never made his fans wait at all.

Whose fans had more new projects to buy in those three years, Carti's or Fahim's?

Carti's model is scarcity: long waits, no explanation, the wait doing the marketing. It works, because when he does show up the whole internet stops.

Fahim went the other way. Atlanta, no label deal, tape after tape sold straight off his own Bandcamp page, so fast that Bandcamp's own editorial site wrote a guide to help people keep up.

Here's the thing nobody puts side by side. Count what each one gave a fan to buy in the same three years. I counted both twice before I trusted the gap.

Hold that thought. You don't need to market to fans. You need a market FOR fans. A play only tells you somebody listened. The CRWN app is built for the people who would pay: tiers your fans join, and a vault behind one of them. Costs nothing to start, and it only takes a cut when you get paid.

ANYWAY.

So whose fans had more to buy in those three years, Carti's or Fahim's?

Carti put out two projects, and Die Lit went top three on the Billboard 200. Fahim was approaching seventy tapes. That's about 35 for every one of Carti's. Carti's two hit a massive audience all at once. Fahim's found their buyers one sale at a time.

But that ain't even the wild part. Every one of those tapes was a sale, not a stream, so every buyer paid him directly. Carti's streams don't come with names attached.

To be fair, the attention scarcity needs is the harder thing to build.

But if a man in Atlanta with no label deal can build buyers seventy releases deep, the question ain't how do I get more plays. It's how many people would actually buy the next thing, and whether you have any way to ask them.

I built a free Proof of Demand Test Builder that sets up a test to find out if fans will pay for it before you make it.

Comment "DEMAND" before you make the next one without asking, and I'll DM you the link.

### Caption 29 (carousel 58: DJ Muggs vs DJ Khaled: a year with no permission)

Comment "VAULT" for the months you lose sitting on finished music with no drop schedule.

In 2021 DJ Khaled had a major label building behind him. DJ Muggs had his own studio and nobody to ask.

Which DJ gave his fans more albums that year, Khaled or Muggs?

Khaled runs the biggest version of the normal model: radio, features, a rollout, a date agreed months ago. That is what a major label machine is FOR, and he's very good at it.

Muggs came out of Cypress Hill and built Soul Assassins into his own label. A rapper turns up, they make a record, it goes out.

Here's the comparison nobody bothers to make. One needs a building to say yes. The other needs an afternoon. I checked the release dates twice before I believed the count.

Hold that thought. You don't need to market to fans. You need a market FOR fans. Getting heard and getting paid are different systems, and almost nobody shows artists the second. The CRWN app is built for the second one: tiers your fans join, and a vault behind one of them. Free to start, and it only takes a cut once the money actually comes in.

ANYWAY.

So which one gave his fans more albums in 2021, Khaled or Muggs?

Khaled put out one, Khaled Khaled. It hit number one on the Billboard 200 and went platinum, further than any of Muggs's. Muggs put out seven, two solo and five with a different rapper each time: something new about every seven weeks.

And here's what got me. Not one of the seven needed a building to say yes. He wasn't waiting on a slot. There was no slot.

To be fair, Khaled's reach is the harder thing to build, and Muggs spent thirty years earning fans who show up unprompted.

But if the whole difference is whether somebody has to approve you, the question ain't how do I get in the building. It's how often you could drop something new for the people who already buy from you, and whether you have enough finished.

I built a free Vault Revenue Planner that shows whether you have enough music to drop on a schedule and what to charge, without waiting on anybody's yes.

Comment "VAULT" before another month goes by with nothing new for them to buy, and I'll DM you the link.

### Caption 30 (carousel 59: Jorja Smith vs Ella Mai: three albums, no deal)

Comment "OWN" for how much of your audience you can't reach without a platform in the middle.

Ella Mai and Jorja Smith both put out debut albums in 2018. One signed with a major label. The other never signed a record deal.

Who has put out more albums since then, Ella Mai or Jorja Smith?

Ella Mai signed to Mustard's 10 Summers through Interscope and got the machine: the record that went everywhere, the Grammy. That is the path working exactly as advertised.

Jorja came up off the same wave of British R&B, started her own label, FAMM, and put everything out through it.

Here's the thing nobody puts side by side. The assumption is that no deal means fewer releases. I went album by album on both before I trusted my count.

Hold that thought. You don't need to market to fans. You need a market FOR fans. Reach and revenue are two different systems and almost nobody has been shown the second one. The CRWN app is built for the second one: tiers your fans join, and a vault behind one of them. It's free to start, and it only takes a cut when you actually get paid.

ANYWAY.

So who has put out more albums since 2018, Ella Mai or Jorja Smith?

Neither one. Three each. Ella Mai's came with a major behind them, and her debut went double platinum in America. Jorja's all came out on her own label, and two went top three in the UK. One EP each in between, too.

And here's the crazy part. Going without a deal did not cost Jorja Smith a single album, and there is no record company that can put a finished one of hers on a shelf.

To be fair, the major got Boo'd Up to top five in America, and that reach is the harder thing to build.

But if you can build all of that and keep every record on your own label, the question ain't who is going to sign me. It's what you already own, and whether you have a direct way to sell it to the people who want it.

I built a free Own Your Fans Calculator that shows how much of your audience you can actually reach yourself, without a label or a platform in between.

Comment "OWN" before another release goes out to people you have no way to reach, and I'll DM you the link.

### Caption 31 (carousel 60: Kool Keith: forty seven albums)

Comment "VAULT" for what you lose every month your best fans have nothing to buy.

Kool Keith has forty seven studio albums. Not mixtapes, not features. Studio albums, since the eighties. Every one bought by somebody who paid for it and took it home.

How many of those buyers can he reach today?

Forty seven is not a typo. Twenty four on his own and twenty three with other people.

Decade after decade, through every format this business went through: cassettes, then CDs, then vinyl, then downloads. He never stopped, and the whole time people were buying. Nobody made them.

Here's the thing nobody stops to work out.

Forty years of people paying for records is forty years of hands going up. Ask where those hands went.

Go guess before I say it.

Hold that thought. You don't need to market to fans. You need a market FOR fans. An audience and a customer base are different things, and the gap between them is where the money sits. The CRWN app is built for the second one: tiers your fans join, and a vault behind one of them. Free to start, and it only earns when a fan actually pays you.

ANYWAY.

So how many of those buyers can Kool Keith actually reach?

Not one. There is no list. Forty seven albums and he cannot message a single person who bought one.

And it gets worse. That is one of the deepest catalogs in rap, and it is worth less than a list of the people who already paid for it. The records are an asset he owns. The buyers were never his. The store kept them, then the label, then the platform. Every one of those people would probably buy again, and he has no way to ask.

Now to be fair, streaming is the reason a forty year catalog is still findable at all. A kid can hear a 1996 record tonight without knowing one thing about him, and that is genuinely new.

But if forty seven albums can be worth less than the list of people who bought them, the question ain't how do I make more. It's whether anyone who already paid you has a way to hear from you again.

I built a free vault revenue planner that shows what you're leaving on the table every month.

Comment "VAULT" before another month goes by with nothing for them to buy, and I'll DM you the link.

--- END OF CONTENT ---

-------------------------------------------------------------------------------
TASK 0: THE PROMISE LEDGER (do this before touching the product)
-------------------------------------------------------------------------------
From the 36 pieces above, write the ledger of concrete beliefs and expectations a viewer carries to the keyword
or the link:
- Every NUMBER or RATIO the content teaches as a rule (for example: what streaming pays per listener per month,
  how many listeners one paying member replaces, what a $4 member is worth, what a small vault is worth).
- Every PROMISE the CTAs make. Quote each distinct promise ("shows how many of yours are unreachable", "shows
  what the direct-support side of your audience could be worth", "maps out what your whole fan business could
  look like", "costs nothing to start, and it only takes a cut when you get paid", and every other one you
  find) and count how many pieces make it.
- Every KEYWORD, the tool the content says it unlocks, and how many pieces use it.
- Every ENEMY the content names (reach without depth, the algorithm, the label, the release-and-fade cycle,
  people you cannot name or email) and the emotional state the viewer arrives in.
- What the viewer expects to SEE after commenting, in one sentence, in their words.
Number the ledger entries. Every finding later must cite the ledger entry it violates or fulfils.

-------------------------------------------------------------------------------
WHO YOU ARE (three personas, run in this order)
-------------------------------------------------------------------------------
PERSONA 1, "The Vault" (the majority viewer: fourteen of the 36 pieces route to VAULT). Dre, 26, he/him,
Chicago, hip-hop. Instagram 9,400, TikTok 6,000, Spotify monthly listeners about 4,200. Never sold anything
directly to fans; streaming pays about $70 a month. No email list. On his phone: 38 unreleased songs, about 45
demos, 80 voice memos, 20 studio clips, a folder of alternate versions. He releases something every two or
three months and the spike fades every time. He just watched VIDEO 5 (Rapsody's 328 songs) and read CAROUSEL 1
(Curren$y vs Westside Gunn) and CAROUSEL 46 (38 Spesh vs Snoop). He arrives expecting to find out whether what
is on his phone is worth anything, and what to charge for it. Uses EMAIL_P1.

PERSONA 2, "Merch Table". Tasha, 29, she/her, Memphis, R&B. Instagram 38,000, TikTok 51,000, monthly listeners
about 22,000. Sells merch at shows and through a Shopify store, roughly $400 a month, and has 600 customer
emails from those orders. Streaming pays about $350 a month. 30 finished unreleased songs. She is thinking about
a limited hoodie run and does not want to front the money blind. She just read CAROUSEL 43 (Lil Dicky funded
before anybody knew him) and CAROUSEL 32 (Open Mike Eagle, four dollars a month). Uses EMAIL_P2.

PERSONA 3, "Already Direct". Marcus, 31, he/him, Atlanta, hip-hop with an R&B lean. Instagram 120,000, monthly
listeners about 90,000. Patreon with 60 patrons at about $450 a month, a Discord of 400. Turned down a
distribution advance last year. 40 unreleased songs, demos and alternate versions. He just watched VIDEO 3 (Tee
Grizzley vs Drake), VIDEO 2 (Tech N9ne vs 50 Cent) and VIDEO 4 (Tobe Nwigwe vs Travis Scott). He arrives
suspicious of any cut and any lock-in, and he already knows what a member is worth because he has sixty. Uses
EMAIL_P3, and EMAIL_P4 for his second signup.

Fill every form and every DM with the persona's real numbers. Do not optimize inputs to make results look good.
When a question does not apply, answer it the way that person would (skip if skipping is offered and they would).

-------------------------------------------------------------------------------
THE TEST MATRIX
-------------------------------------------------------------------------------
Four calculators: Own Your Fans, the Opportunity Calculator, the Vault Revenue Planner, the Proof of Demand Test
Builder. You reach each one the way the content told the persona to: by keyword (Phase K) when DM_PATH_ALLOWED
is YES, otherwise from the bio link (Phase D). Only when both fail do you ask the founder for a direct URL.

| Persona | Keyword paths | Bio-link path | Signs up from |
|---|---|---|---|
| P1 Dre | VAULT (Vault Revenue Planner) | whatever the bio link lands on, then try to find the Vault planner from it | Vault Revenue Planner (EMAIL_P1) |
| P2 Tasha | DEMAND (Proof of Demand), OWN (Own Your Fans) | the bio link, then try to find the Opportunity Calculator | Proof of Demand (EMAIL_P2) |
| P3 Marcus | OWN (Own Your Fans), FREE (Opportunity Calculator), WORTH (record only, do not build) | the bio link, then try to find the Vault planner | Own Your Fans (EMAIL_P3), then a second, separate account from the Opportunity Calculator (EMAIL_P4) |

For every calculator NOT listed under "Signs up from", walk it all the way to the final save action in the
builder, press it, and STOP on the page it takes you to. Record what that page says about the work you just
did. Do not create an account there. WORTH is followed only to its result and recorded for comparison.

-------------------------------------------------------------------------------
THE JOURNEY, PER PERSONA (scope only; never instructions on how CRWN works)
-------------------------------------------------------------------------------
PHASE K, keyword (only if DM_PATH_ALLOWED is YES): logged into IG_TEST_HANDLE on a phone-sized window, open
CRWN_INSTAGRAM, pick the most recent post you have not commented on yet, and comment the persona's keyword
exactly as the content wrote it. Start the clock. Record every DM you receive, verbatim, with the delay. Answer
every question in the DM as the persona would type it on a phone. Record: how many questions, whether you knew
each answer, whether any question repeated something the content already implied, what the first number you
were given said and whether it matched the ledger, whether you were asked for an email and when (before or after
the number), and what the button said. Tap the button. You are now on a result page: continue at Phase R. If no
DM arrives within 10 minutes, record that as a P0 candidate, screenshot the comment, and fall back to Phase D
for that calculator.

PHASE D, bio link (for the persona's bio-link row, and as the fallback when Phase K fails or is not allowed):
open BIO_LINK_URL as the persona, in a fresh browser profile, at VIEWPORT width. Spend the first 30 seconds as a
person who just consumed the content: what is this, is it the thing that was promised, what would I tap. Then
try to reach the named calculator from THIS page without typing a URL. Time it. If you cannot find it within 3
minutes of honest looking, that is a P0 or P1 finding; record the exact path you tried, then ask the founder for
the direct URL and continue. If the bio link itself is a calculator, run it as the persona (Phase C).

PHASE C, calculator (when you meet a wizard rather than a result): run it as the persona. On every screen record
the observation entry (below). Note specifically: did you understand why it asked; did you know the answer; did
you want to skip; did the number of screens match the time the page or the content implied; and, if you already
answered the same question in a DM, whether the page knew that.

PHASE R, result: read the result as the persona. Compare it to the promise ledger entry by entry: the number you
expected versus the number shown; the vocabulary the content used versus the vocabulary the page uses; whether
the enemy the content named appears in the result at all. Then do all of the following, in the order the page
offers them: press the gold call to action; use any "change an answer" or "sharpen" control once with a
materially different value and record whether the number moved in a way you understand; decide as the persona
whether to enter your email or claim the result (do so with the persona's EMAIL when they would, and go read
what arrives, timing it, inbox or spam); watch or skip any video offered and say why; scroll everything below
and say what, if anything, made you want to leave or continue.

PHASE B, builder: complete the builder as the persona. Record every field that was pre-filled and whether the
pre-fill was right for you; every field that asked for something you already answered (in the DM or the
wizard); every moment you did not know what a word meant (quote it). Press the final save action.

PHASE S, signup (only where the matrix says): create the account with the persona's email. Record every field
asked, whether "costs nothing to start" still feels true, and what the page says about the work you just built.
Go to the mailbox, time the confirmation email, click it, and record exactly what the first screen after
verification says about your calculator work. STOP there. Do not continue into setup. Do not connect Stripe.
Do not upload anything.

After each persona finishes, write that persona's section of the report before starting the next persona.

-------------------------------------------------------------------------------
ONE-TIME HYGIENE STEP (not part of any persona; do it in EVERY browser profile before its first page load)
-------------------------------------------------------------------------------
Open https://thecrwn.app, open the browser console, run exactly:
   document.cookie = 'crwn_dnt=1; path=/; max-age=31536000; SameSite=Lax'
then close the console and never open it again in that profile. This marks your browser as test traffic so the
founder's analytics are not polluted. It changes nothing you will see. Use a fresh profile per persona (four in
total: P3 uses a second fresh profile for the EMAIL_P4 signup). Open every DM result link in the persona's
profile, not in the Instagram in-app browser, so the cookie applies.

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
- Distinguish blockers from annoyances. Quote on-screen and in-DM wording exactly when it caused the reaction.
- Keep a running clock. Note wall-clock time at every phase boundary.

-------------------------------------------------------------------------------
ALLOWED ACTIONS
-------------------------------------------------------------------------------
- Everything an anonymous visitor can do on thecrwn.app: run any calculator, change answers, build and save a
  plan, watch a video, enter a persona email in the optional capture or claim step, read the emails that
  arrive, use the "explore another tool" and "see how this fits" links, read the marketing below the tool.
- If DM_PATH_ALLOWED is YES: comment the matrix keywords from IG_TEST_HANDLE (one keyword per post, never twice
  on one post), answer the DMs, tap the links. Never DM CRWN anything but the answers it asks for.
- Create the four accounts the matrix names, verify their emails, and read the first screen after verification.
- Use support chat only if SUPPORT_CHAT_ALLOWED is YES, at most once per persona, only when that persona would.
- Press "Get a call now" and enter a number only if CALL_REQUEST_ALLOWED is YES; otherwise record that the card
  exists, what it says, and whether the persona would have pressed it.

-------------------------------------------------------------------------------
PROHIBITED ACTIONS (hard rules)
-------------------------------------------------------------------------------
- Never go past the first screen after email verification. No setup wizard, no Stripe, no uploads, no tiers.
- No real identity, phone number (unless CALL_REQUEST_ALLOWED), card or bank details, ever.
- Never comment on Instagram from any account but IG_TEST_HANDLE, never comment anything but the keyword, never
  like, follow, share or message anyone else, never comment on a post that is not CRWN's.
- Never log in as anyone but the accounts you create. Never visit /admin or any URL containing "admin". Never
  touch another artist's page beyond viewing it as a visitor.
- Never delete anything, never change an account's email or password after creation.
- Never send anything to anyone. Never unsubscribe from the emails (the founder needs the nurture to run).
- Never create more than the four accounts in the matrix.
- Never fabricate a result. If you did not see it, say NOT TESTED.

-------------------------------------------------------------------------------
OBSERVATION PROTOCOL (record for EVERY screen and every DM, as you go, not afterwards)
-------------------------------------------------------------------------------
For each screen or DM write one entry:
  step_id, clock time, persona, phase (K/D/C/R/B/S), calculator,
  intended goal, expected (what the persona thought would happen, citing a ledger entry where one applies),
  saw (what actually appeared; exact wording when it matters),
  action taken,
  next action obvious? (yes / partly / no),
  confidence 1-10 that this is the thing the content promised,
  friction 1-5 (1 none, 5 stopped me),
  considered abandoning? (yes/no) and why,
  screenshot filename (RUN_ID-<persona>-<calculator>-<step_id>.png; take one whenever something surprised,
  confused, delighted or blocked you, at every phase boundary, and of every DM),
  exact wording responsible, when the reaction came from copy.

Running counters, per calculator per persona and in total:
  DMs received, DM questions asked, seconds from comment to first DM, seconds from first DM to the number,
  screens seen, questions asked, required questions, optional questions answered anyway, screens skipped,
  seconds from page load to first question, seconds from first question to result, seconds from result to
  signup page, times the product asked for something it already knew (list each, including DM answers asked
  again on the page), errors shown (quote them), layout problems at VIEWPORT width (anything cut off,
  overlapping, or needing horizontal scroll), emails received (subject, delay, inbox or spam), moments the
  persona wanted to leave.

-------------------------------------------------------------------------------
SEVERITY (use only these four)
-------------------------------------------------------------------------------
P0 Acquisition blocker: a typical viewer of this content cannot reach a result they believe, or cannot reach
   the account with their work in it. A keyword that produces no DM is P0.
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
   this window), viewport achieved, IG_TEST_HANDLE and the posts commented on, the four account emails and
   handles created, which switches were YES.
2. The promise ledger from Task 0.
3. Per calculator, in this order: Vault Revenue Planner, Own Your Fans, Proof of Demand, Opportunity
   Calculator. For each: how it was reached (keyword, bio link, or handed a URL) and how long that took; the
   single biggest bottleneck; the expectation gaps against the ledger (expected vs shown, per persona); the
   timings table; every screen or DM where any persona considered leaving; what the email said and when it
   arrived; what the builder pre-filled wrong; what the signup page and the post-verification screen said
   about the work.
4. The ranked list of every finding, P0 first, each with: severity, calculator, persona(s) affected, ledger
   entry violated or fulfilled, the exact screen or DM and wording, the screenshot, and one sentence on what a
   fix would change for the viewer (not how to build it).
5. The cross-calculator view: which promises in the content NO calculator keeps; whether meeting the RESULT
   first (through the DM) or the CALCULATOR first (through the bio link) produced more confidence and why;
   which calculator best matches what the content actually sells; the one change that would move the most
   viewers from result to account.
6. What you could not test and why.

=== END CALCULATOR AUDIT PROMPT ===
```

**Appendix the founder hands over only when both paths fail** (keep it out of the prompt; the tester asks for
it when Phase K and Phase D are exhausted): `https://thecrwn.app/tools/vault-revenue-planner`,
`https://thecrwn.app/tools/own-your-fans-calculator`, `https://thecrwn.app/tools/proof-of-demand-test-builder`,
`https://thecrwn.app/tools/opportunity-calculator`, and the directory `https://thecrwn.app/tools`.

---

## 4. What the report should look like, and how to read it

- **The promise ledger is the rubric.** If GPT-6's ledger does not contain "a penny a month per listener", the
  member-to-listener multiple, "a market FOR fans", "a ladder of tiers with a vault at the top" and "costs
  nothing to start", it did not read the content and the run is void.
- **The comment-to-DM timings are the first numbers to read** when the DM path ran. A keyword that produced
  nothing is the funnel being dark again, not a calculator defect, and it outranks everything else in the report.
- **Persona 1 is the majority.** Fourteen of the 36 pieces sell the Vault, and the Vault planner returns a
  readiness percentage and a price band, never a monthly total. Read his "expected vs shown" rows for whether
  the page earned that, because the content around it is all money.
- **Result-first versus calculator-first is the comparison this content makes possible.** The DM hands over a
  finished result; the bio link hands over a wizard. Section 5 of the report says which one a viewer trusted
  more. That answer decides whether the "sharpen your answers" link and the claim step are doing their job.
- **Every finding cites a screen or DM and a screenshot.** A finding without one is an opinion; weigh it as one.
- **The post-verification screen is the last observation.** What it says about the calculator work is the
  carry-over test. A blank generic first screen after a saved plan is the bottleneck this whole funnel was
  built to remove.

---

## 5. Design decisions the tester will flag that are NOT bugs (decide before reading the report)

| The tester will say | Why it is that way | Decide |
|---|---|---|
| "The DM never sent me the calculator, it sent me an answer" | Delivery-first (2026-07-26): the DM asks the questions, replies with the number, and the button opens the stored result; the email ask comes AFTER delivery | Whether the result page makes the "sharpen your answers" path obvious enough for a viewer who wants to redo it properly |
| "The Vault planner shows no money number" | Deliberate (registry comment, 2026-08-16): it promises a PLAN (readiness, inventory, price band, 30-day schedule); the whole-business number lives in the Opportunity Calculator, which models the Vault as the Gold rung | Whether the result page needs a sentence saying so, given fourteen pieces sold the Vault with dollar figures |
| "The demand test shows no money number" | A demand test never takes money; the price field is a non-binding interest signal | Nothing, unless the tester says Persona 2 expected a revenue estimate |
| "Nothing in the carousels ever sends me to the Opportunity Calculator" | True: its keywords are FREE, PLAN, SYSTEM, OPPORTUNITY and only video 4 uses one | Whether that is intended, given it is the tool that models the whole ladder |
| "The homepage never mentions the other three tools" | Rule in the registry: cold visitors on `/` have never met CRWN, so the hero may not list calculators | Whether the bio link should point at `/tools` or a chooser instead of `/` for this content |
| "The Opportunity number is a range 'on top of what you already earn direct, after CRWN's fee'" | The unified model subtracts existing direct income and fees so it never double-counts | Whether Persona 3 reads "after CRWN's fee" as the honesty the content promised ("only takes a cut when you get paid") or as the catch |
| "Own Your Fans talks about apps I do not own, not about members versus listeners" | POSITIONING.md section 24 forbids implying ownership of people; the result is framed as reach you cannot contact | Whether the member-to-listener multiple from the content should appear on that result |
| "The email capture is optional and easy to skip" | Founder decision 2026-08-26: the result is never gated; the capture sits under the primary CTA | Nothing, unless the tester reports nobody would enter it |
| "Own Your Fans jumped from copy straight to Save" | A/B experiment (`signupBoundary='preview'`) drops the preview step for some visitors | Nothing; note which variant each persona saw |
| "The call card only appears on one calculator" | `CALL_HAND_RAISER_TOOLS` is one allowlist shared with the server | Nothing |

---

## 6. Cleanup after the run

1. Run [supabase/calculator-audit-cleanup.sql](../supabase/calculator-audit-cleanup.sql) in the Supabase SQL
   Editor, after replacing the mailbox prefix, the Instagram test handle and the run's start and end times from
   the report. It previews first, then removes the DM lead identity (its sessions, answers, profile and events
   cascade), the email-only leads (their nurture enrollments cascade), the calculator results tied to those
   leads or to the four accounts, the four auth users, and the anonymous event rows inside the window.
2. In ManyChat, delete the contact for the test handle so a rerun starts from a fresh conversation.
3. If a call request was allowed, delete the founder email it produced; the file removes the lead row.
4. Do not touch Stripe: this run never reaches it.
