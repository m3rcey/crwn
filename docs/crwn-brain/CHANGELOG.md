# CRWN Brain — Changelog

## 2026-08-25 (2) - Twilio would not take our word for the paper form, so the opt-in became a page

**Twilio rejected the campaign because the opt-in was described as a signed internal record it
could not inspect.** Its documented evidence standard is "a live, publicly-accessible website with
opt-in functionality", so `/sms-alert-consent` is now that website. This is the same narrow
2026-08-24 exception, not a new one: recipients are still only authorized personnel of JNW
Creative Enterprises, Inc., and broad CRWN SMS marketing is still removed. Yesterday's
"consent is a business record outside the product" conclusion is SUPERSEDED, not deleted: it was
correct about the rules and wrong about what this reviewer would accept.

**The page** (`src/app/(public)/sms-alert-consent/page.tsx` + `src/components/sms/AlertConsentForm.tsx`)
is written for a compliance reviewer, not for conversion: brand and platform named up top, a
plain table of who sends / who receives / message type / frequency / cost / how to stop, then the
form. Mobile number field, a checkbox that starts UNCHECKED and is never programmatically checked,
the full disclosure as the label, "consent is not a condition of purchase" beneath it, and links
to `/privacy` and `/terms`. Submit stays disabled until the number looks real AND the box is
ticked, but the browser is not the gate.

**It sends nothing, and cannot.** The route holds no Twilio client, no credentials, no message
body and no destination beyond the number being consented; a test asserts that against
comment-stripped source, because the route's own comments explain the absence and a naive
substring ban would forbid documenting it. No outbound sender was built: that stays gated on the
campaign being approved.

**Consent evidence: a new table, and reuse was rejected for cause.** `sms_consent_log` was
structurally impossible (`artist_id UUID NOT NULL REFERENCES artist_profiles`, and this consent
belongs to no artist) and semantically false (its `action` CHECK lists four fan-marketing actions
from the product removed 2026-07-31). `acquisition_events` is the LEAD outbox and is read by
acquisition analytics. So `supabase/schema-phase2-internal-sms-alert-consent.sql` adds ONE small
table, `internal_sms_alert_consents`: phone, the SERVER's copy of the disclosure, its version, the
source, timestamp, IP, user agent, and a `revoked_at` so a withdrawal is recorded rather than the
row deleted. RLS on with NO policies plus grants revoked from `anon`/`authenticated` by name,
because a consent log is a list of real personal phone numbers; the probe treats 42501 as the PASS
and a 200 as an incident.

**The disclosure is a server constant, and the form renders that same constant.** If the browser
posted its own consent text, anyone could store any sentence against any number and the record
would prove nothing. `src/lib/sms/alertConsent.ts` owns the wording and the version; the route
reads only the boolean. Mutation-verified both ways: pre-checking the box and retyping the
disclosure in the form each failed exactly one intended test (grep 1 to 0, reverted, green).

**A consent is never lost while the migration is pending.** I cannot apply migrations, so the
route writes the row AND emails the internal recipient their own copy of the record on every
accepted consent, and only reports failure when BOTH sinks fail. A compliance page that says
"recorded" while storing nothing would be the worst possible outcome.

**Security:** public by necessity (a reviewer has no account), declared in `DELIBERATELY_PUBLIC`,
rate limited per IP (5/hour) and per phone (3/day), body size bounded, phone normalized
server-side through the EXISTING `normalizeCallbackPhone` rather than a second phone standard,
consent enforced server-side and checked BEFORE the number (an unchecked box is a refusal, not a
bad number), nothing ever read back, `GET` returns 405, and logs carry only a masked tail.
Deliberately no CAPTCHA: the endpoint sends nothing, spends nothing, and writes to a table no one
can read, so a challenge on a page a handful of people use once would be theatre.

**A build lesson worth keeping.** `next build` exited **0** while printing "Failed to type check"
(an ES2018 regex flag in the new test against an ES2017 target). The earlier grep missed it
because it looked for "Failed to compile", not "Failed to type check". Grep for both.

**Evidence:** `alertConsent.test.ts` 38 assertions (added to `verify:architecture`),
`npm test` 3855 passed / 156 files, `verify:architecture` 900 passed / 51 files, `npm run build`
clean with `/sms-alert-consent` and `/api/sms-alert-consent` both in the route manifest.

## 2026-08-25 - The legal pages audited against the whole product, and the product wins every disagreement

**A full audit of every legal surface against the live product and strategy** (founder-approved
recommendations, executed same day). The organizing rule: a promise the product does not keep is
worse than a missing section. Every change below exists because the code already did the thing.

**The privacy policy stopped lying about fan emails.** It said "Artists CANNOT see: Your email
address (unless you share it)" while `buildAudience` has been returning fan AUTH emails to the
owning artist's CRM all along, and the strategy's core pitch is owning the fan list. Founder call:
disclose, not suppress. Section 4 now says an artist you subscribe to or join can see the email on
your account; the Artist Agreement's rewritten "Fan Data and Communications" section carries the
matching obligations (permission-only imports, CRWN-enforced unsubscribes, export = your problem,
abuse = suspension).

**The processor list caught up with the infrastructure.** Added to section 5: Cloudflare (all
media files), LiveKit (live audio/video), DeepSeek (support chat + artist insights; it was
processing user conversations while the policy named only Anthropic). OpenAI was deliberately NOT
added, because it is DEAD: the synthetic sync generator is deleted, nothing reads
`OPENAI_API_KEY`, so the true inventory is **TWO providers, 8 call sites**. Doc 10, doc 15,
CLAUDE.md and `agentSecurityBoundaries.test.ts` all moved together per the doc-26 workflow, and a
new assertion fails if any live `OPENAI_API_KEY` read reappears.

**Pre-account collection is now described.** Privacy section 7 generalized to "Free Tools, Lead
Conversations, and Live Events": calculator answers + attribution stored at a private link,
optional email into nurture, and the Song Lab captured-contact model (a typed email at a show owns
a free membership and a vote, no password). Section 2 gained "Information we receive from
artists" covering imported third-party contacts. Retention now separates server logs (90 days)
from analytics events (kept while needed): funnel_events are retained indefinitely and the old
wording implied otherwise.

**The terms caught up with the money.** Section 4 gained Automatic Renewal (fan memberships AND
platform plans: California ARL / FTC negative-option exposure, there was ZERO renewal language),
Tips (voluntary, non-refundable, fee applies), and Artist Benefits and Promotions (fulfilling
promised benefits is the artist's responsibility; CRWN is not a party). New section 14, Fan
Earnings Program: the $25.00 cashout minimum the code enforces, Stripe KYC, taxes, fraud voids,
prospective program changes, and the MONEY-005 line that organic artist referrals are unpaid.

**The cash recruiting pages finally have governing terms.** `/partner` and `/recruit` promise
tier fees plus a revenue percentage with Stripe payouts; no agreement existed.
`src/app/(public)/partner-terms/page.tsx` now defines qualifying (paid + 30 days, first link
wins), self-referral bans, FTC endorsement disclosure for partner content, fraud, taxes,
termination, independent-contractor status. It deliberately carries NO rate numbers (the rates
live on the partner page and in the payout code; a duplicated rate map caused the 5x overpay),
and a test enforces that absence. Both recruiting pages link it.

**The Artist Agreement grew what selling a SaaS plan requires**: Platform Plan Billing (auto-
renewal, cancel = Launch at period end, 30-day fee-change notice, promotional pricing reverts), a
Team Splits paragraph deferring to the accepted in-product agreement, and the disclaimers carve-
out "except as expressly stated in a written CRWN offer" so the public First Paid Member
Guarantee no longer sits beside an unqualified no-guarantees clause.

**Notice given, as the Terms promise.** `notice_legal_2026_08_25` banner (same pattern as the
2026-07-24 notice: priority 10, once, announcedAt so post-update signups never see it), key
frozen in ID-004.

**Pinned:** `legalPages.test.ts` grew from 20 to 33 assertions (renewal, earnings, email
disclosure, processors, pre-account surfaces, partner terms, no-rate-map). Mutation-verified on
the renewal pin (grep 1 to 0, one intended failure, reverted, green). Deferred with TODO items:
Copyright Office DMCA agent registration (founder-only), FRL service terms (gates the first
standard-price sale), deleting the dead OPENAI_API_KEY from Vercel.

## 2026-08-24 (third pass) - The index learns to find big pages directly, instead of hoping artists reveal them

**Brent Faiyaz confirmed the remaining bottleneck.** With filtering removed, global discovery
again returned overwhelmingly tiny personal accounts (1K down to double digits), while the
2-page index correctly surfaced @purestrap (1.2M followers, 5 Brent posts, Priority 80) and
@plugcaptions (130K). The downstream pipeline is proven; the page UNIVERSE was the problem, and
"Bootstrap From Artists" could not fix it because it rides the same weak global discovery.
**Ratified finding: artist keyword/hashtag discovery is a supplemental source, not a way to
construct the large-page universe.**

**Direct Big Page Discovery shipped inside the Big Page Index panel**, two mechanisms, both
contract-verified against the live Apify store:
- **Topic profile search** (`apify/instagram-search-scraper`, `searchType: 'user'`): editable
  topics (defaults: r&b, hip hop, music news, music media, black music, music culture,
  independent music), one run per term for clean provenance, 25 results per term. User results
  carry followersCount/verified/private/category/bio DIRECTLY, so candidates filter with zero
  enrichment calls. A 7-topic discovery costs ~175 results (~$0.30-0.47).
- **Related-profile expansion** (`relatedProfiles` from the profile scraper, verified: username +
  is_verified + is_private, NO follower counts): up to 10 indexed seeds, depth 1 only, dedupe and
  drop indexed/private BEFORE paying for the one bounded enrichment run (cap 100).

**Candidates are reviewed, never auto-ingested.** The review table shows followers, category,
found-via provenance ("2 topics + related to @purestrap"), bio excerpt, and a deterministic
**Seed Value** (audience 50 / corroboration 25 / relevance 15 / verification 10; relevance terms
boost and never reject, so a Black-culture page without a "music" label still qualifies). Hard
gate: 50K+ (the existing centralized threshold), public, not already indexed, known size.
Select All / Add Selected runs the EXISTING manual-add flow, so the index keeps one write path
and provenance is honestly `manual` (founder-reviewed, founder-selected); "Add Selected &
Refresh Posts" chains straight into the existing refresh pipeline. **No schema change and no new
job system were needed.** Artist search remains index-scrape-free.

Also: both distribution migrations are now applied and probe-verified (the Brent search proved
the corpus live); the index summary now shows pages at 50K+ and names the 250-500 page operating
target while the universe is small; Bootstrap From Artists is relabeled supplemental.

## 2026-08-24 (later) - The finder learns which pages are worth knowing, not just who tagged the artist

**The first live Ryan Leslie search worked and proved the architecture insufficient.** With the
follower minimum removed it returned 17 posts across 9 pages, the largest around 12-14K followers,
and the #1 result was a ~1K superfan account that had posted Ryan Leslie nine times. Root cause,
structural not a bug: hashtag/keyword discovery surfaces whoever TAGS the artist, which is
superfans; big media pages post artists without those tags, so global discovery cannot see them.

**The upgrade makes the finder hybrid: a Big Page Index plus global discovery.**
- **Big Page Index:** `distribution_pages` gained index metadata (`first_discovered_at`,
  `discovery_source`, `index_eligible`, `last_posts_refresh_at`) and a recent-post corpus table
  `distribution_page_posts` (public captions stored deliberately, so future artist searches match
  against the cache; ~24 posts per page, 90-day floor, admin-only lockdown). Migration
  `schema-phase3-distribution-page-index.sql`, pending founder application, fail-soft until then.
- **Population, three paths, no cron:** automatic promotion (any search's enriched pages at 50K+
  followers join the index), manual handle adds, and reference-artist bootstrap, which is
  deliberately ZERO new server machinery: the admin UI drives the existing search/poll flow once
  per founder-supplied artist and promotion happens in the normal finish path.
- **Search flow:** every response path (fresh cache, live, provider-down, not-configured) merges
  corpus matches with global matches, dedupes across sources, and labels each page Indexed /
  Global / Both. Corpus posts get NO provenance fallback: an ilike prefilter hit is not evidence,
  so they match on caption content only. An artist search never scrapes the index.
- **Two-score model** replacing the single Distribution Score: **Affinity** (recency 40 /
  frequency 35 / evidence 15 / engagement-rate 10), **Distribution Value** (audience 70 /
  absolute-engagement 30, log-scaled, reach-dominated), and **Priority** = 100 · DV^0.6 · AF^0.4,
  multiplicative so maxed affinity cannot rescue near-zero reach. The required behaviors are
  pinned by tests: 300K with 6 recent posts outranks 3M with 1 stale post; the 1K superfan keeps
  higher Affinity but loses Priority to a 500K page with 2 recent posts.
- **The empty state stopped lying:** "9 matching pages found, but all were below your 50,000
  follower minimum" (with actions), never "no pages matched" when matches were merely filtered.
  The API distinguishes `totalMatchedPages` from eligible results, pinned by test.
- **Refresh** is a founder button: stale eligible pages (7-day freshness) batch 25 usernames per
  `apify/instagram-post-scraper` run (`resultsLimit` per profile, `onlyPostsNewerThan` floor,
  contract verified 2026-08-24); a failed batch is counted and skipped, never fatal. Full-refresh
  cost ceilings: 100 pages ≈ $6, 500 ≈ $28-32, 1,000 ≈ $55-65 at ~$2.30-2.70 per 1,000 results.
- `schema-phase3-distribution-finder.sql` was founder-applied and probe-verified the same day, so
  its registry row moved pending → applied.

## 2026-08-24 - The founder can now see who already cares about the artist they are about to post

**The Artist Distribution Finder shipped: a Distribution tab on `/admin` (admin-only, founder
tool).** Before publishing a carousel about an artist, the founder types the artist's name
(optionally their handle and aliases), and CRWN searches public Instagram data through Apify
server-side, matches posts to the artist with an auditable reason on every match, deduplicates
posts (id > shortcode > canonical URL) and pages (user id > username), enriches up to 30 authors
with follower/profile data, filters (own account out, private accounts out, below the follower
minimum out), and ranks by a deterministic Distribution Score (audience 30 / recency 25 /
frequency 25 / engagement 15 / evidence 5, weights in one file, `src/lib/distribution/score.ts`).
Results are BEST PUBLIC MATCHES, never claimed as an exhaustive index of Instagram, and the UI
says so.

- **Async by necessity:** an Apify actor run takes minutes and a Vercel Hobby function gets 60
  seconds, so `/api/admin/distribution/search` starts bounded runs and the admin UI polls
  `/api/admin/distribution/poll`; the server holds no run state between polls (the client carries
  run references, Apify keeps the datasets). Partial failure degrades instead of failing: a dead
  discovery run drops that query's coverage, a dead enrichment run returns posts without profiles.
- **No LLM anywhere.** Query expansion, matching and ranking are all deterministic and tested
  (32 tests in `src/lib/distribution/`). Hidden like counts (-1 from Instagram) are NULL, never
  zero, and a null engagement component renormalizes out of the score instead of sinking it.
- **Secrets:** `APIFY_API_TOKEN` is read only inside `apifyProvider.ts` (Bearer header, never a
  URL), never logged, never dummy-substituted into a real request, and a mutation-tested
  drift assertion (`secretIsolation.test.ts`) pins that no component can import the provider or
  the service-role store.
- **Persistence is the compounding asset:** `distribution_pages` + `distribution_mentions`
  (migration `schema-phase3-distribution-finder.sql`, applied by the founder later the same day)
  cache observations for 24h and accumulate the artist-to-page graph, so future searches answer
  "which pages repeatedly cover CRWN-relevant artists".
- **Boundary:** public Instagram data only, research and discovery only. No outreach automation,
  no DMs, no private data, no login automation. The founder decides whom to contact, manually.

## 2026-08-24 - The legal pages learn to say what CRWN actually does with a phone number

**Founder decision: ONE narrow Twilio A2P 10DLC campaign is authorized, and broad CRWN SMS
marketing stays removed.** The campaign is registered to **JNW Creative Enterprises, Inc.** (Low
Volume Standard), and its ONLY recipients are authorized internal company personnel: when a
qualified artist raises their hand through `CallRequestCard`, an operational alert identifying the
lead and carrying their callback number reaches a representative who then CALLS them. The artist is
not a recipient. This is recorded as a LATER, NARROWER EXCEPTION to the 2026-07-31 removal, not a
reversal of it: everything on that deleted list (fan/artist SMS marketing, the CRM SMS tab, the
campaign SMS channel, SMS plan limits, fan SMS preferences, mass texting) stays deleted.

**What actually shipped is legal copy, not a sender.** Twilio requires a publicly reachable privacy
policy and terms URL on the campaign form (mandatory since 2026-06-30) and vets their CONTENT: error
30908 rejects a policy missing the statement that mobile numbers and messaging consent are not
shared with third parties or affiliates for marketing or promotional purposes, and rejects a website
opt-in with no message-frequency or message-and-data-rates disclosure.
- **`/privacy` gained section 8** (SMS, Mobile Numbers, and Messaging Consent), and Twilio joined
  the section 5 processor list. It carries the required non-sharing sentence verbatim, the
  carrier-standard mobile-information and opt-in-data exclusion, where a number is collected and
  why, the internal-only description of the program, frequency, message and data rates, STOP/HELP,
  and an honest processor paragraph. It deliberately does NOT claim numbers are never disclosed:
  Twilio, Supabase and Resend all touch one, and a false absolute is both a lie and, next to the
  campaign, "conflicting information". Sections 8 to 11 renumbered to 9 to 12.
- **`/terms` gained section 13** (SMS Messaging): sender identity, program description, recipients,
  what CRWN does not send, frequency, charges, STOP/HELP, that consent is never a condition of
  purchase, and a link to the policy. A DIFFERENT §13 was deleted on 2026-07-31; this one is
  narrower and is not that program returning.
- **`CallRequestCard` gained the point-of-opt-in disclosure** under its consent box. Twilio's
  reviewer opens the page a person sees BEFORE consenting, and the linked policies do not satisfy
  that on their own. Static copy only: qualification, `decideCallRequest`, scoring, the uniform
  `{ok:true}` response and the alert channel are all untouched.

**No product code sends an SMS, and none was added.** `/api/lead-magnets/call-request` still alerts
by Resend email plus the optional `FOUNDER_ALERT_SMS_EMAIL` carrier gateway. Building the Twilio
sender is separate work, gated on the campaign being approved.

**Internal-recipient consent is a business record, not software.** A2P 10DLC accepts paper/verbal
consent for non-web opt-in, so a signed one-page record for the single internal recipient is the
correct instrument. Building a consent-management system for one person would have been the wrong
answer to a real requirement. `TODO.md` carries the exact record to write and the exact strings to
paste into the campaign form.

**Pinned:** `src/lib/legal/legalPages.test.ts`, 20 assertions, added to
`vitest.architecture.config.ts` so it runs in `npm run verify:architecture`. It is in the GATE
because this failure is silent and external: a disclosure quietly edited out does not break the
product, it breaks a carrier vetting review nobody is watching. Mutation-verified (removed the
required non-sharing sentence, grep confirmed 1 to 0, one test failed for the intended reason,
reverted, suite green). It also asserts the negative: the deleted `src/lib/twilio.ts` and
`/api/sms/send` stay gone, and `campaignSender.ts` / `AudienceTab.tsx` never grow an SMS channel.

**Evidence:** `npm test` 3681 passed (149 files), `npm run verify:architecture` 848 passed (50
files), `npm run build` exit 0. Lint on `terms/page.tsx` improved 21 to 12 errors (both
`<a href="/privacy">` links became `<Link>`); privacy and the new test file add zero.

## 2026-08-24 - The narrow-result → flagship bridge, and /worth stops being blind at completion

**Founder-ratified acquisition architecture for the first external carousel batch** (from the
`auditing-crwn-work` audit): angle carousel → angle keyword → angle calculator → full narrow
result → the whole-business Opportunity Calculator as a SECONDARY continuation → signup. The
narrow tool earns the click; the flagship earns the account. No new flagship was built, no
flagship repositioning, no universal keyword, no carousel asset touched, no post-level
attribution infrastructure: campaign/angle-level attribution is the founder's chosen resolution
for this batch, and `video` stays honestly unknown.

**The bridge** ([src/lib/leadMagnets/flagshipBridge.ts](../../src/lib/leadMagnets/flagshipBridge.ts)):
one pure helper whose eligibility is DERIVED from the flagship's own `entryContexts`, so there is
no second list. It renders BELOW the builder on `PublicToolClient` and `/worth` (the complete
narrow result and its builder always come first), links to
`/tools/opportunity-calculator?from=<slug>` (the existing entry-context reorder + acknowledgement),
and is tracked with the EXISTING `opportunity_cta_clicked` event discriminated by
`variant: 'flagship_bridge'` — no new event name, no new funnel stage. Royalty Readiness is
deliberately NOT bridged (POSITIONING.md section 18: royalty recovery is money already earned;
the fan-economy continuation does not apply), expressed as the absence of an entry context and
pinned by [flagshipBridge.test.ts](../../src/lib/leadMagnets/flagshipBridge.test.ts)
(mutation-verified: pointing the bridge at /signup failed 2 tests, reverted).
`proof-of-demand-test-builder` gained the one missing entry context (DEMAND is a batch angle).

**/worth emitted no completion event, ever.** It fired `started`, `leadSubmitted` and
`leadCaptureViewed` but never `resultGenerated`, so its funnel line showed starts with zero
completions and the decisive stage was invisible. Fixed at the entry wizard's `onComplete`, the
same moment `PublicToolClient` emits it; a tokenized `?result=` arrival still emits nothing,
matching the registry tools' resume semantics. Historical rows are untouched: pre-promotion
funnel data is founder/internal testing and is not market evidence.



**The AI-tell rule shipped in the morning changed the INSTRUCTIONS and left the 21 existing Fan
Economy captions alone. That deferral was wrong**, and auditing them found something bigger than the
paragraph shape the rule was written about. Five connective phrases were near-verbatim across
unrelated posts: the turn line ("Here's the thing nobody puts side by side") and the wow entry ("And
here's the crazy part") in 21 of 21, the sidenote plug in 19, the fair-balance opener in 18, and the
"One is X. One is Y." framing skeleton in 14. Read two of these back to back and the frame is the
first thing you see, ahead of the artist.

**The wow rotation rule was already written and was ignored by every single post.**
`/crwn-fan-economy-carousel` beat 11 lists five entry variants and says to rotate them, and
`/crwn-fan-economy`'s Batch surface variation caps the same phrase at once per batch. Both were in
the file the whole time. An instruction disobeyed corpus-wide does not need more prose, it needs a
check, so this adds **FE-CAR-004**: at least three distinct wow entries with none over half the set,
and no connective sentence in more than half the captions. Ratified repeats are exempt by name (the
signature line, `ANYWAY.`, `Hold that thought`, and the offer/ask pair, which is one fixed two-line
form per tool by design). Mutation-verified: forcing all 21 back to one wow entry fails it.

**All 21 captions were re-cut, not rewritten.** Paragraphs went from 18 to 20 down to 13 to 15 by
grouping beats that carry one thought, the manufactured negations went ("It's not merch." became
"There's no tier, no paywall, nothing to buy and nothing to upsell."), most "the question ain't X,
it's Y" pivots became the direct question, and the five connectives now rotate. Numbers, claims,
research, tiers, CTAs, keywords and every slide prompt are untouched, and the three strongest framing
lines were KEPT because the distinction is real ("One is wide. One is deep." on the versus post).

**The rendered captions were stale and are the ones that actually get posted.** Every
`Dropbox/nano banana output/Carousel Posts/Fan Economy/[N]-[slug]/caption.md` still held the old
text; all 21 were synced from the repo source, which is now byte-identical. Fixing only the repo copy
would have left the work invisible at upload time.

**One test was rejecting correct copy.** The bare-CRWN check split on the literal lowercase
`the CRWN app`, so a sentence OPENING on "The CRWN app" counted as a bare mention. Made it case
insensitive; it still catches real bare CRWN, proven by inserting one and watching it fail.

## 2026-08-22 - The writing skills learned to stop sounding like AI

**One new canonical section, `Natural Sentence Length and Earned Contrast (the AI-tell pass)`, in
`.claude/commands/crwn-shortform.md`.** It sits next to Word Economy and Voice Register, which is
where the scattered half-versions of it already lived ("stitch staccato lists into flowing
sentences", "merge over-staccato fragments"). Those were written as final-pass niceties and were
being skipped, so the same two fingerprints kept reaching finished scripts: stacks of three or more
identical fragments ("They post lyrics. They send clips to friends. They talk about how her music
makes them feel." in share-sza; "They cannot pitch a beat. They cannot submit vocals. They cannot
suggest a hook." in producer-t-pain), and negation contrasts built on a premise nobody held
("That's not a customer. That's something else." in fan-economy 37).

**It teaches two tests, not a blacklist.** Would anything be lost if these lines were joined into
one natural sentence? Is the negation needed to understand the idea, or was a wrong belief invented
so it could be rejected? Habitual reliance is the defect, so a single short line or a single sharp
contrast still passes.

**What it explicitly protects, because the naive fix would have destroyed all of it.** Short hooks,
CTAs, punchlines and one-line gut-punch numbers stay short. The 15-word cap and the reading level do
not move, and a merge that would break either is not made (overcorrecting into long clauses is a
FAIL, not a fix). One-idea-per-line formatting in the saved files is a delivery aid for camera, not
sentence chopping, so it stays. The `/crwn-lead-magnet` math walkthrough keeps one number per line.
And the Fan Economy signature line, "You dont need to market to fans. You need a market FOR fans.",
is the RATIFIED exception: it is the one negation contrast in the series that carries real
information, `fanEconomySkillContract.test.ts` requires it in every script, and the new section says
so by name so a later pass does not "fix" it.

**Four skills point at the one section instead of copying it**: `/crwn-fan-economy` (plus a section
naming its own exception), `/crwn-lead-magnet` (the setup beat is where it fails every time),
`/crwn-fan-economy-carousel` (a caption paragraph is a THOUGHT, not a sentence: carousel 1 shipped
fourteen one-line paragraphs) and `/carousel` (whose body spec literally said "one idea per line").

**One skill example was contradicting a ratified rule and had to go.** `/crwn-shortform` held up
"Streams build the label. Fans build the artist." as the model of a good payoff while banning that
exact line further down as a saturated belief-confirming closer. It is also the manufactured
two-clause parallel this pass catches. Replaced with the #2 closer that actually earned 3.4% share.

**Pinned by tests, mutation-verified.** A new anchor in FE-SKILL-003, a cross-file check that the
`/crwn-shortform` section the other skills delegate to still exists, EVAL fixture 10 (whose pass
criteria include the overcorrection failure), and a FE-CAR-001 assertion on the caption paragraph
rule. All four were mutated, watched fail for the right reason, and reverted.

## 2026-08-21 (night, later) - A recognition badge was about to flood a live show's notifications

**Song Lab's Day One A&R badge no longer notifies the ARTIST, only the fan.** The badge fires
on a fan's FIRST vote, and `awardFanBadge` notifies both sides, so every new voter sent the
artist two notifications: "New subscriber" from the free join, and "X earned Day One A&R" from
the badge. The live-show path uses the same vote recorder, so a room of a hundred people
scanning one QR at Julius's Sept 26 show would have produced two hundred notifications in an
evening and buried the only signal that matters (real people joining) under badge noise, on the
single night the bell is most useful. Found because the founder read his own notification list
and asked why it said "Day One A&R" when the tier is called "Economy": two systems, correctly
reporting, stacked into one confusing column.

**The fix is one new optional flag, `notifyArtist`, defaulting to TRUE.** Every existing caller
(squads, city unlocks, bounties, the CRM, quests) is untouched and keeps its CRM nudge, which is
appropriate where an award is rare. Song Lab passes `notifyArtist: false`. The fan still gets
their recognition, the badge still sits on their record and renders on the Lab, and the artist
still learns about every one of these people through "New subscriber" and the Fan CRM, which
started working again earlier the same night.

**Two related observations recorded, NOT acted on, because both are the artist's call.** The
badge name is one CRWN chose, not one GB wrote, and it appears in his account as though he
authored it. And "Day One" is a promise the mechanic does not keep: it fires on any fan's first
vote forever, so someone arriving in month six earns the same badge as someone who was there at
the start. Renaming or retiring it is a founder/artist decision and is in TODO.md.

## 2026-08-21 (night) - Every artist's Fan CRM was empty, and nobody could email a subscriber

**One ambiguous database embed silently emptied nine surfaces.** `subscriptions` holds TWO
foreign keys to `subscription_tiers`: `tier_id`, and `pending_tier_id` added later by
`schema-subscription-downgrade.sql`. From that moment every query written as
`subscription_tiers(name)` became ambiguous, and PostgREST answers an ambiguous embed by
rejecting the ENTIRE statement with `PGRST201`. supabase-js reports that as `{data: null}`,
and every call site read `(data || [])` as "there are no subscribers".

**What was actually broken, all of it silently.** Every artist's Fan CRM listed zero members
while the rows existed (`src/lib/audience.ts`); campaign sends resolved an empty audience and
reported success (`src/lib/campaignSender.ts`, `/api/campaigns/[id]/send`); a fan's own
membership list rendered empty (`/profile`); the public fan leaderboard lost its tiers; the
launch-partner guarantee could not see a paid tier (`src/lib/frl/server.ts`); the sequences
cron could not resolve a tier; and a Stripe webhook read "subscription not found" on a money
path (`src/lib/webhookHandlers.ts`). Nothing threw and nothing logged.

**Found by looking, not by reasoning.** The founder screenshotted GB's Fan CRM showing one fan
against three real subscriptions. Calling the real `buildAudience` against production returned
that single fan as `tier=null, status=never`, which proved the row came from `earnings` rather
than `subscriptions`, which proved the subscriptions query had returned nothing at all. The
same artist's PAYING Silver subscriber was misreported by the same bug.

**Fixed by naming the constraint at all nine sites**
(`subscription_tiers!subscriptions_tier_id_fkey(...)`), verified by re-running the diagnostic:
1 fan became 3, each with the right tier and email. **QUERY-001** is the new guard
(`src/lib/architecture/queryIntegrity.test.ts`, in the gate): it scans for a bare embed between
any registered ambiguous table pair, carries two positive controls, and was mutation-tested
(violation reintroduced into `audience.ts`, suite watched to fail naming that exact file,
reverted, clean). The general lesson is registered with it: adding a SECOND foreign key between
two tables retroactively breaks every existing bare embed between them, invisibly to the type
checker and to any test that mocks the database.

## 2026-08-21 (last) - A verified email can vote without signing in, and nobody votes as them

**What v431 got right and wrong.** It refused to write anything when the typed address
belonged to a VERIFIED account, which correctly protected a real person from having an
opinion, a badge and a membership attributed to them by anyone who knew their address. It
was wrong about the remedy: it made an attendee solve an authentication problem mid-set,
and the screen leaked that the address had an account.

**Why a new table was unavoidable, proven not assumed.** `song_lab_votes.fan_id` is
`NOT NULL REFERENCES profiles(id)` and `profiles.id REFERENCES auth.users(id)`, so a counted
vote needs an auth identity; one email can hold only one auth user; `song_lab_offer_claims`
carries the same NOT NULL fan_id; `fan_contacts` and `lead_magnet_results` have no decision
or option concept. `song_lab_public_votes` (migration
`schema-phase2-song-lab-public-votes.sql`, PENDING) holds one vote and nothing else: an HMAC
`participant_key` (a CHECK pins the digest shape so a raw address cannot be stored), no
account link, no readable email, service-role writes only, artist-scoped SELECT, no anon
grant. Dedup is `UNIQUE(decision_id, participant_key)`, upserted, so a re-vote changes the
pick exactly like an account vote. Reconciliation needs no stored link: the same address
rehashes to the same key on demand.

**Three identity states, ONE visible outcome.** Captured contact (new address) gets a free
membership and a canonical vote; unconfirmed capture is reused; public vote participant
(verified address) gets the vote ONLY. The success payload is shape-identical across all
three, so the response no longer reveals account existence. The success COPY is conditional
in one place only, and for truth rather than status: the "you're in the free fan community"
line renders only when a membership actually exists, because the public participant did not
join anything.

**The success screen now shows live results** for the poll just voted in, counting both
sources, with largest-remainder percentages so two options never render as 54% and 47%. This
is a deliberate, scoped founder exception to the hide-until-closed reveal rule: it applies to
the person who just voted on the live-show landing. `/api/song-lab/public` (the Lab page) is
unchanged and still hides open tallies.

Production, v433: a new email votes and sees results (percentages summing to 100, no session
issued); an authenticated fan votes canonically and sees the same screen; a verified address,
including the artist's own, writes NOTHING and exposes no role while the migration is pending,
which is the honest fallback rather than a claimed vote. The verified-address vote begins
counting the moment that one file is run. `verify:architecture` 825, `npm test` 2939, cold
build clean.

## 2026-08-21 (later) - The live-show vote counts on the tap: CAPTURED CONTACT vs VERIFIED OWNER

**Root cause of "Results said 0".** `mailer_autoconfirm` is false, so `supabase.auth.signUp`
returns no session; `/api/song-lab/claim` requires one; therefore nothing was written until
the attendee left the show, opened their inbox and came back. The page worked and the tally
stayed empty.

**The fix is a named identity distinction, not a weakened gate.** CRWN now separates:
- **CAPTURED CONTACT**: an email somebody typed. It is the unconfirmed auth user that
  `signUp` ALREADY creates today, so it is not a new identity class. It may own exactly two
  things, both promised on the page: ONE advisory vote in an open poll, and a free-tier
  membership with the artist whose page captured it. `email_confirmed_at` stays NULL.
- **VERIFIED OWNER**: someone who proved inbox control. Only they can hold a session, and
  only a session reaches anything sensitive.

`/api/song-lab/live-claim` is the one unauthenticated write path, and its security argument
is that it **returns no session, no token and no cookie** (asserted in the production run:
no `set-cookie`). Voting logs nobody in. Signing in still requires the emailed link or a
password reset, so an attacker who types someone else's address gains nothing.

**It refuses to act for a VERIFIED account.** Casting a vote or joining a membership in a
real person's name on an unproven claim is the abuse this route is most careful about, so
that case writes nothing and routes to sign-in with the chosen song carried. The known
trade-off, accepted deliberately: that branch reveals an address has a CRWN account. Writing
to a real account on an unproven claim was judged worse than that disclosure. An UNCONFIRMED
capture account is reused instead (the same fan at the second set), so returning attendees
are never dead-ended. The admin lookup is a SEARCH, so `identityDecision` re-matches the
exact address: a near match can never vote one fan as another (pinned by test).

**Nothing else is special-cased**: the membership goes through `joinFreeTier`, the vote
through `checkVote` + `recordLabVote`, attribution through the same claim row, and one vote
per email is still `UNIQUE(decision_id, fan_id)`. Rate limited per IP (generous, because a
venue is one NAT address) and per email (strict). The email now carries the ACCOUNT LINK and
states the vote is already counted; it is sent through Resend, not Supabase's built-in
mailer, whose few-per-hour ceiling would have throttled a full room.

**No schema change. No Supabase Auth setting change required**: email confirmation stays ON
for normal signups, exactly as before.

Verified in production with the founder's own scenario: a brand-new address votes, never
opens the inbox, and Julius's Results shows the vote; the capture account cannot be signed
into (400 on a password grant); a repeat submission changes the pick without duplicating
user, membership, vote or claim; a verified account's address is refused with nothing
written; a near-match address gets its own identity; cross-artist, invalid-option,
foreign-decision, invalid-email and closed-poll attempts are all refused AND create no
account. All fixtures deleted. `verify:architecture` 825, `npm test` 2928, cold build clean,
sw v431. SEC-SERVICE declares the route deliberately public with its bounds enumerated.

## 2026-08-21 - One night, two shows, one QR: scheduled poll handover (and JUBO, built dark)

**A lead magnet can now follow a whole night.** Song Lab already expressed the shape, so
nothing new was invented: a PROJECT is the event and each DECISION is one set's poll, with
its own ballot, its own votes (UNIQUE per fan per decision) and its own window. Binding a
vote magnet to the PROJECT (via `song_lab_offers.project_id`, a column that already existed
and nothing read) makes one printed QR resolve Show 1 before its close time and Show 2
after, with nothing for the audience to choose. `src/lib/songLab/schedule.ts` is the
resolver; `resolveOfferPhase` in `server.ts` is the ONE entry point the landing page and
the claim route both call, so they cannot disagree about which set is live.

**Time is server-side and zone-aware, never a fixed offset.** "8 PM Eastern" in Atlanta is
UTC-4 in September and UTC-5 in January; a hardcoded EST would have closed Julius's first
show an hour late. `zonedTimeToUtc` converts wall time plus an IANA zone id using Intl (no
dependency), and 25 tests pin the DST boundaries including a spring-forward time that does
not exist and a fall-back time that happens twice. Auto-close needs NO cron: `effectiveStatus`
already narrows by window on every read, so 8:00:00 PM closes the poll on the next request.

**Override is DERIVED, never a stored flag.** Studio offers Open now, Close now, Extend
(+15/30/60 from now) and Reschedule; the state sentence comes from status plus window
(`scheduleLabel`), so "closed early by hand" and "closed at 8:00 PM" are distinguishable
without a column that can desynchronise from reality. Reschedule is the ONE way a closed
poll reopens, which keeps `status: closed` sticky everywhere else.

**The handover cannot silently steal a vote.** The page sends the decision it displayed;
if that set closed while the fan was typing, the claim route refuses with `stale_show` or
`not_open` and still completes the free join. A Show 1 pick never lands in Show 2's tally.

**Creation is one prefilled form.** `liveShowTemplate.ts` generates the project title,
stage labels, question (interpolating the artist's first name), headline, supporting line,
internal magnet name and link slug; only the show/date and the songs are typed, with
"Same songs as Show 1" as a one-tap copy that does not couple the two polls afterward.
8pm/11pm are defaults OF THIS TEMPLATE, editable per event, not CRWN-wide constants.

**JUBO is built, signature-verified, and DARK.** `/api/sms/inbound` answers one keyword
with the same event URL tagged `utm_source=jubo`. Twilio's HMAC-SHA1 is implemented in the
existing `webhookSignatures.ts` (no SDK, matching the Svix precedent) and pinned against
Twilio's published test vector. It refuses everything unless `SMS_KEYWORD_ENABLED=true` and
a live `TWILIO_AUTH_TOKEN` are set, and the account currently holds TEST credentials (probe:
error 20008), which cannot receive inbound at all. STOP/HELP are recognised only in order to
stay silent: those words belong to the carrier and Twilio Advanced Opt-Out. Texting a
keyword enrols nobody in anything; the free membership still happens only on the web page.
SEC-SERVICE now recognises `verifyTwilioSignature` as an authority, mutation-tested.

**Migration `schema-phase2-song-lab-live-shows.sql` is PENDING and additive**: two nullable
columns (`song_lab_projects.show_timezone`, `song_lab_offer_claims.source` with a CHECK).
Every path survives it being unapplied, verified in production: projects read with
`select('*')`, the claim insert retries without `source` on 42703, and the live-show creator
drops the timezone on PGRST204. Until applied, QR vs JUBO is reported as "not recorded",
never as zero.

Verified on production against a throwaway event walked through every phase: Show 1 renders
alone, its vote lands only in Show 1, a stale Show 1 submission is refused while the join
still succeeds, the between state shows no ballot and names the next opening time, a
manually opened Show 2 takes over immediately with its own fresh tally, an invalid option is
refused server-side, and after the night the page shows the ended state with no vote action.
All fixtures deleted. Julius's real night is configured on his existing rows (Show 1 closes
8:00 PM ET Sept 26, Show 2 opens then and closes 11:00 PM ET, one unchanged link and QR).
`verify:architecture` 825, `npm test` 2916, cold build clean, sw v430.

## 2026-08-20 (last pass) - The ballot IS the page: vote-first conversion for `A vote` lead magnets

**The songs now come before the ask, and one action does everything.** A `vote` magnet
whose decision is open renders hero + choices, reveals **First name** and **Email** under
the chosen song, and a single **CAST MY VOTE** performs signup, free join and vote. The
artist's `cta_label` is no longer used (or even sent) in ballot mode, because the button
performs a vote: `BALLOT_CTA_LABEL` is the one label and `FORBIDDEN_BALLOT_CTA` pins the
signup words out of it. Disclosure sits directly under the button, derived from the artist
name via `possessive()`, promising only what a free member really gets (the result, news
about shows, free, no card). Pure rules live in `src/lib/songLab/voteForm.ts` (16 tests):
validation order puts the SONG first, error copy is attendee-readable
("Choose a song first.", "Enter a valid email.", "Voting has closed."), and a recoverable
error never clears the chosen song.

**Auth is unchanged, and the limit is documented rather than bypassed.** A logged-out
attendee goes through the SAME `signUp` the normal form uses, dropping only username and a
self-chosen password (neither is an authorization control; the password is CSPRNG-generated
and email remains the recovery path). Production was probed, not assumed:
**`mailer_autoconfirm: false`**, so signup returns no session and the page says so plainly
("One more tap"), with the chosen song riding verification on the existing
`user_metadata.pending_next` rail as `?claim=1&o=<option>`. The identical code path completes
in the room the moment auth is switched to auto-confirm. An existing address gets the same
neutral state plus a sign-in link carrying the vote, so nothing leaks whether an email is
registered.

**The defect behind the founder's screenshot: a vote magnet could exist with NO decision.**
Julius's live St. James link had `decision_id: null`, so the landing had no ballot and fell
back to a join button with no songs and no explanation. Now refused at create (server and
disabled button), flagged in red on any existing row with an inline picker, and the linked
ballot is editable from the row.

**Post-publish editing and deletion, with history protected.** Artists can now correct a
published vote (question, song titles, and the offer's headline/description/reward) and
DELETE offers, decisions and projects. Every delete refuses once a fan has touched it: an
offer with claims, a decision with votes, or a decision a live link still points at, each
naming the safe alternative (turn off / close / archive). The link slug is deliberately not
editable because printed QR codes point at it. Renaming a song is always safe:
`mergeOptionEdit` keeps option ids by position, so votes already cast keep their meaning.

Verified on production against Julius's real link: ballot renders the stored choices, new
fan joins Bronze once with the vote recorded and `fresh_signup` attribution, duplicate and
rapid double-tap produce exactly one membership/vote/claim, invalid or foreign option ids
are refused server-side while the join still succeeds, cross-artist and non-enabled-artist
slugs 404, anonymous claim 401s, a fan reading artist analytics 403s, a closed vote renders
no ballot and records none, and a non-vote magnet is untouched. All test fans and fixtures
were deleted afterward. `verify:architecture` 825, `npm test` 2857, cold build clean, sw v427.

## 2026-08-20 (evening) - Between-Tour and Proof of Demand rejoin the promoted funnel

**Founder decision: bring back the tour calculator and the proof of demand calculator, with the
same updates the visible calculators carry.** Both joined `PROMOTED_TOOL_KEYS` (nine doors now)
with the full promoted-tool contract established by the 2026-08-16 Live Experience re-promotion:
a Zero to One doorway each in `src/lib/leadMagnets/positioning.ts` (between-tour = show-night
proof carried into the off months, one ladder, never a second business; proof-of-demand = demand
knowable before a dollar is spent, the test chooses the next rung inside the one economy), hero
subheadlines trimmed inside the shared above-the-fold budget (28 and 25 words), and bespoke
illustrated heroes in the brand flat-vector style (`hero-between-tour.webp`,
`hero-proof-of-demand.webp`, both 1376x768 WebP, reviewed by eye per the house rule). Both
figures are men on purpose: the seven existing heroes counted 4 men / 3 women, so two men land
the nine-image set at 6/3, on the 65/35 brand ratio counted across the set. The between-tour
videoAngle's "walks out unowned" became "walks out with nothing to join" (no literal ownership
of people, POSITIONING.md section 24). Nurture modules and continuation CTAs already existed
for both, so nothing was added there. Paused count is now 12. Slugs, routes, DM keywords
(TOUR/TOURING, PROOF/DEMAND), toolIds: all unchanged, as always.

**Email nurture verified end to end for both, no copy changes needed.** The v3 sequence is
universal by design (per-tool words come only from `moduleFor(slug)` plus tokens), enrollment
and the cron never gate on promoted/paused, and both tools' bespoke modules now sit under the
promoted-tool governance in `calculatorModules.test.ts` (derived from `PROMOTED_TOOL_KEYS`).
Rendered every touch for both slugs and read them: between-tour emails quote the artist's own
loss-engine number (`heroValue`/`estimatedMonthlyCents` present); proof-of-demand stores no
dollar fields, so `hasNumber` is false and every `numberOrFallback` block renders its honest
no-number variant. The only real gap was the admin campaign link builder: `LINK_DESTINATIONS`
had no entries for the two returning tools, so content links to them could not be built with
attribution. Both added.

## 2026-08-20 (later still) - Song Lab live show mode: Julius Williams turns a live audience into owned free fans

**Second opt-in artist, same primitive, no new tables.** Julius Williams (slug
`julius-williams`, a veteran Atlanta soul/R&B vocalist whose acquisition moment is the live
room, not Instagram) had `song_lab_enabled` flipped on by a service-role data write
(probe-verified: `/api/song-lab/public?artist=julius-williams` answers 200 with his Bronze
free tier id). His workflow maps one Song Lab OFFER per performance ("City Winery Sept 12" =
`/julius-williams/join/city-winery-sept-12`), so `song_lab_offer_claims` already answers
"which show produced this fan" with `join_result` + `fresh_signup`, first touch preserved by
the existing UNIQUE + ignoreDuplicates upsert. This is an artist-specific opt-in capability;
it does not change the canonical ICP, positioning, onboarding or any default artist surface.

**Live show mode: the ballot IS the landing.** A `vote` offer whose decision is effectively
open now renders the ballot on `/[slug]/join/[offer]` itself (large type, 64px tap targets,
radiogroup semantics, plain words, built for audiences that skew 60+): tap a choice, press one
gold button, and the ONE submission joins the free tier AND casts the carried vote. The choice
rides through signup as `?o=` inside the already-validated `?next=` and is re-validated
server-side (`preselectedOption`); the claim route casts it through the same `checkVote`
authority as `/api/song-lab/vote`, with the fan's tier re-derived from `subscriptions` after
the join, and a denied vote never blocks the join. `ballotOpenForFreeJoin` keeps the page from
promising a ballot the enrolled tier could not cast; the shared `resolveOfferEnrollTier` (also
used by the claim route) guarantees the tier shown is the tier delivered. The confirmation is
a screen, not a redirect: "Your vote is in" + the explicit disclosure that voting joined the
artist's free community, then ONE gold CTA to the offer's optional `destination_path` reward
(now editable in the manager) or the vote status. Open-vote tallies stay hidden (the reveal
rule holds; the confirmation shows membership, not percentages). `recordLabVote` in
`src/lib/songLab/server.ts` is now the one vote writer (vote route + claim route).

**QR sheets, in the manager.** New `qrcode` dependency (dynamic import, manager-only): each
offer gets a print-ready sheet with a high-contrast QR, the plain-language instruction "Open
your phone camera, point it at the square, then tap the link that appears", and the short URL
in large type as the no-camera fallback. SMS text-to-join was NOT built (SMS/Twilio was
removed platform-wide 2026-07-31; the QR sheet's typed-URL line is the non-QR doorway).

**Julius's seed (data, no fabricated content):** project "Live Show Song Vote" + one DRAFT
decision "What should Julius sing next?" (Luther Vandross / Stevie Wonder / Marvin Gaye /
Earth, Wind and Fire; `is_free`, invisible until he opens it), plus his `day_one_anr` badge
definition row. His Bronze $0 tier is the enroll target; reward content is his to supply
(cover-performance recordings need rights he must confirm; nothing was uploaded for him).
`schema-phase2-song-lab.sql`'s post-COMMIT self-verify no longer asserts exactly-one enabled
artist (it asserts gb-is-enabled), so the file stays safe to re-run. Registered/verified:
invariants FEATURES + EXPECTED_MIGRATION_STATE notes updated, `verify:architecture` 825
passing, `npm test` 2841 passing (6 new core tests), WSL build clean, sw.js bumped to v422.

## 2026-08-20 (later that night) - Song Lab is LIVE for gb

**The founder ran `schema-phase2-song-lab.sql` and the probes agree.** Anon reads
`song_lab_projects` 200 with an empty list, the gate column and `song_lab_votes` both answer
42501, the service role sees exactly one enabled artist (`gb`), the `day_one_anr` badge row
exists, and the production route `/api/song-lab/public?artist=gb` answers 200 carrying GB's real
free tier id. `EXPECTED_MIGRATION_STATE` moved to applied, the `song_lab` feature contract moved
to live, and the TODO item is deleted. GB's test walkthrough was handed to the founder; the
first real data (a project, a decision, a lead-magnet claim) will come from GB himself.

## 2026-08-20 (night) - Song Lab: GB The G1ft's fan co-creation experiment, plus the free-join bug it uncovered

**Every free tier join on the platform had failed since launch, and fixing that came first.**
Production's `subscriptions.stripe_subscription_id` is NOT NULL (verified via the PostgREST
schema, not the checked-in SQL, which agrees), and neither free path supplied it: the
artist-page Free button (`/api/stripe/checkout` free branch) never read its upsert error and
reported success while writing nothing, and `/api/stripe/free-subscribe` answered 500. Zero
free subscription rows existed. The fix is code, not a migration: the one canonical writer
`src/lib/subscriptions/freeJoin.ts` upserts a deterministic `free_<fanId>_<artistId>` id, both
free routes call it, and cancel, pause and subscription-update all branch on
`isFreeSubscriptionId` so the synthetic id never reaches Stripe. A free member tapping a paid
tier now routes to a fresh checkout instead of a proration update that would have 500d.

**Song Lab is artist-scoped and ships dark.** GB The G1ft (slug `gb`, the launch partner whose
strategy is building songs in public on Instagram) gets a fan co-creation surface: projects,
async advisory A/B/C decisions (one DB-enforced vote per fan, tier-gated through the standard
`is_free`/`allowed_tier_ids` vocabulary, artist names the winner), configurable free lead
magnets at `/gb/join/<slug>`, and a claims table recording which magnet produced which member
(`join_result`, `fresh_signup`). The gate is a server-only `artist_profiles.song_lab_enabled`
column on the launch_partner pattern; `supabase/schema-phase2-song-lab.sql` (PENDING, in
TODO.md) creates everything, flips `gb` only, and seeds his Day One A&R badge. No slug literal
exists in code; other artists' surfaces are unchanged and `/studio/lab` has no tile anywhere.

**Executive Producer polls were investigated and deliberately not reused.** `session_polls`
carries two NOT NULL FKs to `live_sessions`, session-derived authorization, and the ratified
"every surface is grafted onto Live" invariant, so Song Lab copies its proven patterns
(denormalized artist_id for RLS, UNIQUE vote constraint, service-role-only writes, advisory
finalization) into sibling tables instead of making session_id nullable. Signup finally
preserves a destination: a validated `?next=` mirrors login's, rides
`user_metadata.pending_next` through email verification (same rail as the claim token), and
`/verify` honors it. Registered: FEATURES `song_lab` (dark), EXPECTED_MIGRATION_STATE row plus
two probe lines, and the `requireSongLabArtist` helper added to the security scan's trusted
set (it wraps `auth.getUser()` plus the gate, strictly stronger than what the scan already
trusts). Verified: `verify:architecture` 825 passing, `npm test` 2677 passing, WSL build
clean. Recognition is Special-Thanks-class only; the disclaimer naming every excluded right is
`RECOGNITION_DISCLAIMER` and renders on every recognition surface.

## 2026-08-20 (evening) - The launch cohort exists: gb, giovannimaziq, lagoo

**The stage gate now has its three artists.** `artist_profiles.launch_partner` is true for `gb`,
`giovannimaziq` and `lagoo`, confirmed by the enrol file's own closing SELECT. The First Revenue
Launch guarantee checklist appears on their command screen on next load
(`LaunchPartnerChecklist`, served by `/api/artist/launch-partner`). Selecting the three was the
first line of "what remains" in `20-FIRST-REVENUE-LAUNCH-OFFER.md`, and it is now done.

**They were chosen on evidence, not availability.** `launch-partner-candidates.sql` (new,
read-only) reports every artist against what the product actually enforces: music, a photo, a
name that is not still the signup email, Stripe connected, and at least one paid tier carrying a
live Stripe price. Of ten artists, six were unblocked. Three of those six were excluded as not
real candidates: `m3rcey` (the founder's own test artist), `lago` (the founder's onboarding test
account) and a placeholder row. That left exactly three.

**The enrol file used to fail silently, which is why nothing was enrolled the first time.** It was
`UPDATE ... WHERE slug IN ('replace-with-artist-slug')`: run unedited, or with one slug mistyped,
Postgres reports success having changed nothing, and the founder moves on believing three artists
are in the cohort while the checklist appears for nobody. It now aborts on an unedited list, an
empty list, an unknown slug (naming it), or a partial match, and ends by SELECTing the cohort.

**A claim in CLAUDE.md was corrected.** On 2026-08-19 I wrote that a short Featured row was an
accurate report of a short catalogue, inferred from the completeness filter and never checked.
Probing found the real cause is `featured_hidden`, and that the curation is INVERTED: five of ten
artists are hidden, including the two most complete real ones, while a one-track artist with no
paid tier is shown. Two of the three new launch partners are among the hidden. Fix a thin row by
unhiding a complete artist, never by lowering the completeness bar.

**Open, and deliberately not actioned:** production carries an artist whose slug is the literal
placeholder string and whose display name matches, with a track, a priced tier and an uploaded
photo, publicly reachable. It is out of the Featured row only because `featured_hidden` happens to
be true; the presentable-name check would not have stopped it, because that check only rejects an
unedited signup email. Deleting a row is destructive and founder-approved.

## 2026-08-20 (later still) - Live tips are ON, closing a promise the calculator was already making

**Founder decision, executed the same day.** `admin_settings.live_tips` is ON in production
(probed with `npm run verify:flags`; all flags now ON except `artist_gate`, where OFF correctly
means open signup).

The gap this closes: `src/lib/opportunity/unifiedModel.ts` carries a `live_tips` incremental line
at a 25% tip rate and ADDS it to the live monthly gross, so the Opportunity Calculator, CRWN's
primary promoted door, has been showing every artist tip revenue. The Live Experience Calculator
joined `PROMOTED_TOOL_KEYS` on 2026-08-16 and prices tips during the stream too. Tips shipped dark
in the same period and were never turned on, so two promoted calculators were quoting money the
product could not take. That is the marketing-ahead-of-product failure class, and it had exactly
two honest exits: turn the built feature on, or take tips out of the model. The founder chose to
turn it on, which keeps the artist-facing number intact and makes it true.

Nothing was built. The feature was already complete: `live_tips` and `live_goals` tables, the
Stripe webhook matching a tip BEFORE the ticket branch, the `earnings.type = live_tip` CHECK, the
fan-facing tip bar mounted on the watch page and gated server-side through `/api/live/tips`.
`verify:architecture` confirms both registered surfaces are still wired.

**Two records were wrong, in opposite directions, and both are corrected.**
- `FEATURES` in `invariants.ts` already declared `expectedState: 'live'` and its note asserted
  "(3) flag ON" from the 2026-08-12 reconciliation. Production said OFF. The static suite could
  not catch that and is not supposed to: static gates and live probes are deliberately separate,
  which is the whole reason `verify:flags` exists.
- `.claude/commands/crwn-fan-economy.md` hard-coded "live tips: FLAG OFF, never claim and never
  put in the math". That was correct until today and would now produce scripts that UNDERSELL a
  shipped feature. It is updated. That file had itself written "this line goes stale the moment it
  happens", and it still took a probe to notice, which is the argument for the probe.

The `announce_live_tips` pop-up can now fire. It carries `announcedAt: 2026-07-24`, so only
accounts created before that date see it; anyone newer meets tips as the normal product.

## 2026-08-20 (later) - The Rise Mode login landing is reverted; pop-ups get contrast and lose the essays

Two founder decisions from seeing the work on a real device.

**The login landing goes back to `/home` for everyone, artists included.** Artists were routed to
`/profile/artist` on 2026-08-19, on the reasoning that Rise Mode is their command screen and
`/home` is a fan surface. Seen on a phone, the reasoning did not survive: Rise Mode answers ONE
question and is deliberately sparse, so as a LANDING it is a card and then a screen of empty
space, and `/home` is where the governed pop-up meets an artist at the start of a session. Rise
stays one tap away in the bottom bar. `/home`'s Quick Actions deletion is unaffected and stays:
that was a separate call, and every tile in it was a second door to a bottom-nav slot.

`artist_resume_rise` KEEPS `/profile/artist` in its `pages`. It was added when artists briefly
landed there, but the entry stands on its own: the original reason for excluding that page was
that it was the CTA destination, and the destination moved to `/quests`. The invariant, never
interrupt someone on the page you are sending them to, is unchanged.

**Pop-ups were redesigned against a founder reference** (a Hinge prompt: 6-word title, 12-word
body, animated image, a card that clearly sits above the page).

- **Contrast was the real defect.** The modal was `#1A1A1A` on `black/70`, the SAME surface token
  as an ordinary card on a barely-dimmed page, so an interruption did not read as one. It is now
  the Elevated tier (`#2A2A2A`) on a heavier blurred backdrop with a real cast shadow, a faint gold
  ring, and a scale-in. Deliberately NOT white: that is how the reference gets separation, but a
  white card in a dark-only product reads as a different app.
- **Copy was measured, not guessed.** Bodies ran 9 to 75 words, median 35, and the eight worst were
  announcements spending three sentences on WHY a change was made. That belongs in this file, not
  in front of someone mid-task. Median is now 21, longest 39 (a break-even pop-up whose words are
  arithmetic the artist needs to check the claim).
- **The image is a progress ring, not an illustration.** It draws the artist's ACTUAL percent and
  sweeps to it on mount, built from the same `ctx.resumable` snapshot the copy is. A picture earns
  its place only if it says something the sentence cannot; a number the artist owns is evidence for
  the claim, which is what the reference is doing by showing you your own liked photos. Decoration
  on 20 pop-ups is 20 assets to keep on-brand and nothing gained, so only the resume prompt draws
  one today.
- **`src/lib/popups/copy.test.ts` is a ratchet**, not a style guide: word caps on title and body
  plus a MEDIAN cap, so a paragraph cannot creep back one pop-up at a time. It caught a 15-word
  title on its first run, which was shortened rather than exempted. Mutation tested.

**Two pop-up mechanics worth not re-deriving.** A terminal action RETIRES a pop-up, and clicking
the CTA counts as terminal exactly like dismissing, so pressing "Finish it" closes the resume
prompt for good. And deleting `popup_events` RE-ARMS a `once` pop-up while inserting a row RETIRES
it, which is why `supabase/dev-show-resume-popup.sql` deletes for the resume prompt and inserts for
the announcements, in opposite directions, in one file.

## 2026-08-20 - The resume prompt is VERIFIED live, and what it took to see it

The named resume prompt shipped on 2026-08-19 is confirmed working in production on a real
non-admin artist account (`lago`). The modal reads **"Finish this: Complete Your Artist
Destination"**, the body states the goal is 50% of the way there, and the gold CTA is **Finish it**
to `/quests`. That is the founder's ask satisfied: the prompt instructs the artist to complete the
specific task, by name.

Getting to that screenshot took four wrong turns, and each one is a reusable lesson.

- **An admin can never verify a pop-up.** `eligiblePopupFor` returns null for `role === 'admin'`
  before any targeting runs. The founder's own account is structurally incapable of seeing one, so
  "the pop-up is not showing" was never evidence about the pop-up. This is now in `CLAUDE.md`.
- **Mid-wizard, nothing can fire at all.** An artist with `setup_completed = false` is redirected by
  `MainShell`, which returns null while it does, so `PopupHost` never mounts. `/setup` is in no
  pop-up's `pages` either, and `resumable` would be null regardless because `quest_instances` are
  only assigned by `/api/quests`, reachable only from Rise Mode and the quest board. Four
  independent reasons, all correct behaviour.
- **`RAISE NOTICE` does not reach the Supabase SQL Editor.** The first diagnostic reported through
  notices inside a `DO` block. Running it printed "Success. No rows returned" while the destructive
  half happened silently. A diagnostic whose output cannot reach the human is worse than none,
  because it looks like it worked. Every dev utility now reports through a result set.
- **Deleting `popup_events` RE-ARMS the backlog it was meant to drain.** `passesFrequency` for a
  `once` pop-up is `mine.length === 0`, so clearing history resurrects every announcement. Clearing
  to reach a low-priority pop-up is a loop with no exit. INSERTING a `dismissed` row is what retires
  one, and because the daily governor counts only `shown`, it does not spend the day.

The underlying arbitration was correct throughout and was not changed. `lago` was created
2026-07-30 and therefore legitimately predates five announcements (priority 45 to 58) that all
outrank resume (40), draining one per calendar day. A genuinely NEW artist predates none of them,
so pilot artists go Stripe (100) then resume (40) with no backlog at all. Nothing here is a defect
in the engine; it is a property of testing a low-priority interruption on an old account.

Two dev utilities came out of it, and the announcement key list is written down exactly once in
each so they cannot drift: `supabase/dev-reset-popups.sql` (read-only diagnosis: role, whether the
daily slot is free, which quest is resumable, and what is outranking what) and
`supabase/dev-show-resume-popup.sql` (one ready-to-run statement that retires the backlog).

Also aligned in passing: Stripe Connect was advertised as taking 2 minutes in the guides, 5 in the
setup wizard, and two in the pop-up. All three now say 5, the conservative estimate, on the one
flow that decides whether an artist can be paid.

## 2026-08-19 - Getting Started stops teaching a deleted UI; /home stops duplicating the tab bar; the resume prompt names the goal

Four founder items were audited before any of them were built. One was already built, one was a
duplicate of a nav slot, one asked to decorate a screen that was telling the truth, and one was
actively wrong to the artists CRWN is trying to activate. That last one went first.

- **The getting-started guides were teaching a UI deleted on 2026-08-13, and they feed the live
  support AI.** `supportKnowledge.ts` inlines a digest of every guide into
  `SUPPORT_ASSISTANT_PROMPT`, so each stale guide was also a stale answer from `/support`. Seven
  lines routed artists to a "Profile tab", "Analytics tab", "Community tab" or "Sync tab"; a guide
  was titled "Email & Text Campaigns" four months after SMS was removed; "Set access levels" and
  "Allowed Tier IDs" survived content classes replacing them; a step pointed at a "Weekly Report"
  whose cron was deleted; the audio limit was documented at 50MB against a real 100MB; the tier
  guide taught a $15/$30 two-tier structure against the pinned Bronze/Silver/Gold/Platinum ladder;
  and the referral guide described commissions without mentioning the rate **starts at 0**, which
  is the single most likely reason an artist concludes referrals do not work.
- **Two guides were DELETED rather than rewritten**: `ai-manager` (built entirely around the
  deleted weekly report, for a surface hidden in the pre-PMF reduction) and `sync-licensing` (a
  hidden surface, and it advertised a plan limit nothing enforces). 14 guides became 12.
- **The page held a SECOND hardcoded copy of the guide index**, with its own titles and
  descriptions, which had already drifted. It is now derived from `guideContent.ts`, and the
  "14 In-Depth Guides" stat is counted rather than claimed.
- **The support prompt's own navigation fact was stale too.** It described a five-slot bottom bar
  with Explore and Messages. It now describes the real three artist slots and two fan slots, and
  explicitly forbids the assistant from naming a "Profile tab", "Analytics tab", "Community tab"
  or "Sync tab".
- **`/home` lost its Quick Actions section.** Every tile was a second door to a bottom-nav slot: a
  fan got Library (their Library slot), an artist got Studio (their Studio slot) and "Artist
  Dashboard" (their Rise slot, under a name that stopped being true on 2026-08-13). The founder
  asked for the Artist Dashboard tile to go; deleting the section removes it and the duplication
  together. Two tour steps anchored on the deleted elements were re-anchored, one of which also
  described the 16-tab dashboard that no longer exists.
- **Artists now land on Rise Mode at login**, not `/home`. `/home` is a fan surface (SupporterMode
  is deliberately fan-only), so for an artist it was a Featured row plus links to the tab bar,
  costing a tap every session to reach the actual work. The check is the `artist_profiles` ROW,
  never `profiles.role`, which lags a token refresh. An explicit `?next=` still wins.
- **The Featured row was NOT padded.** Production has 9 public artists and 2 pass the completeness
  filter (music AND avatar AND a presentable name AND active). That row is an accurate report; the
  fix is more complete artists, not more chrome. Padding it would have meant rendering incomplete
  artists as broken tiles or inventing content, against the real-counts-only rule.
- **The resume pop-up now NAMES the goal** (founder decision): "Finish this: <goal>" instead of
  "one of your Rise Mode goals". `resumeCopyFor()` is pure and tested, built from the SAME
  `ctx.resumable` snapshot the audience predicate gated on, so it can never name a goal that did
  not qualify it. This does NOT reopen the 2026-08-11 correction: that bans claiming the artist
  STARTED or ABANDONED something, because progress is derived from DomainChecks over live data. A
  goal title and its percentage are facts on the row, and the new copy is held to the identical
  forbidden-claims list at 4% and at 90%.
- **Naming the goal forced the destination to move, from `/profile/artist` to `/quests`.** Rise
  Mode renders ONE move resolved by `resolveRiseNextMove` from the Constraint Engine, which ranks
  by constraint priority while this prompt ranks by progress. They can legitimately disagree, so
  naming a task and landing on Rise Mode would name X and show Y. `/quests` is the board that
  actually renders that quest and its progress. `/profile/artist` joins `pages` in the same move,
  which matters because artists now land there at login. The invariant is unchanged and still
  asserted in two suites: never fire on the page you are sending someone to.
- **Not a defect, and the reason the founder could not see it:** `eligiblePopupFor` opens with an
  admin short-circuit that returns null before any targeting runs. No pop-up of any kind renders
  for an admin account. Verification on a non-admin artist is in `TODO.md`.

Evidence: `npm run build` clean, `npm test` 2519 passed, `npm run verify:architecture` 825 passed.
Production flags probed the same day: `quest_engine` ON, `popup_engine` ON. One doc/production
disagreement found in passing and deliberately NOT fixed here: `live_tips` probes **OFF** in
production, while the 2026-08-16 entry below records that flag-off as retracted before it ran.

## 2026-08-16 - Live Experiences re-promoted; the live_tips flag-off is retracted

**Founder decision: both Live Experiences and Executive Producer Sessions are being promoted in
content, so both belong in the visible funnel.**

What actually changed is smaller than the ask, because most of it was never taken away:
Executive Producer Sessions was already in the promoted calculator set (PRODUCER, 7 scripts), its
flag was already ON, and its surfaces ride the Live room, whose Studio tile survived the surface
reduction. Verified end to end rather than rebuilt.

Live Experiences needed two things. Its calculator (`live-experience-calculator`, keyword LIVE)
joins `PROMOTED_TOOL_KEYS`, so the promoted set is now SEVEN and the tool reappears in the /tools
directory; pausing had touched nothing else, so there was nothing else to restore. And the staged
live_tips flag-off (`supabase/flag-off-live-tips.sql`) is RETRACTED and deleted before it was ever
run: its premise was "live is not on any promoted content path this phase", which this decision
falsifies, and tips are part of the live room those funnels sell. The flag was never turned off in
production, so there is nothing to undo.

## 2026-08-15 - Brand imagery becomes flat vector poster art, and the hero is rebuilt around the fold

**Founder decision: every image generated for the app or an email is now a flat vector poster
illustration, not photography.** The rule is in `CLAUDE.md` (replacing the cinematic-photography rule
of 2026-07-11) and in persistent memory. Reference implementation:
`src/lib/positioning/sectionImages.ts`, `public/hero-*.webp`, `public/section-*.webp`.

- **The style.** Bold geometric colour blocks, near-black silhouette figure with sculpted flat
  highlight planes, radiating sunburst rays, concentric arcs, repeating dot rows, hard vector edges.
  No gradients, texture, realism, soft shading, 3D or drop shadows. **Palette is exactly five**:
  `#0D0D0D`, `#1A1A1A`, gold `#D4AF37`, amber `#E8A33D`, burnt orange `#C2571A`. The founder's
  reference ran bright red-orange; that was deliberately pulled toward CRWN gold, because a second
  warm brand beside the gold CTAs reads as two companies on one page.
- **15 assets**: 6 heroes (homepage plus each promoted calculator) and 9 section bands. **No text,
  letters, logos or watermarks inside any image**, and each one was opened and reviewed rather than
  trusted from its prompt.
- **Gender mix is ~65% male / 35% female ACROSS THE SET, not per image.** The first generated set
  came out ~93% male for a mundane reason: every prompt said "artist" and the model returns a man
  almost every time. Five images were redrawn with a woman leading and one two-hander made mixed,
  taking it to 10/5 = 67/33. **Name the gender in every prompt and count the set before shipping.**
- **WebP, never JPEG.** Flat colour and hard edges are the worst case for DCT: the nine section
  images were 4.8 MB as JPEG with visible ringing on every edge, and 475 KB as WebP with no visible
  loss. A 90% reduction on eight below-fold images.
- **No border, frame or white edge**, machine-checked. The generator drew a 25px white frame around
  one hero and it reached production because a thin light border is invisible at review scale
  against a dark page. `toolPositioning.test.ts` now samples all four edges of every brand asset and
  fails on a near-white edge; proven by mutation. **The eye is the wrong instrument for this**, so
  looking and the edge test each catch what the other cannot.
- **The hero is one centred column, image on top, at every breakpoint**, and the CTA stays above the
  fold **by construction rather than by a height budget**. Two hand-computed budgets were both wrong
  on a real screen, because the copy block has no fixed height: the headline wraps to two or three
  lines depending on the tool and the viewport. On desktop the hero is exactly one viewport tall, the
  copy is `shrink-0`, and the image is `flex-1` and absorbs the remainder. A wrapping headline now
  costs the image height, never the button its place. **Do not give the image a fixed or
  aspect-derived height on desktop again.**
- **The eyebrow and the "Takes about N. Free." line are gone from every surface.** Removed from the
  props rather than made optional, and `hero.eyebrow` was then deleted from the type and all 19
  configs once a grep confirmed nothing read it. `timeToComplete` STAYS in the registry:
  `LeadMagnetDirectory` renders it on `/tools` and `automationDispatcher` sends it as `howLong`.
- **Existing photography stays until its surface is next touched.** The 14 paused calculators,
  `studio_*.jpg` and `homepage_*.jpg` are still photographic, so `/tools` currently mixes both. This
  rule governs what is GENERATED and is not a licence for a mass re-shoot.

## 2026-08-14 - Homepage hero and CTA targets (founder pass)

- **The homepage hero drops the eyebrow ("For independent artists already selling direct") and the
  "Takes about 2 min. Free." line.** `ToolHero` now takes both as optional and `PublicToolClient`
  passes neither when `surface === 'homepage'`. `timeToComplete` stays registry DATA because the
  `/tools` directory and `automationDispatcher` read it; only the hero rendering changed, and the
  19 tool routes are untouched.
- **More photograph, still above the fold.** Desktop needed no change: the image is `flex-1`, so it
  absorbed the freed height automatically. Mobile has no such slack, so its crop is now
  height-aware: 4:3 above 700px of viewport height, 16:9 below it. Measured, not budgeted, at
  375x667 / 390x844 / 430x932 / 1280x800 / 1440x900.
- **Every "go and run this" CTA now lands on the calculator, not the top of the document.** New
  `WIZARD_ANCHOR_ID` on the wizard; the nav's "See my opportunity", the First Revenue Launch CTA
  when no result exists, and the closing CTA before completion all target it. The top-of-page
  fallback survives only when no wizard is mounted, because for a finished visitor the top is their
  own result. Completed-state targets are unchanged (hand-raiser and builder).
- The fold drift test previously banned the literal string `aspect-[4/3]`. It now asserts the rule
  that ban stood in for, and is strictly stronger: any ratio must be neutralised at `md`
  (`md:aspect-auto` required, `md:aspect-[...]` forbidden), so desktop can never become
  aspect-derived. Mutation-tested: the violation was introduced, the test failed for the intended
  reason, and it was reverted.

## 2026-08-15 - Team Split funding decisions: stale "open questions" language reconciled

**Documentation-only pass; no money, Stripe, schema or runtime behavior changed and the cashout
rail remains 503.** The three funding decisions (no retroactive splits, no pre-deal accrual,
unowed reserve belongs to the artist) were ratified 2026-08-12 and recorded in
`FUNDING_RATIFIED_DECISIONS` (`src/lib/teamSplits/funding.ts`), but four places still called them
open founder questions: `CLAUDE.md`, `15-AI-AGENT-INSTRUCTIONS.md`, the cybersecurity audit's F-3
disposition row, and the `funding.ts` header comment itself. All four now point at the ratified
record while preserving the load-bearing distinction: settled decisions do not open the rail,
which stays closed until the charge-time reserve is wired and a test-mode canary proves the
payout source (the sandbox item in TODO.md). `TODO.md` and `07-BUSINESS-RULES.md` §8a were already
accurate. Dated changelog entries were left as honest history.

## 2026-08-14 - The six promoted calculators become six doors into one story

**The homepage was rebuilt on the ratified Zero to One positioning on 2026-08-13. The six promoted
calculators were not, so CRWN's acquisition surfaces were arguing six different companies. This is
a positioning, composition and copy pass only: no formula, constant, scenario, price, fee,
question, funnel contract, qualification rule or route changed.**

- **The generic showcase was the core defect.** `CrwnShowcase` rendered under every promoted tool
  in both the hero and result phases, and its mockups advertised the **leaderboard, Sync, the AI
  actions feed, the clipper program and email sequences**: five surfaces the pre-PMF product
  reduction deliberately hid. A promoted acquisition door may not promise a product the visitor
  cannot then find. It is now gated to NON-promoted tools, which keep it untouched.
- **One shared story, six doorways.** `src/lib/positioning/story.ts` owns the canonical argument
  (the five-step path to first revenue, the operating loop, the First Revenue Launch offer and its
  guarantee); `src/lib/leadMagnets/positioning.ts` owns only what must stay different, one doorway
  per promoted tool. **`HomeMarketing` now reads the same module**, so the homepage and the
  calculators cannot drift apart again. The promoted set is DERIVED from `PROMOTED_TOOL_KEYS`, so
  promoting or pausing a tool can never leave a page without a story or a story without a page.
- **`ToolMarketing`** is the shared lower page: what this reveals, one fan economy, the path to a
  first paid member, First Revenue Launch, one closing CTA. Deliberately shorter than the homepage,
  because the artist's own number has already made the argument. Presentation only: no second
  calculator, result, builder, hand-raiser or analytics call, so it cannot double-count.
- **Six theses, rewritten.** Streaming Loss: reach and direct fan value are two different numbers,
  and streaming stays the discovery job. Vault: unreleased work is why a committed fan climbs a
  rung, not idle inventory. Share-to-Earn: advocacy is ACQUISITION into the same ladder, never a
  second revenue line. Executive Producer: premium participation is how the high-value end reveals
  itself, and no capacity is implied. Own Your Fans: reach is not a relationship, and the eyebrow
  stopped asserting ownership of people (the slug, name, route, `featureName` and DM keyword all
  stay, because campaign links and historical rows are keyed to them). Opportunity Calculator: the
  complete diagnosis, with the anti-double-counting contract stated in the artist's own words.
- **`/worth` kept its calculator and lost its era.** Deleted: the revenue-mix bar, the "what is
  CRWN" mock, the streaming comparison table, the six-way monetization grid and shop mock (which
  advertised DMs), the objections, the steps and the FAQ, plus a duplicate closing CTA and two en
  dashes. **Kept: the personalized ladder**, the one place on that page showing economic depth from
  the artist's OWN result rather than a benchmark. It now renders the shared narrative.
- **Homepage verified unchanged** in rendered HTML: `HomeMarketing` present, the tool narrative
  absent, its First Revenue Launch block intact.
- Tests: `src/lib/leadMagnets/toolPositioning.test.ts` (22 new). Six existing `pageComposition`
  assertions were **re-pointed at the shared module, not weakened**: the strings they scan for moved,
  and two got stricter (the showcase gate now also excludes promoted tools; the ownership check now
  covers the eyebrow). 2,263 tests pass, `verify:architecture` 814 pass, build clean, `sw.js` v403.
- **Known limitation, pre-existing and unchanged:** the five registry tool routes return early on a
  `phase === 'loading'` gate, so their body is client-rendered and ships no server-rendered
  marketing. `/worth` server-renders and was verified directly.

## 2026-08-14 - Opportunity Calculator pre-traffic fix pass (two answers reach the model, and the headline says what it is)

**A full credibility audit of the Opportunity Calculator found the economics defensible and the
anti-double-counting architecture clean, and found one live implementation defect plus three
presentation defects. All four fixed. No model constant, scenario value, tier price, fee, version,
question or qualification behavior changed.**

- **Two wizard answers never reached the model.** `usesLossEngine` is true for this tool, so both
  browser clients route through `toolAdapters.ts`, which read only the DM's `lead_profiles` column
  names (`email_list_size`, `catalog_size`) and **overwrote the wizard's own keys**
  (`owned_contacts`, `unreleased_count`) with zero. From any browser: the owned-audience screen did
  nothing, the vault was never eligible, the **Gold $25 rung never existed**, and the assumptions
  block promised a $25 Gold tier the ladder beside it did not contain, while the Vault line told an
  artist who typed 30 unreleased pieces to come back when they had five. Reproduced on the real
  path before the fix (`ownedContacts` 0 instead of 8,000, `unreleasedCount` 0 instead of 30,
  `$24,115 to $89,078` against the model's `$34,236 to $113,696`, a **30% understatement**). Fixed
  by reading the wizard key first and falling back to the DM column, so one adapter serves both.
  **Why no test caught it:** every existing test called `buildUnifiedResult` directly and passed
  throughout. Five new tests in `unifiedFunnel.test.ts` run the ADAPTER on wizard-shaped values.
- **The headline described the wrong quantity.** `netNewMonthlyCents` is gross minus the CRWN fee,
  minus artist-funded commissions, minus existing direct revenue; the copy called it
  "direct-to-fan revenue". Now: *"on top of what you already earn direct, after CRWN's fee and any
  commissions you pay."* The ratified verb *could build* is unchanged. The existing-revenue
  subtraction is the model being deliberately conservative, and saying nothing about it gave that
  away for free.
- **The "/mo" hero merged recurring and one-time money.** Between 7% and 48% of the figure is
  one-off ticket, tip and seat revenue depending on the answers. The summary now states the
  recurring share beside the number, and an artist with no event money is told that plainly rather
  than read a split of nothing.
- **Material assumptions were carrying money with no rate disclosed:** member extras ($3/member/mo,
  11 to 12% of gross), the live cadence (ONE event a month, never stated), and the session seat
  rate (0.3% of non-members at up to $300, about **40% of gross** at arena scale). All now
  disclosed, conditionally so a layer the artist is not eligible for is never asserted at them, and
  the seat line states that **no capacity limit is modeled**. Sub-1% rates render as "0.3%" rather
  than rounding to "0%". `maxConversion` is described as the guard it is, since it cannot bind at
  the current knobs. Unit prices now appear beside buyer counts.
- **Deferred by decision, not oversight:** every calibration finding. No assumption in this model is
  externally validated ("not yet externally validated", never "benchmark"); `expected` (0.15/0.03)
  is `leadCalculator`'s **conservative** preset relabelled; `high` pairs `punchy`'s reach with
  `aggressive`'s superfan rate; the band is a one-factor sweep, not a confidence interval;
  `liveWilling: 'maybe'` is modeled as `'yes'`. Recorded in `UNIFIED_OPPORTUNITY.md` section 10 and
  awaiting first-cohort evidence. **Do not "improve" any of them without a founder decision.**
- Previously stored `unifiedOpportunity@1` results were computed with the two dropped fields at
  zero, so they understate. Pre-traffic, so no backfill; new runs are correct.
- Touched: `toolAdapters.ts`, `unifiedAdapter.ts`, `recalcUnified.ts`, `unifiedFunnel.test.ts`,
  `07-BUSINESS-RULES.md`, `UNIFIED_OPPORTUNITY.md`, `sw.js` (v401 to v402). 2,241 tests pass,
  `verify:architecture` 814 pass, build clean.

## 2026-08-14 - Homepage pre-traffic correction pass (the page stops losing convinced readers)

**A browser audit of the shipped homepage found two defects that cost money at the exact moment
of intent, plus contained presentation problems. All fixed; strategy and architecture unchanged.**

- **The pricing FAQ was factually wrong.** It concluded "so the software costs nothing until the
  fan economy is paying you", which is true only of Launch: Pro and Scale are real recurring
  Stripe subscriptions (`mode: 'subscription'`) billed whether or not the artist earns. Corrected
  to state the split plainly. A drift test now forbids the phrasing class.
- **"See if I qualify" did not go to qualification.** Measured live: pressed at y=11538, landed at
  y=0, with the `CallRequestCard` at y=7178 and off screen. Both lower CTAs called
  `window.scrollTo(top)`. `PublicToolClient` now exports `PLAN_ANCHOR_ID` / `QUALIFY_ANCHOR_ID`
  and stamps them on the builder and the hand-raiser; the CTA scrolls to the hand-raiser when a
  result exists and returns to the calculator when it does not, because qualification is scored
  server-side from those answers. Verified in a browser: card IN VIEW after the click. No new
  qualification component, route, scheduler, or scoring change.
- **The closing CTA is now useful in both states**, reading "Back to my plan" and returning to the
  builder after completion instead of re-offering a number the visitor already has. Completion is
  ONE bit: `below` accepts a function and receives `{ completed }` from the funnel component.
- **The lower page no longer narrows when the visitor converts.** The `below` slot rode inside the
  funnel's phase-dependent wrapper, rendering the narrative at `max-w-lg` for anyone who finished
  the calculator. Hoisted out; measured identical at 640px in both states.
- **Compression, from four repetitions to one.** The "one next move with the evidence" claim
  appeared in four consecutive sections; it is now made once, in the operating loop, with the
  Evidence section merged into it as a compact trust strip (claim-maturity safeguards kept,
  including the insufficient-evidence line). Capabilities 6 to 4 grouped jobs, FAQ 8 to 5. Lower
  page is roughly 11% shorter on both desktop and mobile.
- **Mobile fragmentation reads again.** The horizontal arrow was `hidden sm:flex`, so the stacked
  cards became two unrelated lists on a phone. A downward arrow now renders below `sm`, and the
  cards are content-aligned rather than stretched, so the shorter CRWN side looks deliberate
  instead of half empty. No claims were invented to pad it.
- Guarantee wording tightened from a defensive aside to a precise term ("It covers the rebuild and
  relaunch, not a specific income result"); the documented terms are unchanged. "Decision layer"
  jargon replaced with customer language.

Untouched on purpose: hero, calculator questions and math, result, builder, save boundary, result
tokens, `surface="homepage"` attribution, `decideCallRequest`, guarantee evaluator, pricing,
Stripe, flags, crons, schema, and every tool route.

## 2026-08-13 - Zero to One homepage rebuild (the marketing page catches up with the positioning)

**The homepage's lower page is now the ratified Zero to One argument instead of a feature
parade.** The funnel is untouched and still the shared `PublicToolClient` mount of the
Opportunity Calculator (hero → one CTA → wizard → result → builder → save boundary, homepage
surface dimension intact). What changed is everything below it: the old double marketing stack
(`CrwnShowcase` + `WorthExperience marketingOnly`, roughly forty feature-led sections between
them) was replaced by `src/app/HomeMarketing.tsx`, nine sections that make one argument:
fragmentation problem → first-revenue path (activation = first paid member) → operating loop in
customer language → evidence principles (claim-maturity compliant, no fabricated proof) → First
Revenue Launch with the canonical First Paid Member Guarantee ("See if I qualify" returns to the
calculator because `decideCallRequest` scores qualification from its answers; no new application
system) → capabilities mapped to economic jobs → pricing from `TIER_PRICING`/`TIER_LIMITS` → ICP
FAQ → one final CTA back into the funnel. `ToolShowcase`/`CrwnShowcase` are now gated to
`surface === 'tool'` (tool routes unchanged); the `marketingOnly` prop and the homepage-only
legacy sections in `WorthExperience` were deleted (the `/worth` calculator surfaces are
byte-identical in behavior); `HomeNav` slimmed to two anchors + Log in + one funnel CTA. The
registry hero kept its ratified H1 and CTA, gained the fragmentation beat in the subheadline and
the "already selling direct" eyebrow. Contract pinned in `pageComposition.test.ts` (no second
calculator, no hardcoded pricing, no banned frames, no em dashes, no fake proof). Routes doc 06
updated; `POSITIONING.md` section 17 note added.

## 2026-08-13 - Pre-PMF surface reduction (the default product is the experiment now)

**The decision: the default CRWN experience is exactly the path that gets 3 qualified artists to a
first paid member, and everything else is preserved but not presented.** Unknown demand was never
treated as rejection: hides are one-commit reversible, disabled crons carry registered re-enable
triggers, and only verified-dead or misleading code was deleted.

**Visible after the cut.** Artist: Studio with five tiles (Music, Albums, Shop, Offer Builder,
Live), a hub indexing Rise Mode + the run-the-business screens, a 3-slot bottom nav. Fan: Home,
artist pages, Library (ReferralDashboard = the full Share-to-Earn loop), notifications, 2-slot
nav. Founder: 8 admin tabs, with the Dashboard replaced by a 12-number experiment scorecard
(/api/admin/scorecard) that reads only canonical stores and renders a failed query as
"not measured", never 0. Public: 6 promoted calculators (worth, vault, share, producer, own,
opportunity) matching the 51 content scripts; the other 14 are lifecycle-paused, which touches
ONLY the /tools directory: routes, slugs, toolIds and dmKeywords are untouched and pinned by
promotion.test.ts, including the assertion that the ManyChat keyword table derives from
dmKeywords and never from lifecycle (wiring it to resolveFunnelByKeyword would silently kill
every paused Reel).

**Deleted, with the reason each beat hiding.** The autonomous Manager cron: its dormancy rested
on ONE accidental gate (an is_active filter on a column that does not exist) and it would have
re-armed auto-executing AI across every artist account the moment that column appeared; six test
files now pin its ABSENCE. weekly-report: dead on the same nonexistent column. The synthetic sync
generator + syncInsights + 126 production rows: model-fabricated listings presented to artists as
real briefs, deleted by SOURCE PATTERN (CRWN Curated via %); the 24 real-source rows and the
founder-authenticated manual ingestion POST remain, and the security suite now rejects any
sync_opportunities writer that references an AI provider. Plus the long-verified dead list:
funnel-events admin route, Calendly components, onboarding placeholder/tagline step, empty
barrels, the importerless useContentAccess + GatedCommunityPost pair, ArtistProfileForm's
onboarding mode; the /artist/[slug] share duplicates became redirect shims so no old link 404s.

**Two audit rows failed pre-delete verification and were left alone.** posts/comments/likes are
NOT superseded by community_posts: the live share page, PostCard and PostCreator read and write
them (5/26/32 rows). access_level is NOT dead: it is the live access model for products and
albums; content classes replaced only the track model. The point of verifying before deleting is
that the audit gets corrected instead of production.

**Ratified invariants that genuinely changed** went through the rule-change workflow, each keeping
its property while its mechanism moved: NAV-002 (a fan can always reach their money -> /library),
NAV-003 (surviving slots keep their tourIds; retired anchors may never be reused, now a
RETIRED_TOUR_IDS registry), REACH-001 (hidden features name their ROUTE as the delivery surface),
REACH-003 (nine deliberately-unscheduled crons registered with re-enable triggers), ID-004 (two
pop-ups retired by TARGETING, keys frozen), and the Manager/ownership suites (never-duplicated
holds at zero; the strong new assertion is that hidden ROUTES still exist).

**Founder SQL now pending:** supabase/flag-off-live-tips.sql (0 tips ever) and
supabase/schema-phase2-drop-manager-outcome-schema.sql (drops the never-written outcome columns,
aborts if any row unexpectedly holds data). Both linked in TODO.md.

## 2026-08-13 - Early access becomes server-enforced (the window was a React decision)

**The invariant: no client-only visibility decision may be the authority for protected audio.**
Early access was the one place CRWN broke it.

**What was wrong.** `fieldsForClass('paid_first')` encodes "members first, public later" as
`is_free = true` + a non-empty `allowed_tier_ids` + a FUTURE `public_release_date`. `is_free`
staying true is deliberate and correct: it is what makes "public later" real with no second write
and no scheduler. But `can_play_track` short-circuited on `IF t.is_free THEN RETURN true` and never
read `public_release_date`. `tracks_public` serves `audio_url_128/320` on exactly that boolean and
is granted to `anon`, so for a members-first track's entire window:

- `GET /api/tracks/[id]/stream` minted a signed URL for a logged-out visitor
- `/embed/[trackId]` passed its own `is_free` guard, because paid-first IS `is_free`
- every browser read of `tracks_public` carried the locator in the payload

Only `GatedTrackPlayer` hid the track, plus `/api/explore`, which already filters in-window rows out
of its listings (a visibility filter, not a gate). Nine live `tier_benefits` rows advertise 7-day
and 14-day early access, so this was a sold promise with no server enforcement behind it.

The header of `schema-phase2-track-waterfall.sql` asserted that `can_play_track` already saw
`public_release_date`. It did not. That comment is corrected in place.

**Nobody was exposed.** Production has **zero** tracks with a `public_release_date` (anon probe
2026-08-13), so the paid-first class has never been used and the hole was never reachable. That is
why the fix lands now, before a pilot artist schedules the first members-first release.

**The fix.** `supabase/schema-phase2-early-access-window-enforcement.sql` changes ONE line of
behaviour in the ONE canonical oracle: the `is_free` short-circuit no longer applies while a track
is inside its window. No second resolver, no new column, no view change, no grant change, no RLS
change. "Inside the window" is defined EXACTLY as `classifyTrack` defines `paid_first`, including
the clause that a future date with an EMPTY tier list stays PUBLIC: treating that as a locked window
would lock out every paying member for the whole window, which is the precise failure the
content-class refactor exists to make unrepresentable.

**One source for the day count.** `LADDER_EARLY_DAYS` (positional: 30/14/7) and
`tier_benefits.config.days_early` (per-tier, artist-editable, and what the fan is actually shown)
could diverge, so a tier could advertise 7 days and open on day 14. The benefit config is now
canonical: `earlyAccessDaysByTier()` reads it, `buildWaterfall` schedules from it, and
`LADDER_EARLY_DAYS` survives only as the fallback for a tier carrying no early-access benefit.
`waterfall.test.ts` asserts displayed promise == scheduled opening for every rung of the recommended
ladder; the assertion was mutation-tested (forcing the config to be ignored fails it with
"vault displays 14d but opens 30d early").

**Verification layers, because a function body is invisible to PostgREST.** The migration
self-verifies its own DEFINITION. `supabase/verify-early-access-window.sql` proves BEHAVIOUR: it
creates a members-first track, a members-only track, a public track and two subscriptions, asks the
oracle as anonymous / non-entitled fan / entitled payer / owner, and ROLLBACKs everything. The daily
`rls-canary` gains `early_access_window_enforced`, vacuous until a real in-window track exists.

**Migration state: APPLIED 2026-08-13**, in the required order (oracle first, then the waterfall,
because the waterfall schedules exactly the content class this oracle gates).

**Proved live, with the anon key, on a throwaway canary track** (inserted on the founder test
artist, probed, deleted) rather than by trusting the migration report. A definition check cannot
prove behaviour, and with zero in-window tracks in production a passive probe would have been
vacuous:

- in-window, anonymous: `can_play = false`, `audio_url_128` AND `audio_url_320` both NULL
- after the window: `can_play = true`, locator returns, so "public later" still works
- in-window with an EMPTY tier list: `can_play = true`, matching `classifyTrack`, so a stray date
  cannot lock out paying members

**No regression:** all 44 anon-visible free tracks still play, all 11 member-only tracks stay
denied and redacted. `tracks.waterfall` is NULL on every existing row, so the daily cron's
`.not(waterfall, is, null)` filter skips them all and nothing in flight changed.

## 2026-08-13 - Fulfillment urgency now requires a recipient (empty-room promises are not broken promises)

**The invariant: an overdue fan obligation is evidence that an artist broke a promise only when at
least one currently eligible member can receive it. The gate is zero versus one, never a sample
threshold.** Found by the Automation Readiness Audit, which is why the audit's own conclusion was
"fix this, then stop building Rise Mode".

**What was wrong, measured live.** All four overdue fan promises on the platform were
`tier_benefit_sync` rows CRWN auto-created from a tier template ("Auto-created from a tier
benefit"), sitting on Gold ($25) and Platinum ($100), which had **zero active subscribers between
them**. One of the two artists holding them (`lagoo`) had never had a subscription of any kind.
FULFILLMENT fires at n = 1 and outranks every growth stage, so Rise Mode was about to displace the
roadmap milestone that leads to a first paying member in order to demand delivery of a vault unlock
to an empty room, and the daily reminder cron would have emailed about the same nobody.

**The fix is to the EVIDENCE, not the engine.** Stage order is untouched, FULFILLMENT still fires at
n = 1, and the founder rule that an overdue promise to a paying supporter outranks a roadmap
milestone is unchanged. Only obligations somebody is actually entitled to receive now reach it.

- **One rule, shared.** `obligationHasNoEligibleRecipient` (`src/lib/calendarProjection.ts`) is the
  existential form of the existing per-fan `fanEligibleForObligation`, written in terms of it so a
  second interpretation of "who is owed this" cannot appear. Both the Constraint Engine's assembler
  and `sendPromiseReminders` import it. Inheritance is preserved for free: `serves_tier_ids` (dedup
  merges and "everything in Gold" upward inheritance) counts, an unrelated rung does not.
- **It fails safe, and the direction is deliberate.** Audience kinds a membership list cannot answer
  (squad, campaign, anything added later) and any failed read keep counting. Suppressing a promise a
  paying fan IS owed is far worse than letting one empty-room promise through.
- **NOT `fulfillment_events.eligible_fan_count`.** That column is declared "denormalized at
  materialize time" and **nothing has ever written it**: every insert site omits it, so it is 0 on
  every production row. Gating on it would have silenced every promise on the platform. Eligibility
  is derived on read from live subscriptions. (The Promise Calendar still renders "N supporters
  eligible" from that dead column, which is a separate pre-existing display bug, left alone here.)
- **Obligations are not deleted.** Nothing archives, cancels or removes an empty-room obligation;
  it stays on the calendar and simply stops being urgency. Ramp-step exclusion is applied BEFORE the
  recipient gate, so a private ramp step never reaches the right answer for the wrong reason.

**Read-only production verification** (service role, GET only, using the real exported function):
13 overdue pending events, 4 of them fan promises, **all 4 suppressed, platform `overdueNow` 4 → 0,
zero real promises suppressed**. The discrimination is on the audience, not the artist: `m3rcey` has
10 active members and is still correctly suppressed, because none of them hold Gold or Platinum.

New `src/lib/promiseRecipientEligibility.test.ts` (18). `npm test` 2189 pass,
`verify:architecture` 812 pass, build clean, lint at the repo baseline.

## 2026-08-13 - Rise Mode, Accelerate pass: the destination is part of the advice

**The principle: once Rise Mode identifies the correct next move, its CTA takes the artist to the
most specific SAFE EXISTING completion surface, preserves the path back, and does not ask them to
rediscover information CRWN already holds.** No automation was added: every accelerated link opens
a form, a list or an editor that the artist still drives.

**The defect this pass found, which was not a speed problem at all:** the roadmap's `Connect Stripe`
step pointed at `/account/payouts`, and **the payouts screen has no Stripe connect control**. The
only one in the product (carrying the Artist Agreement checkbox) lives in `TierManager` on
`/account/tiers`. An artist following CRWN's own instruction on the single requirement that decides
whether a fan can pay at all landed on "$0.00, no earnings yet" with nothing to click. Corrected in
the roadmap step and the launch-partner condition; `/account/payouts` now shows an unconnected
artist a short "You cannot be paid yet" panel linking to that one authoritative control, rather than
a second copy of a legal gate.

Accelerated, all through parameters the destination screens already had or now read:

| Move | Before | After |
|---|---|---|
| `Deliver "<promise>"` | `/studio/promise`, opening the **This week** tab, promise not shown | `/studio/promise?tab=overdue&event=<id>`: the overdue list with that promise ringed and scrolled to |
| `Import your fan contacts` | `/studio/fans`, importer is a button inside the fans table | `/studio/fans?import=1`: the import dialog open |
| `Review what <tier> promises` | `/account/tiers`, artist re-identifies the rung | `/account/tiers?tier=<id>`: that rung's editor open |
| `Connect Stripe` | `/account/payouts`, **no control there** | `/account/tiers`, where the control is |

`ConstraintEvidence.promises.oldestOverdue` gained an `id` (the `fulfillment_events` row) so the
action can name the obligation. **Every one of these params is a pointer, never authority.** The
Promise Calendar matches the id against the artist's own `/api/promise-calendar` payload;
`TierManager` matches against tiers loaded with `.eq('artist_id', <this artist>)`. An id belonging
to someone else is simply absent, so it opens nothing and reveals nothing. `TierManager` now also
forwards a same-site `returnTo` into `/api/stripe/connect`, which re-validates it server-side.

Deliberately NOT accelerated: per-field routing into the profile editor (`ArtistProfileForm` has no
section anchors, so it would mean inventing them), and a `?new=1` tier-create shortcut (the roadmap
already lands on the screen whose primary control is creation). Both would be new architecture, not
wiring.

`npm test` 2171 pass, `verify:architecture` 812 pass, build clean, lint at the repo baseline.

## 2026-08-13 - Rise Mode, Simplify pass: four survivors questioned, three simplified

The deletion pass (below) left four things on the surface. Each was re-asked "does this change what
the artist should do right now, or does it just explain CRWN to them".

- **Launch Partner guarantee: kept, collapsed.** Six of its seven conditions are evaluated by the
  SAME DomainChecks as roadmap steps (stripe, free tier, purchasable tier, welcome post, campaign
  sent, first paid member); the seventh is the contacts import at a higher threshold. So an always-
  open list of seven items, six carrying a "Do it" link, under its own `Next: ...` line, was a
  duplicate priority queue, and "it has no gold button" was never proof it did not compete. What
  stays on first paint is the one thing the roadmap does not own and the offer requires: the
  measured contract status ("3 of 6 required steps done"). Conditions moved behind a `See what it
  covers` disclosure, one tap from the same evidence. The `Next:` line is deleted from the render.
  `src/lib/launchPartner.ts`, the cohort flag, the route and the admin Money Model view are
  untouched, and `nextCondition` is still in the brain.
- **Quest-board footnote: deleted.** It named a system Rise Mode had just been simplified to hide,
  and then told the artist not to open it. It helped nobody finish the current move. `/quests`
  stays indexed in the AccountHub under Grow, which is where the complete index of destinations
  lives; a test now asserts that entry exists precisely because the footnote no longer does.
- **`After this`: kept, and a real duplication bug fixed.** It was already one subordinate line with
  no control. But the constraint and the roadmap can name the SAME work: REACH's action for an
  artist with no free members is "Import your fan contacts", and the roadmap's `audience-contacts`
  step is that same job. The screen could print it as the move and again as what follows it.
  `resolveRiseNextMove` now skips a roadmap step whose `source.check` equals the constraint action's
  `verifiedBy`. That is the engine's own declaration of which check proves its action was taken, so
  it is existing semantics, not string matching or new prioritization.
- **`Foundation · 2 of 7 complete`: audited, unchanged.** Verified in the repository: the numerator
  is `stage.doneCount` and the denominator `stage.total` for the CURRENT stage only, both derived
  through the Quest Engine's own `evaluateCondition`. `RoadmapStepDef` has no optional, conditional
  or plan-gated field at all, so the denominator cannot be mixing "must" with "could": all seven
  Foundation steps genuinely apply to every artist. Pinned by a test that fails if optionality is
  ever introduced without the stage line learning the difference.
- **`NextMoveCard`: one line of repeated copy removed.** The card's `Your next move` eyebrow said
  the same thing as the page header directly above it ("Your next move, and what skipping it
  costs"). The action title, the reason (`action.why` / step `detail`) and the fact (`evidence[0]`)
  were checked for three-way repetition and have none: each says something the other two do not.
- Also fixed: a `setState` called synchronously in an effect body on the Rise Mode page, introduced
  by the deletion pass. The settled state is derived instead.

`npm test` 2160 pass, `verify:architecture` 812 pass, build and lint clean.

## 2026-08-13 - Rise Mode is one next move: the competing surfaces were deleted, not the engines

**The product decision (founder, 2026-08-13): Rise Mode is the single-next-move execution surface.
Supporting systems may inform the decision but may not compete visually for artist attention. An
overdue fulfillment promise owed to paying supporters outranks a normal roadmap milestone.**

The screen had become a collage of CRWN's own architecture. One load could present a launch-blocker
panel, the Constraint Engine's card, the roadmap card (its own next milestone, a percentage, a
progress bar, three stat tiles, an upcoming-promises list), the membership strategy card (revenue
model, a "why this was recommended" line, three suggested action pills) and then the quest board
(artist build, level, XP total, XP bar, Focus mode, an AI recommended quest, a daily move, a weekly
goal, six side quests, a movement map). CRWN had already decided what mattered; the interface then
asked the artist to arbitrate between four subsystems, none of which knew about the others.

**No priority engine was added.** The precedence already existed and was already correct: Stage 1 of
`readConstraint` evaluates FULFILLMENT before reach, capture, first-paid and depth, and fires at
n = 1 because an overdue promise is a breach happening now rather than a pattern inferred from a
sample. `resolveOperatingFlow` already read back which owner holds the primary action. The new
`src/lib/riseNextMove.ts` is pure presentation assembly on top of those two: it flattens the winner
into one title, one reason, one fact, one destination, plus the label of the move after it. It
contains no threshold, no lookback and no comparison between systems, and its test asserts the
override end to end through the real engine rather than a stubbed diagnosis.

What the primary surface renders now: `Rise Mode` + its purpose line, `Foundation · 2 of 7 complete`
(discrete milestones, because a whole-roadmap percentage is precision the model does not have), ONE
dominant move with ONE gold CTA carrying `returnTo`, `After this: <next step>` as a line rather than
a second button, and `View full roadmap` as a disclosure.

Removed from the surface, with where each system now lives:

| Removed | The system underneath |
|---|---|
| Level, XP total, XP bar, `% to next level`, artist build, Focus, side quests, movement map | Quest Engine, **unchanged**. Board moved to `/quests` (AccountHub → Grow). `/profile/artist` mounts `RiseMode variant="driver"`, which renders nothing and exists solely to keep calling `/api/quests`, the route that ASSIGNS and auto-completes quests server-side. Deleting the board without that call would have frozen every artist's quests and XP silently. The driver also deliberately does not advance `rise_last_xp`, so the board still celebrates. |
| `YOUR MEMBERSHIP STRATEGY`, `RECOMMENDED`, the revenue model panel, the monthly-promise explainer, the "why this was recommended" line, three action pills, the tier-education link | Membership strategy engine, **unchanged** (`/api/artist/strategy`, derived on read). `StrategyCard` moved to `/account/tiers`, where the ladder it describes is edited. |
| Members / Paying / Monthly stat tiles and the revenue-goal line | Still computed by `/api/artist/roadmap`; owned for display by `/studio/analytics`. |
| The Upcoming Promises list | Promise Calendar (`/studio/promise`) owns it. A promise reappears on Rise Mode only when it IS the diagnosed constraint. |
| `68%` and the progress bar | `progressPercent` still returned by the API; the surface uses per-stage `doneCount/total`. |
| Repeated blocker copy (headline, body, bullet and nested card all naming the same overdue promise) | The fact is stated once, from `evidence[0]`. The constraint's `title`, which was a summary of that same fact, is no longer rendered. |
| `Early signal` confidence footnote | `confidenceLabel` still exists for other consumers; a known-overdue promise is not a signal. |
| `View as fan` pill | Already in the AccountHub identity header with the same `?preview=visitor` destination. The dashboard tour step that anchored to the pill folded into its account-hub step. |

Deleted files: `ConstraintCard.tsx`, `RoadmapCard.tsx` (both were used only by this page; their
content is absorbed by `NextMoveCard.tsx` + `FullRoadmap.tsx`). No migration, no data change, no
API change: `/api/artist/constraint`, `/api/artist/roadmap`, `/api/artist/strategy` and
`/api/quests` all return exactly what they returned before.

Registry: `quest_engine` now lists two surfaces (the board and the driver) and `membership_strategy`
points at `/account/tiers`. Tests: new `src/lib/riseNextMove.test.ts` (17); `operatingFlow.test.ts`
updated from pinning the three-card composition to pinning that the decision still comes from the
engine. `npm test` 2150 pass, `verify:architecture` 812 pass, build clean.

## 2026-08-13 - Complete feature inventory, with live usage counts, for a delete/keep review

New doc `29-COMPLETE-FEATURE-INVENTORY.md`. Every feature listed once (what it does, why it exists,
the benefit claimed, how it works, what it couples to), grouped A to K, plus the decision brief for
an outside reviewer: four reversibility levels, the constraints a valid recommendation must respect,
the do-not-cut list with the incident behind each entry, and seven duplication clusters.

**Row counts were read live from production the same day** (service role, read-only, PostgREST
`count=exact`) rather than inferred, and they are the point of the document:

- 9 artist accounts, **all on the free Launch plan**, so every Pro-gated feature is reachable by nobody.
- 19 fan subscriptions, 11 active, **7 on a paid tier** at $5 to $10.
- **0 one-time purchases ever**, 0 live tickets, 0 tips, despite 8 products and 8 live sessions.
- 0 rows for: team split deals, fan campaigns, clip bounties, city unlocks, smart links, saved
  segments, imported fan contacts, community channels, DM conversations, mission participants,
  survey responses, fan referrals, prospect nurture enrollments, testimonials collected.
- The busiest surfaces after the artist page (1,690 visits) are the acquisition funnel
  (411 acquisition events, 496 funnel events, 41 calculator results) and Rise Mode (326 quest
  instances). Promise Calendar is the largest artist-side dataset after quests (97 obligations).

No code changed. `02-FEATURE-MAP.md` remains the architecture-and-rules view per feature; doc 29 is
the usage-and-cost view, and where they disagree the counts in 29 were measured.

## 2026-08-13 - Canary preflight: blocked on environment, no Stripe object created

Verified against the Stripe API rather than the variable name. **No code changed, no Stripe object
created, cashout still 503.**

- `balance.livemode: true` on `acct_1BO7MsEG40iT0MPS`: the configured key really is LIVE, not merely
  named that way. No test-mode Stripe variable exists, and `STRIPE_WEBHOOK_SECRET` is not defined in
  `.env.local` at all.
- Supabase project ref is `ecpqtuidtsncjfwtkvwc`, which CLAUDE.md documents as production. No
  staging/local Supabase exists: `supabase/config.toml`, `docker-compose.yml` and `.env.test` are all
  absent.
- The webhook guard is `!event.livemode && (usingLiveKey || usingProductionDb)`. BOTH disjuncts are
  currently true, so satisfying it requires changing the key AND the database, which is exactly the
  isolation a money canary needs. The guard exists because a test-mode checkout once wrote a phantom
  Pro plan into production; it is correct and was not touched.
- Recorded the minimum environment (doc 28 section 27), by variable NAME only. Once it exists,
  everything else is automatable: the test Express account, the canary identities, all ten canary
  steps through the real code paths, and the activation decision.


## 2026-08-13 - Cap-reservation migration verified live; canary blocked on a live-only Stripe key

The founder-applied migration is verified and the registry is flipped to APPLIED. **Collaborator
cashout stays 503**, and the blocker is now environmental rather than architectural.

- **Verified behaviourally, not by object existence.** 28 checks against the INSTALLED production
  primitive, using a canary deal that was deleted afterwards (Team Splits back to 0 rows). The
  headline: two payments racing a 1000c cap got 800 and **200**, aggregate exactly 1000, and the
  clamp held ACROSS RAILS (payment_intent vs invoice). A re-grant on the same money identity
  returned the existing 800 and consumed no new headroom.
- Release returns headroom and a later payment reuses it; a FUNDED reservation refuses release,
  because real money moved. Surplus refuses provisional, refuses a second return on the same
  reservation, refuses more than reserved, and refuses frozen money. Freeze and unfreeze are both
  idempotent, so a dispute cannot clawback or restore twice.
- Security probed with the anon key: cannot read the ledger, cannot forge a row, cannot execute any
  of the six money functions. 401 on all.
- D4 re-verified live: 89% of GROSS still reads as 101.14% of net and is rejected.
- Five post-flip mutations proven applied and caught, including opening the cashout gate.

**The canary cannot run.** CRWN has only a `sk_live` Stripe key; no test-mode key exists. A canary
would therefore move real money through a real artist's Connect account. And the webhook correctly
refuses `livemode: false` events when the live key is configured, so even a test key would need a
non-production Supabase project. Unblocking needs a Stripe test-mode key plus a test Connect
account: a founder environment decision, not an engineering one.

Proven in unit/integration form and NOT against real Stripe cents: first-charge withholding, the
draft-invoice fee, refund transfer reversal, dispute freezing, the D3 transfer landing, and a
collaborator cashout transferring exactly once. The gate reflects that.


## 2026-08-13 - Team Split final controls: cap reservations, D3 returns, disputes

Code complete. ONE migration pending founder application, and the canary after it. Cashout is still
503, now enforced by an invariant rather than by a comment.

- **Atomic cross-rail cap reservations.** The race was invisible in any table: money is withheld at
  charge time but only accrues after settlement, so the cap was being consumed by something with no
  row. `team_split_cap_reservations` gives that interval a row, and the grant locks the DEAL and
  counts accruals AND live reservations, so a track purchase and a subscription invoice contend on
  the same row. Deals lock in sorted id order (no deadlock), and the grant is idempotent on the
  money identity, so a retried invoice reuses its own reservation.
- **Provisional is not funded.** A provisional reservation holds cap headroom and has ZERO
  collaborator value. Release is provisional-only: funded money is never handed back as headroom,
  because real money moved.
- **First-charge precision (the subtle one).** Stripe caps the percentage at two decimals, and
  nearest-rounding is subsidy-safe but CONTRACT-unsafe: it can retain fewer cents than the
  collaborator accepted, and the accrual guard would then clamp them DOWN to the short amount. The
  percentage now rounds UP, always. The overage is artist-owned surplus and returns through D3, and
  an unrepresentable target funds no split rather than underfunding one.
- **D3 implemented.** Reservation release (nothing settled, give back headroom) and surplus return
  (settled money now unowed, real transfer to the artist) are separate paths. The transfer carries a
  deterministic idempotency key and the RPC refuses a reservation that already has a transfer id.
- **Disputes.** Stripe debits the platform on a destination-charge dispute and leaves the artist
  holding their share, while the collaborator reserve is already platform-held. Those are two
  different recoveries: the artist transfer may be reversed, the collaborator reserve is FROZEN in
  the ledger and never "recovered" from Stripe, because that would fabricate a recovery. Won
  disputes unfreeze; the artist transfer is not auto-re-sent, since Stripe warns re-transfers can
  hit cross-border limits.
- **One cashout balance formula**, deducting paid, clawbacks, negative carry and frozen amounts.
- Eleven mutations proven applied and caught, including flipping the cashout gate.


## 2026-08-13 - Correction: the first subscription invoice never had a draft window

The previous entry claimed one `invoice.created` path funded every subscription invoice class. That
was wrong for the FIRST invoice, and the error was mine.

- Stripe: "For subscriptions with collection_method set to charge_automatically, Stripe creates an
  invoice with the status OPEN when you create the subscription", and "For Stripe Checkout
  integrations, you can't update the subscription or its invoice if the session's subscription is
  incomplete." CRWN creates subscriptions through Checkout, so the first invoice is never a draft
  and never editable. The one-hour advancement delay applies to subscription-cycle invoices.
- **Nobody was mispaid.** The handler's draft-only guard meant first charges funded nothing, and the
  accrual guard refuses to accrue without a recorded reserve, so the failure direction held: a
  collaborator was never credited money nobody withheld. The defect was that first-charge
  collaborators would silently never be paid, and that the report said otherwise.
- Fixed with two paths, because Stripe gives two shapes: the first charge is funded at checkout
  through `subscription_data.application_fee_percent` (the only lever at creation), and every later
  invoice keeps the exact `application_fee_amount` while draft. Proof for the first charge lives on
  the session rather than the invoice.
- A subscription with NO Team Split sends exactly the fee it sent before, which the F-01 suite now
  pins by asserting the fallback rather than the old literal.
- The new invariant is mutation-proven: reverting checkout to the bare fee fails TS-MONEY-011.

Lesson: "one handler covers every case" was a claim about Stripe's behaviour, and verifying it
needed Stripe's documentation, not the shape of our own code.

Still open and unchanged: cap concurrency locking (new migration), the D3 artist-return transfer,
dispute reconciliation, and the canary. Cashout stays 503.


## 2026-08-13 - Subscriptions now fund the collaborator reserve

Every payment rail CRWN has is funded. Cashout is still 503; doc 28 section 23.4 lists the three
remaining gaps honestly.

- **`invoice.created` funds the reserve while the invoice is a DRAFT.** Re-verified against Stripe:
  monetary fields are editable only in draft, and Stripe waits one hour after a successful response
  before attempting payment, and will not charge at all without one. So this is a comfortable
  window, not a race, and immutability at finalization is what makes D1 enforceable by Stripe rather
  than by our bookkeeping.
- **One path funds every invoice class.** Keyed on the invoice, not on `billing_reason`, so the
  initial charge, renewals, prorations, coupon'd and retried invoices are all covered and a billing
  reason Stripe adds later cannot silently skip funding.
- Order preserved: platform fee, then referral/clipper, then the collaborator share from what
  remains. The fee is bounded by the invoice total and asserted before the update.
- **Settlement proof on BOTH subscription writers.** The initial charge and renewals are funded by
  the same path, so the proof lives on the invoice; the initial writer fetches it from the session's
  invoice. A proof on only one would strand the other's collaborators.
- Six mutations proven applied and caught. One escaped first and exposed another presence-check of
  mine: `attributedCutPercent: 0` still contains the identifier, so a name check passed while a
  split quietly ate the referrer's commission. That is the third time a presence-check has been the
  weak link, and the assertion is now a literal source check.

Still open, and why the rail stays shut: cap concurrency is safe-direction rather than locked (needs
a new migration), the D3 artist-return transfer is unbuilt, disputes do not reconcile reserves, and
no canary has been run.


## 2026-08-13 - The refund hole is closed, and every one-time rail now funds the collaborator

Continuation of the funded reserve. `schema-phase2-team-split-funded-reserve.sql` is APPLIED and
live-verified. **Cashout is still 503**; doc 28 section 22.3 says exactly why.

- **Migration verified by behaviour.** Probed via the service role because both functions are
  revoked from the Data API roles, so an anon probe could only ever say "denied". 89% of GROSS reads
  as 101.14% of net at the Launch fee and is refused; 88% lands exactly on 100. That conversion
  working in production is the part that mattered.
- **All five one-time rails withhold the reserve** (track, product, booking, live ticket, live tip),
  through one canonical calculation. No rail does its own split math.
- **Settlement records proof of what was actually funded**, read from the settled charge rather than
  recomputed from checkout's intention. Without it nothing could ever accrue, which is why accruals
  were correctly zero until now.
- **The destination-charge refund subsidy is closed.** CRWN creates no refunds in code, so every
  refund is a Dashboard action, and Stripe's default leaves the artist whole while CRWN's balance
  absorbs the whole thing. That was a live loss on ordinary refunds, unrelated to Team Splits. The
  refund webhook now recovers the artist's share, reversing only what is still owed against
  `transfer.amount_reversed`, so an already-reversed refund, a redelivered webhook and a run of
  partial refunds all converge without double-reversing. What cannot be recovered is recorded as a
  shortfall, not rounded away.
- **The Team Split clawback moved from the daily cron to the refund event**, closing a 24-hour
  window in which a collaborator could cash out against money already refunded. One authoritative
  writer; the cron is now repair.
- The application-fee refund policy was NOT a founder question: the refund handler already wrote
  `platform_fee: -refundedFee`, so the ledger has always booked the fee as refunded. Stripe now
  matches the ledger.
- Eight mutations proven applied and caught. Two escaped first and exposed weak assertions: removing
  the settlement proof from ONE of five earnings writers left the identifier in place, and wrapping
  the clawback in `if (false)` did too. Both are now counted and position-checked.


## 2026-08-12 - Team Splits: over-commitment is now refused, and the reserve has a money path

Phase 1 of the funded reserve. **The collaborator cashout rail is still 503** and the migration is
not applied. Detail: doc 28 section 21.

- **D4 is enforced, not warned.** Deal creation used to warn about over-commitment and allow it, so
  two collaborators could each accept more of one product than was left, and the first sale would
  silently decide who was short-changed by row order. Acceptance now refuses anything committing
  more than 100% of the artist's net on an OVERLAPPING scope. Overlap is per-fence, not per-artist:
  60% of Product X and 50% of Product Y coexist; 60% and 50% of Product X do not; `all_earnings`
  overlaps every fenceable source.
- **The check runs in the database**, under `pg_advisory_xact_lock` on the artist, in the same
  transaction that flips the status. An application-side read-then-write cannot close that race.
- **A gross-basis percentage is converted to percent-of-net** before comparison, because 88% of
  gross IS 100% of net at the Launch fee. Converting with no referral is the low end on purpose:
  the validator should only refuse contracts impossible even in the artist's best case.
- **`computeFunding` is finally on a money path.** `reserve.ts` resolves the qualifying deals for a
  sale and adds the collaborator share to the application fee, so it is withheld before Stripe
  settles the artist's proceeds. Wired into track checkout as the reference; four one-time rails
  and the subscription invoice hook remain.
- Conservation is a PRECONDITION of withholding, not a report: an unreconciled breakdown reserves
  zero rather than sending Stripe a number nobody can reconcile.
- Six mutations proven applied and caught. Three found real gaps first: the D4 suite was not in the
  architecture gate at all, the accept-path assertion matched an identifier rather than the call,
  and nothing asserted that the reserve checks conservation.
- **The refund subsidy is still open and now blocks the payout rail.** CRWN issues no refunds in
  code, so a Dashboard refund on a destination charge leaves the artist whole and CRWN absorbing
  it. True today with or without Team Splits, and it is the next task.


## 2026-08-12 - Fan Testimonials verified in production (migration applied)

The founder applied `schema-phase2-fan-testimonials.sql`. Verified rather than assumed, then the
registry and the docs were reconciled to live state. Detail: doc 27 section 29.

- **Both probes flipped**, with deliberately opposite semantics: the public view reads 200, and
  both base tables answer anon 42501. Both lines are required. The view alone proves objects exist
  and says nothing about closure; the tables alone cannot tell "closed" from "never created".
- **Properties, not object existence.** Base tables refuse anon on `select(*)` and on every
  sensitive column named individually. The public view's PRODUCTION column list is exactly
  `id, artist_id, body, context_kind, submitted_at, display_name, verification_label, tenure_label`.
- **Invertibility demonstrated, not asserted.** A canary from a fan on a 1000-cent tier rendered as
  "Verified supporter" + "Supporter for 3+ months" with no tier name and no price anywhere, so the
  pair that would reveal lifetime spend cannot be assembled from the public surface.
- **Authorship freeze proved by read-back.** A service-role rewrite of `body`, `display_identity`
  and `fan_id` returned success and changed nothing. Consent narrowed and could not re-widen, so a
  withdrawal cannot be undone by the artist. The canary was deleted and the table is back to 0.
- **The generator ran live.** Every artist toggled OFF created 0 (D4 at scale). Toggles restored:
  11 active paid subscriptions scanned, **7 asks created**, immediate re-run created 0.
- **The promise trigger correctly created nothing.** All three fulfillment events completed in the
  window carry `metadata.ramp_step_key`, so they are Revenue Ramp steps, not fan promises. The
  boundary holding in production is a better result than a request would have been.
- **The cron route could not be invoked**: production's `CRON_SECRET` is a Vercel Sensitive var and
  does not match `.env.local`, so an authenticated call still 401s locally. The real module was
  driven directly instead, which is the same code path. Unauthenticated calls to all three routes
  return JSON 401 in production, so they are real routes, not the HTML auth wall.
- New behavioural tests exercise the pop-up arbiter rather than only reading the catalog: the
  testimonial ask wins when nothing competes, LOSES to `fan_first_support`, and is suppressed by
  the one-per-user-per-day governor.
- **Feature LIVE. 7 fans asked. 0 testimonials collected.** Those are separate facts and the docs
  keep them separate; whether fans answer is the riskiest assumption in the design and only fans
  can settle it.


## 2026-08-12 - Automated Fan Testimonials V1 (code shipped, schema pending)

CRWN now collects permissioned proof from an artist's own verified fans, automatically, after
those fans have EXPERIENCED value. The customer is the artist; the author is the fan.
Spec + what was actually built: `docs/crwn-brain/27-AUTOMATED-FAN-TESTIMONIALS-ARCHITECTURE.md`
(section 28). `supabase/schema-phase2-fan-testimonials.sql` is **not applied**, so every surface
degrades to empty. There is deliberately no feature flag: the migration is the gate, because a
flag can be ON while the tables are absent and that is a broken screen.

- **The earlier reading was backwards for a findable reason.** The only "testimonial" in this
  repo is `frl_engagements.testimonial_consent`, an ARTIST granting CRWN sales-collateral rights.
  Anyone searching found that and only that.
- **The loyalty survey was already 70% of this.** It asks 90-day fans why they stay, over email,
  on a tokenized link, and stores their exact words. What it lacks is what makes a testimonial a
  testimonial: display consent, display identity, a verification label, a library, publication.
  Its DELIVERY and DEDUPE patterns were reused; its TABLE was not. Private research and
  publishable content in one table means a single mis-scoped query publishes research
  (TESTIMONIAL-008).
- **`POST /api/surveys` trusts `respondentId` from the token and never checks the session**, so a
  forwarded link submits as someone else. Fine for private research, fatal for words published
  under a "Verified supporter" badge. Testimonials authorize on the session only (TESTIMONIAL-003).
- **Triggers read canonical tables, never `fan_events`.** That log permits `subscribe`, `purchase`
  and `live_join` in its CHECK, and `recordFanEvent` has five callers, none of them the Stripe
  webhook. A trigger built on it would have silently produced nothing forever.
- **The pair rule.** Tier and tenure are each safe alone; together, beside a public price list,
  they are lifetime spend to the dollar, which is the defect `leaderboardPrivacy.ts` exists to
  prevent. The public payload carries bucketed tenure and NO tier. Two corrections the new gate
  forced before anything ran: the view read `tier.price` inside its projection (now collapsed to a
  boolean inside a LATERAL join, so a price cannot enter the SELECT list at all), and the
  TypeScript kept a tenure label after cancellation while the SQL dropped it (the SQL was right;
  the label is present tense and dies with the badge).
- **Automatic collection is never automatic publication.** Nothing reaches the public page until
  the artist explicitly features it, and featuring a response the fan kept private is refused
  rather than silently ignored.
- **The artist manages visibility, never authorship.** No route accepts a body, and a database
  trigger reverts one that tries. Consent narrows only: `crwn_only` to `private_to_artist` is a
  fan withdrawing permission; widening back requires asking again.
- **Delivery is the Pop-up Engine at priority 10, the catalog floor**, plus a persistent card on
  `/command` so a dismissed pop-up does not destroy the request. Asking a fan for a favour never
  outranks their money, their access or an obligation. No email in V1, which also leaves the
  `fan_solicitation` governor gap documented rather than quietly worked around.
- Nine invariants (TESTIMONIAL-001..009), two suites in `verify:architecture`, eleven mutations
  proven applied and caught. One of those mutations found a defect in the new test suite itself:
  a tenancy check counted matches over a slice running to end-of-file, so a neighbouring function
  kept it green while the visibility UPDATE had lost its artist scope.


## 2026-08-12 - The Claude Code subagents were outside every gate

Twelve `.claude/agents/**.md` development agents had never been reviewed against the repository.
All twelve read end to end; eight corrected. New gate
`src/lib/architecture/agentContracts.test.ts` (14 tests) inside `verify:architecture` and inside
`REQUIRED_SECURITY_SUITES`.

- **Orion's job description contradicted a ratified invariant.** It still instructed an agent to
  build "the cross-artist context that gets injected into each artist's prompt", carrying another
  artist's MRR in dollars. `crossArtistEvidence.ts` exists precisely to make that impossible and
  its header names those defects. Orion also sent the agent to two deleted modules and told it to
  update one. Rewritten: same job, founder-facing evidence, privacy/evidence/reliability gates
  kept separate, no money aggregated, never artist-facing. Reese carried the same dead pointers
  and causal phrasing.
- **Nadia taught a ladder that never shipped** ("Free / $15 / $30") and cited CLAUDE.md as the
  source. CLAUDE.md never said it. The ladder is Bronze/Silver/Gold/Platinum in `tierTemplate.ts`.
- **Kai read status codes as proof.** With deployment protection on, this origin answers 200 HTML
  for every path including nonexistent ones, so a 200 could certify an endpoint that is not there.
  It now checks the body, and uses `sw.js` `CACHE_NAME` as the real deployment check.
- Devon now runs npm through WSL (the Marcus lesson). Luna pointed at the pre-wizard onboarding
  page rather than `/setup`. Miles quoted recruiter rates inline instead of reading them from
  code. Sage handed out a legacy `?tab=` URL.
- The gate tests falsifiable operational claims only: file exists, npm script exists, cited `src/`
  path exists, build invoked through WSL, no retired fact repeated. It deliberately does not
  assert prose. It also deliberately does NOT ban naming the deleted modules, because Orion and
  Reese must be able to warn about them and a rule forbidding the name forbids the warning; being
  SENT there is the harm, and the path-existence check covers that.

## 2026-08-12 - Agent reconciliation: what a compromised model can actually do

Reconciled every AI surface against the ratified product, drift and security contracts. No new
AI capability, no provider change, no autonomy enabled.

- **The security gate was protected by convention, not by a test.** `vitest.architecture.config.ts`
  claimed `architecture.test.ts` asserted manifest parity "so removing a line fails the suite". That
  was false for the two files it mattered most for: no invariant names `security.test.ts` or
  `headers.test.ts` in `enforcedBy`, so the parity check never covered them. Mutation-verified by
  deleting the `security.test.ts` line, at which point the parity assertion still PASSED. Added
  `REQUIRED_SECURITY_SUITES`, which fails.
- **CRWN uses THREE model providers, not two.** The Anthropic acquisition lead decision
  (`claudeDecisionService.ts`, reached from the ManyChat inbound webhook) was live and
  undocumented. Investigated for defect and found none: the tool call is forced so prose is not a
  legal output, output is validated against server-side allowlists, history is bounded to 6 turns,
  the context carries no secrets or cross-artist data, provider errors are categorized without
  logging raw text (which can echo the lead's DM), and `decide()` cannot throw.
- **A retired payout schedule was still being taught in three places.** Stripe Express pays
  automatically on a rolling schedule and the `weekly-payout` cron was retired 2026-08-11 having
  never created a payout, yet the getting-started guide, the artist `PayoutDashboard` and the admin
  Sage prompt all promised money "every Monday". The guide feeds the support prompt, so support
  repeated it. An artist waiting for a Monday that never arrives reads as CRWN not paying them.
- **New suite `src/lib/ai/agentSecurityBoundaries.test.ts`** asserts the non-model control behind
  each AI security claim rather than prompt wording, and runs adversarial payloads against the real
  validators as pure functions. Mutation testing found a gap in it before it shipped: the support
  ownership assertion used `toMatch`, and `loadConversation` has TWO branches carrying
  `.eq('user_id')`, so deleting the filter from the caller-supplied `conversationId` branch (the
  only one an attacker controls) still passed. Now counted and re-mutated.
- **Support and admin-support prompts hardened** with an untrusted-data contract, no authority from
  role claims, and an explicit ban on claiming a refund/payout/plan change was performed. The
  prompts are defense in depth; the boundary is that the support model has no tools and every
  conversation read is scoped by the session user id.
- **Exception liveness generalized.** Path-shaped exception subjects must still exist, and an
  AUTH-001 exception whose route now calls `requireAdmin` fails as stale.
- **`15-AI-AGENT-INSTRUCTIONS.md` rewritten**, not appended to. Removed the founding-artist 5%
  override (retired 2026-07-15), Quest Engine as the dark-feature example (flag probes ON), and the
  hardcoded "820 tests across 50 files".

## 2026-08-12 - Security migrations verified in production, and the open redirect closed

The founder applied the four security migrations. They were verified by REPLAYING each
audit exploit rather than by trusting the SQL editor, which is the only thing that
distinguishes "the migration ran" from "the hole is closed".

- **SEC-002/011 closed.** `check_rate_limit`, `redeem_invite` and `user_passes_artist_gate`
  now answer `42501` to anon where they previously answered `25006`. That difference is the
  whole finding: `25006` ("cannot execute DELETE in a read-only transaction") means the
  privilege check PASSED and the function was still reachable, and PostgREST only produced it
  because a GET runs in a read-only transaction. A negative window is now rejected with
  `22023`, and the limiter still returns `true`, so no rate-limit state was damaged.
- **SEC-003 closed.** An authenticated throwaway user could not self-approve, rewrite
  `profiles.email`, or promote its own role: every attempt returned 204 and changed nothing,
  which is the freeze trigger's silent revert working as designed. Legitimate writes still land.
- **SEC-004/007/012 closed.** Anonymous notification INSERT is `42501` where it was `23503`
  (RLS letting the write through with only a fake uuid stopping it), `tier_benefits` refuses
  anon writes while keeping its public read for the storefront, and all 15 money and CRM tables
  answer `42501`.
- **The SEC-002 migration failed on first run with `42P13`**, because production declared
  parameter defaults the repo had never described (`schema-phase2-rate-limit.sql` only creates
  the function IF NOT EXISTS, so the live copy predates it). It was rebuilt signature-agnostically
  via `pg_get_function_arguments()` rather than `DROP FUNCTION`, which would have left a window
  with no rate limiter, and the limiter fails closed, so every rate-limited route would have
  429'd real users. The rebuild is also now non-fatal: it aborted before reaching the revokes,
  which is the one failure direction that leaves the vulnerability fully open while looking like
  a tidy migration failure.
- **`verify:migrations` now covers security migrations under the OPPOSITE contract**: a security
  migration is proved applied by access becoming DENIED, so `42501` is the pass and anything else
  fails the run.
- **SEC-016 closed.** thecrwn.app was an open redirect: three email click-tracking routes
  redirected to a raw `?url=`. `src/lib/safeRedirect.ts` now decides, comparing PARSED origins
  rather than string-matching hostnames. An origin allowlist was deliberately rejected because
  artists legitimately link out of CRWN, so the fix removes the hostile scheme and the silent hop,
  not the destination. `live/thumbnail` also stopped serving private recordings' cover art.
- **Team Split funding arithmetic is proven but NOT wired**, and the cashout rail stays disabled.
  Three questions that change artist take-home are the founder's to answer, recorded in
  `FUNDING_OPEN_QUESTIONS`.

## 2026-08-12 - Cybersecurity remediation: admin authority, the money ledger, and the private bucket

Executed the findings of `docs/CYBERSECURITY_AUDIT_2026-08-12.md`. Shipped as `0ae065cf`,
`7ec8d679` and `70e133ea`. Per-finding status lives in that document's disposition table.

- **SEC-001 (critical), fixed and verified in production.** `/api/admin/approvals` authenticated
  by reading the role of whatever user id the REQUEST carried, and called `auth.getUser()` nowhere.
  Any unauthenticated caller who knew an admin UUID (returned to the public anon key by
  `profiles?select=id,role&role=eq.admin`) could dump every profile and invite code, self-approve,
  mint codes, and disable the artist gate. Now session-derived through `requireAdmin()`. Live probe
  went from HTTP 200 with the full dump to 403.
- **The drift system had certified that route as safe**, which is the more serious half. Its test
  regex-matched the string `role === 'admin'`, which the vulnerable code contained. AUTH-001 now
  asserts the authority SOURCE and is mutation-proven: reintroducing SEC-001 verbatim fails three
  assertions, and a disguised variant with the parameter renamed still fails.
- **Team Split identity is now ratified: email INVITES, an authenticated identity AUTHORIZES.**
  Deals no longer pre-bind a collaborator by looking up the self-writable `profiles.email`;
  `collaborator_user_id` (the column the accrual cron and cashout RPC pay on) is set only at
  accept-invite, and only when the accepting account's VERIFIED auth email matches the invitation.
- **Team Split cashout is disabled (503) pending a founder funding decision.** The transfer had no
  `source_transaction` and no split term in `application_fee_percent`, so a 50% split on a $100
  Launch sale would have paid $44 from CRWN's own balance against $12 collected. Production holds
  0 deals, 0 accruals and 0 payouts, so nothing was lost and nobody is owed.
- **Ledger truth:** booking checkout no longer writes a client-supplied artist into `earnings`, and
  subscriptions book the amount actually charged rather than the sticker price (renewals had the
  same bug), so a 100% off code can no longer mint phantom net that funds real payouts.
- **New SEC-\* invariants** cover client-bundle secrets, unsigned webhooks, revoke-PUBLIC-only
  grants, tables created without RLS, private-media signing, and service-role routes with no
  established caller. "Public" is now a DECLARED authority class, not one inferred from a missing
  check. All mutation-tested.
- **Four security migrations are written but NOT YET APPLIED** (P0 in TODO.md). Until they run,
  SEC-002/003/004/007/011/012 are only half-closed in production.

## 2026-08-12 - Verified feature-state reconciliation: the last four unknowns closed

The founder ran `supabase/check-unverified-feature-state.sql`. All four disputed migrations came
back **applied**, and a read-only flag probe then showed all three disputed flags **ON**. Every
`unverified` state in the drift registry is now resolved, and the Brain's dark claims were wrong
in the same direction every time: they were written from CODE DEFAULTS, not from production.

- **Migrations, now `applied`** in `EXPECTED_MIGRATION_STATE`: royalty-readiness,
  producer-sessions, sub-avatar, earnings-live-tip-type. Probe lines added for the first three;
  the fourth carries the new `liveCheck: 'sql-check'` because it only widens a CHECK constraint,
  which PostgREST cannot see (an anon probe there would return 200 either way and certify
  nothing).
- **New live layer: `npm run verify:flags`** (`scripts/probe-flags.mjs`, read-only, service-role
  because `admin_settings` is admin-gated). Production 2026-08-12: `quest_engine`, `popup_engine`,
  `acquisition_engine`, `experiments`, `live_tips`, `royalty_readiness`, `producer_sessions` all
  ON; `artist_gate` OFF.
- **Royalty Readiness: LIVE** (was documented dark "because the migration is unrun" — it was
  applied and the flag was on). The unconditional AccountHub entry is correct, not a leak.
- **Executive Producer Sessions: Phase 1 LIVE.** The documented launch blocker ("pending attorney
  review, `consent.ts` stamped `2026-07-24.draft1`") **did not exist in code**: the agreement has
  been final at `2026-07-24.v1` and 13-CURRENT-STATE contradicted itself twelve lines apart.
  Surfaces are grafted onto Live, not a separate page.
- **Live tips: LIVE, with all four facts now separately true** (schema accepts
  `earnings.type = live_tip`; the webhook records the earning and the funnel conversion; flag ON;
  the fan tip bar is mounted and server-gated). Worth knowing: `recordFirstPaidConversion` fires
  OUTSIDE the earnings-insert guard, so before the CHECK migration a tip could record a first-paid
  conversion with no GMV behind it. The migration closes that; the code shape is unchanged.
- **Sub-avatar: applied, and deliberately NOT artist-facing.** Internal acquisition/evidence data,
  surfaced admin-only (`sub_avatar_audit` is admin-read/service-write, the override column has no
  client grant, and a test pins that the artist is never asked to self-select). Added to `FEATURES`
  with that boundary written down so a future reader cannot mistake "table exists" for "ship it".
- **Docs corrected:** 02-FEATURE-MAP (3 rows), 13-CURRENT-STATE (producer heading, flag/migration
  line, the self-contradicting agreement block, sub-avatar, live-tip), 21-MONEY-MODEL,
  23-ZERO-TO-ONE ("blocked on legal" for producer), CRWN-BRAIN-COMBINED's dark list, 26 (the two
  live layers + the migration-vs-feature distinction).
- **TODO:** removed the four-way verification item and the two now-applied migration items; the
  announcement-flag note now cites the verified flag values.
- **Drift tests:** DOCS-002 gained a `liveCheck` branch, a by-name pin that the four stay
  `applied`, and a new assertion that no doc calls an applied migration's feature dark BECAUSE of
  that migration. No schema, no production mutations, no flags flipped.

## 2026-08-12 - Permanent product drift prevention system: LIVE

The whiteboard item after the consistency remediation. Not another audit: the system that makes
the next one mostly unnecessary. Canonical doc: `26-PRODUCT-DRIFT-PREVENTION.md`.

- **One registry.** `src/lib/architecture/invariants.ts`: ~50 invariants (P0 money/security,
  P1 ownership/measurement/identifiers, P2 navigation/comms/reachability, P3 terminology/docs),
  each with canonical owner, source of truth, enforcing tests and docs. Plus the shared data:
  frozen funnel stages / pop-up keys / tour ids / compatibility routes, `ATTRIBUTION_DIMENSIONS`,
  the `FEATURES` reachability registry, and `EXPECTED_MIGRATION_STATE` (the static migration
  contract; `npm run verify:migrations` stays the live layer).
- **One exception file.** `src/lib/architecture/exceptions.ts` — every intentional deviation
  with its reason; suites detect stale exceptions in both directions.
- **One command.** `npm run verify:architecture` (~2.5s, deterministic, no credentials) runs the
  ten new registry-driven suites in `src/lib/architecture/` PLUS the ~26 existing boundary
  suites, via the manifest in `vitest.architecture.config.ts`; registry↔manifest parity is
  itself asserted.
- **New protections that did not exist before:** tree-wide Z3 single-issuer walk; earnings-writer
  containment (`from('earnings').insert` allowlist); architecture-level Post-Win economic
  firewall; funnel_events single-writer; admin "activated"-must-source-first_paid_conversion
  walk; full Studio→AccountHub parity (the F-10 class); fan-hub canonical destinations;
  registry-driven retired-vocabulary scan (.ts AND .tsx — F-14's escape path); frozen
  compatibility identifiers; feature reachability + ANNOUNCEABLE_FLAGS parity (the "gate reads
  false forever" trap); cron schedule discipline (everything scheduled, nothing more than
  daily); admin-route gating walk with verified-authority exceptions; the DOCS-002
  migration-state contract in `brainContract.test.ts`; tour boundary-copy pins.
- **Real drift caught during the build:** five source-defined notification types were shipping
  unclassified (`bounty_submission`, `campaign_reached`, `bounty_won`, `badge_awarded`,
  `fan_milestone` — now classified in the taxonomy); three doc lines still called applied
  migrations pending (doc 22 frl-engagements, doc 18 experiments + support-chat); doc 00 called
  Post-Win "not shipped" and the Quest Engine "dark"; doc 02 called Fan Drives dark and the
  chokepoint gap open; TODO still asked Josh to run three migrations the probe shows applied.
  All corrected.
- **Mutation-verified.** Eleven deliberate violations (second Z3 issuer, cron payout, Post-Win →
  recruiter rail, notification bypass, unclassified type, activation off-canon, net helper
  unwired, new raw earnings writer, retired label, hub-parity break, dropped attribution
  dimension): every one failed the suite; all reverted; suite green after restore.
- **Process layer.** `.claude/hooks/doc-sync-reminder.sh` now maps changed code areas to the
  specific canonical docs that own their rules and reminds about `verify:architecture`.
- **Founder item created:** `supabase/check-unverified-feature-state.sql` (read-only) resolves
  the four states where TODO and the Brain contradict each other (producer_sessions, live_tips,
  royalty-readiness / sub-avatar / live-tip-earnings migrations); the registry marks them
  `unverified` until then rather than trusting either claim.
- No schema. No production mutations. No new runtime subsystem (deliberately: no drift service,
  no rules database, no dashboard, no LLM judge).

## 2026-08-12 - Product consistency remediation: the audit's findings executed

Executed `docs/PRODUCT_CONSISTENCY_AUDIT_2026-08-12.md` in dependency order (the audit doc now
carries the full per-finding remediation status). The headline changes:

- **F-01 (money).** `earnings.net_amount` on an INITIAL referred/clipper subscription now
  subtracts the attributed commission, exactly like renewals: ONE shared formula
  (`src/lib/earningsNet.ts`, `subscriptionEarningNet`), fed by a new `attributed_cut` echo in
  checkout metadata. `platform_fee` stays the base cut. Historical impact probed read-only:
  **zero** positive `referral_earnings` rows and **zero** `team_split_earnings` rows exist in
  production, so no backfill was needed and no collaborator money moved.
- **F-04 (milestone truth).** `src/lib/milestoneReconcile.ts` derives activation milestones from
  canonical rows (tracks, albums, paid tiers, setup funnel event, subscription earnings) with
  historical evidence timestamps, runs inside the daily activation-nudges cron before rule
  evaluation, and never touches `stripe_connected`. Decision D holds: `shouldEnrollForRule`
  refuses stalls older than 30 days, so backfilled truth cannot fire archaeology emails.
- **F-02/F-03 (admin truth).** Admin funnel now carries BOTH series: `setup_progress` (the
  preserved 3-of-5 computation, honestly named) and `activated` (canonical
  `first_paid_conversion` across all six rails). `first_subscriber` is labelled
  "First Member (memberships)", never first money.
- **F-05 (pop-ups).** Production probe: `popup_engine` is **ON** with 16 events; the channel was
  never dark. All 19 registered pop-ups audited safe (announcedAt + flag gates hold). Post-Win
  is reachable and correctly silent until a first paid conversion exists.
- **F-06 (comms).** Twelve unclassified notification types classified; 15 artist-facing direct
  inserts (webhooks, milestones, VIP task) now route through `createNotification`; the buyer's
  ticket confirmation got its own fan type `live_ticket_confirmed`. Source-walking test pins the
  boundary with a documented allowlist (`src/lib/comms/chokepoint.test.ts`).
- **F-07 (one interruption owner).** `selectSingleInterruption` retired; the Pop-up Engine is the
  formal owner of interruption arbitration and the precedence invariants are asserted against
  its registry.
- **Navigation/copy.** Fan nav slot renamed Missions (`/command`), Earnings (`/earn`) + the fan's
  own calendar/missions/squads/bounties/impact indexed in the hamburger; Royalty Readiness added
  to the artist hub (hub-aware exit); "Action Plan" label purged from `/missions` and pinned
  repo-wide; tours shipped for Manager, Promise Calendar, Team Splits, Fan Drives.
- **F-15/F-16.** Eleven admin routes consolidated onto `requireAdmin`; the milestone route moved
  to `/api/artist/milestone` with the old admin path kept as a compatibility wrapper.
- **F-11.** CLAUDE.md + doc 22 corrected (fan-campaigns migration IS applied; quest/popup engines
  are LIVE), and CLAUDE.md itself joined `brainContract.test.ts`'s canonical doc list, which is
  the gap the drift escaped through.

Suite grew 1604 → 1671 tests, all passing. No migrations. No production mutations (the one flag
Decision A contemplated was already on).

## 2026-08-12 - Post-Win Referral V1 live: unpaid, additive, and nowhere near the money rail

Both blocking founder decisions were ratified, so the thin V1 shipped. Doc
[`25-POST-WIN-REFERRAL.md`](25-POST-WIN-REFERRAL.md) updated from NOT SHIPPED to LIVE.

**Founder policy, now pinned by test:** organic Post-Win referrals are **unpaid forever** and
**never retroactively commissionable**; a future paid Artist Affiliate program is a **separate**
program with its own enrollment, economics and effective date; and Post-Win activity alone may
never create `artist_referrals` or `recruiter_payouts`, assign the $50 flat fee, or promote anyone
to recruiter/partner.

**The loop:** canonical `first_paid_conversion` (deduped per artist across all six paid rails, so
five webhook entry points cannot produce five asks) → a `celebration` pop-up at priority 30, below
Stripe (100), first broadcast (80) and resume (40) → CTA **copies** a link → the referred artist
lands on the Opportunity Calculator, never signup → `artist_referrer` rides the existing attribution
carrier to first paid.

**Attribution is a ninth dimension, `artistReferrer`, carried as `?artist_ref=<slug>`.**
Deliberately NOT `ref`, which means "partner/recruiter code" and flows into `partner_code_used` /
`recruited_by` / `artist_referrals` — rows carrying `flat_fee_amount: 5000` written from a Stripe
webhook. Identity is the artist's **public slug**: already public, unique, stable and
server-resolvable, so V1 needed **no token table and no schema**. It fills only the funnel's
existing JSONB `metadata` bag, so an artist who clicks a referral link and later converts through a
tagged video keeps **both** facts.

**Two real bugs were caught by the tests while wiring it**, both the same shape:
`sanitizeStoredAttribution` and `buildCampaignUrl` each re-parse through
`parseCampaignAttribution` via an explicit key map, and both omitted the new field. Left alone, the
dimension would have been captured and silently dropped at every read, and the shareable link would
have serialized nothing while looking correct. **Anything added to `CampaignAttribution` must also
be added to those two maps under its query-param name.** Documented in section 6.

**One small generic addition:** `PopupCta.copyText`. Any pop-up whose action is "take this with
you" can now use it, and it falls back to navigation when the clipboard is unavailable. The
alternative was a whole referral page for a single button.

**Prior finding corrected:** the durable carrier was reported unproven (0 of 41 rows). It is wired
correctly and complete; production rows are empty because no visit has ever arrived tagged, which
is a content-tagging gap, not a code gap. A Post-Win link is tagged by construction.

Untouched: Virality Engine, Z3/Z9/Z10, autonomous Manager (still dormant), the Communications
Governor (no G3, no cross-channel cap), and every existing money rail.

## 2026-08-11 - Post-Win Referral: architecture only, implementation blocked

**No code was written.** `src/` and `public/` are clean. New canonical doc
[`25-POST-WIN-REFERRAL.md`](25-POST-WIN-REFERRAL.md), marked NOT SHIPPED.

**The win is solid.** `first_paid_conversion` is genuinely canonical: one definition covering all
six paid rails (subscription, product, track, booking, live ticket, live tip), deduped per artist
so only the first ever lands, already carrying attribution, emitted from five call sites in
`webhookHandlers.ts`. Prerequisites like connecting Stripe were rejected as triggers: those are
CRWN chores, and a referral ask after a chore trades on trust that has not been earned.

**The blocker is attribution, and it is not a small gap.** CRWN has five referral systems and none
of them is artist → artist. The obvious slot, the allowlisted `ref` dimension, already means
"partner/referrer code" and flows into `partner_code_used` / `recruited_by` / `artist_referrals` —
a table whose rows carry `flat_fee_amount: 5000`, written from a Stripe webhook. Putting an artist
referral code there would sit one branch away from a $50 commission obligation. There is no
`artist_referrer` dimension, so artist identity has nowhere canonical to live, and its precedence
against `ref`, a paid campaign or an organic video is undefined.

**And the carrier is unproven:** `_attribution` on `lead_magnet_results.input_data` is the
documented durable home, and production holds a value on **0 of 41 rows**. Survival across signup
and auto-claim is asserted in docs, never demonstrated in data.

**Two founder decisions gate it**, and inventing either was explicitly out of bounds: whether an
artist is ever paid for referring (retrofitting economics onto already-distributed codes is the
irreversible move), and whether artist referrals ever enter the recruiter rail.

**Nothing is lost by waiting.** Only **2 of 9** artists have a paying member and
`first_paid_conversion` has fired **0** times, so the trigger population is two and the win has
never been recorded. Building hard-to-reverse attribution semantics for that population, before the
event has occurred once, is the wrong order.

Recommended V1 once unblocked: one win, one `celebration` pop-up reusing the existing governor and
its caps, one copy-link, one additive reporting-only `artist_referrer` dimension that never
overwrites an existing acquisition owner, and referred artists measured to first paid rather than
to shares. No cash, no badge, no leaderboard, no dashboard, no navigation, no Virality Engine
merge, no Z3, no Manager.

## 2026-08-11 - One owner per promise: the duplicate reminder is gone

**The duplicate was never fixed, only narrowed.** The earlier Part A work corrected which
`fulfillment_events` qualify (both readers stopped treating Revenue Ramp steps as fan promises). It
did not touch the fact that TWO senders email about the same event: `promiseReminders` at 06:00 via
`scheduled-releases`, `calendarReminders` at 09:00 via `sequences`, deduping against ledgers that
cannot see each other (`metadata.reminded_offsets` vs the `calendar_reminders` claim table). So one
obligation produced two emails three hours apart plus an in-app notification, and after the
eligibility fix the thing still being doubled was the REAL fan obligations. Production had already
claimed **16 `fulfillment_event` reminders across both channels**.

**Resolution: one owner per subject type.** `calendarReminders` no longer reads
`fulfillment_events` at all. `promiseReminders` won because it is the specialist: it honours each
obligation's configurable `reminder_offsets` (default `[7,3,1]`), so an artist gets a reminder at
every lead time they set, which the other sender structurally cannot do (it fires once, when an
item first enters the window). **`calendarReminders` is now fan-only** and keeps its distinct job:
livestream reminders and campaign / mission / bounty / proof-of-demand deadlines. Stated tradeoff:
promises no longer produce an in-app notification from that path; they remain visible in the
Promise Calendar, Manager's fulfillment insights and the FULFILLMENT diagnosis.

**A hole in the Communications Governor was found and closed.** `calendarReminders` inserted into
`notifications` DIRECTLY, bypassing the `createNotification` chokepoint G2 was built around, which
is why its type had never appeared in the taxonomy. It now routes through the chokepoint and
`calendar_reminder` is classified (fan-facing, ungoverned). **It is not the only bypass:** 25 other
direct-insert sites remain, 15 of them in `webhookHandlers.ts`. Logged, not swept, because most sit
on money paths and none belong to this task.

**Honest negative finding: lifecycle email is NOT the blind drip it was thought to be.**
`activation-nudges` gates every rule on a milestone being PRESENT and another being ABSENT
(`onboarding_completed` → `first_track_uploaded` → `tiers_created` → `stripe_connected` →
`first_subscriber`), so a Stripe-connected artist is disqualified from the connect-Stripe nudge by
possessing the milestone. `onboarding-reminder` is send-once and gated on incomplete onboarding.
Checked against all 9 production artists across 7 milestone combinations: **no reachable
stale-stage email was found.** No personalization work was invented to fill the gap.

No schema, no new email ledger, no G3, no cross-channel cap. No frontend asset changed, so no
service-worker bump. Two prior assertions of mine were deliberately superseded with the reasoning
left inline.

## 2026-08-11 - Rise Mode Resume: the plumbing was right, the claim was not

The resume prompt shipped during One Operating Flow. Re-verified end to end, and the architecture
held up: it is a pop-up over canonical quest state, with no resume table, no second progress store
and no second ranking. `resumable` picks the highest-progress open instance strictly between 0 and
100, which is the SAME rule as `recommendNextQuest`'s "finish what is underway" branch, so the
prompt and Rise Mode cannot disagree. Priority 40 sits below Stripe (100) and first broadcast (80),
`everyN` 4 days max 3 with the engine's one-per-day cap on top, `/profile/artist` excluded from its
own pages, dismissal handled by the engine without marking work abandoned, completion ending
eligibility with no `resume_completed` record, and cross-device working for free because nothing is
client-side. All verified, none assumed.

**What was wrong was the sentence.** It opened with *"You left something half done"* and *"Work you
already started is sitting there unfinished"*. Quest progress does not prove engagement:
`syncQuest` sets `in_progress` automatically whenever an evaluated condition rises above 0, and
those conditions are DomainChecks over live database state. Progress climbs because the ACCOUNT
changed, not because anyone opened a quest, and there is no `started_at`, no accept step and no
quest event log anywhere.

Production made it vivid: **all 16 eligible instances were `domain`-kind**, and they included
*"Reach $1,000 per month in recurring support"* at **4%** and *"Reach 25 supporters"* at 40%. Those
are outcome targets that advance as the business grows. Telling an artist they left them half done
is false, and "pick it back up" is meaningless for a goal with no position to return to. The
pop-up had also never actually fired: zero `artist_resume_rise` rows in `popup_events`.

Copy now claims only what the row proves, and is true at 4% as well as 90%, since the pop-up does
not interpolate. Still loss-framed, because partial progress genuinely does pay nothing.

**Known limitation, logged rather than hidden:** eligibility cannot distinguish "began and stopped"
from "conditions partly satisfied". Fixing that needs an engagement signal CRWN does not record,
and changing this predicate alone would desync it from `recommendNextQuest`. Founder decision.

No frontend asset changed (the registry is server-only; `PopupHost` fetches resolved copy from the
API), so no service-worker bump. Constraint Engine, Roadmap, Manager, Needs You and the quest
catalog are untouched.

## 2026-08-11 - Needs You owns events, and only events

Implements the boundary the Action Plan vs Manager investigation approved.

**Removed from Needs You: the calculator-derived mission block.** It turned a calculator an artist
completed BEFORE signing up into a ranked recommendation ("Build Membership ($X/mo)") and hardcoded
the top one to `high`, with a code comment saying it "leads the whole plan". That is strategic
prioritization on a surface that owns events. An artist diagnosed FULFILLMENT could see "deliver
your overdue promise" on Rise Mode and a growth mission ranked high on Needs You in the same
session, with nothing reconciling them. Manager is explicitly forbidden from contradicting the
canonical priority (Z4); this path had simply never been given that rule.

**Nothing was lost.** `buildLeadMagnetMissions` is untouched, Rise Mode still calls it and still
leads with the top mission, and Rise Mode is also what remembers progress against it. Only the
second reader was removed, so the duplication and the ranking conflict ended in one step. There is
now exactly one reader, pinned by test. Production blast radius: **1 artist, 7 items**; 17 claimed
calculator results and 326 quest_instances unchanged, nothing deleted.

**Urgency is not priority.** `ActionPlanPriority` → `NeedsYouUrgency`, `ActionPlanRecommendation`
→ `NeedsYouItem`. `high` now means a deadline is close or something is overdue, never "your most
important business problem". Ordering deadlines is legitimate; ranking strategy is not. The API
header no longer describes "the artist's next best moves, ranked".

**Compatibility held deliberately.** The wire field stays `priority` (renaming would break the page
for terminology alone). `/action-plan` and `/api/action-plan` stay: `tourId: 'action-plan'` is a
persistence key, so renaming it would replay the tour for every artist who already dismissed it,
and the surviving item ids (`clip-window-closing`, `pending-fan-suggestions`, `proof-of-demand-met`)
are unchanged so historical analytics still group.

**One prior assertion was deliberately reversed and the reasoning is inline.** Z5's
`ownership.test.ts` listed `lead-magnet-mission` among the event signals that must SURVIVE. That
classification was wrong: a pre-signup calculator is a commitment, not an event. It moved to the
must-NOT-appear list.

No frontend file changed, so no service-worker bump. Manager, Constraint Engine, Rise Mode, quests
and attribution are untouched; autonomous Manager remains dormant.

## 2026-08-11 - Promise reminder boundary fixed, and Communications Governor V1 (G1 + G2)

**Part A — CRWN was preparing to tell artists they owed fans their own to-do list.** Z12 applied
the fan-promise boundary to the three readers that DECIDE (Constraint evidence, Manager insights,
Roadmap) and missed both readers that COMMUNICATE. `promiseReminders` selected `metadata` and never
filtered; `calendarReminders` did not select `metadata` at all, so it could not have filtered.
Both ran daily, three hours apart, each deduping only against itself.

Measured read-only on production at the moment of the fix: **all 12 events inside the 8-day
reminder window were Revenue Ramp steps**, with titles including *"Personally message your 50 most
engaged fans"* and *"Announce it everywhere you post"* — each queued to be emailed as "Promise due
in N days" as though a paying fan were waiting on it. `calendarReminders` went from 94 eligible
pending events to 4. Both readers now use the shared boundary (`onlyFanPromises` in JS,
`FAN_PROMISE_FILTER` in the query), and neither re-expresses the rule with its own literal, which
is what let the first three drift. Truthful urgency for real obligations is unchanged.

**Part B — Communications Governor V1.** `src/lib/comms/taxonomy.ts` (eight classes in precedence
order, owners, notification-type registry) and `src/lib/comms/governor.ts` (PURE: its only import
is the taxonomy, asserted by test). It governs ATTENTION, never diagnosis — no `readConstraint`, no
database, no AI. Integrated at `createNotification`, the one chokepoint all twelve producers
already call. **No producer changed**: classification keys on the `type` string they already pass,
so the information needed to govern had been flowing all along and was simply never read. No new
query, no new schema.

**Manager is not an owner of priority.** `ai_insight` is owned by `constraint`. Manager is the
voice; the engine owns the answer. Z4/Z5 survives into communications.

**Founder decisions encoded.** (1) **No global cross-channel cap** — no counter, budget, quota or
cooldown exists anywhere in the governor, asserted by test, because CRWN has no shared send history
and a cap would be enforced against evidence it does not have. Channel-local caps remain
authoritative. (2) **Celebrations coexist but never displace** — always delivered alongside a fan
obligation in a feed; where a channel admits one winner the obligation wins and the celebration is
**deferred, never suppressed**.

**V1 emits no `suppress` at all.** The only non-delivering outcome is `defer`, and only for growth
when the caller POSITIVELY knows a blocking state (`=== true`; `undefined` stays unknown, never
false). Critical fails OPEN everywhere. An unclassified type delivers ungoverned, because a
boundary introduced under live traffic that failed closed would silently mute a new feature.
Enforcement is deliberately thin: growth suppression against the canonical constraint would put a
Constraint Engine read on every notification write, which was refused on performance grounds.

**Untouched:** lifecycle email (G3, evidence-gated), the pop-up engine and its channel-local
governor, artist-authored fan campaigns and broadcasts, fan transactional mail, Z3/Z9/Z10, and the
dormant autonomous Manager. Production verified read-only: notifications 183 unchanged, popup_events
16 unchanged, sequence_enrollments 10 unchanged, nothing sent, nothing migrated.

## 2026-08-11 - Manager admin observability: an instrument, not a cockpit

Shipped `/admin?tab=managerops`, labelled **Artist Manager**. Read-only operational truth about the
artist-facing Manager. Deferred through four prior tasks so it could be built against the
architecture that actually exists rather than the one that did in April.

**Placement:** a tab in the EXISTING admin shell, not a new route, inheriting the admin gate and
nav. The label is deliberate: the Dashboard tab already carries CRWN's OWN business agent
(funnel/pipeline/partners/CRM → `autonomous_run_log`), and the founder must never have to work out
which agent a panel is about.

**The health model is the point.** `deriveCronState` returns three states, not two:
`running_with_work`, **`running_no_work`**, `not_running` (plus `unknown`). The middle state is
exactly what CRWN lacked when the ai-manager heartbeat let `agent-health` certify a four-month
outage as healthy. The cron's own heartbeat `detail` is rendered verbatim, because it already
encodes the reason, so "nothing to do" stays distinguishable from "broken" without inventing a
single new telemetry field.

**Shown:** scheduled autonomy as *intentionally dormant* (founder decision, not an error); last
artist-visible Manager output; awaiting-approval vs expired-unactioned; oldest valid pending age;
approved / rejected / **abandoned**; executed vs auto-executed; failures classified from the
structured `not_executed:<reason>` prefix the execution gate writes; insight volume and liveness;
recent actions keyed by public slug.

**Refused:** outcome scores, POSITIVE/NEGATIVE verdicts, "worked"/"no lift", MRR deltas, artist
ranking, cohort comparison, and **approval percentages** (single-digit sample; a rate there reads
as a finding and carries none, so only counts ship). The route selects explicit columns rather than
`select('*')`, because the retired `outcome_delta`/`outcome_metrics`/`baseline_metrics` columns
still physically exist and existence is not permission. **No mutation of any kind:** GET only, no
write call, no button, no click handler, no `?artistId=`.

**No schema.** Derived from `artist_agent_actions`, `artist_agent_runs`, `ai_insights`,
`cron_heartbeat`, `artist_profiles.slug`. Expiry reads the ONE cutoff in `ai/actionValidity.ts`, so
the panel cannot disagree with the execution gate.

**Reported, not faked:** provider/model failures are unobservable. A failed DeepSeek call makes
`generateInsights` return `[]` and `runAutonomousAgent` insert no run row, leaving no queryable
trace, so there is no provider-health panel guessing at it.

Autonomous Manager remains dormant (pinned). `weekly-payout` untouched. Artist Manager unchanged.

## 2026-08-11 - weekly-payout retired: Stripe was already paying the artists

**Disposition: RETIRE.** The cron is deleted and unscheduled. No Stripe configuration was touched,
no balance moved, no payout created.

**What it was designed to do:** every Monday 11:00 UTC, sweep each connected account's ENTIRE
available balance to the artist's bank via `payouts.create`, no fee, no threshold.

**What it actually did:** nothing, ever. It filtered `artist_profiles.is_active`, a column that does
not exist, so it returned "No connected artists found" every week after taking its `cron_run_log`
lock, which made a no-op look like a completed run (locks exist for 2026-W13 onward).

**The decisive evidence, read-only against LIVE Stripe.** Across all 7 connected accounts:
**5 payout objects, every one `automatic: true`, ZERO created through the API**, all `paid`, none
failed, spanning 2026-05-14 to 2026-08-11. So Stripe has been paying artists the whole time and
neither this cron nor the manual cashout has ever created a payout. Accounts are **Express**,
`daily` automatic, `delay_days: 2`, USD, 6/7 payouts+charges enabled (the 7th has not finished
onboarding). **Every available balance is currently zero**, because the daily sweep keeps them
there.

**Repairing it would have been worse than leaving it.** On a zero balance it would skip every
artist and do nothing; in the rare window where funds had just become available it would have
issued a manual payout for the full balance, racing Stripe's own automatic payout for the same
money. It also hardcodes `currency: 'usd'` while summing `balance.available` across all
currencies, records no payout id anywhere (CRWN would have had no ledger of its own payouts), and
takes its idempotency lock before doing any work, so a mid-run failure cannot retry that week.

**There was no canonical weekly payout rule to protect.** `07-BUSINESS-RULES` described the code,
and `17-OPEN-QUESTIONS` #9 had the fee asymmetry (weekly free vs manual $2) logged as **unresolved**
since the audit. Retirement resolves it: the free path is gone, so the only CRWN-initiated artist
payout is the $2 cashout. **A new founder question replaces it:** with Stripe sweeping daily at
`delay_days: 2`, artists rarely hold a balance (0 of 7 do today), so the $2 cashout may have
nothing left to accelerate. That is pricing, not cleanup, and was not decided here.

**CRWN never owned payout timing and still does not.** `accounts.create` passes no
`settings.payouts`, so the schedule has always been Stripe's default. That is now the documented
canonical answer rather than an accident.

**Untouched, and pinned by test:** `earnings`, referral/fan cashout, team-split cashout, recruiter
transfers (all `transfers.create`, platform → connected account, a different rail from
connected → bank), Connect onboarding, platform fees, `/api/stripe/cashout`. New
`payoutOwnership.test.ts` walks EVERY cron route and fails if any of them calls `payouts.create`,
and asserts `/api/stripe/cashout` is the only `payouts.create` in the entire application.

Also corrected: the Sage support agent was instructing staff to tell artists "weekly payouts run
Monday 11am UTC", which was customer-facing misinformation about money. `POST_DEPLOY_CHECKLIST`
no longer instructs anyone to trigger a payout cron.

## 2026-08-11 - Manager approval is not perpetual authorization

**The defect.** `artist_agent_actions` had no expiry of any kind. `/api/ai-manager/execute` matched
on `status = 'pending'` and nothing else, and the Manager screen rendered an Approve button for
every pending row regardless of age. Production carried three actions generated 2026-04-03, still
offered **130 days later**, one an `adjust_tier_price` marked risk=high. Approving it would have
rewritten a live tier price using April's analysis of April's numbers. The Approve button itself
was the problem: it implied CRWN still stood behind a suggestion it had not re-examined since.

**The rule now enforced:** authorized AND approved where required AND **still valid**, with
validity re-derived from current state at execution time.

**TTL = 14 days, inherited rather than invented.** CRWN had already decided how long Manager output
stays current: `ai_insights` is written `expires_at = now + 14 days` and every reader filters on
it. An insight is Manager's advice; an action is that advice plus a proposed write, and the write
must not outlive the reasoning. The 7-day dedup window and the 1-hour coordination lock were
explicitly NOT reused: different concepts that happen to be durations. No founder decision was
needed because no number was invented.

**`src/lib/ai/actionValidity.ts`** checks age, then target state, returning `expired` /
`target_missing` / `already_satisfied`. Artist-scoped lookups, so a stored id belonging to another
artist reads as missing rather than resolving. It runs **before the coordination lock and before
any handler**, so a stale action costs no lock and no partial write, and it lives inside
`executeAction`, the one function both the artist-approval and autonomous paths funnel through, so
the dormant automation path inherits the guard if it is ever enabled. Fails OPEN on a read error,
leaving the handlers' own existence checks to refuse: this is an additional gate, never a
replacement for the ones already there.

**No schema, no history loss.** Expiry is derived from `created_at`; the `status` CHECK is
untouched and no `expired` value was added. A refusal is recorded `failed` with a structured
`result_message` (`not_executed:<reason> — <message>`), since `rejected` would falsely imply the
artist declined. The three April rows are unmodified and simply stop being offered. The UI and the
teaser badge use the same cutoff as the server, so the badge cannot advertise actions the page will
not show. `agent-health` no longer alerts on permanently-expired rows and reports
`expiredPendingActions` separately.

**Deliberately not done:** canonical-priority revalidation. Action rows store no constraint type,
no `actionKey` and no diagnosis snapshot, so "was this generated under REACH while the artist is
now FULFILLMENT?" is unanswerable from the row. A *current*-priority veto at the execution boundary
would be a new product rule and a second constraint reader inside execution, so it was refused
rather than guessed. Stamping canonical context at generation time is the enabling step and belongs
with any future canonical-priority automation.

Autonomous Manager remains dormant (test-pinned). `weekly-payout` untouched. No admin observability.

## 2026-08-11 - Autonomous Manager: keep dormant (investigation, no code changed)

**Investigation and product decision only.** No code was changed: `src/` and `public/` are clean.
Verdict: **keep the scheduled autonomous Manager dormant, do not delete it, and revisit only
against evidence gates.** Founder decision remains open.

**Manager is not one feature**, and separating it makes the question answerable. Artist-requested
Manager works and does not depend on the broken query. Execution under artist approval works.
Telemetry works. Only *scheduled generation* and *auto-execution* are dormant.

**Two gates hold it shut and only one is a bug.** Beyond the known `artist_profiles.is_active`
defect, `runAutonomousAgent` returns early for `platform_tier === 'starter'`, and all 9 production
artists are `starter`. Fixing the query alone would resume rule-based nudges and notifications for
9 artists and generate **zero** actions. **Autonomy re-arms on the first Pro upgrade**, with no
further code change, which is the real deadline on this decision and was not previously recorded.

**Both auto-executable actions email fans without artist sight**, and `send_reengagement`
duplicates `/api/cron/inactive-subscribers`, which already performs the same 14-day-inactive
enrolment deterministically every day (7 active such sequences exist). The LLM path adds no
capability there, only variance.

**Two structural misalignments found.** None of the 8 action types can serve FULFILLMENT or
RETENTION, the constraints that outrank everything, so when the canonical brief correctly forbids
growth actions the whole toolkit is ineligible. And `canonicalPriorityBrief` returns null for BOTH
launch-gated and steady-state artists, so Manager cannot distinguish them and falls back to its own
framework in both cases (`resolveOperatingFlow` makes the distinction for the UI; the brief does
not).

**Evidence: proactive need is UNKNOWN.** Z3 holds 0 rows, so no canonical priority has ever been
recorded going unresolved and no execution gap is demonstrable. Approval history is 1 approved,
1 rejected, 3 abandoned. Nothing supports autonomous execution; absence of evidence was not
converted into a need.

**Separate live finding, unrelated to dormancy:** pending Manager actions have **no expiry**.
Three actions from 2026-04-03, including a high-risk `adjust_tier_price`, are still rendered with
an Approve button and would execute against today's state on April's analysis. Logged in `TODO.md`;
not fixed here because the task forbade changing approval gates.

`weekly-payout` untouched and its disposition unchanged. No admin observability built.

## 2026-08-11 - Manager measurement loop: partial retirement SHIPPED

Implements the decision from the investigation earlier the same day. Scope was the approved,
non-financial, reversible half only.

**Still live: Manager action telemetry.** `artist_agent_actions` and `artist_agent_runs` keep
recording what Manager did, when, with what result and under what approval state. Nothing else in
CRWN records that, which is why it survived.

**Retired: the private outcome-scoring layer.** Gone from the application: pre-execution baseline
capture, `outcome_delta` / `outcome_metrics` writes, `outcome_score` (all three copies, including
the one the cron recomputed in TS), the `PastOutcome` type, the "PAST ACTION OUTCOMES" prompt
block, the POSITIVE/NEGATIVE/NEUTRAL verdicts, and the instruction to "repeat what worked, avoid
what failed". `src/lib/ai/snapshotMetrics.ts` is DELETED: after the two callers went, zero
remained. Both Manager prompts now carry an explicit prohibition on claiming a past action produced
a result. The dead `crossArtistContext` parameter went with it, because a channel that injects text
into an artist's prompt the moment someone assigns to it is a latent version of the Z10 leak.

**`cron/outcome-measure` was NOT deleted**, and tracing it first is why. Two live consumers there
have nothing to do with Manager measurement: `expireStallLocks` (shared with the ADMIN agent's
execute route, so it outlives Manager entirely) and `refreshAllOpportunities` (the opportunity
ledger). Only the measurement block was removed; the route now reports
`managerOutcomeMeasurement: 'retired'`. Two `agent-health` checks that measured the retired loop
were removed rather than left reporting a permanent zero, since a health cron that reassures you
about a system that no longer exists is how this codebase got a heartbeat certifying a dead cron.

**Boundaries held, and are pinned.** Z3 remains the only recommendation-outcome linkage: no Manager
action was migrated into it and it gained no notion of one. Z9 still reaches Manager through
`coachingBrief` with sample floors, windows and eligibility untouched, and Manager grew no
"learned rates" of its own. The Z4/Z5 reconciliation is intact. **No replacement learning system
was built**, which is the point rather than an omission.

**Deliberately NOT done:** the AI Manager's dormant activation query (`artist_profiles.is_active`,
a column that does not exist) is UNCHANGED and now **guarded by a test**, because fixing it would
reactivate an auto-executing AI across every artist account and that is a founder product decision.
`weekly-payout` untouched. No admin observability built. No schema migration: the legacy JSONB
columns and the `artist_action_outcomes` view remain structurally present, unread, and documented
as legacy. No historical rows were deleted, migrated or reinterpreted.

`managerBoundaries.test.ts` grew from 25 to 38 assertions. Full suite 1388/1388, build clean.

## 2026-08-11 - Manager measurement loop: investigation, and the loop that never closed

**Investigation only. No code changed.** Architecture decided: **partial retirement**.

**What the code says.** Manager recommends, the action executes, `snapshotArtistMetrics` captures a
baseline, the `outcome-measure` cron re-snapshots and stores `outcome_delta`, and the next run
feeds the last 10 scored outcomes back into the prompt with *"Repeat what worked. Avoid what
failed."* Four defects, and the two the prior audit missed are the worse ones: the "7-day window"
is a 7-day MINIMUM capped at 30 with the elapsed time never recorded, so deltas of different
lengths are ranked against each other; and measurement is **per-artist, not per-action**, so one
snapshot is diffed against every pending action's baseline and whatever the account did in the
interval is credited to all of them. That is not weak attribution, it is none. The loop also
carries `outcome_score` in three places, which `recommendationOutcome.ts` (Z3) explicitly forbids
by name, alongside `caused`, `impact` and `attributed`.

**What production says.** 7 agent actions have ever existed, all between 2026-03-29 and
2026-04-03. **0 have `baseline_metrics`. 0 have `outcome_delta`. 0 were ever measured.** The
`artist_action_outcomes` view returns 0 rows. `pastOutcomes` has therefore never been non-empty,
so the causal instruction has never actually fired.

**Why it stopped.** Not the `HTTP 402` recorded in `FEEDBACK_LOOPS.md` §4.10. The ai-manager cron
filters `artist_profiles.eq('is_active', true)` and **that column does not exist** (`42703`
verified; `profiles.is_active` is a different table). The result is not error-checked, so `data`
is `null` and the cron early-returns "No active artists" every day, then writes a heartbeat that
`agent-health` reads as proof of life. The safety net has been masking the outage it was built to
catch. `/api/cron/weekly-report` and `/api/cron/weekly-payout` share the exact bug. **No artist is
unpaid:** all 7 connected accounts run on Stripe's own `daily` automatic payout schedule, verified
read-only, so weekly-payout is redundant rather than a money leak. §4.10 corrected.

**Decision.** Retire the learning half (`outcome_score` ×3, `outcome_delta`, `outcome_metrics`,
baseline capture, the `pastOutcomes` prompt block, the view's score column). Keep the telemetry
half (`artist_agent_actions` / `artist_agent_runs`), which is the one job nothing else does: Z3
records constraint recommendations, Z9 records rates, neither records what Manager DID. Replace the
prompt input with facts ("already taken on date X") rather than verdicts. Historical cost is zero
because there is no history. Not implemented: retirement changes recommendation-learning semantics,
a declared stop condition. Full disposition in [`02-FEATURE-MAP.md`](02-FEATURE-MAP.md).

## 2026-08-11 - Manager reconciliation: the second strategist Z4 missed

**What existed:** Z4 gave Manager the canonical diagnosis and Z5 declared it a coach that may
re-word the priority but never re-rank it. Verified against the repository, that was true of ONE
of Manager's two model calls. `generateActions` received `canonicalPriorityBrief()`;
`generateInsights`, which fills the largest block on the Manager screen, did not, at either call
site. It carried its own priority policy in prose ("fix retention before anything else",
"consider price increases", "acquisition problem"), emitted the result as `urgent`, and its title
format demanded an action verb. So an artist the engine had diagnosed as FULFILLMENT could open
Manager and read *"Raise Silver tier to $15"* in gold, contradicting the Constraint Card one
screen away. The artist's own Refresh button was the worse path: it ran that model with **no
canonical context at all**. The same prompt hardcoded *"ARPU low relative to peers ($8-15/mo is
typical)"*, a cross-artist claim that survived Z10 because it was never a query. The Manager
screen itself showed no canonical priority anywhere, billed itself as a "24/7 assistant", called
its own page "What to do next", and rendered a **"Worked" / "No lift"** verdict plus a dollar MRR
figure beside each executed action, derived from `snapshotArtistMetrics` (self-derived MRR,
missing metrics defaulted to `0`, fixed 7-day window, no control).

**What shipped:** `src/lib/ai/coachingBrief.ts`, the ONE builder of coaching context (Z4 brief +
Z9 rates from a single evidence read, fail-soft to null), used by both Manager routes. The insight
prompt now states the canonical diagnosis outranks its guides, forbids peer/benchmark comparison,
forbids computing a rate, and forbids implying a past action caused a money change; the peer line
is deleted. The Manager screen renders the canonical priority ABOVE its own output with a link back
to Rise Mode (no second gold CTA: Manager reads the priority, it does not own it), and its chrome
now describes coaching rather than strategy. The artist-facing causal verdict is removed.
`ai/crossArtistPatterns.ts` (zero importers since Z10) is deleted. `agent-health`'s stale
"cross-artist intelligence needs more data" alert now names what it actually measures.

**Deliberately NOT changed:** Manager's outcome measurement stays quarantined rather than repaired
or merged into Z3/Z9. Only its unsupported artist-facing presentation was removed; the loop still
records and still feeds Manager's own prompt. Repairing it touches financial derivation and is a
founder decision (TODO). Constraint Engine priority, thresholds, ordering and issuance are
untouched: `/api/artist/constraint` remains the only Z3 issuer.

**Admin finding:** there is **no admin Manager**, verified rather than assumed. `admin/agent/*`,
`AgentInsights` and `AutonomousOpsBar` are CRWN's own business agent (funnel/pipeline/partners/
CRM) writing `autonomous_run_log`; `ApprovalsManager` is user and invite-code approval. No `/admin`
surface reads `artist_agent_actions`, `artist_agent_runs` or `ai_insights`. That gap is logged as
observability work, explicitly not a second strategist.

**Also reconciled:** two stale canonical claims. `11-SECURITY-AND-PRIVACY.md` HIGH-2 and
`12-ENVIRONMENT-AND-SETUP.md` still listed `NEXT_PUBLIC_CRON_SECRET` as a live client-bundled
risk; it appears nowhere in `src/` except historical comments, and the route has used session auth
plus `requireArtistOwner` since. Marked FIXED and RETIRED respectively.

**Pinned by:** `src/lib/ai/managerBoundaries.test.ts` (25 assertions). It fails if any Manager path
calls `generateInsights(data)` without a brief, issues a Z3 record, imports cross-artist evidence,
reasserts a peer claim, renders an outcome verdict, duplicates itself in navigation, or loses an
approval/ownership gate.

## 2026-08-10 - Money Model measurement: the First Revenue Launch gets a ledger

**What existed:** every artist-side truth (the `earnings` ledger with per-row snapshotted
platform fees, `first_paid_conversion` across six rails, the guarantee evaluator, first-touch
attribution) and NO cost side at all: no record of the implementation invoice, founder hours,
acquisition cost, or contribution margin. Doc 20's "What remains" list (track hours, document
first-paid results, convert to case studies) was founder work with no instrument.

**What shipped:** three admin-only tables (`frl_engagements` terms/scope/consent,
`frl_work_entries` labor + external cents, `frl_evidence` case-study record + dated metrics
snapshot; manual checklist state in `frl_checklist_state`), one pure finance module
(`src/lib/frl/economics.ts`, 43 tests: 7/30-day UTC windows, revenue by source, contribution
margin, CAC payback, replication diagnostic, cohort aggregates with per-metric sample sizes),
a 20-item operator checklist (10 derived through the quest evaluator and never storable, 10
manual), and the `/admin` Money Model tab with the founding-cohort comparison. Full spec:
`21-MONEY-MODEL-MEASUREMENT.md`.

**Rules that held:** null is never zero (a missing input names itself); plan-subscription
revenue is labeled MODELED because no invoice table exists; consent defaults to not_granted;
predictive LTV is unavailable by policy; no checkout, no pricing change, no public surface.

**DB impact:** `supabase/schema-phase2-frl-engagements.sql` (admin-only RLS, service-role
writes, self-verifying, probed) + `supabase/schema-phase2-earnings-live-tip-type.sql` (the
earnings type CHECK was missing `live_tip`, silently rejecting every live-tip earning row
wherever applied). Both unrun until Josh applies them; everything fails soft before that.

**Also:** `PlatformTierModal`'s hardcoded "$1,225"/"$5,000" break-even bullets and fee
percents now derive from `proBreakEvenGmvCents()`/`scaleBreakEvenGmvCents()`/`TIER_LIMITS`.
Tests 1030 pass; build clean.

## 2026-08-06 - Campaign attribution: the funnel below signup learns which VIDEO produced the artist

**What existed:** more than expected. `funnel_events` was already applied in production with 20
stages and four reporting dimensions (`calculator`, `campaign`, `referrer`, `video`), the client
already snapshotted first-touch UTMs, and the beacon route already mirrored the top of the funnel.

**What was missing was the join below signup.** `account_created`, `setup_completed`,
`stripe_connected`, `fans_imported` and `first_paid_conversion` carried the CALCULATOR and nothing
else. `leadMagnetDashboard.ts` said so in its own header comment ("account_created is not tagged
with the source dimension"), which is why every ranking stopped at completion rate. A video could be
compared on completions and never on artists produced. `email_submitted` also dropped `utm_content`
entirely, and every UTM value was stored raw: unallowlisted marketing copy in a grouping key.

**The fix is one durable place, not a new system.** `src/lib/analytics/campaignAttribution.ts`
normalizes a tagged link into eight allowlisted slugs; the result is written onto the artist's own
`lead_magnet_results` row under `input_data._attribution`, which is exactly the row the existing
claim path binds at signup. `attributionLookup.ts` reads it back oldest-first and every downstream
stage stamps it. No migration, no new table, no cookie, no second identity system: attribution
survives a delayed signup on another device, because the claim matches on the verified email.

**Two attribution policies, both documented rather than invented.** The client beacon keeps its
existing last-touch behavior (current URL wins, snapshot fills silence). PERSISTED attribution is
FIRST-TOUCH: `mergeAttribution` never replaces a set field, so a later untagged visit cannot erase
the video that brought them, and can only ADD dimensions the first visit left empty.

**Quality, not just volume.** Capture now stamps the band from the CANONICAL server-side scorer
(`decideCallRequest`), so the admin scorecard reads "40 leads, 4 sales-priority" instead of "40
leads". The scorer, the ICP definition and the calculator formulas are untouched.

**Admin:** a Content scorecard (group by campaign / video / angle / platform / keyword / variant,
walked to first paid conversion, with the biggest drop named per row) plus a Campaign link builder
that emits links through the same normalizer the server parses with. Founder procedure:
`docs/acquisition/campaign-tagging.md`.

**Deliberately not built:** the affiliate/partner funnel, paid-ad attribution, a ManyChat API
integration, and a campaign dimension on `opportunity_ledger` (so per-campaign CRWN revenue is a
named limitation, not a silent gap).

## 2026-08-06 - A cold signup gets the same argument for the ladder, and the guard that keeps it

**What/why:** the question was whether an artist who signs up OUTSIDE a calculator is offered the
same tier template. Verified: they already are. `buildLadderDraft()` takes no argument, so
`RECOMMENDED_LADDER` is the draft for every artist; a claimed calculator result is an OVERRIDE
applied afterwards behind `if (s?.ladderPrefill && !ladderTouchedRef.current)`. The `ladder` screen
is in a flat `SCREENS` list with no plan condition, and `LadderConfirm` maps the template, not the
projections. Nothing needed building.

**What was actually missing** was the argument, not the offer. The calculator path renders a
per-rung "about N fans in range for this tier, dropping it leaves them with no way to pay you". A
cold signup saw four rungs and a "Drop this tier" link with nothing pushing back. It now gets one
loss-framed line, with prices derived from `RECOMMENDED_LADDER` rather than retyped, so a template
price change can never leave the wizard quoting a number no rung carries.

**The calculator signup is untouched.** The line is gated on `hasPlan === false` (a threaded
`plan !== null`), deliberately NOT on `projections.length === 0`: those are different facts, and
the second would have caught a calculator artist whose result modelled no buyers.

**Guarded:** `src/lib/setupLadderOffer.test.ts` (12 tests) pins the whole chain, including the
silent failure where prefill becomes the SOURCE of the draft and cold signups land on an empty
ladder with nothing failing, plus both second chances (the launch review's "Offers ready" fix, and
`TierLadderTemplate` mounted ungated in `TierManager`).

**Files:** `src/app/setup/page.tsx`, `src/lib/setupLadderOffer.test.ts`. **DB impact:** none.
**Migration:** none. **Tests:** 935 pass.

## 2026-08-06 - The First Revenue Launch offer layer: activation is the first paid member

**What/why:** the founder settled the updated offer ("The CRWN First Revenue Launch", a premium
concierge migration + launch service) as a LAYER ON TOP of the open self-serve funnel, never a
replacement for it. Nothing was gated; the calculators, free plan and wizard stay open. Five
product changes encode the offer:

1. **Activation is redefined as the first paid member**, not a published page. The roadmap's
   private-launch stage now reads "Get member number one before the world hears about it," its
   money step is "Get your first paid member," and the wizard's LaunchReview says a live page is
   not the finish line and steers the first shares at warm fans (ten DMs beat one public post).
2. **Fan import moved from the audience-launch stage into Foundation** (`artistRoadmap.ts`,
   pinned by a test): you cannot privately launch to warm contacts before the list exists.
3. **CRWN Revenue Models** (`src/lib/avatars/revenueModels.ts`, `revenueModel@1`): a second,
   ORTHOGONAL axis to the sub-avatars. The avatar answers "who is this artist" (acquisition);
   the revenue model answers "which monetization system runs first" (offer prescription):
   Membership Consolidation / Between-Tour Revenue / Live Community Monetization / Independent
   Empire Expansion. Deterministic explainable scorer over the same evidence shape as the
   avatar scorer plus touring/shop extras; below the floor it returns the ICP baseline
   (consolidation) marked `isDefault`. Touring is never prescribed without touring evidence.
   Derived on read in `/api/artist/strategy` (seed answers + live sessions + product count) and
   rendered as a block in `StrategyCard`. The acquisition chain is
   avatar -> revenue model -> launch plan; the two layers must never merge.
4. **First Paid Member Guarantee checklist** (launch-partner cohort, dark):
   `src/lib/launchPartner.ts` (pure, tested) maps every guarantee condition to the SAME quest
   evaluator the roadmap uses (Stripe, free door, purchasable paid tier, contacts, welcome
   post, campaign SENT) with one outcome condition (first real dollar). Founder review same
   day: the contacts rule is 100 imported contacts OR 40 proven buyers (Patreon-tagged), so
   quality never auto-disqualifies a small warm list, and "campaign drafted" was dropped as a
   requirement because sent subsumes it.
   `/api/artist/launch-partner` serves it only when `artist_profiles.launch_partner` is true
   (migration `schema-phase2-launch-partner.sql`, SERVER-ONLY column, no client grants, fail-soft
   42703); `LaunchPartnerChecklist` renders on the command screen above the roadmap. Cohort
   flips via `supabase/enable-launch-partner.sql`. Three partners first, manual Stripe invoice
   for the implementation fee, no checkout built on purpose.
5. **Stack Replacement Report** (`src/lib/stackReplacement.ts`, pure, tested; had NO UI and no
   callers at all until **Z6 surfaced it operator-side on 2026-08-11**): the
   audit tool that prices the artist's CURRENT fragmented stack (per-tool subscriptions + each
   tool's fee on the GMV it processes) against every CRWN plan from TIER_PRICING/TIER_LIMITS,
   with `CRWN_REPLACES` keeping ticketing/scheduling honestly out of the savings claim, and a
   plain-text renderer for the audit conversation. Whether it becomes a public calculator is a
   post-cohort founder decision.

Copy: the three "no pitch" lines (worth page x2, artist welcome email) became honest
qualified-artists-get-hands-on-help lines, and two nurture objection emails
(switching-cost, no-time) now mention assisted migration for artists with an existing paid
fanbase. `handoffSeed.ts` now exposes `inputData` (already selected, previously dropped).

**The full settled offer lives in `20-FIRST-REVENUE-LAUNCH-OFFER.md`** (added same day):
promise, qualification, the Fan Revenue Loop, the complete offer stack with
shipped/concierge/deferred status, the guarantee and its measured conditions, pricing (three
founding partners, manual invoice), scarcity, what not to promise yet, and the superseded
draft decisions listed so they are not resurrected. That doc wins over any earlier offer
draft.

## 2026-08-04 - Genre becomes a dimension of the avatar cohorts, not a fifth cohort

**What/why:** the precedence question ("should a big R&B seller land in Empire Builder or R&B
Empire Builder?") was checked against the real scorer instead of reasoned about, and the answer
was that precedence barely matters: that artist scores Highest Priority 7 vs R&B Empire 6 and wins
on POINTS. Precedence only breaks an exact tie. **The order stays as declared.**

The check surfaced the real problem underneath it. The qualification bar (large audience plus
proven direct sales) outscores every genre segment, so every big seller lands in Highest Priority
whatever they make, and the genre cohorts silently become "artists who did not qualify as big
sellers". Comparing cohort revenue would then answer "which cohort holds the biggest artists?",
tautologically the one defined that way, while looking like a content result. That would have
misled exactly the acquisition decision the report exists to inform.

**The fix, because genre and priority are orthogonal:** genre now CUTS each cohort instead of
competing with it. `buildGenreBreakdown()` (`src/lib/avatars/cohortGenre.ts`, pure, tested)
returns all four genre rows per cohort with identities, first-paid artists, refund-netted GMV and
a within-genre first-paid rate that is null below 5 identities rather than a noisy percentage.
`?genre=` filters the whole report. It costs no extra query: genre is read from the same stored
answers the identity resolution already loads, and an artist row plus its owning user canonicalize
to one person so nobody is double-counted.

**The honesty rule it encodes:** `other` (they told us a genre outside the two families) and
`unknown` (they never told us, which is every anonymous row) are counted separately and never
merged, because folding them would report an absence of data as a measured result. Pinned by test.

**Files:** `src/lib/avatars/cohortGenre.ts` + test (new), `api/admin/avatar-cohorts/route.ts`,
`AvatarCohortsView.tsx`, `docs/SUB_AVATARS.md` (§7a, and §10 records the precedence decision as
settled). 889 tests pass. No migration, no founder action.

## 2026-08-04 - subAvatar@2: four identity segments, one front door

**What/why:** founder call, one day after `subAvatar@1` shipped. The four sub-avatars are renamed
to **Highest Priority Empire Builder / Established Independent Minded Operator / Brand-Led
Hip-Hop Artist / R&B Empire Builder**, and every one of them now enters through the ALL-IN-ONE
calculator (`/tools/opportunity-calculator?from=<avatar id>`) instead of a calculator of its own.

**Why this was a rebuild, not a rename.** v1's avatars were PAIN segments, so `calculator ->
avatar` was the entire assignment mechanism. The new names are IDENTITY segments (priority tier,
operating maturity, genre), and routing all four at one calculator deletes that mechanism: every
lead now runs the same tool. Renaming without rebuilding assignment would have produced one cohort
wearing four labels, and a report that lies is worse than no report. So:

- **Assignment moved onto the ANSWERS** (`assignment.ts`): the ICP Tier 1 audience floor crossed
  with proven direct sales, real supporter and revenue numbers, platform count, years or catalog
  depth, genre family, video output, unreleased count, plus the `?from=` funnel as a strong but
  outvotable declared signal. Genre alone deliberately scores 2, never enough on its own, because
  being a hip-hop artist does not make someone brand-led.
- **Overlap is handled explicitly.** These segments intersect by construction, so exactly ONE
  primary is assigned and ties break by declared precedence (the array order in `taxonomy.ts`,
  a founder decision). Disjoint cohorts are what make any comparison mean anything.
- **One new question**, `genre_family`, on its own opening step and NOT required: the calculator's
  standing invariant is that an artist can reach a real result from one number, and the existing
  invariant test caught the attempt to make it mandatory. Two of the four avatars are
  genre-defined, so without it they could never be assigned from an answer.
- **Cohort attribution rebuilt** for a world where `calculator` is a constant: stamped on
  `funnel_events.metadata.subAvatar` (client value validated against the taxonomy server-side),
  stored beside the answers as `_entry_context` at capture, and resolved per identity for
  post-signup stages, in that order of trust. Identity never overrides a stamp, so a cohort cannot
  gain members halfway down its own funnel. Ledger GMV is now attributed per ARTIST rather than
  per calculator, which would otherwise pool all four cohorts' money into one pile.
- **Personalization follows the avatar, not the slug:** nurture modules
  (`moduleFor(slug, subAvatar?)`, wired through the cron from the stored result) and starter-offer
  framing (audience line and reason only, never the offer, price or benefits).

**Safe because nothing had accumulated.** v1 lived for a day, the avatar was never stored on an
event, and its migration was unrun, so the taxonomy was replaced outright rather than migrated.
The migration's CHECK is now drop-and-recreate, so re-running the same file is safe either way.
The two v1 calculators (`fan-stack-calculator`, `between-tour-calculator`) are KEPT as ordinary
single-opportunity tools, each with its own entry context into the all-in-one calculator.

**Files:** `src/lib/avatars/{taxonomy,assignment}.ts` + both test files (rewritten),
`leadMagnets/registry.ts` (genre question, 6 new entry contexts), `leadMagnets/analytics.ts`
(entry-context persistence on every beacon), `api/lead-magnets/analytics` (validated stamp),
`api/lead-magnets/capture` + `PublicToolClient` (server-side entry context), `auto-claim`,
`api/admin/avatar-cohorts` (identity resolution), `AvatarCohortsView`, `api/artist/avatar`,
`starterOffer.ts` + `api/starter-offer`, `prospectNurture/calculatorModules.ts` +
`cron/prospect-nurture`, `setup/page.tsx`, `unifiedFunnel.test.ts`,
`supabase/schema-phase2-sub-avatar.sql`, `docs/SUB_AVATARS.md`, ICP.md, 13-CURRENT-STATE.md,
TODO.md. 881 tests pass.

## 2026-08-04 - The entry hero stops assuming the visitor has met CRWN before

**What/why:** the Opportunity Calculator's hero led with "The all-in-one calculator" and "You are
guessing at your own business with five separate numbers." Both only make sense to someone who
already knows CRWN has a family of single-opportunity calculators. On `/` and on
`/tools/opportunity-calculator` the reader is usually meeting us for the first time, so the pitch
was answering a question they had never asked, about a product they had never seen.

**New hero** (loss-framed per the copy rule, cost of inaction first, then cut to the bone on
Josh's call the same day): eyebrow "For independent artists", headline "Your fans are worth more
than they pay you.", subheadline "One number, and what to build first.", CTA "See what my fans are
worth". The first rewrite kept a three-sentence subheadline explaining the cost of guessing; it was
correct and too wordy for a hero. The loss is already carried by the headline.

**One config, both pages.** The homepage and the tool route render the same registry hero, so this
is a single edit in `src/lib/leadMagnets/registry.ts` and neither page has its own copy. Nothing
about the wizard, the model, the result, or the builder changed.

**Guarded:** a new test fails if the hero ever again contains "all-in-one", "five separate",
"other calculators" or similar, plus an em-dash check on the hero lines.

**Files:** `src/lib/leadMagnets/registry.ts`, `src/lib/leadMagnets/homepageFunnel.test.ts`.
**DB impact:** none. **Tests:** 876 pass.

**Left alone deliberately:** `videoAngle` (the source Josh writes video scripts from, where
contrasting with separate calculators is the actual argument), the `/tools` index `description`
(shown in a list where the other tools are visible anyway), and the post-result overlap note
(which names CRWN features the result just explained, not other calculators).

## 2026-08-03 - Four sub-avatars: two new calculators, one taxonomy, one cohort report

**What/why:** CRWN could not answer "which kind of artist should acquisition money chase?"
because every lead pooled into one funnel. The ICP is now segmented into four founder-approved
sub-avatars (Membership Stack Consolidator, Touring Access Seller, Live Community Creator,
Catalog and Vault Seller), each a complete journey from a loss-framed entry calculator through
builder, signup restoration, avatar-aware onboarding, launch, and calculator-attributed revenue,
compared side by side in a new admin Avatars tab. Spec: `docs/SUB_AVATARS.md`.

**The five-step pass applied:** no new funnel infrastructure. The two missing calculators
(`fan-stack-calculator`, `between-tour-calculator`) are ordinary registry entries riding the
shared wizard/loss-engine/capture/claiming rails; the two existing ones (vault, live) were
verified and reused untouched; the avatar of an event is a READ-TIME mapping of the funnel's
existing `calculator` dimension (`src/lib/avatars/taxonomy.ts`, `subAvatar@1`), so nothing is
backfilled and nothing stored can drift. Assignment is deterministic and explainable
(`assignment.ts`: acquisition path > declared > behavioral, manual override wins, below the
evidence floor there is NO assignment). The only storage is the override + its audit trail
(`schema-phase2-sub-avatar.sql`, fail-soft, UNRUN, in TODO.md).

**Model honesty:** `fanStack@1` claims only ADDED revenue (partial 60% migration, uplift only
above current per-fan revenue, tool costs a separate tile never summed into the headline);
`betweenTour@1` deflates attendance to unique fans, converts VIP buyers at 25% into the
Gold-priced tier, and sells off-month stream tickets only to non-members (disjoint
populations). Both are pure, versioned, and pinned by tests (54 new tests, suite at 874).

**Feedback loop:** `readCohortConstraint()` finds each cohort's largest observed drop under the
Constraint Engine's house rules (min sample 30, null is silence, investigation-only copy, no
causal claims). Cohort metrics without a trusted source (retention, churn, referral, CAC,
contribution) are listed as "not measured" with reasons, never zero-filled. Also new:
first-touch UTM persistence (`crwn_first_touch` snapshot with current-URL-wins fallback), the
`/api/artist/avatar` derive/override endpoint, avatar promise copy on the wizard's PlanIntro,
and the vault avatar defaulting the catalog step to the project path.

**Files:** `src/lib/avatars/*` (new: taxonomy, assignment, fanStackModel, betweenTourModel,
cohortConstraint + 5 test files), registry + toolAdapters (+2 tools), deliverableSpecs (+2),
postSetupDestination, continuationCta, calculatorModules (+2), starterOffer (+2 cases),
auto-claim, setup wizard, leadMagnets/analytics (first touch), `api/admin/avatar-cohorts` (new),
`AvatarCohortsView` (new), admin page tab, `api/artist/avatar` (new),
`supabase/schema-phase2-sub-avatar.sql` (new), `docs/SUB_AVATARS.md` (new), ICP.md,
13-CURRENT-STATE.md, TODO.md, sw.js v364.

## 2026-08-03 - The live fan preview runs beside the whole setup wizard

**What/why:** an artist building their CRWN could not see what they were building. The only fan
view was a link at the very end of the wizard. Now, from the moment they claim their link through
launch, `LivePagePreview` renders their REAL public page beside every screen, as a signed-out fan
sees it.

**Architecture:** an **iframe of `/{slug}?preview=visitor&embed=1`**, deliberately not a rebuild.
The public page is an RSC running ten Supabase queries over the money surface; re-rendering it from
wizard state would create the exact duplicate rendering architecture worth avoiding, and
refactoring it would put the highest-risk page in a preview widget's blast radius. Framing the real
route reuses it whole and cannot drift.

**Safety:** `preview=visitor` is the EXISTING persona lens (only ever REMOVES access). `embed=1` is
new: hides the owner `PreviewBar`, and makes both `SubscribeSection` handlers and
`ShopSection.handleBuy` inert. `embedded` survives the provider's non-owner branch on purpose (it
can only remove an action). The frame runs without `allow-top-navigation` / `allow-forms`.
`next.config.ts` went from `X-Frame-Options: DENY` to `SAMEORIGIN` + `frame-ancestors 'self'`:
cross-origin framing is still blocked exactly as before, same-origin is now permitted. Verified by
curling the built server, not inferred from config.

**State:** binds to `useArtistSetup`; no second copy of onboarding state. `previewSignature()`
(pure, tested) changes only on fan-visible change and the iframe reloads on that alone, never per
keystroke. A nonce bumped where the wizard already calls `refresh()` catches what the derived
booleans cannot see (a second track does not flip `hasMusic`).

**Files:** `src/lib/onboardingPreview.ts` (new), `src/components/onboarding/LivePagePreview.tsx`
(new), `src/app/setup/page.tsx`, `src/app/[slug]/page.tsx`, `src/hooks/useArtistPreview.tsx`,
`src/components/artist/SubscribeSection.tsx`, `src/components/artist/ShopSection.tsx`,
`next.config.ts`. **DB impact:** none. **Migration:** none. **Tests:** 820 pass (26 new).

**Deliberately deferred:** the pre-signup half of the ask (a preview on the calculator and builder
pages, before an account exists). See the report and TODO "On Claude's plate": before signup there
is no page, no name, no photo and no music, so the only fan-visible thing that exists is the tier
ladder, and `TierCards` is coupled to auth, router and live checkout. Showing an artist a
near-empty page at the moment of peak excitement is a conversion risk, not a north star.

## 2026-08-03 - The homepage server-renders again (loading gate was hiding the whole page)

**What/why:** the funnel reuse below shipped a real SEO regression, caught on the LIVE page. The
shared `PublicToolClient` opens on a `'loading'` phase so an emailed `?result=<token>` link does
not flash the hero before it resumes. `/` prerenders, so that first render was the served HTML:
production was shipping a nav plus "Loading…" (167 characters of text) where the old homepage
served its full marketing body. Every `?result=` link is built from `config.publicRoute`
(`/tools/<slug>`), so **nothing ever points at `/?result=`** and the gate bought the homepage
nothing.

**Fix:** the initial phase is now `surface === 'homepage' ? 'hero' : 'loading'` (one line). The
tool route is byte-identical: `/tools/opportunity-calculator` still prerenders its "Loading…"
placeholder exactly as before. Prerendered `/` went from 167 to 21,178 characters of text and
again contains the hero, the CTA, wizard step 1, and every marketing section below the funnel
(verified against `.next/server/app/index.html`, not inferred).

**Files:** `src/components/lead-magnets/PublicToolClient.tsx`. **Tests:** 794 pass (1 new
`pageComposition.test.ts` case pinning the homepage's initial phase). **DB impact:** none.

## 2026-08-01 - The homepage runs the Opportunity Calculator funnel (structural reuse)

**What/why:** `/` led with the Streaming Loss Calculator (`WorthExperience homepage`) while the
all-in-one Opportunity Calculator lived only at `/tools/opportunity-calculator`. The homepage now
opens with the same photo-led hero, one primary CTA that smooth-scrolls to the wizard on the same
page, and the same result → transition → builder → save/signup chain, because it mounts the SAME
component (`PublicToolClient` + the registry config). No homepage copy of the calculator, result,
builder, or boundary exists; both routes get every future fix.

**Order:** photo hero → one CTA → wizard → result → transition → builder → save/signup → tool +
CRWN showcase → **every existing homepage marketing section, unchanged and in the same order**
(embedded via a new `below` slot using `WorthExperience marketingOnly`, which strips that
component's own nav, hero, and calculator). Those sections render their existing no-number copy
path since the Streaming Loss result no longer leads the page; no section was removed, reordered,
or rewritten.

**Analytics:** no event renamed, added, or duplicated. `OpportunityEventMeta` gained one
allowlisted dimension, `surface: 'tool' | 'homepage'`, so the shared funnel's events stay
separable per page. `WorthExperience` fires no analytics of its own (verified), so embedding it
cannot double-count.

**Files:** `src/app/page.tsx`, `src/app/HomeFunnel.tsx` (new), `src/components/lead-magnets/PublicToolClient.tsx`
(additive `surface` + `below` props; `surface === 'tool'` keeps the "All tools" and "Explore
another tool" chrome so the tool page is visually unchanged), `src/app/(public)/worth/WorthExperience.tsx`
(additive `marketingOnly`, `HomeNav` exported), `src/lib/opportunityFunnels/analytics.ts`.

**DB impact:** none. **Migration:** none. **Tests:** 793 pass (5 new structural reuse tests in
`pageComposition.test.ts`, 6 config tests in `homepageFunnel.test.ts`, 1 analytics surface test);
`npm run build` passes with `/` still prerendered; `npm run verify:quests` OK.

**Known limitations:** the homepage marketing sections lose the personalized Streaming Loss
figures they used to interpolate (they fall back to their existing generic copy) because the
homepage no longer runs that calculator; `/worth` keeps the personalized version. Component-level
rendering (mobile overlap, focus order) was not automatically tested: this repo's vitest setup is
node-only with no jsdom, so those were verified by reading the shared components rather than
executed.

## 2026-08-01 - Onboarding music upload is project-centric (albums/EPs/singles/loose tracks)

**What/why:** the wizard's music step bulk-uploaded independent tracks and could ask for artwork
per track even when every track belonged to one album. It now asks WHAT you are adding first
(one OptionSelect): **an album/EP/mixtape** (one container, one title, ONE cover upload, bulk
audio, per-item title edit, up/down reorder; saved as an `albums` row + `album_tracks` in queue
order), **one featured track** (the existing single path, now with an OPTIONAL cover), or **a
batch of loose tracks** (the existing bulk path; no artwork required, 🎵 fallback stands).

**Key decisions from repository evidence:** NO migration — `albums.album_art_url` +
`album_tracks.track_number` is sufficient, and a "single" is by convention a standalone track
(no release_type exists). Artwork inheritance does NOT exist at render time (all 12 surfaces
read `track.album_art_url` only), so the project flow follows the AlbumManager convention:
upload the cover ONCE, store it on the album, and copy the URL STRING onto linked tracks that
have no art of their own (`.is('album_art_url', null)` guard; one storage object, N references).
Everything runs on the browser client under the existing albums/album_tracks RLS ownership
policies; no service role.

**Idempotency:** album created once per session (ref), `album_tracks` UPSERTs on
`(album_id, track_id)`, numbering continues from the album's max, duplicate ids dropped in the
pure layer, so retry/double-click cannot duplicate rows or renumber.

**Fixed along the path:** bulk upload failures used to fabricate a dead
`crwn-media.r2.dev` URL and insert the track anyway — they now FAIL the item with a per-item
Retry; bulk file selection now uses the shared `validateUpload` (100MB/audio types) instead of a
private 50MB check; and album share/OG metadata queried nonexistent `albums.cover_art_url`, so
every album OG card said "Album Not Found" — both duplicate album routes now use
`album_art_url`.

**Files:** `src/lib/projectUpload.ts` (+14 tests), `src/components/onboarding/OnboardingProjectUpload.tsx`,
`src/components/artist/BulkUploadForm.tsx` (additive props `projectMode`/`onBatchComplete`,
reorder, retry), `src/app/setup/page.tsx`, `src/lib/onboardingItems.ts` (optional single cover),
milestone `first_project_created` (existing jsonb pattern, no migration).

**DB impact:** none. **Migration status:** none needed. **Tests:** 781 pass, build passes.
**Known limitations:** a reload mid-project after some tracks uploaded leaves them as loose
tracks (manageable in Studio, linkable via the existing add-to-album flow); the studio bulk
path (TrackUploadForm mount) still fires no `first_track_uploaded` milestone (pre-existing gap);
`src/lib/albums.ts` remains dead schema-incompatible code (untouched, flagged).

## 2026-08-03 - The Constraint Engine: CRWN's first artist-facing closed loop

Turns the evidence layer shipped earlier today into ONE next action. Deterministic end to end:
no AI provider is involved at any point, and with every model offline the engine returns the
same answer. It reads, it never writes. No tier, price, promise, campaign, quest, XP or Revenue
Ramp state is touched by this path, and no roadmap step is ever marked complete from it.

**Shape.** `src/lib/constraint/` holds four files: `thresholds.ts` (the ONE policy object,
founder-adjustable, no migration to change), `types.ts` (vocabulary), `engine.ts` (pure
`readConstraint(evidence)`), `assembler.ts` (server-only evidence gather), plus
`presentation.ts` for the render decision. `GET /api/artist/constraint` derives on read and
stores nothing. `ConstraintCard` renders above `RoadmapCard` on `/profile/artist`.

**Evaluation order, and the one place it departs from the brief.** The obvious order is causal
(reach, capture, convert, deliver, retain). That is right for diagnosing a machine and wrong
for advising a person, because **fulfillment and retention protect revenue the artist has
already been paid, while acquisition wins revenue they have not been paid yet.** Sending an
artist to recruit fans into a system that is failing the fans already inside it makes the leak
bigger. So the order is: launch gate (delegated) → FULFILLMENT → RETENTION → REACH →
FREE_CAPTURE → FIRST_PAID → PAID_TIER_INTEREST → CHECKOUT_COMPLETION → DEPTH → none. The build
brief's illustrative list put fulfillment 7th and retention 8th while its own acceptance
criteria required fulfillment to outrank acquisition and retention to outrank expansion; those
cannot both hold, and the criteria encode the intent.

**Launch readiness stays owned by the Roadmap.** The engine checks only whether enough of the
machine exists for its numbers to MEAN anything (page live, Stripe charges enabled, a
purchasable paid tier, a track) and returns `insufficient_evidence` otherwise, letting the
roadmap render unchanged. Those four facts come from the Quest Engine's own `evaluateCondition`
via synthetic instances, the same pattern `/api/artist/roadmap` and `rampReconcile` use, so
there is no second completion oracle.

**Evidence discipline.** Every field the engine consumes is nullable, and null means "cannot
evaluate this stage", never zero. A missing table therefore reads as silence rather than as a
failing artist. Below a stage's minimum sample there is no diagnosis at all, not a low-confidence
one: confidence is sample sufficiency (`medium` at the minimum, `high` at 2x), never a model's
opinion. Every diagnosis renders its own evidence lines so an artist can DISAGREE with it, which
is the difference between coaching someone and managing them.

**Product-failure safety.** Checkout completion refuses to diagnose when joins exceed checkout
starts, because that means the two are not measuring the same population (members who joined
before instrumentation, or a fan who started on one day and paid on another) and the rate would
be a fiction. Tier stages need `interactionDataAvailable` plus real sample sizes, so they stay
quiet while tier evidence accumulates. Copy is neutral throughout: "Fans are viewing Silver but
few are starting checkout", never "your Silver tier is bad". A test asserts no diagnosis ever
mentions upgrades or downgrades, since the subscription schema cannot support that claim.

**One churn definition.** `computeChurn` / `rateChurnAgainstBenchmark` /
`lifespanMonthsFromChurn` moved out of `/api/analytics` into `src/lib/analytics/retention.ts`,
and that route now imports them. The engine needed the same two numbers, and a second copy of a
churn formula is the shape of bug that once produced a 5x commission overpay.

**Fallback.** `decideNextAction` is pure and tested because the repo's harness is node-only with
no jsdom: loading, error, insufficient evidence and "nothing is blocking you" all render the
roadmap exactly as before. The constraint card never replaces the roadmap, so when a constraint
clears, the next read simply stops showing it.

767 tests pass (103 new across 4 files). Build clean. **No migration, no env var, no flag.**

Deferred on purpose: platform-wide product-problem classification, AI phrasing of the
deterministic result, and the Belief/Learning Profile. The thresholds are first guesses made
with no cohort data and are in `TODO.md` as a thing to watch, exactly like the lead score bands.

## 2026-08-03 - Evidence layer: tier interactions, missed promises, and every paid rail

Closes the measurement gaps in `docs/FEEDBACK_LOOPS.md` §18 Phase 0 and Phase 1. **Evidence only:
no recommendations, no adaptive Rise Mode, no pricing or tier changes, no new artist-facing
screen.** The deterministic Constraint Engine is deliberately still unbuilt.

**(1) One finding was WRONG and is retracted.** The audit claimed `stripe_connected` and
`first_paid_conversion` were declared but never emitted. Both were emitted all along
(`connectReconcile.ts`, `webhookHandlers.ts`); the audit's grep was truncated by a `head -30`.
`stripe_connected` already fired only on a live `accounts.retrieve` reporting `charges_enabled`,
which is the correct authoritative state. Two real, smaller gaps sat underneath it. **Rail
coverage:** only the subscription and product paths emitted, and because the stage dedupes per
artist and only the first event ever lands, an artist whose first dollar came from a track,
booking, live ticket or tip read as "never converted" forever. **Attribution:** the event carried
`artistId` and nothing else, so it could not join back to the calculator the artist came in
through, which is the whole reason the funnel extends below signup. Both fixed by one shared
recorder, `src/lib/analytics/paidConversion.ts`, now called from all six rails and stamping
`calculator` + `resultId` from the artist's claimed result. A tip is tagged `live_tip` in metadata
so a stricter "recurring only" reading stays available without a backfill.

**(2) Missed promises are recorded.** `fulfillment_events.status = 'missed'` was read in nine
places and written in none, so promise reliability could only be sampled at this instant and never
measured over time. `MISSED_GRACE_DAYS = 14` in `src/lib/fulfillment.ts` is the ONE
founder-adjustable threshold (no founder-approved value existed, so this is a documented temporary
default). `sweepMissedPromises` (`src/lib/promiseSweep.ts`) runs piggybacked on the existing 6am
`scheduled-releases` cron, AFTER the reminders so an artist is nudged before being scored. Guarded
by `status = 'pending'` on the UPDATE itself, so it is idempotent, cannot touch a terminal status,
and cannot lose a race with a concurrent completion. It creates nothing. **Lateness is derived**
from `due_at`/`completed_at`, with no new column: `latenessDays`, `wasLate` and
`summarizePromiseHealth` give completion rate, missed rate, late-completion rate and median
lateness, all null (never 0) on an empty denominator.

**(3) Tier interaction instrumentation, the keystone.** New `tier_events` table (migration
`supabase/schema-phase2-tier-events.sql`, **unrun**), deliberately NOT an extension of
`funnel_events`: tier events are per-tier and higher volume, and folding them in would inflate the
acquisition funnel's stage counts and add a column 20 of 22 stages leave null. Grain is
`(artist, tier, event_type, visitor_hash, event_date)` UNIQUE, matching `artist_page_visits` so the
two reconcile, which is what makes both counts mean "unique visitors per day" and a view-to-checkout
rate arithmetically honest. `tier_card_viewed` comes from the browser at half-card visibility
(`useTierViewTracker`, IntersectionObserver, unobserve-on-fire + a per-page-load Set + the DB grain:
three layers, so rerenders cannot duplicate). `tier_checkout_started` is recorded SERVER-side in
`/api/stripe/checkout` after `sessions.create` resolves, so a failed session records nothing and a
client cannot forge one; the free path returns before it, so a free rung never gets a checkout it
does not have. **The caller never supplies an artist id**: `recordTierEvent` reads the artist off
the tier row, so cross-artist forgery is impossible by construction rather than by policy. Metadata
is key-blacklisted and shape-whitelisted so no Stripe id can ever land in an analytics row.

**(4) Derived tier evidence reader.** `src/lib/analytics/tierEvidence.ts` +
`GET /api/artist/tier-evidence` (owner-gated by `requireArtistOwner`, same as `/api/analytics`).
Per rung: views, checkout starts, joins, active and churned members, and the three conversion
rates. Derived on read, nothing stored. **Upgrade and downgrade rates are reported as unavailable,
not estimated**: `subscriptions` is UNIQUE (fan_id, artist_id) and every write upserts on that
pair, so an upgrade overwrites `tier_id` in place and no transition history exists.

**(5) One visitor identity.** `hashVisitor` moved from private-in-middleware to
`src/lib/analytics/visitorHash.ts` and middleware imports it. Tier events must use the SAME hash as
page visits or the two tables can never be reconciled, and two copies would be one edit from
disagreeing silently.

664 tests pass (86 new across 5 files). Build clean. **Josh must run
`supabase/schema-phase2-tier-events.sql`**; until then the recorder no-ops and the reader returns
counts with null view rates plus a stated limitation, never a confident zero.

## 2026-08-03 - The artist page redesign lands end to end (interface v2, PR10)

Four commits finish the artist-page pass of the v2 redesign. (1) **The page looks like the
mock**: contained ambient accent pool (pure CSS color-mix), banner as a rounded media card with
accent glow, lifted avatar tile, display-size name, accent-tinted verified chip and tier cards
with pill Join buttons; `GatedTrackPlayer` untouched on purpose (entitlement logic; its glyphs
already ride the accent variable). (2) **Self-healing palette**: `PaletteBackfill` samples in
place when the owner views their page with a banner but no stored palette (sampling needs a
browser canvas), persists, refreshes; m3rcey backfilled `#d50000` live. (3) **Banner
reposition**: drag to reframe stores two object-position percentages
(`schema-phase2-banner-position.sql`, applied and probe-verified), never a re-encoded image.
(4) **Ink correctness, measured not guessed**: derived accent variants clamped so hover/muted
survive being used as ink (hover brightens toward white, muted clamps to the AA floor);
`--crwn-muted-on-tint` fixes muted text on gold-tinted cards (the failure was on the DEFAULT
gold theme, 3.85:1 under a 15% tint, solved against the worst shipped 18%); TrackList's Locked
badge moved off `gold-muted` (3.88:1 even in base gold). `auditContrast()`/`sweepContrast()`
ship as a tested dev tool (`window.__crwnContrastSweep()`); CI wiring pending. The reference's
sampler bug (`180 - dh > 35` accepted identical hues, rejected exact complements) is fixed to
`dh > 35` and pinned by `palette.test.ts`. All migrations verified applied in production via
`npm run verify:migrations` (including plan recommendation, palette, banner position).

## 2026-08-01 - Release strategy phase 1: the membership strategy brain + content classes

Implements the core of `CRWN_UPDATED_RELEASE_STRATEGY.md`. (1) **The brain**:
`src/lib/membershipStrategy.ts` (pure, 18 tests), deterministic pick between **The Release Club**
(enhances the public release cycle, the default) and **The Vault Membership** (monetizes catalog
depth: 10+ declared unreleased songs, or 2 or fewer releases a year over a 20+ track catalog).
Each strategy maps ROLES onto the pinned Bronze/Silver/Gold/Platinum rungs (the spec's "First
Listen"/"Inner Circle"/"Executive" are roles, never names), and carries the monthly promise by
platform plan, a single-release waterfall template, and a 90-day outline. (2) **Derived on read**:
`/api/artist/strategy` (roadmap pattern) derives facts from real data; the only stored value is
the artist's override (`artist_profiles.membership_strategy`, migration
`schema-phase2-membership-strategy.sql`, fail-soft pre-migration). Surfaced by `StrategyCard` on
the command screen; announced via `announce_membership_strategy`. (3) **Content classes replace
the track access toggles**: free forever / members first, public later / members only, one
OptionSelect in `TrackUploadForm`, encoded onto the EXISTING fields by `fieldsForClass()`. This
fixed a real gating bug: the old independent "Free to all" + "Enable early access" toggles could
write a future `public_release_date` with an empty tier list, which `GatedTrackPlayer` reads as
locked for EVERYONE (paying members included) for the whole window; and early access on an
is_free=false track never actually opened to the public. `paid_first` keeps `is_free: true` so
"public later" is real, refuses to encode with zero tiers, and editing a mid-window track keeps
its existing date so unrelated edits cannot silently extend the window. (4) **Declared facts** (same day):
the strategy card asks the two questions that separate the strategies (unreleased depth, release
cadence) as range dropdowns; stored in `artist_profiles.declared_unreleased_tracks` /
`declared_releases_per_year` (same migration, idempotent) and re-derives live. (5) **Live-session
templates** (same day, spec 28.5): `src/lib/liveSessionTemplates.ts` (7 templates, tested) with an
OptionSelect picker in `LivestreamManager`; a template is a PREFILL of fields the form already has
(title, agenda, free vs paid vs top-tier audience via `audienceTierIds`, capacity, and the
Executive Producer template pre-wires submissions when the flag is on). Only on create, never
while editing. Deferred, in order: per-tier waterfall automation (Pro; per-tier dates need an
entitlement change), quest catalog realignment (the Quest Engine stays dark until then).

## 2026-08-01 - Money-path guards, plan truth, and the support chat's escalation model

Found by Josh's live testing, in order of severity.

(1) **Platform plan double-subscribe.** `/account/billing` offered "Go Pro" to an artist already
on Pro and opened Stripe. NOTHING checked at any layer: the billing screen read `platform_tier`
only to display it, `PlatformTierModal` never received the current tier, and `platform-checkout`
never selected it. Completing it would have created a real second $49/mo subscription, and because
`handlePlatformCheckoutCompleted` stores a SINGLE `platform_stripe_subscription_id` and overwrites
it, the first subscription would have become uncancellable from the app and billed forever.
Guards: checkout 409s when **Stripe** reports an active subscription for the customer (the DB pair
is only the fallback when Stripe is unreachable); the modal takes `currentTier` and disables the
current plan. **A first attempt that refused on `platform_tier` equality alone was wrong and was
reverted**: it would have trapped every comped/stale row as permanently unable to start paying.

(2) **"Start Free" left artists billed.** `/api/account/set-starter-tier` carried a comment saying
it only allows the downgrade if there is no paid Stripe plan, and never implemented it. It flipped
the DB row without cancelling Stripe, so an artist on Pro who clicked it kept paying while the
product treated them as free. Now 409s and points at the cancel route.

(3) **Phantom plans: a stored tier is a claim, Stripe is the truth.** `artist_profiles` can read
`pro`/`active` with nothing billing (every platform webhook matches by subscription id and returns
early on a miss, so a subscription deleted in Stripe never downgrades the row). Production had
exactly that. `src/lib/stripe/platformPlanReconcile.ts` + `/api/stripe/platform-status` ask Stripe
and correct the row; the billing screen self-heals on load. Only downgrades when Stripe positively
says nothing is billing. A SQL migration (`schema-phase2-reconcile-phantom-platform-plans.sql`)
covers the narrower NULL-subscription-id case.

(4) **`profiles.platform_tier` DOES NOT EXIST.** `schema-platform-tiers.sql` declares it but was
never applied. Three code paths wrote to it and every write failed silently (supabase-js returns an
error object rather than throwing, and none checked it). Nothing ever read it. Writes deleted;
`artist_profiles` is the single source of truth. Do not add a mirror.

(5) **Support chat escalation model.** The prompt said "ALWAYS escalate when you are not
confident", so a vague opener went straight to a human with no attempt. It now leads with TRY
FIRST. Escalation now splits JUDGMENT (user asked, or the assistant flagged it: thread locks to a
human) from FAULT (key unset, API error, empty response: alert only, thread stays open so it
self-heals). A "New question" control was added because the panel always resumes the newest
conversation, making one escalation a permanent dead end.

(6) **Plan limits are real or gone.** Members are UNCAPPED on every plan (the cap was enforced
nowhere and the only enforcement point would be refusing a paying fan at checkout); the 50-track
Launch cap is enforced by DB trigger; the email quota is enforced at CREATE and, authoritatively,
at SEND (a draft-then-send bypass existed because only sent/sending/scheduled count). Tooling:
`npm run verify:migrations` and `npm run verify:stripe`.

## 2026-07-31 - Platform repricing: Launch / Pro / Scale (CRWN_PRICING STRATEGY.md)

The platform plan lineup was repriced per the founder-approved `CRWN_PRICING STRATEGY.md`.
(1) NEW LINEUP: **Launch** (internal key `starter`, free, 12% fee, 50 tracks, 250
members/contacts, 1 email campaign/mo, free tier + 3 paid fan tiers), **Pro** ($49/mo or
$490/yr, 8% fee, unlimited tracks/members, 20 email campaigns/mo), **Scale** (internal key
`scale`, renamed from the old spec-only `label` $99 concept; $199/mo or $1,990/yr, 5% fee,
100 email campaigns/mo, assisted migration, team permissions). All plans allow the same
4-tier fan ladder. Launch limits were raised from 20 to 50 tracks and 100 to 250 members.
Break-evens: Pro beats Launch above $1,225/mo GMV; Scale beats Pro above $5,000/mo GMV.
Positioning: Launch "Prove your first direct-to-fan offer", Pro "Run your entire
direct-to-fan business in one place", Scale "Scale revenue, your team, and fan operations
with less manual work". (2) CODE: `empire` fully deleted from
`TIER_LIMITS`/`TIER_LIMITS_V2`/`PlatformTierName`; `resolveTierKey()` aliases stray
`label`/`empire` strings to `scale`; `formatTierName()` maps `starter` to "Launch". Both
`pro` and `scale` are in the platform-checkout whitelist, and the route now verifies the
live Stripe price amount against `TIER_PRICING` before checkout, so a stale env var fails
loudly. Stripe env vars are now `STRIPE_CRWN_PRO_PRICE_ID`, `STRIPE_CRWN_PRO_ANNUAL_PRICE_ID`,
`STRIPE_CRWN_SCALE_PRICE_ID`, `STRIPE_CRWN_SCALE_ANNUAL_PRICE_ID` (LABEL/EMPIRE vars gone).
(3) PLAN RECOMMENDATION ENGINE: `src/lib/planRecommendation.ts` (`recommendPlan()`, pure +
tested). Every account starts on Launch; the recommended operating plan is stored on
`artist_profiles.recommended_plan` / `recommendation_reason` / `projected_monthly_gmv`
(migration `supabase/schema-phase2-platform-plan-recommendation.sql`, NOT yet applied),
seeded from the claimed calculator in `/api/lead-results/auto-claim` (fail-soft
pre-migration). (4) LEGAL: `/terms` and `/artist-agreement` now state Launch 12% / Pro $49
8% / Scale $199 5% (hand-kept, never rendered from code). A true multi-artist Label tier
stays custom-priced and unshipped until org accounts / cross-artist analytics / bulk ops
exist; never describe the old $99 Label as a current plan.

## 2026-07-31 - SMS removed entirely; a real support system ships

(1) SMS REMOVAL (founder decision: the A2P 10DLC compliance cost was not worth it). Deleted:
`src/lib/twilio.ts`, all `/api/sms/*` routes (send, webhook, status, provision, upload),
`/api/cron/sms-reset` and its vercel.json cron, `/api/admin/twilio-health`, the `SmsSetup`
component, the SMS tab in the Fan CRM (AudienceTab), SMS limits in `platformTier.ts`, SMS
mentions in the tier upgrade emails / PlatformTierModal / PlatformBilling / worth page, the
SMS consent checkbox on lead capture, the fan SMS marketing toggle, and Terms §13 (SMS
Messaging Program) plus the privacy policy's Twilio mention. The DB tables
(`artist_phone_numbers`, `sms_subscribers`, `sms_consent_log`) were NOT dropped: they keep the
historical consent records, but nothing reads or writes them. Hot-lead call-request alerts to
the founder are now EMAIL always (joshn.wms@gmail.com), plus an optional carrier email-to-SMS
gateway via `FOUNDER_ALERT_SMS_EMAIL` (plain Resend email, no Twilio). `TWILIO_*` env vars are
dead; Twilio is no longer an integration. This also resolves by removal the old Twilio-inbound
webhook exposure and the LOW-3 quiet-hour drop finding, and moots the deferred-send-queue TODO.

(2) SUPPORT SYSTEM SHIPPED. `/support` is now a help center: search across the 14
getting-started guides, a link to /getting-started, a live chat, and the existing contact form
(which now CCs joshn.wms@gmail.com and accepts auto-captured context). The chat stores in
`support_conversations` + `support_messages` (migration `supabase/schema-phase2-support-chat.sql`,
PENDING until Josh runs it; the UI falls back to the form until then); the client reads via RLS
+ realtime, and ALL writes go through service-role API routes: `/api/support/chat` (user side,
session-auth) and `/api/admin/support-chat` (requireAdmin). AI answers come from DeepSeek
(deepseek-chat) with a knowledge prompt generated from the real guide content
(`src/lib/supportKnowledge.ts`, env `DEEPSEEK_API_KEY`). If the key is unset, the AI flags the
question, or the user taps "Talk to a human", the conversation escalates: status
`human_requested`, founder emailed a link to /admin?tab=support, where the new Support tab
(`SupportChatView`) lets the founder reply; replies email the user. A global bug-report widget
(`BugReportButton`, mounted in the root layout, hidden on auth/setup screens) shows a subtle
flag button bottom-right on every page and posts to `/api/support` with category Bug Report and
auto-captured page URL / user agent / user id. Announced via the one-time
`announce_support_chat` popup (2026-07-31) in the popup registry.

## 2026-07-31 — Purchase-level obligations and promise reminders: the calendar's last two organs

(1) PURCHASE-LEVEL FULFILLMENT (the spec's offer-level vs purchase-level rule, now complete):
`src/lib/purchaseObligations.ts`, called from the Stripe webhook's product-purchase handler
after the purchase row lands. A shipped product creates "Ship X to fan" (shipment, due +5
days); a scheduled experience creates "Schedule X with fan" (event, due +7 days); a digital
download creates NOTHING (no fake workload). Idempotent per purchase via metadata.purchase_id
(webhook retries safe), best-effort (never blocks the money path), artist-task only
(auto_create_fan_items false; the buyer already has their confirmation). (2) PROMISE REMINDER
DELIVERY: obligations always carried reminder_offsets ([7,3,1]) and nothing ever sent them.
`src/lib/promiseReminders.ts` now delivers: one loss-framed DIGEST email per artist per run
listing every promise crossing an offset today, deduped per (event, offset) via
metadata.reminded_offsets, paused/archived obligations never remind, artist email resolved via
auth admin. Piggybacked on the 6am scheduled-releases cron (Vercel Hobby allows no new
schedules), best-effort. sw.js v325.

## 2026-07-31 — Spec-gap sweep: the ladder they designed, segments they can target

Four gaps from the wizard spec closed. (1) LADDER PREFILL, the core "restore the business they
designed" promise: `src/lib/leadResults/ladderPrefill.ts` (pure + tested) shapes the artist's
own pre-signup tier edits (deliverable-draft t0-t3 values first, conversionPayload.ladder as
fallback, template filling every gap) and auto-claim returns it as `ladderPrefill`; the wizard's
ladder draft now carries a per-rung NAME, seeds from the prefill until the artist touches the
draft, renders custom names (with a "your Gold rung" hint), threads them through promise
planning ("serves your Day Ones members") and tier creation, and dedupes on custom name +
template aliases. (2) SEGMENT TARGETING: the campaign composer's contacts audience gained a
segment dropdown built from real contact tags with counts (patreon, patreon-tier:X), stored as
`filters.contactTag`; the contacts sender narrows with `.contains('tags', [tag])` under the SAME
consent rules, making per-tier Patreon invites real. (3) PLAN INTRO now shows the plan's
substance: their model line (their names/prices or stock), the honest recurring workload, and
the launch timeline. (4) CADENCE/TITLE PROPAGATION: syncTierObligations updates an existing
obligation's recurrence and title when a benefit's config changes (future cycles follow; history
never rewritten). Still open, recorded in TODO: purchase-level obligation engine, reminder
delivery, OAuth import connectors, Share-to-Earn as a confirmable wizard component, same-day
high-effort spacing, warn-before-delete. sw.js v323.

## 2026-07-31 — Live-test sweep: nine onboarding findings diagnosed from production, seven fixed

Josh walked the full journey on a fresh account (lagoo); every item was diagnosed against live
data before any code moved. (1) STRIPE: Stripe said charges_enabled and the milestone/backfill
HAD landed, but 30 minutes late; verification is asynchronous and nothing reconciled until a
polling surface was opened. One shared reconciler (`src/lib/stripe/connectReconcile.ts`) is now
used by connect/status AND run by the roadmap route whenever an account exists without the
milestone. (2) SHARE-TO-EARN: the public page advertised `|| 10` percent while the payout pays
the real rate (default 0): rates are now real everywhere, the fan button hides when the program
is off, and the page OWNER sees a program-state pill (live at X% / turn it on) since the fan
button is invisible to them by design. (3) RAMP: "Build your four-tier ladder" stayed pending
after the wizard built it; `rampReconcile.ts` completes ramp events via the quest evaluator's
own checks before the calendar projects. (4) RISE XP: not a flag (quest_engine on) or a
regression; lagoo had 975 XP at level 4 but a null artist build, and the build picker replaced
the whole board. The progression header now renders above the picker. (5) POP-UPS: PopupDef
gained `announcedAt`; the engine skips announcements for accounts created on/after that date
(context now carries profiles.created_at). All five announcement/notice defs dated. (6) TOURS:
the cross-tab feel is the artist-page tour clicking its own in-page tabs (kept: content mounts
per tab) plus tour CHAINING (every surface auto-firing its first-visit tour in one session);
startTour now caps auto-starts to ONE per browser session, deferring the rest to later visits.
Stale copy fixed (community step now mentions channels; the home tour's dead replay anchor now
points at the real help button). (7) FAN IMPORT: the launch review's "Audience imported" row
gained an in-place "Import now" that opens the FanImportModal inside the wizard. Deferred with
reasons: per-quest $/month estimates (needs an honest estimate model, not invented figures) and
the full 20-file tour audit. sw.js v322.

## 2026-07-30 — Launch no longer re-asks for the business the wizard just built

Josh's live test caught a stale journey: pressing "Launch my CRWN" routed him into the restored
deliverable builder (re-confirm tiers/growth/experiences), then into the offer builder, whose
publish tried to create a DUPLICATE Silver tier and was blocked by the paid-tier cap ("Your plan
allows 3 fan tiers"), reading like a broken free-tier promise. Diagnosis: the cap is CORRECT
(Option-2 counting, paid tiers only, the free Bronze does not count; he already had his 3 paid
tiers live). The restored-builder destinations were designed BEFORE Launch Wizard Stages 2-3,
when the wizard did not build the ladder; now they re-build what exists. Fixes: (1)
`resolveJourneyDestination` takes `hasPaidTier` (resolved server-side in
/api/lead-results/post-setup-destination) and skips any restore whose end state is tier creation
(calculator prefills bound for /offers/new, and saved deliverables whose spec `continueRoute` is
/offers/new), landing on the Rise Mode command screen instead; non-tier restores (Own Your Fans
plan, missions, demand tests, live builder) still restore. (2) The offer builder's publish now
has a duplicate-name guard: a tier whose name already exists gets "edit it in Fan tiers and
pricing instead of creating it twice," never a twin and never a confusing cap error. Resolver
covered by new tests. sw.js v321.

## 2026-07-30 — Wizard polish from Josh's live test: no screen claims to show what it does not show

Two fixes from Josh walking the wizard with a real account. (1) The plan-restore intro showed
"Build your CRWN plan" under "From your CRWN Opportunity Calculator": a deliverable DRAFT row
(saved pre-signup by /api/opportunity-drafts) stores the spec's CTA as its `title` and
`result_data = {}` with the revealed number in `input_data.opportunitySummary`, and the seed
reader never looked at input_data. `rowToSeed` now reads input_data and, for draft rows,
surfaces the summary (never the CTA); both seed queries select `input_data`. The intro card
also gained a substance fallback for old draft rows with no summary. This fix flows to EVERY
seed surface (Rise banner, action plan, starter offer copy). (2) The ladder and promises
screens showed a bare "already set up, hit Continue" to returning artists, under headlines
promising a confirm/review. They now render read-only summaries of the REAL data: the artist's
actual tiers (name + price) and their actual active obligations (title, cadence, next due),
with "nothing will be duplicated" framing. Identity screens correctly stay skipped for
existing artists (never re-ask, never pre-fill the email-seeded name). sw.js v320.


## 2026-07-30 — Launch Wizard Stage 9: preview, publish, command screen. The wizard is COMPLETE.

The last stage. The wizard's end screen became `LaunchReview` ("Your CRWN launch system"): a
six-item completeness checklist (offers / Stripe / content / promises / audience / campaign)
where open required items carry a "Fix it" jumping back to the exact wizard screen and the
after-launch items say honestly where they happen; the previews, shaped by the setup gate (the
PUBLIC PAGE serves as the storefront + checkout preview opened as a fan, while the Promise
Calendar's next events and the roadmap's first milestone render INLINE because their routes
bounce ungated artists back to /setup); the share block; and one publish action, "Launch my
CRWN", which remains exactly the existing server-side completion (markComplete →
/api/artist/complete-setup → journey resolver; role promotion stays the server trigger). The
post-launch command screen is Rise Mode's top: RoadmapCard now renders the REAL numbers
(members, paying members, MRR against the artist's own calculator goal) and the next three
upcoming promises, from /api/artist/roadmap's new stats/upcomingPromises, above the current
stage and next milestone. Real counts only, never projections dressed as results. With this,
all nine stages of docs/ARTIST_LAUNCH_WIZARD.md are SHIPPED: restore the business they designed
→ make it operational → show the workload → prepare the audience → launch it. sw.js v319.

## 2026-07-30 — Launch Wizard Stage 8: the launch campaign composer (drafts only, ever)

The Campaigns view in the Fan CRM now opens with a Launch Kit panel. `src/lib/launchCampaign.ts`
(pure + tested) writes the whole launch from what the artist actually built: the announcement
email ("I built us a home") and the follow-up, a social caption, story copy, DM copy, the share
link, a segment suggestion (Patreon members first when the import tagged them), a 20-contact
test size, and a suggested send date (the coming Friday with two days of review runway). One
click creates BOTH emails as `campaigns` DRAFTS through the existing /api/campaigns route,
announcement preset to the contacts audience with the test group; the artist reviews them in
the existing composer and sends through the compliant contacts sender (attested + subscribed +
suppression + unsubscribe). Copy buttons cover the manual path. Also fixed a real wiring bug
from Stage 7: the import done-screen CTA and the roadmap's announce step deep-linked to
/campaign-hub, which is ROAD-TO campaigns; email campaigns live at /studio/fans, and both
links now point there. The sign-off name is guarded by isPresentableArtistName so an email
address never signs a launch email. No migration. sw.js v318.

## 2026-07-30 — Launch Wizard Stage 7: the fan import hub, with the Patreon on-ramp

The Fan CRM's import modal became the fan import hub, and the TODO's chosen wedge (Patreon
on-ramp option (b)) is built. The first screen asks "where are your fans right now?": a Patreon
card carrying the exact export path (Audience → Relationship Manager → Download CSV) and an
any-CSV card (Mailchimp, Shopify, Gumroad, spreadsheets) that keeps the existing column-mapping
flow. A Patreon export is AUTO-recognized by `src/lib/patreonImport.ts` (pure + tested:
detection, status/pledge/tier parsing, closest-CRWN-tier suggestion with free→front-door and
ties-break-cheaper rules). The review step shows active vs former patrons (active-only default;
former import tagged `patreon-inactive` for win-back), and each Patreon tier's member count
with where it lands on the artist's ladder. Members import with `patreon` and
`patreon-tier:<name>` tags so campaigns can target each group separately. Consent unchanged
and central: the same versioned attestation gates the import, and the done screen hands off to
Campaign Hub, whose contacts audience only ever sends to attested, still-subscribed contacts
through the suppression-gated sender. Import never messages anyone by itself. No migration.
sw.js v317.

## 2026-07-30 — Launch Wizard Stage 6: the personalized artist roadmap, as a view over the Quest Engine

Every artist now has a 5-stage execution roadmap (Foundation → Private launch → Audience launch
→ Deliver and retain → Expand, ~21 steps) that answers "what do I do next?", surfaced as
`RoadmapCard` at the top of Rise Mode: current stage, ONE next milestone with a prefetched deep
link into the surface where the action happens, overall progress, and the full five stages on
expand. The design rule that mattered: this is NOT a second progression system. Steps reference
EXISTING Quest Engine DomainChecks by exact name, and `/api/artist/roadmap` evaluates them
through the evaluator's own `evaluateCondition` with a minimal synthetic instance, plus three
Promise Calendar facts the evaluator lacks (promises scheduled / first delivered / nothing
overdue). Derived on read, stored nowhere (deliberate deviation from the spec's "store
per-artist": the house derive-from-live-data pattern cannot go stale), so the roadmap can never
tell a different story than the quests, and XP keeps flowing only through the Quest Engine.
Personalized where CRWN has real data: share steps deep-link to the artist's public page, and
the Expand MRR milestone is the monthly figure from their own claimed calculator (default
$500/mo). Weekly availability and platform inputs are NOT used because CRWN does not collect
them. Pure structure + assembly tested in `artistRoadmap.test.ts`. No migration. sw.js v316.

## 2026-07-30 — Launch Wizard Stage 5: minimum viable content, with the catalog path

The wizard's music group now opens with a `content-plan` decision screen: one featured track
(the fastest minimum, unchanged single path, starts free), the full catalog, or an explicit
loss-framed "I'll add music later" escape that jumps the group. The catalog path mounts the
EXISTING dashboard `BulkUploadForm` inside the wizard, exactly per the spec's "reuse existing
systems, no onboarding-only media system": multi-file queue, per-track tier access and one-time
prices (real `allowed_tier_ids` gating against the tiers the wizard just created), cover art,
per-file progress, and the Artist Agreement consent line. The audio screen wears catalog copy in
bulk mode, the track-title screen is skipped on that path (titles come from file names), Continue
unlocks from the DB the moment tracks exist, and bulk completion fires the `first_track_uploaded`
activation milestone the single path already fired. This is the wedge for the 40-300-song ICP:
the deep catalog lands behind the Gold tier the artist just confirmed. The wizard is now 12
screens. sw.js v315.

## 2026-07-30 — Launch Wizard Stage 4: Stripe connect moved into the wizard

The wizard now surfaces Stripe at the right moment: a `stripe` screen right after the promise
review (monetize group). Understanding-first per the spec: the artist has just confirmed the
model and its workload, so "Connect Stripe so fans can purchase your offers and you can receive
payouts" finally has context. `/api/stripe/connect` accepts a validated same-site `?returnTo=`
for its account-link refresh/return URLs (wizard passes `/setup`; everything else keeps the
dashboard default), and the wizard's resume effect restores the EXACT `stripe` screen on
`?stripe=success|refresh` instead of running the first-incomplete scan. Verification stays
server-side: the screen only re-hits `/api/stripe/connect/status` (live `accounts.retrieve` +
tier-price backfill; the response now includes `payoutsEnabled`) and renders one of three
states: connected (charges enabled, payouts enabled-or-verifying), under review ("Check
again"), or not connected (Connect button + loss-framed skip note). The screen NEVER blocks
Continue, preserving the design rule that Stripe is required to take money, not to see the
recommendation or finish setup. The wizard is now 11 screens. sw.js v314.

## 2026-07-30 — Launch Wizard Stage 3: the benefit→obligation generator and the promise review screen

The wizard now shows the WORKLOAD before it creates anything. A new pure module
`src/lib/promisePlan.ts` is the one benefit→obligation brain, shared by the wizard's new
`promises` review screen and the server sync (`tierObligations.ts` consumes it): promise
detection, cadence/title/first-due-date read from benefit config, DEDUP (the same promise on
several tiers is ONE obligation, tracked in `metadata.merged_tier_ids` and re-anchored if the
anchor tier drops the benefit), INHERITANCE (Gold's monthly Vault unlock carries
`serves_higher_tiers`, so the one obligation also serves every higher tier via
`metadata.serves_tier_ids`, refreshed on every sync so wizard creation order converges), and the
recurring-workload model (`estimateMonthlyWorkload`, the full ladder is "about an hour a
month"). Fan-side eligibility (`calendarProjection.fanEligibleForObligation`) and the
promise-fulfilled fan notify now honor `serves_tier_ids`, so a Platinum member actually sees and
gets Gold's inherited promises. The wizard's monetize group is two decisions: confirm the MODEL
(`ladder`) then confirm the SCHEDULE (`promises`, where the create now runs); cadence
(shared `OptionSelect`) and first-due-date adjustments ride into `applyTemplateTier` as
`benefitConfigOverrides` → each benefit's config (`frequency`, `first_due_at`). Stage 2
leftovers landed: the ladder screen shows estimated buyers per rung from the artist's own
calculator (`tierProjections` on auto-claim, matched by current/legacy names) with loss-framed
attribution. Pure logic tested in `src/lib/promisePlan.test.ts`. No migration (metadata jsonb
only); the wizard is now 10 screens. sw.js v313.

## 2026-07-30 — Launch Wizard Stage 2: the wizard confirms the recommended model

The wizard's Monetize group stopped asking the artist to hand-build one free tier
(tier-name/tier-price/tier-benefits) and became a single `ladder` confirm screen: Bronze free
(always applied) plus Silver/Gold/Platinum with inline price editing and per-rung "Drop this
tier"; benefits expand in place and the Gold/Platinum fulfillment notes show what the artist is
committing to. The apply logic was extracted from Rise Level 3's `TierLadderTemplate` into
`src/lib/applyTierTemplate.ts` and BOTH surfaces now use it, so tier creation and Promise
Calendar seeding (via `/api/tier-benefits` → `syncTierObligations`) cannot drift. Retry-safe via
name/alias dedupe; the wizard is now 9 screens. sw.js v312.

## 2026-07-30 — Launch Wizard Stage 1: the wizard restores the pre-signup plan

Josh specced the full Artist Launch Wizard (restore plan → confirm offers → roadmap → Stripe →
content → Promise Calendar review → import fans → campaign → preview → publish → launch command
screen). The staged build plan, mapped stage-by-stage onto existing systems, is
`docs/ARTIST_LAUNCH_WIZARD.md`. Stage 1 shipped: `/api/lead-results/auto-claim` now returns the
claimed seed summary (toolName/headline/heroValue/estimatedMonthlyCents), and `/setup` opens with
a "Your CRWN plan is saved" intro for a brand-new signup with a claimed result (no artist row,
nothing typed), so signup reads as a continuation of the calculator, not a restart. The
profiles/artist_profiles policy-repair migration was applied and verified live the same day
(RLS insert 201, client profiles update 204, role freeze holding, email still revoked). sw.js v311.

## 2026-07-30 — /welcome retired; identity moved into the setup wizard; profiles UPDATE 42501 fixed

A real incognito signup (joshn.wms+onboardj) hit "Something went wrong saving your info" on
/welcome. Root cause: since `schema-phase2-profiles-column-privileges.sql` was applied
(~2026-07-23), the `profiles` FOR UPDATE policy's WITH CHECK subqueries read
`stripe_connect_id`, a column that migration revoked from `authenticated`; one forbidden column
42501s the whole statement, so EVERY browser-side profiles save (welcome, wizard photo, tour
completion, profile settings) silently failed. This is the same collision fixed once before on
`artist_profiles`. Fix: `schema-phase2-fix-profiles-update-permission.sql` moves the
is_active/stripe_connect_id/role freeze into a BEFORE UPDATE trigger (with an exemption for the
trg_promote_to_artist fan→artist promotion) and restores plain-ownership RLS. **Migration
pending Josh** (TODO.md P0).

Follow-up the same day: Josh's retest failed on the LINK screen ("Something went wrong creating
your page"). Second policy, same collision: the "Gated artist profile insert" policy on
artist_profiles subqueries the revoked `profiles.is_approved`, so the RLS INSERT 42501s
(reproduced against production with a throwaway user; permissions on policy subqueries are
checked at executor startup, so the artist_gate_enabled() short-circuit does not help). Fixes:
the identity route's artist_profiles insert moved to the admin client (ownership still enforced,
trg_promote_to_artist still fires), the wizard's photo save moved server-side too
(`POST /api/onboarding/avatar`, URL restricted to the caller's own avatars folder), and the
migration was extended to rebuild the INSERT gate on a SECURITY DEFINER helper
(`user_passes_artist_gate`). The full RLS surface of onboarding was probed live with a throwaway
user: tier, track, and product inserts and the avatars/audio storage uploads all pass; the daily
canary will alarm (correctly) until the migration runs. sw.js v310.

Independently of the migration, onboarding was restructured per Josh's ask: the /welcome page is
retired (route now redirects to /setup). The wizard gained two leading identity screens
(artist-name with a "Continue as a supporter" escape, artist-link), saved server-side by
`POST /api/onboarding/identity` (admin client for the profiles write, so it works pre-migration;
user-session client for the artist_profiles insert, so the canary-guarded RLS publish path stays
real, and the welcome email now sends once with the chosen name). Phone is no longer collected.
All entry points (signup, login, /verify, (main) gate, journey resolver, quest destination
registry, onboarding-reminder email) now point at /setup; `slugify` moved to `src/lib/slugify.ts`;
`setup` added to reserved slugs; sw.js bumped to v309.

## 2026-07-30 — Stock tier ladder renamed to Bronze / Silver / Gold / Platinum

The recommended four-tier ladder shipped under invented names (The Wave / Inner Circle / The
Vault / Throne). Fans had to learn what those meant before they could rank them. Bronze / Silver
/ Gold / Platinum is a ladder every fan already knows on sight, so the ordering does the selling.

Prices, keys, benefits and math are unchanged: free / $10 / $25 / $100, keys still
`wave | inner_circle | vault | throne`. Only the display names moved, everywhere the platform
builds tiers on an artist's behalf: `tierTemplate.ts` (`RECOMMENDED_LADDER`, the source of
truth), the setup wizard's free entry point (`DEFAULT_TIER_NAME`), the Rise Mode Level 3 ladder,
`/worth` (tiers, waterfall, mocks, prefilled builder), the calculator result email, the unified
opportunity model + adapter, `postSetupDestination` fallbacks, the vault planner's seeded tier,
the `/offers/new` goal templates, and the getting-started guides.

Each rung now carries `legacyNames`, and `TierLadderTemplate`'s "already added" check matches
those too, so an artist who applied the old ladder is never offered a duplicate tier. The quest
evaluator recognizes the free tier by `price = 0`, not by name, so it was unaffected.

"The Vault" survives as a FEATURE name (the Vault Revenue Planner, the monthly vault unlock, the
artist's private archive). It is no longer a tier name: the vault lives in the Gold tier.

Not renamed, deliberately: the `inner_circle` **fan role** in `quests/fanRoles.ts` (a different
concept from a subscription tier), and the m3rcey test artist's real tier rows in
`seed-demo-data.sql`.

## 2026-07-30 — The Tier 1 launch journey: qualified call requests, consent-attested fan import, and first-fan invites

The calculator-to-launch spine existed end to end (unified calculator → editable pre-signup
builder → save boundary → auto-claim → setup → prefilled `/offers/new` → Stripe backfill →
public page). What was missing was everything around it for the fragmented-stack ICP: a way for
a hot lead to raise their hand, a consent-honest on-ramp for the fan list they built elsewhere,
a way to actually invite those fans, and a funnel that reaches the first dollar.

**Qualified immediate-call requests (net-new).** The unified calculator's `proof` step now asks
the 40% question (`monetization_status`, one tap), matching every loss tool. A `CallRequestCard`
below the pre-signup builder (never before it) collects a callback number and explicit,
versioned consent (`src/lib/acquisition/callRequest.ts`). `POST /api/lead-magnets/call-request`
sanitizes the calculator answers against the tool's own definitions, recomputes qualification
through the canonical `scoreLead` (client bands are never read), claims idempotency on
`acquisition_events` (one per phone per day, insert-as-claim), and for `sales_priority` leads
only sends one SMS to the server-only `FOUNDER_ALERT_PHONE` via the existing `sendSms`, with an
email fallback to the founder. The whole CRM record (consent, qualification, answers, alert
status, manual contact status) lives in the claim row's `response_snapshot`, surfaced in
`/admin` → Acquisition → Calls with a status dropdown (`set_call_request_status`). The public
response is uniform so the endpoint cannot probe the scoring model. 18 new tests.

**Consent-attested fan import.** `/api/fan-contacts/import` (which already existed,
contradicting `docs/ICP.md`; the doc is corrected) now requires an explicit permission
attestation (`src/lib/fanImportConsent.ts`, versioned), stores `consent_attested_at` +
`consent_attestation_version` on each row (PGRST204-fallback keeps imports working
pre-migration), and records the `fans_imported` funnel stage. `FanImportModal` renders the
attestation checkbox and blocks import without it.

**First-fan invites through the EXISTING campaign sender.** `campaigns.filters.audience =
'contacts'` resolves recipients from `fan_contacts` (attested + still subscribed + not globally
suppressed), supports a small-test-group cap (`testCount`), sends via the same
`campaignEmail`/unsubscribe/pixel rails, and records `fan_invited`. `campaign_sends` learns
nullable `fan_id` + `contact_id` (migration `schema-phase2-fan-invites.sql`, with a recipient
CHECK); the unsubscribe route flips `fan_contacts.is_subscribed_email` for contact sends; the
cron sender refuses scheduled contact campaigns so the wrong audience can never resolve.
Pre-migration, the whole invite path returns a clean "not available yet" error.

**The funnel now reaches money.** `FUNNEL_STAGES` grew from fifteen to twenty:
`call_requested`, `stripe_connected` (written in `/api/stripe/connect/status` when
charges-enabled, deduped per artist), `fans_imported`, `fan_invited`, `first_paid_conversion`
(written in the Stripe webhook handlers on the first subscription or product sale, deduped per
artist). The unapplied `schema-phase2-funnel-events.sql` was updated in place and
`schema-phase2-funnel-events-journey-stages.sql` widens the CHECK for an already-applied table.
The funnel_events migration had silently dropped off TODO.md while CHANGELOG called it unrun;
both founder items are restored.

**Launch transition.** The `/offers/new` done screen becomes the post-publish launch step:
"now choose who should see it first" (import CTA, small-test-group invite CTA via
`/studio/fans?view=compose&audience=contacts`, copy launch link), plus "Connect Stripe so fans
can purchase this offer" whenever the status check answered that charges are off for a paid
offer. `AudienceTab` accepts `?view=` deep links; `CampaignComposer` gained the binary
fans/contacts audience toggle.

**Migrations applied same day (2026-07-30, verified via anon-key probes):** `funnel_events`
exists, `fan_contacts.consent_attested_at` exists, `campaign_sends.contact_id` exists, and
`prospect_nurture_enrollments` exists, so the invite path, the 20-stage funnel AND prospect
nurture are all LIVE. The products-physical CHECK migration was run in the same session
(founder-confirmed; not externally probeable). Remaining founder item: set
`FOUNDER_ALERT_PHONE` in Vercel (email fallback active until then). Deliberately NOT built:
OAuth contact imports (Mailchimp/Google/Patreon APIs), inbound SMS, any change to Stripe
fees/payouts, any new broadcast system. Build clean, 427 tests pass (18 added), sw.js bumped
to v297.

## 2026-07-30 (latest) — Two "done" items were not done: test artists still existed, and the Resend webhook was never registered

Verifying founder-completed items caught two real gaps, both now closed or filed.

**The two onboarding test artists still existed.** The SQL-editor deletion had hit a foreign-key
error and stopped, leaving both `auth.users` rows and their profiles live. Deleted properly via
the admin API after clearing the blocking rows (`sequences`, `abandoned_checkouts`,
`sequence_enrollments`), each scoped to those two ids. Verified: profiles and artist_profiles
gone, the real `m3rcey` account untouched.

**`FOUNDER_ALERT_PHONE` is live, and the hot-lead SMS now sends (resolved same day).** The first
end-to-end test (CLAUDE TEST) scored `sales_priority` 74, deduped, reached the admin Calls tab,
and failed at the SMS hop with *"The 'From' phone number provided (+13145573549) is not a valid
message-capable Twilio phone number for this destination"*, delivering by email fallback instead.
Twilio's message blames the number, so the first fix I proposed sent Josh chasing number
capabilities, trial mode and A2P 10DLC. Querying the Twilio API directly gave the real answer:
**error 20008, the configured credentials were Twilio's TEST pair**, which by design refuses any
real from-number (a send from the magic test number +15005550006 was accepted, proving it). Josh
swapped in the live Account SID + Auth Token, and a second test produced message SID `SMde98c…`
with no error and no fallback. **The sender number never needed changing**; the live account owns
it. `sendSms` now special-cases 20008 so this failure states its own cause instead of misdirecting
the next person.

**🔴 The Resend webhook was never registered in the Resend dashboard.** Josh could not find it
because it does not exist. The route is live and correctly fails closed (403 on an unsigned
POST), but the only row in `email_suppressions` is the July security test's
`victim@example.com`, proving no real event has ever arrived. **Hard bounces and spam complaints
have therefore never been suppressed in production**, while prospect nurture is live sending up
to 25 emails per lead over 12 months. Filed as the P0 item with exact create-and-configure
steps. `10-INTEGRATIONS.md` corrected (it still described the signature gap as open, and said
nothing about registration). The general lesson is recorded there: **a correct, deployed,
signature-verifying webhook proves nothing about whether the provider is calling it. Look for
received data, not for code.**

## 2026-07-30 (later) — Founder-list sweep: ramp verified live, bespoke calculator hero, real tiers in the artist context, Terms notice

Josh delegated the open TODO decisions. Executed: **revenue ramp verified end to end in
production** (promise-calendar tables probed, then `seedRevenueRamp` run for `m3rcey` via the
real lib with the service role: 31 steps seeded, 0 skipped); **bespoke hero** for the
opportunity calculator (`public/tool-opportunity.jpg`, charcoal + gold, artist 18-32, gold
threads converging to one point — reviewed before shipping; registry now points at it);
**`useArtistContext` fixed at the source** (tiers now come from `subscription_tiers`, not the
dead `artist_profiles.tier_config`; consumers of `ctx.tiers` no longer see an empty list);
**Terms notice shipped** as a once-ever, priority-10 banner (`notice_terms_2026_07_24`) because
Terms §1 promises notice of material changes. Decisions recorded: do NOT promote the unified
calculator to primary until `oyf-signup-timing-v1` concludes; the next on-ramp build is
**(b) Patreon member import** (over (c)), queued as a dedicated session. sw v298.

## 2026-07-29 — The conversion spine: from calculator result to "launch this, charge this, do this next"

The middle of the acquisition journey existed (claim, prefilled builders, post-setup routing) but
nothing ever told the artist WHAT to do: the homepage dropped all continuation context at its
highest-intent moment, and a brand-new artist landing on `/profile/artist` met a dead "Rise Mode is
on its way" placeholder. This ships the avatar-specific conversion spine for the ideal customer
(a proven direct-to-fan seller with audience traction who is not converting it into owned revenue).

**One deterministic starter-offer recommendation.** `src/lib/leadResults/starterOffer.ts`
(`starterOffer@1`, 17 tests):

- `buildStarterOffer(input)` is pure: claimed seeds + account state (paid-tier count, free tier,
  track, Stripe, plan) in, ONE offer out: kind, name, integer-cent price, audience, benefits,
  fulfillment burden, why, what is missing, three next actions, and a prefilled builder link that
  returns to Rise Mode. No LLM, no new tables, no writes.
- Prices come from the seed's own `conversionPayload` when the calculator modeled them, else from
  `RECOMMENDED_LADDER` in `tierTemplate.ts`, so there is no third copy of 1000/2500/10000.
- One monthly figure per recommendation via `monthlyCentsOf` (max semantics, never a sum across
  tools). Share-to-Earn and missions are labeled acquisition for the same membership, never a
  second income. Vault carries a "do not count it twice" note.
- Pro gating honored: producer-session and live seeds on Free fall back to the membership with a
  plain constraint note; the upgrade is never the first outcome.
- Low confidence (no seed, score-only tool) recommends the smallest testable offer, not a menu.

**Surfaces.** `GET /api/starter-offer` (session-authed, artist resolved server-side, Stripe status
read only through `connectAccount.ts`) feeds `StarterOfferCard`, which now renders in Rise Mode's
flag-off slot on `/profile/artist` ("Based on what you told us, start here", primary CTA "Finish my
offer", secondary "Preview what fans will see"). Falls back to the old placeholder on any failure.
Emits the existing `recommended_action_viewed`/`recommended_action_started` journey events; no new
event names, no new analytics sink.

**The homepage stops dropping context.** `WorthExperience` now renders the result-to-builder
continuation on the homepage too (it was `!homepage`-gated): saving the draft routes through
`buildContinueUrl('worth', token)` so signup receives the result token. The hero subline now
promises the outcome: "...get the exact offer to launch, what to charge, and what to do first."
`ConvertToFeatureButton` now calls `buildContinueUrl` instead of rebuilding the URL inline.

Three defects fell out of the audit and are fixed or filed:

- **`TierManager` truncated cents** (`parseInt("9.99") * 100` = $9.00) on tier create AND update;
  both now `Math.round(parseFloat(...) * 100)`.
- **The prospect-nurture cron wrote a `completed_at` column that does not exist**, so a finished
  enrollment could never leave `active`; the phantom field is removed (status/exit_reason carry it).
- **`products` CHECK constraints never allowed `physical`/`shipped`** though the setup wizard, the
  offer builder, and ShopManager all write them; corrective idempotent migration
  `supabase/schema-phase2-product-type-physical.sql` (self-verified), filed in TODO.md P1 together
  with the two prospect-nurture migrations that were promised in TODO.md but never actually added.

Deliberately NOT done: no new onboarding screens (refinement happens in the already-editable
prefilled builder), no Quest Engine changes (still dark), no `/welcome` name prefill (the blank
field is a deliberate guard against legal names leaking as public artist names), no new nurture
system (the built-but-dark 11-email sequence already personalizes per calculator).

## 2026-07-29 — The unified Opportunity Calculator: one model, nothing counted twice

Seventeen calculators each modeled one opportunity honestly. Run together they were dishonest,
because they were all built on the same audience and most of them resolved to the same dollar. At
500,000 followers their own published formulas sum to about **$550,835/mo and 23,500 paying people**,
against a following of 500,000 and a repo audience model that says only 2,250 of them ever pay for
anything. The vault tier alone claimed more payers than the entire membership model. An artist planning
against that number plans a business that does not exist.

**The new tool does not add them up.** `/tools/opportunity-calculator`, model
`src/lib/opportunity/unifiedModel.ts` (`unifiedOpportunity@1`):

- **One normalized audience.** `max(followers, listeners, owned)`, never a sum, because nothing in
  this repo can say how much two platforms overlap. Owned contacts are folded in by
  inclusion-exclusion (owned are fully reachable, the rest at `reachRate`), so addressable can never
  exceed the audience. Where the overlap is genuinely unknown, the result says so.
- **One unique paying-supporter count.** Every recurring dollar is the ladder applied ONCE to it.
- **The vault is a TIER** (Gold, $25, the middle rung of `RECOMMENDED_LADDER`), not a second membership.
  Standalone only when explicitly configured, and then it replaces a rung rather than adding one.
  Not recommended at all below five unreleased pieces.
- **Share-to-Earn and Clip-to-Earn are acquisition, not revenue.** Clips are a capped LIFT on the
  conversion of the audience the artist already has. Sharing is the one mechanism reaching people
  from outside, so it adds heads, but those heads join the same ladder at the same prices. Both
  appear only as a supporter and attribution split; `organic + clip + share == payingSupporters`.
- **A fan may hold two roles; a person is counted once.** `uniquePromoters = sharers + clippers -
  both`. The overlap question is asked only when both systems are live, and falls back to a
  documented default.
- **Incremental purchases sell only to non-members.** Members already have the live in their tier,
  so no member is also counted as a ticket buyer. A session that is a top-tier benefit earns
  **zero** on its own; a hybrid counts only the extra seats. This disjoint-population rule is what
  makes the total provable: every dollar is paid by a member or a non-member, never both.
- **Recurring and one-time stay separate**, gross is never mixed with net, the fee is applied once,
  commission only on the attributed slice, and current direct revenue is **subtracted**, never
  added. Headline is a conservative-to-high **range**.
- **82 tests** (`unifiedModel.test.ts`, `unifiedFunnel.test.ts`) assert every one of those, plus that
  the unified total stays below half the naive sum.

Around the model: an 11-screen branching wizard (the overlap question renders only when the artist
has both sharers and clippers; session structure only when they will go live; a step whose every
input is branched away is skipped rather than shown empty), `?from=<tool-slug>` entry contexts that
reorder the wizard for a single-opportunity video **without changing the model**, a coordinated
`system` builder that prefills the whole business (ladder, Vault placement, both growth systems,
the experience, the launch order) and re-runs the model via `recalcUnified.ts` the moment an edit
changes the structure, and a compact signup boundary carrying the range, the plan preview and a
one-line overlap disclosure.

**Additive and reversible.** No migration, no feature flag: it is an 18th entry in the existing
lead-magnet registry, so it inherits the tool page, capture, tokenized result, email, prospect
nurture, draft claiming and the journey resolver. All 17 individual calculators are untouched and
verified still working. Promotion is deliberately `secondary`, because Own Your Fans is `primary`
AND is the assigned experience of the running `oyf-signup-timing-v1` experiment.

Two fixes fell out of the work and apply beyond this tool:
- **`resultVersion` is pinned** in the funnel overlay. Defaulting would have stamped it
  `lossResult@1` and pooled its analytics with sixteen other tools, the same mislabelling the
  royalty overlay exists to prevent.
- **The analytics server allowlist is now DERIVED** from `ALL_OPPORTUNITY_EVENT_NAMES` instead of
  hand-copied in `/api/lead-magnets/analytics`. The two lists had drifted apart by hand, so adding a
  client event left the server silently dropping it: a 200 response with the row never written.

### Brain package audit, same day

Answering "is the brain up to date" honestly meant auditing all 20 docs against the code rather than
just the three the feature touched. It was not up to date, and two findings predate this work:

- 🔴 **The fee docs contradicted each other, in the direction that misquotes an artist.**
  `01-PRODUCT-VISION.md` stated the founding-artist flat **5%** override as live and `Confirmed`,
  and `16-GLOSSARY.md` + `CRWN-BRAIN-QUICK-CONTEXT.md` repeated it, while `07-BUSINESS-RULES.md`
  correctly said it was retired. Read the code: `getArtistFeePercent()` returns the tier fee, full
  stop, nothing writes `is_founding_artist`, and no production row ever carried it. An agent loading
  the vision doc or either context pack would have quoted a discount that does not exist. All three
  corrected against the code.
- **"Zero automated tests" was repeated in six places** (`00-START-HERE`, `04-ARCHITECTURE`,
  `09-CODING-CONVENTIONS`, `12-ENVIRONMENT-AND-SETUP`, `15-AI-AGENT-INSTRUCTIONS`,
  `CRWN-BRAIN-COMBINED`) plus `13-CURRENT-STATE`. Vitest is configured and `npm test` runs 392 tests
  across 23 files. Corrected everywhere, **with the limit stated**: coverage is the pure business
  layers only, there is no component/integration/e2e test, so `npm run build` is still the gate for
  everything the suite does not reach. Also recorded that `npm run lint` is NOT a gate (~635
  pre-existing errors), which no doc had said.
- **Counts were stale by a third or more.** Actual: 241 API routes (docs said ~190), 134 migrations
  (117), 115 pages (~89). Fixed in every doc that quoted them.
- **The 18th tool and the `/tools` routes were missing** from `06-ROUTES` (which did not mention
  `/tools` at all), `16-GLOSSARY`, `18-SOURCE-MAP`, and both single-file context packs. Added, along
  with a new **§14 Opportunity modelling rules** in `07-BUSINESS-RULES` so the overlap rules sit
  where an agent actually looks before touching money copy.
- Commit refs on the three docs that carry one now point at `86e3e8c` instead of `614b958`/`38186b1`.

Lesson worth keeping: the same fact was duplicated by hand across up to seven docs, so one code
change left six of them lying. That is the documentation version of the analytics allowlist bug
fixed in this same commit. Prefer one doc owning a fact and the rest linking to it.

## 2026-07-27 — Flagship calculator polish: wizard entry, above-fold CTA, signup continuation, four campaigns

Final UX pass on the three flagship funnels so they feel like one product.

- **Streaming Loss now opens as a wizard** (Issue 1): cold `/worth` asks listeners, then followers,
  then streaming revenue, one screen at a time via the shared `Wizard` with a sticky CTA. Scoped to
  the calculator view: the homepage keeps its instant-number marketing behavior and a personalized
  lead link still arrives with the numbers filled in. After the reveal the full inputs card returns
  below, so live re-calculation and the presets are preserved.
- **CTA immediately under the result** (Issue 2): `/worth` renders the shared `ResultToBuilder` card
  right below the result, above the derivation, scrolling and focusing the builder. The tool pages
  already had this in the result hero.
- **Signup is a continuation, not a restart** (Issue 3): new `DraftContinuation` reads the anonymous
  draft through the EXISTING public capability route and renders, above the form: the opportunity
  they uncovered (stored as `opportunitySummary` on the draft) and a list of what they already built
  (four tiers, four campaigns, or the deliverable's own items), then the builder-specific reason.
- **Four Share-to-Earn campaigns** (Issues 6 and 7): one per canonical tier, each with a pre-written
  message, a copy button, and inline help describing what that tier actually includes, so an artist
  who skipped Streaming Loss still knows what they are sharing. `saveLabel` is now "Save my campaigns".
  **Share links are NOT fabricated**: referral links are `/[slug]/r/[code]` and need an artist slug
  plus a referral code, so the card states the link is generated with the account. Referral economics
  untouched.
- **Marketing tour removed from the calculator funnel** (Issue 8): 12 sections (storefront, go live,
  clip army, community, own your audience, independence, AI manager, payouts, analytics, sync, and
  the rest) are now gated to `homepage`. `/worth` keeps only calculator support: where the number
  comes from, the setup that captures it, what the CRWN app is, streaming vs direct, the fan math,
  FAQ, how it works, and the disclaimers.
- Issues 4 and 5 were already shipped in v282 (four prefilled canonical tiers; generated launch copy)
  and were verified rather than redone.
- Tests: 285 pass. Build clean.


## 2026-07-27 — Builders that feel already built: four-tier ladder, sticky CTA, signup context

The builders existed but still asked artists to do the work. Now the artist arrives at something
already built, and signup reads as "save what you built".

- **Streaming Loss now builds the FULL four-tier ladder** (was one tier, which broke continuity with
  the result that shows four). Names, prices and benefits come from `RECOMMENDED_LADDER`
  (`src/lib/tierTemplate.ts`) — the SAME canonical ladder Rise Mode Level 3 and the Tier Manager
  apply — so nothing is invented: The Wave (free) / Inner Circle / The Vault / Throne. One tier per
  Wizard step, then a ladder preview. Prices prefer the calculator's own modeled ladder, falling back
  to the template. `deliverableType` is now `membership_ladder`.
- **New `ladder` preview kind** renders all four tiers with prices and benefit lists.
- **Above-the-fold CTA:** `Wizard` gained an OPT-IN `stickyFooter` prop (default off, so `/setup` and
  every other caller are untouched). Both pre-signup builders enable it, so the primary action is
  always reachable without scrolling a long step.
- **Benefit-driven save CTAs:** Save my membership / campaign / session / Vault / test / experience /
  mission / page / calendar / journey / leaderboard / action plan / founding offer / scenario / plan,
  and Own Your Fans is now "Save my fan system". Configurable per spec, never hardcoded in components.
- **Builder-specific signup context:** new `signupContext` per spec, rendered on `/signup` from the
  existing `?tool=` param ("Create your account to save your membership system and publish it inside
  the CRWN app"). Read-only banner; no auth behavior changed. Every tool's reason is unique.
- **Share-to-Earn no longer starts blank:** the offer is an `OptionSelect` of the canonical ladder
  tiers (reusing `tierTemplate`, not a second tier source), plus prefilled sharing instructions, a
  plain-words referral explanation, and a launch message. Referral economics untouched.
- **Section audit (second pass):** the result-to-builder path was already minimal after the previous
  correction (result -> transition -> builder on the shared template; result -> derivation -> builder
  on /worth). No further sections needed removing; supporting content stays below the builder.
- Tests: 282 pass (was 274), including canonical-ladder prefill, ladder preview integrity, save-label
  and signup-context contracts, and Share-to-Earn defaults. Build clean.


## 2026-07-27 — The builder is the CTA: universal page-composition correction

Founder-verified defect corrected: the builders existed but the pages kept their old conversion
architecture (a signup CTA embedded in the result hero on all 16 shared-template tools; on /worth
the builder sat below five marketing sections and multiple book-a-call CTAs).

**Root cause was ONE shared slot:** `PublicToolClient` rendered `LeadEmailCta` (email gate + gold
signup link) in the result's `afterHero`, before the builder, on every tool. Fixed at the shared
layer, not per page.

- **New page order (all 16 tools + OYF):** result -> `ResultToBuilder` transition (tool-specific
  "Build my X", scrolls to and focuses the builder, never navigates) -> BUILDER -> email-my-results
  (consent-carrying `LeadCaptureForm`, demoted below) -> explore link -> ToolShowcase -> CrwnShowcase.
  Nothing routes to signup before the builder; the save boundary inside the builder is the only
  identity ask.
- **Spec-driven transitions:** `transition` + `buildCta` added to every deliverable spec
  (`transitionFor`/`buildCtaFor` derive defaults). Founder-approved copy on the priority tools:
  Worth "Turn this estimate into an offer your fans can join." / Share-to-Earn "...a campaign your
  fans can share." / Executive Producer "Turn this opportunity into a session offer."
- **/worth reorder:** result -> derivation ("How we got to $X/mo") -> builder -> inputs -> email
  card. The misleading "Book a free 15-min call, keep this money" CTA is REMOVED; the two upper
  marketing PrimaryCTA blocks are homepage-only; exactly one optional help CTA remains, reframed
  "Need help setting this up? A 15-minute call, no pitch." Formulas and values untouched. The
  homepage (`homepage=true`) keeps its original marketing flow (it has no builder).
- **`LeadEmailCta`** gained a `secondary` mode (email only, no signup link) for remaining call sites.
- **Structural tests** (`pageComposition.test.ts`): source-order assertions for the shared template
  and /worth, CTA-copy contract (no signup/account/booking words, no em dashes), priority-tool
  transitions. 274 tests pass. Build clean. `sw.js` v281.
- **Known limitations:** the tokenized share page (`/tools/[slug]/result/[token]`) still uses
  `LeadEmailCta` in default mode (it has no builder; flagged for a follow-up); no real-browser
  visual verification (bundle + structural tests only); OYF experiment variants untouched.

## 2026-07-27 — Universal pre-signup deliverable: every public tool now builds something before signup

**Defect corrected.** The previous Opportunity Funnel phases delivered architecture plus ONE exemplar
(Own Your Fans). Verified in code: `ConvertToFeatureButton.tsx:42` pushed `/signup` for every public
tool, `PublicToolClient.tsx:256` branched to a builder only for OYF, and `/worth` linked to `/signup`.
So **16 of 17 tools ended in Result → generic CTA → immediate signup.** The founder's report was
accurate; prior reports described infrastructure, not the product outcome.

- **New `src/lib/opportunityDrafts/deliverableSpecs.ts`** — a data registry of the pre-signup
  deliverable for all 16 non-OYF tools (fields, steps, preview shape, save label, continue route).
  One registry, not 16 bespoke builders.
- **New `src/components/opportunity/DeliverableBuilder.tsx`** — the universal builder: Wizard steps,
  editable prefilled fields, a LIVE preview (offer card / page / plan list), and a
  planning-vs-publishing checklist. Renders for every tool with a spec.
- **CTA behavior changed**: `PublicToolClient` now renders the builder instead of the signup button,
  and `/worth` gained the membership-offer builder above its CTA. Signup is requested only at the save
  boundary, with expectation-matching labels ("Save my offer", "Save my plan", "Save my campaign plan").
- **Drafts generalized**: `POST /api/opportunity-drafts` + `GET|PUT /[token]` now serve any tool with a
  spec (spec-driven allowlist sanitizer, unclaimed-only, 30-day expiry). No migration: still
  `lead_magnet_results`.
- **Restoration**: new `/plan/[tool]` authenticated page restores the artist's OWN saved draft under
  RLS and continues into the real gated builder carrying their edits via existing `lm_*` params. The
  journey resolver gained `savedDeliverableTool`, which wins over a calculator-derived prefill.
- **Honesty rules enforced by tests**: prices are pre-filled only where the tool actually modeled one
  (Founder Window and Clip-to-Earn start empty); Team Splits is an explicitly NON-BINDING scenario;
  Royalty stays a checklist with no currency field and no collection claim; Quest Path is labeled a
  general order, not a personalized diagnosis; every preview carries a "not published yet" note.
- Tests: `deliverableSpecs.test.ts` + updated journey/onboarding tests. **265 pass** (was 230). Build
  clean. `sw.js` v280. **Known gaps are listed in the implementation report** (per-tool formula audit
  and browser screenshots were not completed in this pass).

## 2026-07-27 — Admin: filter Video/Campaign performance by tool

Small launch-support add: the admin Experiments tab's "Video and campaign performance" section now
has an `OptionSelect` to scope it to a single tool (e.g. show only the Worth videos vs the Share-to-
Earn videos). `experiment-analytics` accepts `?tool=<slug>`, applied ONLY to the video/campaign
aggregation (every other section stays global so its numbers are not distorted). Reads
`funnel_events.calculator`; no new data. Motivated by a launch driving ~26 videos across Worth,
Share-to-Earn, and Executive Producer, where per-tool video attribution matters more than A/B power.
230 tests pass, build clean, `sw.js` v271.

## 2026-07-27 — Admin variant-results readout (save vs preview, honest)

Added a "Variant results" section to the admin Experiments tab so the save-vs-preview outcome is
readable in the UI, not just via SQL. `experiment-analytics` now returns `experimentBreakdowns`: per
variant, distinct-aid `exposed` vs the `signup_completed` outcome + conversion rate, plus the shared
`compareRate` insight (sample sizes shown, no winner below MIN_SAMPLE=30, directional language, no
fake confidence). New tested pure helper `distinctAidByVariant`. Reached-builder is labeled honestly
(signup + onboarding complete, a consistent point for both arms). Build clean, 230 tests, `sw.js` v270.

## 2026-07-27 — Close the experiment loop: variant-attributed OYF outcome

Live smoke test confirmed assignment/exposure record correctly, but the experiment was not yet
READABLE: exposure rows are anonymous (aid + variant, no user_id) and nothing re-fired post-signup,
so a variant could not be tied to its outcome. Fixed minimally.

- New `recordExperimentOutcome(experienceKey, eventName)` in `src/lib/experiments/client.ts`: re-sends
  the persisted `crwn_aid` from an AUTHENTICATED surface; the track route re-derives the variant
  (never trusted) and stamps `user_id` from the session, deduped per browser + server-side.
- Wired into `src/app/(main)/own-your-fans/plan/page.tsx` (the post-signup OYF landing): fires
  `signup_completed` once on resume. This is a consistent point for both arms (signup + onboarding +
  reached the builder), so save-vs-preview conversion is now comparable per variant.
- Inert when no experiment runs. No migration. Full suite 229 pass, build clean, `sw.js` v269.
  Readout is a SQL query over experiment_events (exposed vs signup_completed per variant); a variant
  breakdown in the admin Experiments tab is a recommended follow-up.

## 2026-07-27 — Make oyf-signup-timing-v1 runnable (variant moves the signup boundary)

Closed the one gap that kept the first split test from being runnable: the OYF pre-signup builder now
HONORS its assigned variant. `recordExperimentEntry` already returned the server-derived variant;
`PublicToolClient` now reads it and passes `signupBoundary` to `FanCaptureBuilder`.

- New pure module `src/components/opportunity/fanCaptureSteps.ts` (`visibleSteps(boundary)`, node-tested):
  control `save` = full flow (goal -> copy -> capture -> preview, then sign up: max value before signup);
  `preview` = the save boundary moves one step earlier (sign up to see/keep the finished page; the
  in-wizard preview is deferred to the post-signup plan page, so nothing built is lost).
- Default is `save` (control), so with no experiment running NOTHING changes. Authenticated resume
  (plan page) always uses the full flow. Variant is derived server-side; the client only reads it.
- The experiment stays dark until the migration is applied, `admin_settings.experiments` is on, and
  `oyf-signup-timing-v1` is set to running. Tests: `fanCaptureSteps.test.ts` (4). Full suite 229 pass,
  build clean, `sw.js` v268.

## 2026-07-27 — Opportunity Funnel launch-readiness audit (small corrections only)

Final integration/security/attribution/experiment audit of the whole Opportunity Funnel system
(4 parallel audits + full test suite). Security came back with NO critical/high issues; analytics,
experiments, and product-language passed all critical checks (several exemplary). Corrections were
small and clearly justified; material/structural items were documented, not changed.

**Corrections made:**
- **Quest Path honesty (copy-only, HIGH):** `execute()` returns a FIXED result (score 68, fixed
  ranges) and never reads the two inputs, but copy implied a personalized path. Reframed to the fixed
  reality: `primaryCta` "See the right order", review subtitle "see the order most artists get wrong",
  flow "Get the proven order to build in", fix "ordered the way careers actually compound"
  (`leadMagnets/registry.ts`, `acquisition/toolAdapters.ts`). No formula, no output logic, no Rise
  Mode change.
- **Own Your Fans ownership language (copy-only, LOW):** the OYF result `cause` said "you own none of
  the people... you rent them"; changed to "you own none of your relationships with the people... you
  rent access to them" (owning the relationship/first-party data, not people; CLAUDE.md rule).
- **Royalty result version mislabel (MEDIUM):** the funnel layer emitted `lossResult@1` for
  `royalty-readiness-check`, but its adapter stamps `readiness@1`, so every royalty analytics event
  was mislabeled. Added `resultVersion: 'readiness@1'` to the overlay (`opportunityFunnels/registry.ts`)
  + a regression test.
- **Two stale test counts:** `ACQUISITION_TOOL_IDS` 5 -> 17 (all tools onboarded); `ALL_OPPORTUNITY_EVENT_NAMES`
  23 -> 32 (7 + 16 + 9 events). Both reflect legitimate growth; the `toContain` checks still hold.

**Confirmed safe (no change):** no ungated admin route (`requireAdmin` on every method); no
open-redirect bypass (`safeInternalPath`); cannot read/claim another user's draft (unclaimed-only +
verified-email-only + atomic `user_id IS NULL`); no PII/token leak; sanitizer allowlist; deterministic
whole-experience assignment (no mid-journey switch); exposure≠eligibility; projection (`revealed`)
shown separately from actual (`captured`, refund-netted), never combined; experiments cannot override
pricing/fees/ownership/RLS (prebuilt code, no dynamic JSON).

**Documented known gaps (no code change; several are honestly disclosed via `dataQuality`):** two
destination resolvers (`journey/resolveJourneyDestination` for post-setup, `quests/destinationRegistry`
for claim-time) share gate logic by copy, not extraction (drift risk); `funnel_events` rows are not
per-visitor stitchable (`anon_id` is a per-event id, no `user_id`) so only `experiment_events` links
anon->auth; `sourceVideoId` dimension relies on `utm_content` (no independent video id); subscription
cancellations/churn are not modeled in the opportunity ledger (refunds ARE netted); rate-limit keys on
the left-most `x-forwarded-for` hop (spoofable, all public routes); unclaimed anonymous drafts persist
to their 30-day TTL (cleanup query in the value-before-signup entry); the `/results/resume` fetch works
only by matching the `[id]` route's token branch (fragile); `funnel.resultRoute` is dead + inaccurate;
promotion is code-only (no `admin_settings` override wired yet).

**Deferred to founder (unchanged):** apply the three unrun migrations (`funnel_events`,
`opportunity_ledger`, `experiments`) and verify production state; flip `admin_settings.experiments`
to run an experiment; keep the sensitive tools deferred (Team Splits, Royalty economics, Clip/Share
economics, Live pricing, Quest/Rise Mode). Full suite 225 pass, build clean, `sw.js` v267.

## 2026-07-27 — Onboard Fan Mission + Proof of Demand onto the journey resolver (batch of 2)

Incrementally onboarded the next smallest coherent batch onto the shared Opportunity Funnel
architecture: **Fan Mission Generator** and **Proof of Demand Test Builder**. Both are
production-ready, non-financial, non-ownership tools that already have a real builder and a
`live_feature` conversion adapter; they were the only unmapped tools that fit every selection gate.

- **What changed:** two explicit cases in `buildDraftConfig` (`src/lib/leadResults/postSetupDestination.ts`)
  via a new `liveFeatureDraft` helper that routes to the tool's existing builder (`/missions/new`,
  `/proof-of-demand/new`) and prefills from the SAME conversion adapter the same-session flow uses
  (new `adapterPrefill` export in `conversionAdapters.ts`). So a claimed Fan Mission / Proof of Demand
  result now resumes into the right builder after signup instead of the dashboard fallback.
- **No formula, output, route, or economics change.** Result versions unchanged (1.0.0). The tools
  were already in the registry + funnel layer + shared analytics + admin reporting from prior phases;
  this only adds the post-signup resume path. Explicit per-tool cases (not a generalized live_feature
  branch) so economics-sensitive `bounty`/Clip-to-Earn is NOT auto-onboarded.
- **Deferred (documented, still a safe dashboard fallback, not a dead end):** Team Splits (ownership +
  legal), Royalty Readiness (dark, sensitive), Clip-to-Earn + Share-to-Earn economics, Live/Exec
  pricing, Quest Path (dark + fixed output), Founder Window (financial urgency), Fan Journey / Movement
  / Top Fan (no meaningful builder or partial feature).
- Tests: `src/lib/leadResults/toolOnboarding.test.ts` (17) + OYF/Worth no-regression. Build + lint pass.
  No migration, no frontend asset change (no sw bump).

## 2026-07-27 — One post-signup journey resolver (opportunity context survives signup)

An artist who enters through a specific problem now keeps that context after signup. ONE reusable
server-side resolver decides where they land, composing the pieces that already existed instead of
scattering routing conditionals or building a parallel onboarding system.

- **Resolver:** `src/lib/journey/resolveJourneyDestination.ts` (pure, tested). Ordering: no artist row
  -> `/welcome`; setup incomplete -> `/setup` (setup wins, never bypassed); a claimed calculator ->
  its real prefilled builder via the existing `buildDraftConfig` (Own Your Fans -> `/own-your-fans/plan`,
  Streaming Loss -> `/offers/new`); otherwise the dashboard (safe, never a dead end or a broken quest
  route). `safeInternalPath` validates `returnTo` (rejects `//`, schemes, backslashes, control chars,
  overlong) to prevent open redirects.
- **Rise Mode:** stays behind `admin_settings.quest_engine`. When ON it only APPENDS
  `returnTo=/profile/artist` (Rise Mode surface); when OFF, no returnTo and the destination is the
  normal builder. The global flag is never modified and no hidden setting is exposed.
- **Wiring:** `GET /api/lead-results/post-setup-destination` now builds the context server-side (own
  artist row + `setup_completed`, most-recent claimed seed, quest flag) and runs the resolver. The
  experiment variant is re-derived server-side from an optional `aid` (never trusted from the client),
  so experiment assignment is preserved into the restored builder (`lm_variant`). `/setup` passes the
  durable `crwn_aid`. The OYF plan page emits the personalized-journey events and routes the next best
  action to the ownership-gated `/studio/fans`.
- **Analytics:** 9 events (`personalized_journey_assigned`, `context_restored_after_signup`,
  `onboarding_context_viewed`, `recommended_action_viewed/started/completed`, `feature_activated`,
  `feature_published`, `next_action_viewed`) on the existing sink, sanitized, no PII/tokens.
- No `/welcome`/`/setup`/role-promotion/publishing/payment changes. No migration. Tests:
  `resolveJourneyDestination.test.ts` (13). Build + lint pass. Live `sw.js` v266.

## 2026-07-27 — Holistic experience experimentation foundation + experience analytics (dark)

A feature-flagged foundation to compare COMPLETE Opportunity Funnel journeys (Own Your Fans vs
Streaming Loss), plus a new admin Experiments tab. Ships dark: nothing assigns or exposes a variant
until the migration is applied AND `admin_settings.experiments` is on AND an experiment is set to
running. No experiment can ever change pricing/fees/Stripe/ownership/permissions/RLS/roles/revenue,
because experiment BEHAVIOR is prebuilt code, never remote JSON.

- **Code registry** `src/lib/experiments/registry.ts` (experiences, variants, prebuilt experiment
  configs; `toPublicExperiment` strips hypothesis/metrics before the browser). `assignment.ts`
  (deterministic FNV-1a assignment: pure, stable, holdout-aware, no mid-journey switching, re-derived
  server-side so a client cannot pick its arm). `anonId.ts` (durable non-PII `crwn_aid` cookie +
  localStorage; bot exclusion). `taxonomy.ts` (versioned event map; `opportunity_captured` = ACTUAL,
  `opportunity_revealed` = PROJECTION, `thirty_day_retention` marked unavailable, never invented).
  `metrics.ts` (every metric has a definition). `insights.ts` (directional, sample-sized, no causal
  claims, no fake confidence, no winner below MIN_SAMPLE=30).
- **Migration (UNRUN):** [supabase/schema-phase2-experiments.sql](../../supabase/schema-phase2-experiments.sql)
  creates `experiments` (operational state) + `experiment_events` (measurement sink; service-role
  write, admin-only read RLS, dedupe_key, indexes, self-verify). Listed in TODO.md.
- **Routes:** `POST /api/experiments/track` (public, flag-gated, rate-limited, server-derives the
  variant, links to the authed user only from the session cookie, no PII/tokens, fail-safe).
  `GET|POST /api/admin/experiments` and `GET /api/admin/experiment-analytics` (requireAdmin; aggregate
  server-side from existing funnel_events/lead_magnet_events/opportunity_ledger + experiment_events,
  fail-safe on missing tables).
- **Admin UI:** new feature-flagged `experiments` tab -> `src/components/admin/ExperimentsView.tsx`
  (Experience / Funnel / Tool / Video-Campaign / Opportunity performance; insight cards; metric
  definitions; data-quality notes; projected shown SEPARATELY from actual captured; tool promotion
  status visible; pause/resume/complete controls). Reuses admin layout + Recharts.
- **Client:** `recordExperimentEntry` fires 'assigned' + 'exposed' for the OYF experience (inert
  unless an experiment runs). welcome/setup/auth/role-promotion untouched.
- Tests: `src/lib/experiments/experiments.test.ts` (19). Build + lint pass. Live `sw.js` v265.

## 2026-07-27 — Own Your Fans value-before-signup journey (build a fan page, then sign up)

An anonymous artist can now BUILD a fan-capture page after the Own Your Fans result and only sign up
at the save boundary ("Save my fan page"), so they arrive at signup with something they do not want
to lose. No new table, no migration: the anonymous draft reuses `lead_magnet_results` (status
`draft`, `lead_id`/`user_id`/`artist_id` NULL) and the EXISTING claim path.

- **Builder:** `src/components/opportunity/FanCaptureBuilder.tsx` (shared anon + authed). Wizard +
  OptionSelect + a live preview card mirroring the smart-link editor, plus an honest
  planning-vs-publishing checklist. Collects ONLY non-sensitive planning copy (goal, headline,
  subheadline, CTA label, capture type, optional http(s) link). Rendered after the OYF result in
  `PublicToolClient` (OYF only), replacing the bare post-calculator signup button.
- **Draft store + capability routes:** `src/lib/opportunityDrafts/ownYourFansDraft.ts` (bounded
  sanitizers + `isDraftToken`). `POST /api/opportunity-drafts` (public, rate-limited, no PII,
  server-recomputes the result) and `GET|PUT /api/opportunity-drafts/[token]` (public capability
  token; act ONLY on UNCLAIMED, unexpired rows; the UPDATE re-asserts `user_id IS NULL` to lose a
  claim race safely). localStorage (`crwn_oyf_draft`) mirrors for instant refresh; the server row is
  the durable truth.
- **Handoff:** "Save my fan page" -> existing `/signup?result=<token>` -> `user_metadata` token ->
  existing `autoClaimForUser`/`claimByRawToken` binds the row (idempotent, atomic on `user_id` null).
  `postSetupDestination` now routes OYF to `/own-your-fans/plan`.
- **Resume:** `src/app/(main)/own-your-fans/plan/page.tsx` reads the claimed draft under RLS
  (`owner_manage_lm_results`, owner-only, no token, no cross-user lookup), resumes at the exact step,
  and routes real publishing into the ownership-gated `/studio/fans`. `/welcome`, `/setup`, auth, and
  server-side role promotion are untouched.
- **Analytics:** 16 journey events (`anonymous_value_*` -> `feature_published`) on the existing
  `lead_magnet_events` sink, sanitized, never mirrored into `funnel_events`, never carrying a claim
  token or PII.
- **Retention:** abandoned anonymous drafts expire via `public_token_expires_at` (30 days) and are
  inert once expired (deny-public RLS, token unusable). Optional periodic cleanup:
  `DELETE FROM lead_magnet_results WHERE status='draft' AND user_id IS NULL AND public_token_expires_at < now() - interval '7 days';`
- Tests: `src/lib/opportunityDrafts/ownYourFansDraft.test.ts` (9). Build + lint pass. Live `sw.js` v264.

## 2026-07-27 — Shared Opportunity Funnel layer (phase 1); Own Your Fans migrated, Worth connected

Turned the public tools into a measurable, configurable funnel layer WITHOUT a new subsystem or a
migration. New `src/lib/opportunityFunnels/` assembles a typed `OpportunityFunnel` VIEW over the
existing registries (`LEAD_MAGNETS` + `EXTERNAL_TOOLS`) and layers only the dimensions they lacked:
lifecycle (`draft|internal|active|paused|archived`), promotion (`primary|secondary|none` + a
`promotionRank`, so priority is configurable and NOT permanently hardcoded), tool type, stable
`opportunityKey`, `toolVersion`/`resultVersion`, availability + auth boundary, feature flag (metadata
only), attribution channels, and internal-only fields stripped by `toPublicFunnel`. Resolution +
pure selection/order helpers (`getFunnelByToolKey`, `resolveFunnelByKeyword` with orchestrator-matching
`normalizeKeyword`, `selectActive`/`selectPublic`/`sortByPromotion`).

- **Own Your Fans** is marked **primary** (rank 0) via overlay; `opportunityKey: own-your-fans`;
  `recommendedNextRoute: /studio/fans` (the owned-CRM `AudienceTab`, the most repository-supported
  next surface; no dedicated builder exists so `builderRoute` stays null). Its formula and published
  result are UNCHANGED (still the loss-engine `lossResult@1`).
- **Streaming Loss / Worth** joins the metadata layer only (`opportunityKey: streaming-loss`,
  `secondary`, rank 1). Its `/worth` page, formulas, inputs, disclaimers, and CTA are untouched.
- **Analytics:** seven shared events (`opportunity_funnel_viewed|started|completed`,
  `opportunity_result_viewed`, `opportunity_recommendation_viewed`, `opportunity_cta_clicked`,
  `opportunity_builder_started`) on the EXISTING sink (`/api/lead-magnets/analytics` ->
  `lead_magnet_events`), added to its allowlist. They are NOT mirrored into `funnel_events`, so the
  existing 15-stage counts never double-count. `sanitizeOpportunityMeta` is an allowlist that strips
  email/phone/tokens/raw answers/financials (defense in depth on top of the server's column allowlist).
- **Wired (additive, defaults reproduce today's behavior):** `PublicToolClient` emits the funnel
  events alongside the existing beacons; `ConvertToFeatureButton` emits cta/builder; the tools
  directory now hides non-active/unsupported funnels and leads with promoted ones (all current tools
  default active + public, so only the ORDER changes and Own Your Fans surfaces first).
- Tests: `src/lib/opportunityFunnels/{registry,analytics}.test.ts` (20). No migration, no env var, no
  flag. Live `sw.js` v263.

## 2026-07-26 — Executive Producer seat price: $300 top band + "suggested" framing

Resolved the tool-vs-script price conflict by RAISING the calculator, not lowering the scripts (the
producer-kendrick/travis scripts price a seat at $300; a mega-artist charging $300 is more credible
than $200). Added an `audience >= 1M -> $300` band to `seatPrice` in `toolAdapters.ts` (the exec
adapter); all its copy reads `seatPrice` dynamically, so nothing else needed touching. The seat/ticket
price stays artist-set: the LivestreamManager price field now labels itself "Seat price — suggested for
your level / a starting point based on your audience, you set the final price" when it was prefilled
from the calculator (`ticketSuggested`), generic otherwise. Suggestions stay because the calculator
CANNOT project a dollar without a price assumption, and a blank price box is decision friction. Live sw.js v261.

## 2026-07-26 — P0: every artist page 404d (`profiles(*)` embed named a revoked column)

`/[slug]` (the public artist page, both its queries), `/[slug]/playlist/[id]`,
`/artist/[slug]/playlist/[id]`, and community `PostCard` all selected `profile:profiles(*)` /
`author:profiles(*)`. `profiles.email` and `.phone` have SELECT revoked from anon/authenticated, and
naming a revoked column 42501s the WHOLE embedded query, so PostgREST returned NO row and the page
called `notFound()` -> "Artist Not Found" for EVERY artist. No fan could view, subscribe, or buy.
Same class as the Stripe-id revoked-column outage; the fix there used a view for the base table but
left the `profiles(*)` EMBED unfixed. Proven from production with the anon key (view returns the row;
`profiles(*)` 42501s; explicit public columns return the row). Replaced every embed with an explicit
PUBLIC column list (`id, display_name, username, avatar_url, bio, social_links, is_active`; PostCard
adds `role`). Live `sw.js` v256.

## 2026-07-25 — Bridge the ManyChat funnel into funnel_events (video = the IG post)

The dashboard's funnel + "Highest Converting Video" only saw WEB traffic: the client beacon maps
utm_content -> funnel_events.video, but real leads come via IG comment -> ManyChat -> CRWN, handled
server-side and never loading that beacon. Their "which video" signal is `lead_sessions.source_post_id`
(the IG post/Reel), captured server-side but living in acquisition_events/lead_sessions, not funnel_events.

`src/lib/analytics/acquisitionFunnelMirror.ts` records the ManyChat funnel into funnel_events using the
post as the video dimension (creator -> referrer `ig:<acct>`, keyword -> campaign fallback). Wired at the
existing acquisition choke points: `lead_session_started` -> page_viewed (orchestration.ts, attribution
straight off the payload), `lead_result_generated` -> calculator_completed (resultGeneration.ts),
`lead_result_viewed` -> result_revealed (resultAccess.ts). Deduped by session/result id; fail-safe. Web
and ManyChat are disjoint (web has no lead_session), so no double counting. account_created stays covered
by the useAuth auto-claim path.

REQUIRES the ManyChat External Request to send `source_post_id` (IG post id) to the CRWN webhook, or the
video dimension stays null for those leads. `igFunnelDims` is the tested pure mapping.

## 2026-07-25 — Feature-specific continuation CTAs on every calculator

Replaced the generic post-result CTA ("Create your CRWN account and fix this", "Claim it on CRWN",
"Build this inside CRWN") with copy that names the exact feature: worth -> "Build My Membership",
share-to-earn -> "Turn On Share-to-Earn", executive-producer -> "Build My Executive Producer
Session", live-experience -> "Create My First Ticketed Live Event", vault -> "Build My Vault". Every
other calculator derives "Build My {featureName}" (with natural overrides for a few plurals/labels),
so a new calculator gets a feature-specific CTA for free.

- **Single source of truth:** `src/lib/leadMagnets/continuationCta.ts` — `continueCtaFor(slug)`
  (bespoke overrides + featureName-derived default) and `buildContinueUrl(slug, token)` (the EXISTING
  signup flow, `/signup?tool=&result=`). No new signup flow; the token handoff is unchanged.
- **Render sites rewired to the helper:** `ConvertToFeatureButton` (the one registry-driven CTA, so
  all 16 tools change at once), `LeadEmailCta` (new `ctaLabel` prop; web + tokenized result page,
  web claimHref now token-aware via buildContinueUrl), the tokenized result page `SignupCta`, the
  capture email `ctaLabel`, and both `/worth` continuation buttons.
- **Deliberately left alone:** `CrwnShowcase` / `IndependenceSection` — platform-wide showcases that
  list ALL revenue streams, not a single feature; and the `hero.primaryCta` "run the calculator"
  buttons. Only the true post-result continuation CTA changed.

Tests in `src/lib/leadMagnets/continuationCta.test.ts` (the five exact strings + every registered
calculator gets non-generic copy + the URL preserves context).

## 2026-07-25 — Lead Magnet Performance dashboard (admin)

The admin-facing surface over the funnel + opportunity analytics. New tab `leadmagnets` in
`src/app/admin/page.tsx` -> `src/components/admin/LeadMagnetsView.tsx` (admin-gated by the page's
role check; its data route re-checks admin server-side, so nothing is exposed publicly).

- **Data:** `GET /api/admin/lead-magnet-dashboard` reads funnel_events + opportunity_ledger and
  returns every tile: Views / Completions / Emails / Accounts, Activation Rate (accounts /
  completions), Builder Completion (published / opened), Revenue Opportunity Revealed + Captured
  (current month, so reveals are not summed across months), Top Calculator, and Highest Converting
  Source / Video / Campaign. Filters: date, campaign, calculator, artist (fetched once per window,
  filtered in memory so the filter-option dropdowns never collapse).
- **Pure aggregation** `src/lib/analytics/leadMagnetDashboard.ts` (tested): stage counts, the two
  rates, `conversionByDimension` (completion rate per source/video/campaign with a min-views floor
  so a 1-view/1-completion row can't top the chart), `calculatorPerformance`.
- **Video dimension added:** funnel_events gained a `video` column (utm_content), wired through the
  recorder and the analytics mirror, so "Highest Converting Video" is real. (Amended the still-
  unapplied funnel migration; no second migration.)
- **UI:** responsive (cards reflow 2->6 cols, recharts in ResponsiveContainer, the per-calculator
  table scrolls on mobile), reuses the FunnelView card/pill/chart patterns. Tests in
  `src/lib/analytics/leadMagnetDashboard.test.ts`.

## 2026-07-25 — Opportunity tracking (revealed / activated / captured / remaining)

Tracks the DOLLAR opportunity a calculator revealed through its lifecycle, per artist per FEATURE
per month. Distinct from the funnel event counts below: this is a money ledger.

- **Table:** `opportunity_ledger` (`supabase/schema-phase2-opportunity-ledger.sql`, UNRUN, TODO.md).
  Grain (artist_id, feature, period_year, period_month) UNIQUE = the dedup guarantee. Columns:
  revealed_cents / captured_cents / remaining_cents / activated + calculator + dimensions. Artist
  reads own, admin reads all.
- **Pure core** `src/lib/analytics/opportunity.ts` (fully tested): `FEATURE_BY_CALCULATOR` maps the
  five calculators onto THREE disjoint features (worth+vault -> membership, live+exec -> live,
  share -> referral); `revealedByFeature` dedups per feature with MAX (two calculators describing
  the same money are never summed); `computeRemaining` = max(0, revealed - captured);
  `capturedFromEarnings` sums net revenue per feature and nets refunds back onto the ORIGINAL
  payment's feature (grouping by type alone would strand refunds and overstate captured).
- **Captured is real money, from disjoint ledgers so it never double-counts:** membership = artist
  net `earnings` type='subscription' (already referral- and fee-netted), live = earnings
  live_ticket + live_tip, referral = `referral_earnings.commission_amount` (the referrer's cut that
  was netted OUT of subscription earnings). Monthly, refund-adjusted.
- **Recompute** `src/lib/analytics/opportunityLedger.ts` `recomputeArtistOpportunity(db, artistId)`:
  reveals (from claimed results) + captured (this month) + activated (real state: a live tier / a
  live session / referral rate > 0) -> upsert the current-month rows. Idempotent.
  `refreshAllOpportunities` does it for all artists with a claimed result.
- **Triggers:** on `builder_published` (the funnel beacon recomputes that artist); read-time for a
  single ?artistId in the rollup; and a daily refresh piggybacked on the `outcome-measure` cron (no
  new cron, per the Hobby cap).
- **Reporting:** `GET /api/admin/opportunity` rolls up revealed/activated/captured/remaining by
  feature, calculator, artist, month, and year.

Tests in `src/lib/analytics/opportunity.test.ts` (feature map, max-dedup, remaining floor, refund
netting, totals).

## 2026-07-25 — Complete lead-magnet funnel analytics

One canonical funnel store for the whole acquisition funnel (page view -> mission completed),
deduped and dimensioned for dashboards. It does NOT replace the two existing event tables
(`lead_magnet_events` append-only log, `acquisition_events` IG outbox); it unifies the funnel.

- **Table:** `funnel_events` (`supabase/schema-phase2-funnel-events.sql`, UNRUN, in TODO.md). Columns:
  `stage` (CHECK of the 15 canonical stages), the five dimensions `calculator`/`campaign`/`referrer`/
  `artist_id`/`occurred_at`, plus `user_id`/`result_id`/`anon_id`/`metadata`, and `dedupe_key`
  (UNIQUE) for "no duplicate events". Admin-read RLS, service-role write.
- **Recorder:** `src/lib/analytics/funnelEvents.ts` — `FUNNEL_STAGES`, `recordFunnelEvent(db, input)`
  (upsert ON CONFLICT (dedupe_key) DO NOTHING; fail-safe, never throws; no-ops pre-migration),
  `buildFunnelRow` (pure, tested). The dedupe_key is namespaced by stage and defaults to a random
  uuid so inherently-repeatable stages never collapse while a retried beacon of one occurrence does.
- **Instrumentation (server-side, each stage once):**
  - Stages 1-7 (page/started/completed/revealed/signup) are MIRRORED from the EXISTING client beacon:
    `/api/lead-magnets/analytics` maps the lm event -> stage via `LM_EVENT_TO_STAGE`; `trackLeadMagnet`
    now stamps a per-occurrence `eventId` (dedup key) and `document.referrer`.
  - Email Submitted: capture route. Assumptions Changed: recalculate route (dedup on result+values).
  - Account Created + Email Verified: auto-claim route (dedup per user). Setup Completed:
    complete-setup route (dedup per artist). Builder Opened: post-setup-destination route.
    Rise Mode Started + Mission Completed: quests route (reuses quest completions).
  - Setup Started + Builder Published: a new authenticated beacon `POST /api/funnel/track`
    (identity from session, never body) called from the setup page and the two builders.
    Client helper `src/lib/analytics/trackFunnelClient.ts` (separate file so node:crypto never
    bundles into a client component).
- **Reporting:** `GET /api/admin/funnel-events` (admin-only) rolls up per-stage counts + breakdowns
  by calculator/campaign/referrer over a date range. Distinct from `/api/admin/funnel` (the existing
  artist activation-milestone funnel), which is untouched.

Tests in `src/lib/analytics/funnelEvents.test.ts` (stage guard, dedup key, fail-safe).

## 2026-07-25 — Lead magnets ARE the first Rise Mode mission

A calculator an artist completed now becomes their personalized first mission, generated through the
existing Action Plan architecture (no new quest/mission system). `src/lib/leadResults/leadMagnetMissions.ts`
is the single shared generator both surfaces read from:
- `LEAD_MAGNET_MISSIONS` maps the five builder-mapped calculators to concrete titles: worth -> "Build
  Membership", executive-producer-session -> "Create Your First Executive Producer Session",
  share-to-earn-planner -> "Turn On Share-to-Earn", live-experience-calculator -> "Schedule Your First
  Ticketed Live", vault-revenue-planner -> "Launch Your Vault".
- `buildLeadMagnetMissions(db, {userId, artistId})` reads EVERY claimed result (via new
  `getClaimedResults` / `rowToSeed` in handoffSeed), keeps one mission per completed calculator
  (newest), ranks by monthly opportunity (worth's dollar is `conversionPayload.netMrrCents`; loss tools
  use `estimatedMonthlyCents`), and each mission's CTA is the prefilled builder URL from
  `postSetupDestination`.

Wiring:
- `/api/action-plan` Rule 0 now emits one recommendation per completed calculator: the top is `high`
  (the personalized FIRST mission), the rest `medium`. Title carries the dollar, e.g. "Build Membership
  ($1,200/mo)".
- `/api/quests` returns the top mission as `leadMagnet`, and RiseMode's banner (above "Your next move")
  renders it as the starting mission with its value. Existing quests/board untouched; degrades to null
  when no calculator was completed.

No migration, env var, or flag. Tests in `src/lib/leadResults/leadMagnetMissions.test.ts`.

## 2026-07-25 — Pre-built draft configs from calculator results (honest scope)

Extends the routing below from a thin prefill to a fuller, auto-generated DRAFT the artist edits and
publishes. Nothing persists until they publish; the two draft-until-publish builders (Offer Builder,
LivestreamManager) are the only homes. A builder audit drew the line between what is a real draftable
field and what is not, and the code respects it rather than faking features:

- **Real drafts (pre-filled, editable):** Membership entry tier (name/price/benefits), the Vault tier,
  the referral share step (on, 20%), a ticketed live/producer session (title, ticket price,
  submissions), and the producer session's `max_slots` (limited room = 20).
- **Suggestions, NOT drafts (because the field does not exist):** the full 3-tier membership ladder
  (Free caps live paid tiers at 1, so only the entry tier is drafted; the rest, with the calculator's
  real projected supporter counts, links to the Pro Tier Ladder builder), the live tip goal (needs a
  live session, commits immediately, dark-launched), replay (records automatically, gated post-hoc),
  and Vault release cadence (no scheduler exists; timing is per-track in Music).

Mechanics: `src/lib/leadResults/postSetupDestination.ts` now centers on a tested pure
`buildDraftConfig(seed) -> { path, prefill, suggest }`. `prefill.*` -> editable `lm_*` fields the
builders hydrate; `suggest.*` -> `lm_suggest_*` guidance the new `CalculatorSuggestions` card renders
(mounted under the prefill banner in both builders). Payloads enriched to carry the real numbers:
worth adapter now emits the `ladder` (price + projected subs per tier, 70/22/8), live adapter emits
`suggestedTipGoalCents`. Tests in `postSetupDestination.test.ts` lock the draft/suggestion boundary.

No migration, env var, or flag. Public result-page CTAs untouched.

## 2026-07-25 — Post-onboarding routing: land in the builder, not the dashboard

Extends the handoff below. When setup finishes, the wizard no longer hardcodes `/profile/artist`.
It asks `GET /api/lead-results/post-setup-destination`, which reads the artist's most recent
claimed calculator result and maps it to the matching builder, PREFILLED. Null (no calculator, or
an unmapped one) falls back to the dashboard, so nothing regresses.

The five calculators collapse onto two real builders (there is no dedicated Referral/Vault/Live
route; they are steps/modes inside these two):
- **`/offers/new`** (Offer Builder): Streaming Loss -> Membership (`grow-supporters` goal, price =
  the calc's implied ARPU netMrr/payers), Vault -> the `vault-access` goal (The Vault tier + price),
  Share-to-Earn -> subscription + the share step turned on.
- **`/studio/live`** (LivestreamManager): Live Experience -> ticketed live ($15), Executive
  Producer -> ticketed live + submissions on, seat price banded to audience.

Mechanics, reusing the existing `lm_*` prefill convention (Missions/PoD/Bounties already do this):
- `src/lib/leadResults/postSetupDestination.ts` is the pure map (tool_slug -> path + `lm_*` params).
  It invents nothing: prices come from each result's `conversionPayload`. Two adapters were enriched
  to carry their real number: live-experience (`ticketPriceCents: TICKET`) and executive-producer
  (`ticketPriceCents: seatPrice`, `acceptsSubmissions`).
- Both builders gained a one-shot prefill `useEffect` reading `window.location.search` (Offer
  Builder presets the goal + jumps past the picker; LivestreamManager opens the form like
  `runItAgain`), and both mount `CalculatorPrefillBanner` ("We already filled this out using your
  calculator.").

Public result-page CTAs (`conversionTarget`) were deliberately left untouched: the routing lives
only in the post-setup path, so blast radius is onboarding, not the marketing pages. No migration,
env var, or flag. Tests in `src/lib/leadResults/postSetupDestination.test.ts`.

## 2026-07-25 — Lead-magnet handoff: the storage-free bridge into the app

The persistence already existed. `lead_magnet_results` has stored every field the calculators
produce (inputs, outputs, generator/formula version, tokens) since the lead-magnet + acquisition
schemas landed, and `claimResult` already bound an anonymous result to a verified account without
ever duplicating an artist. The gap was SURVIVAL: the only thing carrying a result through
signup was `localStorage['crwn_claim']`, redeemed by `ClaimRedeemer` only after setup finished.
That loses the result on a different device, in incognito, or with a cleared cache, and the WEB
calculator path (raw `public_token`) had no claim at all, so a web signup never attached anything.

The bridge, all server-side, no browser storage as a dependency:

- **`autoClaimForUser(userId, {email, token})`** in `src/lib/leadResults/resultAccess.ts` sits
  next to `claimResult` and reuses its safety rules. Two durable keys: (1) a token carried
  through signup in Supabase `user_metadata` (resolves BOTH the hashed acquisition token and the
  raw web `public_token`), and (2) a **verified-email match** across `lead_magnet_leads` and
  `lead_identities`. Only ever anchored on the auth side's VERIFIED email, so binding a
  self-entered lead email to it is safe. Every write touches only unclaimed rows and is
  idempotent; it re-runs to backfill `artist_id` after `/welcome`.
- **`POST /api/lead-results/auto-claim`** derives user + verified email + metadata token from the
  SESSION (never the body), rate-limited, burns the one-shot token.
- Triggered fire-and-forget from `useAuth` (both session-establish paths) and from
  `ClaimRedeemer`. `/signup?result=|token=` carries the token into `user_metadata` via `signUp`,
  which also finally makes the long-dead capture-email CTA work.
- **Feels started:** `getLeadMagnetSeed` (`src/lib/leadResults/handoffSeed.ts`) reads the claimed
  result back into a display shape. The always-on **Action Plan** leads with it (loss-framed) and
  the dark-launched **Rise Mode** shows a banner above "Your next move".
- The numeric opportunity is now persisted INTO `result_data` (`estimatedMonthlyCents` /
  `estimatedAnnualCents`, set by `buildLossResult`) so the handoff leads with a real figure.

No migration, no env var, no flag: it runs on columns/tables the live acquisition engine already
uses, and every path fails safe. Tests in `src/lib/leadResults/handoff.test.ts`.

## 2026-07-24 — P0: a revoked column had silently killed every Stripe flow

Found while chasing why the hamburger showed artists the fan menu. That was one symptom.

`schema-phase2-stripe-id-column-privs.sql` revoked SELECT on `stripe_connect_id`,
`platform_stripe_customer_id` and `platform_stripe_subscription_id` from `anon` and
`authenticated`. Correct, and it stays. What nobody accounted for is **how Postgres refuses**:
naming one revoked column fails the ENTIRE statement with `42501`, and PostgREST applies the
same rule to **embedded joins**. A query does not come back missing a field, it comes back as
**no row at all**, so every caller reads "not found" and fails closed while looking healthy.

Verified against production with the anon key before changing anything (a control query proves
the probe works, per the RLS-canary discipline):

| Query | Result |
|---|---|
| `artist_profiles?select=slug` | 200, row |
| `artist_profiles?select=slug,stripe_connect_id` | **42501** |
| `subscription_tiers?select=id,artist:artist_profiles(slug,platform_tier)` | 200, row |
| `subscription_tiers?select=id,artist:artist_profiles(stripe_connect_id)` | **42501** |

**Money in, all of it, dead:** `/api/stripe/checkout` ("Tier not found", no subscriptions),
`track-checkout`, `product-checkout`, `live-checkout`, `live-tip-checkout`.
**Money out and setup, all of it, dead:** `/api/stripe/connect` ("Artist not found", so no artist
could connect Stripe at all), `connect/status` (reported not-connected for connected artists),
`balance`, `cashout`, `login-link`, `create-price`, `platform-portal`.
**Three screens rendered empty:** `PayoutDashboard`, `PlatformBilling`, `MonetizationRoadmap`.

Fix: `src/lib/stripe/connectAccount.ts`, a service-role helper that is now the ONLY way these
ids are read. The ownership check stays where it was, on the user session; only the secret moves
server-side. This generalizes the pattern `booking-checkout` had already worked out alone.

Still exposed on purpose: `src/app/team/[id]/page.tsx` reads `profiles.stripe_connect_id` from
the browser. It works only because `schema-phase2-profiles-column-privileges.sql` is unapplied.
Flagged in TODO.md against that migration.

## 2026-07-24 — Public artist page opens on Music, and the hub stopped trusting profile.role

- **Default tab on `/[slug]` is now Music, not Movement** (`ArtistProfileContent`). A fan who
  lands on an artist page came for the songs. Movement asked them to care about the artist's
  campaign before they had heard anything. Returning from checkout still lands on Tiers.
- **`AccountHub` derives artist-ness from the `artist_profiles` row, not `isArtist()`.** The
  whole slug/plan/Stripe fetch was gated on `profile.role`, which lags a token refresh. When the
  context still said `fan`, the slug never loaded, so the identity header fell back to the email
  line and **"View as fan" never rendered** for someone who plainly is an artist. Same class of
  bug the `(main)` gate and `useArtistSetup` already guard against. The context is now only a
  placeholder while the row is in flight.

## 2026-07-24 — The artist dashboard's 16-tab strip became 15 real screens

Josh compared CRWN to the Lyft driver app: an identity header, collapsed accordion groups, and
sub-screens that open with an X in the top left that puts you back in the menu. He was right, and
the reason it mattered is that CRWN had **three competing artist hubs** (AccountHub, `/studio`,
and the `/profile/artist` tab strip), one of which was quietly broken.

- **`/profile/artist` is now Rise Mode and nothing else.** It was 16 lazy tabs behind a horizontal
  scroll strip. On a phone, tabs 8 through 16 (Sync, Profile, Albums, Shop, Billing, Tiers,
  Payouts, Referrals) sat past the edge of the screen.
- **Bug this inherited and fixed:** the page only honored **7 of its 16** `?tab=` values from the
  URL and silently fell through to `activeTab = 'rise'` for the rest. 102 internal links pointed
  at `?tab=`, and the biggest groups were dead: `?tab=payouts` (15 links, including the account
  menu's own "Payouts and tax"), `?tab=profile` (6), `?tab=tracks` (5), `?tab=analytics` (5),
  `?tab=livestreams` (5), `?tab=referrals` (4). All landed on Rise Mode. `?tab=live`,
  `?tab=community`, `?tab=bookings` and `?tab=upgrade` were linked but were never tabs at all.
- **Three surfaces, one job each.** Bottom nav = do the work (Studio is back in the artist's 3rd
  slot). Hamburger `AccountHub` = manage the business (`/account/*`). `/studio` = the toolbox
  (`/studio/*`). Explore, Messages and Library deliberately stayed on the tab bar: Lyft can hide
  everything because the driver's actual job is the map underneath, and CRWN's equivalent of the
  map is discovery and the fan inbox.
- **`HubPage`** (`src/components/layout/HubPage.tsx`) is the shared shell: X in the top left,
  artist gate, artist context. `?from=hub` on a link means the X returns to the hamburger, via a
  one-shot sessionStorage flag (`requestHubReopen`) that `Navigation` consumes on the next
  pathname change. A query param would have been simpler but pulls `useSearchParams` into the
  layout, forcing every static page under it into a Suspense boundary. Without `from=hub` the X
  is a plain `smartBack`, which is what keeps Rise Mode CTAs returning to Rise Mode.
- **Why it is now instant.** The tabs were already lazy, so the cost was never parsing: it was
  that a tab's chunk downloaded **at tap time**, behind a spinner, because nothing was a route
  and nothing could be prefetched. AccountHub and the Studio grid now use `<Link prefetch>`, so
  chunks arrive while the menu is on screen. `useArtistContext()` caches the `artist_profiles`
  row at module scope, so splitting one page into 15 did not turn one query into 15.
- **Legacy links.** `src/lib/dashboardRoutes.ts` holds `TAB_ROUTES`; `/profile/artist` redirects
  through it carrying every param except `tab` (notification rows hold
  `?tab=payouts&earning=<id>`). All 98 in-repo `?tab=` links were rewritten to point directly at
  the new routes, so only history pays the redirect hop.
- **The old 27-step dashboard tour was deleted.** Every step targeted a `[data-tour="tab-*"]`
  element that no longer exists. Replaced with a 6-step orientation tour: Rise, Studio, the
  hamburger, view-as-fan.
- The overlay sits at `z-45`, under the nav's `z-50`, so the bottom tab bar and desktop sidebar
  stay visible and tappable while the menu is open.

## 2026-07-24 — The app was slow because three surfaces did work that never needed doing

Josh reported the site loading slowly, worst on Home and worst of all on Rise Mode. Diagnosed
against the code, then measured in production. Nothing here was an N+1 or a missing index. Every
cause was **redundant or serialized work**, which is why it never showed up as one slow query.

- **Rise Mode / `/api/quests`** (runs on every load AND every tab switch, and the route loops its
  cascade up to 12 times per load):
  - `ensureRoleQuests` called `assignQuest` for all ~72 templates every time. Each call costs 3+
    round trips (open check, completed check, prereq check) before concluding it has nothing to
    do. Now it reads what the user already holds in ONE query and only assigns what is missing:
    ~200 queries down to 1 on a settled account. `assignQuest` keeps its own guards, so the
    prefilter is an optimization, not the correctness boundary.
  - `refreshQuests` evaluated every open quest sequentially. `evaluateCondition` is read-only, so
    the read phase is now concurrent. **Writes stay sequential on purpose**: `completeQuest` does a
    read-modify-write on the shared `user_progression` row, so parallel completions would lose XP
    grants. Progress-percent writes hit distinct rows and share nothing, so those batch.
  - `reconcileXp` did a select-then-insert per completed quest. It is a self-heal for a historical
    bug, so on a healthy account every lookup found nothing. One ledger query now.
  - `safeEvaluate` isolates a throwing quest condition. Previously one bad quest rejected the whole
    sequential pass and blanked the board.
- **Home:** every load called `/api/stripe/connect/status` through `useArtistSetup`, which does a
  live `stripe.accounts.retrieve()` plus `backfillTierPrices`. An external API round trip in Home's
  critical path, for a "Finish setup 2/4" pill that never reads the value. The hook now takes
  `withStripe` (default OFF) and only the setup wizard pays for it. The featured grid also selected
  `*, profile:profiles(*)` for 50 artists to render 12 tiles; narrowed to the five fields shown.
- **Artist dashboard bundle:** the page opens on Rise Mode but statically imported all 16 tab
  managers, so the browser downloaded and parsed the charts, upload widgets, calendars and the whole
  shop editor before Rise could paint. Every tab except Rise is now `next/dynamic`. Tabs were
  already render-gated by `visitedTabs`, so behavior is unchanged.
- **Explore** (measured after the above shipped: 2.7s cold, ~0.95s warm): eight sequential round
  trips, most of them independent of each other. Now three waves.
- **`artist_profiles.featured_hidden`** (`supabase/schema-phase2-featured-hidden.sql`): removes ONE
  artist from Featured + the Explore browse list without deactivating them. Previously the only
  lever was `profiles.is_active = false`, which kills the whole account. They stay findable by
  SEARCH. **The migration REBUILDS `artist_profiles_public`** because that view enumerates its
  columns at creation time, so a new base-table column stays invisible to it until rebuilt, and the
  app reads the view. The self-verify asserts the column reaches the view AND that the rebuild did
  not re-expose the three Stripe id columns. App code queries the flag separately and tolerantly so
  it survives the pre-migration schema; verified in production (200, full list) before the column
  existed.
- **Royalty Readiness is now reachable from Rise Mode**, not only the Studio tile. Josh looked in
  Rise, which is correct: Rise is the guided path, Studio is the tool hub. Deliberately NOT a quest
  template, because coupling two separately dark-launched features makes each harder to launch alone.

## 2026-07-23 — profiles was leaking every user's email to the public internet

Found while chasing a much smaller problem (12 accounts whose public `display_name` was their
signup email). Probing production from OUTSIDE with the public anon key showed the real issue:
`GET /rest/v1/profiles?select=*` returned **all 68 profiles including `email`**, plus 5 real
`phone` numbers. The anon key ships in every browser bundle, so this required no login.

- **Cause.** `schema.sql` created `"Profiles are viewable by everyone" ON profiles FOR SELECT
  USING (true)`. That is correct for the PUBLIC columns, since an artist's `display_name` and
  `avatar_url` have to render on their page. But `profiles` later grew private columns by
  ALTER TABLE (`email`, `phone`, `full_name`, `stripe_connect_id`, `is_approved`,
  `last_active_at`, `onboarding_nudge_sent_at`) and every one inherited "viewable by everyone".
- **Why RLS was never going to fix it.** RLS filters ROWS, not COLUMNS, and the rows really are
  public. This is a column-privilege problem. The identical fix already exists one table over:
  `artist_profiles.stripe_connect_id` returns 42501 to anon. That hardening was done once and
  never applied to `profiles`.
- **Fix.** `supabase/schema-phase2-profiles-column-privileges.sql` revokes the table-level SELECT
  from `anon` and `authenticated` FIRST (a column grant is a no-op while a table grant stands),
  then re-grants only the public columns. `authenticated` additionally keeps the tour/onboarding
  booleans the client UI needs. Self-verifies with `has_column_privilege` for both roles.
- **The one code change that mattered:** `useAuth.fetchProfile` did `select('*')`, which would
  have started returning 42501 for every logged-in user the moment the grant was narrowed. It now
  selects an explicit column list. A user's own email comes from the Supabase session
  (`user.email`), which is where it should have been read from all along. Nothing else in the
  browser reads `email`/`phone`/`full_name` (every such read is a server route on the
  service-role client, which is not subject to grants).
- **Still open, deliberately:** a fan's chosen `display_name` remains anon-readable. That is a
  design question (community bylines, chat authors, and leaderboards render it) rather than a
  leak, so it was not bundled into this fix.

## 2026-07-23 — Royalty Readiness Check: CRWN starts noticing money the artist already earned

Everything CRWN did before this answered one question: **how much NEW revenue can an artist create
from their audience?** This is the first piece of the second question: **how much revenue have they
already earned and never collected?** Streaming pays badly, but an artist who is not registered
with a PRO, has never registered their songs, and has never heard of SoundExchange is also failing
to collect money that already exists. Nobody in the artist's stack tells them: the distributor
reports masters, the PRO reports only what the PRO collected, and no one reports the gaps.

- **Royalty Readiness Check (dark-launched).** Page `(main)/royalty-readiness`, route
  `/api/royalty-readiness`, scorer `src/lib/royalty/readiness.ts`, table `royalty_readiness`
  (`supabase/schema-phase2-royalty-readiness.sql`), flag `admin_settings.royalty_readiness`, off by
  default, same pattern as the quest, pop-up and live-tips engines. Twelve questions across
  ownership / registration / collection, a 0-100 coverage score, and a ranked action list.
- **The hard constraint, and the reason it is a score and not a dollar figure.** CRWN cannot verify
  a single answer. A precise "you are owed $14,200" from unverifiable self-reported inputs is a fake
  royalty statement, so the output is coverage plus a checklist and the copy says "not confirmed" /
  "nobody is set up to collect this", never "you are owed". `buildLossResult` already had a `score`
  mode for exactly this class of tool; the same reasoning applies in-app.
- **Scoring rules that matter.** Publishing questions are SKIPPED for an artist who does not write,
  rather than scored as failures, so a performer is not shown gaps that are not theirs. `unsure`
  scores as uncovered but yields a "find out" action rather than a "set this up" action. An
  unregistered backlog is an INVERTED question (yes is the risky answer) and is the only item with
  a real clock on it, because back claims are not open forever.
- **CRWN diagnoses, it does not collect.** Every action points outward (ASCAP/BMI, the MLC,
  SoundExchange, an administrator) with no affiliate relationship and no preference. Whether that
  becomes referral revenue is a founder decision, and it changes what the list means.
- **`PopupContext` now carries `featureFlags`.** An announcement pop-up for a dark-launched feature
  must gate on that feature's own flag, not just `popup_engine`, or flipping the engine announces
  something the user cannot reach. Both owed announcements are now written and safe:
  `announce_live_tips` and `announce_royalty_readiness`. New announcements must add their flag to
  `ANNOUNCEABLE_FLAGS` in `src/app/api/popups/route.ts` or the gate is `false` forever.
- **Deliberately NOT built:** the Unclaimed Royalty lead magnet (ships only after the in-app check
  is live, so the tool points at something real), per-song registration tracking, and a composition
  record separate from the recording. The last one is the real prerequisite for anything split-sheet
  shaped, and it must never be collapsed into Team Splits: a CRWN revenue share is a payout
  arrangement, not copyright ownership.

## 2026-07-23 — Live Tips + Tip Goals, and the LIVE lead magnet

CRWN had **no tipping primitive of any kind**. The only money paths into a live were the
subscription tier gate and the pre-sale ticket, which blocked six requested live features at once
(tip goals, biggest-tipper badges, tip-leader queue sorting, revenue-by-minute, live challenges,
tip-goal sponsors). Tipping was therefore built first, ahead of the flashier backstage/FaceTime work.

- **Live Tips (dark-launched).** `live_tips` + `live_goals`
  (`supabase/schema-phase2-live-tips.sql`), checkout at `/api/stripe/live-tip-checkout`, board at
  `/api/live/tips`, `handleLiveTip` + `settleLiveGoals` in `webhookHandlers.ts`, UI in
  `LiveTipBar` (viewer + broadcaster) and `LiveGoalsEditor` (artist), shared helpers in
  `src/lib/live/tips.ts`. Reads `admin_settings.live_tips`, off by default, same pattern as the
  quest and pop-up engines. A tip is a one-time Connect charge in the same shape as a ticket:
  pending row at checkout, flipped to `paid` by the webhook, and only paid tips move the bar.
- **Three traps worth remembering.** (1) A tip carries `live_session_id` just like a ticket, so the
  webhook must match `metadata.type === 'live_tip'` BEFORE the ticket branch or the ticket handler
  swallows it. (2) `earnings_type_check` did not list `live_tip`; the earnings handlers return early
  on a failed insert, so without widening it every tip would be charged and never reach payouts.
  (3) Money columns and `reached_at` are frozen in BEFORE UPDATE triggers, not an RLS `WITH CHECK`,
  so the artist's tip-moderation policy cannot self-approve a payment.
- **Goal unlocks announce themselves in the live chat**, posted as the artist at tier rank 99, so
  the payoff happens on stream rather than in a dashboard.
- **Live Experience Calculator** (`live-experience-calculator`, DM keyword `LIVE`): the 15th
  acquisition tool, ticketed-live angle, registered in `leadMagnets/registry.ts` +
  `acquisition/toolAdapters.ts` with a bespoke charcoal-and-gold hero. Its math and its fix use
  ONLY shipped features (ticket, tips, recording-as-replay). **Standalone post-show replay sales
  and brand sponsorship are deliberately excluded from both** because neither exists in CRWN.
  Sibling of `executive-producer-session`, which sells one seat in the room at a high price; this
  one sells the show itself at volume.

## 2026-07-18 to 2026-07-22 — Backfill: the loss-revelation lead magnet build-out, Founder Window, and two production fixes

**Written 2026-07-23 as a catch-up.** These 20 commits shipped without a brain update, which is a
process failure, not a code one: the `doc-sync-reminder.sh` Stop hook only *reminds*, it does not
gate, so a long run of feature commits drifted. Recorded here so the brain is not silently wrong.

- **The lead magnet system became the acquisition front door.** It grew from 4 tools to 16, all
  running through ONE engine (`src/lib/acquisition/lossResult.ts` `buildLossResult`). Each tool is
  an adapter in `toolAdapters.ts`; a registry entry with `usesLossEngine: true` makes the web
  clients render from that same adapter, so the web page and the DM show an identical result from
  one model. New tools across the window: Founder Window, Movement Page, Fan Journey, Top Fan
  Leaderboard, Quest Path, Supporter Promise, Team Split, Share-to-Earn, Executive Producer
  Session, Own Your Fans, Live Experience.
- **Two integrity rules were learned the hard way and now govern every tool.** (1) Every `fix` must
  point to a CRWN feature that ACTUALLY exists; the audit found one gap (Founder Window), which was
  then built rather than removed from the copy. (2) The result must deliver the dollar the DM hook
  teased. Tools that required `direct_fan_revenue_cents` returned $0 for a cold lead, so
  Supporter Promise and Team Split were switched to project from `social_followers` like the rest.
- **Result presentation was rebuilt twice.** Loss pages now lead with a bold gold dollar hero plus
  stat tiles, carry a `derivation` infographic showing how the number is built, and put the email
  and signup CTAs above the fold. `cause`/`consequences` prose is intentionally NOT rendered (it
  repeated the hero) but stays on the params for storage. Two renderers exist and BOTH need any new
  section kind: the tokenized result page and the web tool client.
- **Share-to-Earn model correction (Josh caught it).** Referral conversions come from the NEW reach
  the sharers create, not a flat percentage of the artist's own followers. Funnel is now
  sharers x reach-per-sharer x conversion x $10.
- **Email capture was broken for every loss tool** and is fixed: the capture route called
  `generateResult`, which throws for `usesLossEngine` tools, so the emailed result never sent.
  Tools also gained email-only `emailInsights` (a computed cost-of-waiting plus a tailored move).
- **Founder Window shipped as a real feature** (see the feature map row): cap, deadline, and
  `is_founder` marking, enforced in checkout on both free and paid paths.
- **Two production fixes on 2026-07-22.** Artists could not save their profile at all (42501: the
  `artist_profiles` UPDATE policy's `WITH CHECK` subqueried Stripe-id columns whose SELECT had been
  revoked from `authenticated`; the freeze moved into a BEFORE UPDATE trigger). And `handle_new_user()`
  was seeding a new user's PUBLIC `display_name` with their signup email. **Both fixes are
  migrations that were still unrun as of 2026-07-23**, so the underlying breakage is live until
  Josh applies them.

## 2026-07-17 — Pop-up Engine, account hub, and interruption governors

A batch of engagement/nav work, all built around one principle: the platform must NOT overkill
the user. Every surface that interrupts a user now passes a frequency governor.

- **Pop-up Engine (dark-launched).** A governed in-app interruption layer. Catalog lives in code
  (`src/lib/popups/registry.ts`), server logic + governor in `src/lib/popups/index.ts`, API at
  `src/app/api/popups/route.ts`, client host `src/components/popups/PopupHost.tsx` mounted in
  `(main)/layout.tsx`. Governor: **at most one pop-up shown per user per calendar day**, plus each
  pop-up's own frequency cap (`once` / `max N` / `everyN days`), plus role/stage targeting.
  Dark-launched exactly like the quest engine: reads `admin_settings.popup_engine`, the API echoes
  `enabled`, the client renders nothing when off. Migration:
  `supabase/schema-phase2-popup-engine.sql` (adds `popup_events`, `popup_survey_responses`, seeds
  the flag OFF). Copy is loss-framed, no em dashes.
- **Pop-up surveys** are a pop-up `kind` (1-5 rating + feedback). Answers → `popup_survey_responses`;
  a score of 1-2 emails the founder the feedback (the "what to fix first" signal).
- **Broadcast + notification governors.** `api/messages/broadcast` gained a daily cap (5/day) on top
  of the hourly 10; `api/notifications/notify-subscribers` gained a daily cap (8/day) on top of the
  5/min burst. Both return loss-framed 429 copy (a muted fan is a lost fan).
- **Account hub (hamburger).** New `src/components/layout/AccountHub.tsx`: a Lyft-driver-style
  full-screen menu (identity header + "View as fan" + plan/upgrade pill + accordion sections)
  reached from a top-left hamburger. **Profile was removed from the bottom tab bar** and now lives
  here; the freed 5th slot is **Rise Mode** for artists / **Library** for fans (`Navigation.tsx`).
- **Fan CRM is now its own route** `/studio/fans` (wraps `AudienceTab` + a Back to Studio control),
  no longer a dashboard tab deep-link. The Studio "Fan CRM" card and the hub point at it. The
  ownership-guarded `/api/audience` is unchanged.
- **Home cleanup.** The two identical "?" icons collapsed into ONE `home-help` control: a setup
  progress pill while an artist has steps left, else a single Getting Started link. The tour replay
  moved into the hub ("Replay the app tour" → `/home?tour=1`). The static welcome subtext is now a
  **rotating daily line** (`getDailyWelcome`, deterministic per calendar day).

## 2026-07-15 — Founding-artist fee/AI promo killed at the source

Founder call: the partner-code 5%-fee promo (and its incidental Pro-level AI access) is dead. It reused the retired founding-artist plumbing and would have fired the first time an influencer converted an artist.

- **The one writer removed:** `metadata.founding_artist = 'true'` in `platform-checkout`. That was the ONLY code path that ever set the flag (`founding_number` was never set, so the original 50-spot webhook branch was already dead). With the writer gone, `is_founding_artist` is permanently false.
- **Dead readers deleted** rather than left as latent landmines: the 5% branch in `getArtistFeePercent` (it now returns the tier fee, unconditionally), and the "founding → Pro access" clause in all three AI-manager surfaces (`cron/ai-manager`, `ai-manager/generate`, `AiManagerCard` + the `isFoundingArtist` prop and the profile-page state that fed it).
- **Kept, because it is the influencer program, not the promo:** the partner-code branch still records attribution (`partner_code_used`, `acquisition_source='partner'`), creates the `artist_referrals` row + `recruited_by`, and grants the 1-month Stripe trial. It just no longer touches the platform fee. Artists pay their plan's normal fee (12% Free / 8% Pro) from day one.
- **Inert residue, left on purpose:** `FoundingBadge` renders behind `artist.founding_artist_number`, which nothing sets, so it never shows. Cosmetic, not behavioral; not worth public-profile render surgery.
- Zero artists ever carried the flag in production, so nothing changed for anyone live.

## 2026-07-14 — The legal pages now state the fees the code actually charges; founding artists retired

The **artist agreement** (a document artists accept) said **Starter = 8%** while `getArtistFeePercent` charges **12%**: a contract term wrong in the direction that hurts the artist. It also said Pro was $50/month ($9.99) and Label 6% at $150 (5%, $99, not sellable). `/terms` repeated the same fiction ("standard fee is 8%, reduced to 6% for Label").

- **Founder call (2026-07-14): the code is correct, the documents bend to it.** Free **12%** / Pro **8%** at **$9.99/mo**. Fixed in `(public)/artist-agreement`, `(public)/terms`, and the Stripe guide.
- The Label row was **deleted** from the fee schedule rather than corrected: it is spec-only and not sellable, and listing it in a contract implies an artist can buy it.
- **Founding Artist program retired** (founder call, same day). Every user-facing mention removed. Zero artists ever carried the flag in production, so nobody was affected.
- ⚠️ **Still live in code:** the partner-code promo (**5% fees for 3 months**, `platform-checkout:132` → `webhookHandlers:1529`) deliberately *reuses* `is_founding_artist` to get the fee reduction. It is unadvertised and currently unused, and it cannot render the Founding badge (that needs a `founding_artist_number` the partner path never sets). Awaiting a keep/kill call in `TODO.md`. **Do not delete the founding fee path without deciding this**, or the influencer program silently loses its closing discount.
- **Rule:** a legal page must state what the code does. Do not render it from a live constant either, or a code change silently rewrites the contract artists agreed to.

## 2026-07-14 — A deploy is not an outage: the error boundaries were mislabelling a routine deploy as a crash

Reported as "site not loading, says something went wrong" on the homepage and the featured
artist page, which then stopped on its own. Production was never down. It was a **stale-deploy
chunk error**: a deploy had gone out ~1h earlier, and an open tab still held HTML pointing at
the previous build's content-hashed JS chunks. Fetching one 404s, throwing `ChunkLoadError`,
which trips the nearest error boundary. `chunkReload` then hard-reloads once and the next load
is clean, which is why it "fixed itself."

- **The defect was the presentation, not the recovery.** All three boundaries only tested
  `isChunkLoadError` inside `useEffect`, so the crash screen **painted first** and the reload
  fired a tick later. Every deploy therefore flashed "Something went wrong" at anyone mid-session.
  It convinced the founder the site was down; a visiting artist would conclude the same and leave.
  That puts it on the acquisition surface, not in the cosmetics pile.
- **Fix:** the check now runs during **render**, so the first paint is a quiet "Updating to the
  latest version" screen (`src/components/shared/AppUpdating.tsx`). The genuine crash copy is
  reserved for genuine crashes.
- **`global-error.tsx` was also missing `<html>`/`<body>`**, which Next requires because that
  file *replaces* the root layout when it renders. It is now inline-styled end to end: it cannot
  depend on `globals.css`, since the layout it replaces is what imports it.
- **Boundary coverage:** only `(main)`, `(auth)` and the root `global-error` exist. `(public)`
  and `[slug]` (artist profiles) have no route-level boundary and fall through to `global-error`,
  which is the path this bug came in on.

## 2026-07-14 — Influencer commission is 1% of artist REVENUE (founder rule), and it was paying 5x

Founder rule: **influencers earn 1% of the referred artist's revenue**, negotiable per influencer. The code was paying a percentage of something else entirely.

- **The bug:** `cron/recruiter-recurring` held a private price map (`pro: 5000, label: 17500, empire: 35000`) and fed it straight into `stripe.transfers.create()`. Pro is **$9.99**, so a 10% recurring commission on a Pro artist would have wired **$5.00/mo against an artist paying $9.99** (5x), Label 1.77x. It had been logged in TODO.md as a P2 "harmless dead code" item. **It never fired** (no recurring payout has ever run; no qualified referrals exist), so nothing needed clawing back.
- **The rule now:** commission base is `earnings.net_amount` (what the artist keeps, the same basis Team Splits uses) summed over the **previous calendar month**. Refunds are negative rows and net out; a net-negative month pays 0, with no clawback. Rate defaults to **1%**, overridden per influencer via `recruiters.partner_recurring_rate` (legacy column name, now applies to every recruiter).
- **Plan gates removed.** The old "artist must be on an active paid plan" and "partners earn nothing on Pro artists" rules assumed the commission came out of the artist's SaaS fee. A revenue share is funded by the platform fee (Free 12%, Pro 8%), which exists on every plan.
- **Also fixed:** the summary emails were rebuilt by a second pass that re-derived every amount and re-applied none of the skips, so a recruiter could be emailed about money that was never sent. They now report what was actually transferred. Earnings reads are paginated (PostgREST caps at 1000 rows, so a busy artist's month would have silently underpaid).
- **Copy:** `/partner`, `/recruit` and the getting-started guide were selling the fiction ($69 Pro, Label $175, Empire $350, "10% on Label+"). Rewritten to the real deal.
- **Rule:** never hardcode a price or fee in a route. Derive from `TIER_PRICING` / `TIER_LIMITS`. A "harmless dead constant" that feeds arithmetic is not harmless.

## 2026-07-14 — All four unsigned webhooks now verify signatures (HIGH-1 closed)

`webhooks/resend`, `outreach/webhook`, `outreach/inbound`, `sms/webhook` accepted a POST from anyone and wrote via the service-role client. See `11-SECURITY-AND-PRIVACY.md` HIGH-1. Verified with hand-rolled HMAC (`src/lib/webhookSignatures.ts`) against Twilio's and Svix's official test vectors. All fail closed. Needs three Resend signing secrets in Vercel (in `TODO.md`).

## 2026-07-14 — Internal self-calls hit Vercel's auth wall, silently

`cron/ai-manager`, `admin/agent/{briefing,autonomous,execute}` and the RLS canary built base urls from `req.nextUrl.origin` / `VERCEL_URL`. Inside a Vercel cron both resolve to the `*.vercel.app` **deployment** origin, which sits behind Vercel Authentication (custom domains are public, deployment urls are not). That wall answers **every** path, `/api/*` included, with an **http 200 and an html login page**, so the self-calls did not fail loudly: they "succeeded" with html and the work never happened. It also made the RLS canary email a false LEAK alert about its own front door. One hardcoded `PUBLIC_ORIGIN` (`src/lib/publicOrigin.ts`) now. Two of the routes also had `(A || B) ? C : D` precedence bugs that made the `NEXT_PUBLIC_SITE_URL` fallback unreachable.

## 2026-07-11 — Rate limiter fixed (every unauthenticated route was fail-closed)

`check_rate_limit(p_user_id)` is typed `uuid`, but unauthenticated routes have no user id and key on a string like `ip:1.2.3.4`. Postgres could not cast it (`22P02`), the RPC errored, and `checkRateLimit` discarded the error, so `data === true` evaluated `false`. An errored limiter was indistinguishable from a denial, and **every visitor got a 429 on their first request**.

- **Was broken in production:** `/api/support` (support form), `/api/partner/apply` (partner applications), `/api/lead-magnets/capture`, `/api/lead-magnets/email`. All four are unauthenticated and top-of-funnel. Authenticated routes pass a real uuid and were never affected, which is why this went unnoticed.
- **Fix (`src/lib/rateLimit.ts`, no schema change):** hash any non-uuid key into a stable uuid so it buckets like a real one (verified against prod: allows exactly `max_requests`, then denies); log RPC errors instead of swallowing them.
- **Note:** the limiter still fails CLOSED on an RPC error (unchanged semantics, so money routes are not weakened), but it now logs loudly. `check_rate_limit` has no checked-in migration; its signature was recovered by probing production.

## 2026-07-11 — Lead Magnet system (4 tools)

Added a config-driven Lead Magnet system (branch `claude/rise-mode-full-journey`). One typed registry (`src/lib/leadMagnets/registry.ts`) drives all tools; adding a tool = one config + one deterministic generator, no new pages.

- **Tools shipped (4):** Vault Revenue Planner (`vault-revenue-planner`), Proof of Demand Test Builder (`proof-of-demand-test-builder`), Fan Mission Generator (`fan-mission-generator`), Clip-to-Earn Campaign Planner (`clip-to-earn-campaign-planner`).
- **Routes:** public `/tools` + `/tools/[slug]` (SSG shells, `(public)` group); protected `/artist/tools`, `/artist/tools/[slug]`, `/artist/tools/saved` (middleware `protectedPaths` gains `/artist/tools`; `tools` added to `knownRoutes`).
- **Shared engine:** reuses `Wizard` + `OptionSelect`; deterministic versioned generators (`resultGenerators.ts`, `GENERATOR_VERSION`); preview-gated result renderer; consent-correct public lead capture; save/email/share; conversion adapters that PREFILL the live builders (Proof of Demand, Missions, Bounties read `lm_*` params, one-time seed, their own validation/payout logic untouched). Vault degrades to a saved plan by design.
- **APIs (`/api/lead-magnets/*`):** `capture` (public, IP rate-limited, server-recomputes the result), `results` + `results/[id]` (owner-scoped CRUD, public read by high-entropy token), `email` (recipient-locked, suppression-checked), `analytics` (field-allowlisted sink), `admin` (aggregates only).
- **DB:** `supabase/schema-phase2-lead-magnets.sql` (**APPLIED 2026-07-11**) adds `lead_magnet_leads`, `lead_magnet_results`, `lead_magnet_events` with RLS (owner-manage + admin-read) and a self-verify block. Distinct from `crm_contacts`/`fan_contacts`/`fan_events`.
- **Verified in production:** end-to-end capture writes the lead + result, recomputes server-side and mints a token; token read returns 200, no token 401, wrong token 404 (no leak). Smoke-test rows were deleted afterward.
- **Out of scope preserved:** the existing `/worth` "money left on the table" calculator is untouched.
- **Follow-up:** builder->result "converted" callback (marking a result `converted` after the builder creates the record) is not yet wired; no `/admin` Lead Magnets tab yet.

## v1.0 — 2026-07-10 (initial generation)

- **Generated:** 2026-07-10
- **Repository:** CRWN (`thecrwn.app`), Supabase project ref `ecpqtuidtsncjfwtkvwc`
- **Git branch:** `master`
- **Git commit:** `614b9582b2e5c456837fcd0c5cfc42b1d3194bac` (`614b958` — "Dropdowns for multi-option selectors; notification polish; Rise Mode return-to")
- **Repository status at generation:** working tree had unrelated uncommitted changes (mostly Windows `:Zone.Identifier` / Dropbox attribute sidecar files, plus edits to video-script and SQL notes). **No application source was modified to produce this documentation** — the CRWN Brain only adds files under `docs/crwn-brain/`.

### Method
Documentation was produced by static analysis of the repository at the commit above: reading source, routes, ~190 API handlers, 117 `supabase/*.sql` migrations, config, and the repo's own docs (`CLAUDE.md`, `CODEBASE.md`, `DEV_RULES.md`, `PRD.md`, `CRWN_Kickoff_Brief.md`). Evidence was gathered by parallel read-only exploration agents across domains (database, auth/security, payments, features, integrations, design/conventions, current state) and cross-checked against direct file reads. No code was executed, no migrations applied, no external API called, no production data touched.

### Files created (23)
`00-START-HERE.md`, `01-PRODUCT-VISION.md`, `02-FEATURE-MAP.md`, `03-USER-ROLES-AND-PERMISSIONS.md`, `04-ARCHITECTURE.md`, `05-DATABASE.md`, `06-ROUTES-AND-USER-FLOWS.md`, `07-BUSINESS-RULES.md`, `08-DESIGN-SYSTEM-AND-UX.md`, `09-CODING-CONVENTIONS.md`, `10-INTEGRATIONS.md`, `11-SECURITY-AND-PRIVACY.md`, `12-ENVIRONMENT-AND-SETUP.md`, `13-CURRENT-STATE.md`, `14-ROADMAP-INFERRED.md`, `15-AI-AGENT-INSTRUCTIONS.md`, `16-GLOSSARY.md`, `17-OPEN-QUESTIONS.md`, `18-SOURCE-MAP.md`, `CRWN-BRAIN-COMBINED.md`, `CRWN-BRAIN-QUICK-CONTEXT.md`, `CHANGELOG.md` (this file).

### Certainty labels
Statements are marked `Confirmed`, `Strongly inferred`, `Unclear`, `Not found in codebase`, or `Needs founder confirmation`. No secrets or secret values were included; env vars are referenced by name only.

### Key reconciliations baked in
- **Pricing:** code (`TIER_LIMITS`) is authoritative — Free 12% / Pro $9.99 8% / $99 `label` spec-only / `empire` dead. `PRD.md`, `schema-platform-tiers.sql`, and `recruit/page.tsx` all carry stale/contradictory pricing.
- **AI provider:** DeepSeek (+ narrow OpenAI), not "Moonshot/Kimi" as PRD says. `@google/genai` is unused by the app.
- **Booking:** live flow is booking tokens; the Calendly components are orphaned.
- **Onboarding:** `/welcome` → `/setup` wizard (PRD's tour/action-picker flow is stale).

### Known documentation limitations
1. **Schema is not fully reconstructable from the repo** — `earnings`, `referrals`, `referral_earnings`, `fan_payouts`, `processed_webhook_events`, `recruiters` have no checked-in CREATE TABLE migration; their columns are described only from later ALTERs. A production `pg_dump` is needed for completeness.
2. **Security audit sampled, not exhaustive** — the 195-file `SUPABASE_SERVICE_ROLE_KEY` surface was reviewed across every risk category, not line-by-line for all files. No leak found in anything reviewed; a full sweep is a reasonable follow-up.
3. **Env var equality unverifiable** — whether `NEXT_PUBLIC_CRON_SECRET == CRON_SECRET` in production (which determines exploitability of HIGH-2) could not be checked without Vercel access.
4. **Runtime-only facts unverified** — e.g. whether body text renders Inter vs a fallback, and whether subscription downgrades actually apply on Stripe's side, were reasoned from static code and flagged, not observed at runtime.
5. **Dynamic ranking/algorithm logic** (Explore/Home feed ordering) was not deeply traced.
6. Reflects a single commit; drift begins immediately. Update this changelog + the affected docs after each behavior/architecture change.

### How future agents should update the CRWN Brain
- After a feature/change: update `02-FEATURE-MAP` (status), `05-DATABASE` (schema), `07-BUSINESS-RULES` (rules), `13-CURRENT-STATE`, and any doc whose claims changed. Re-check certainty labels.
- Append a new dated `## vN` section here with the new commit hash, what changed, and any new limitations.
- If a statement in the Brain becomes stale, fix it in place and note the correction — stale docs caused several of the reconciliation issues found during this generation.
- Keep `CRWN-BRAIN-COMBINED.md` and `CRWN-BRAIN-QUICK-CONTEXT.md` consistent with the numbered docs when you edit them.
