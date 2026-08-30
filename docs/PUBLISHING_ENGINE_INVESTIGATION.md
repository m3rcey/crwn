# Investigation: a CRWN-owned content publishing engine

**Status:** investigation only. Nothing was implemented, no migration was written, no production code
was touched, no external account was configured. Dated 2026-08-24.

**Question asked:** can CRWN build the smallest reliable internal publishing pipeline that gets
founder content from generation to publication without manually loading every post into Later?

---

## 1. Executive decision

# BUILD A PARTIAL VERSION NOW

Build direct publishing for **Instagram and Facebook only**. Keep Later (or manual posting) for
**TikTok and YouTube**. Build it in two stages, and put a hard gate between them.

Three findings drive this, and they are the whole decision.

**First: Instagram and Facebook need no approval at all, and TikTok and YouTube both do.** Meta
grants Standard Access automatically to every Business app, with no App Review and no Business
Verification, for any account that holds a role on the app. The founder publishing to his own
Instagram account is exactly that case. There is zero elapsed approval time and zero review
paperwork for Instagram and Facebook. TikTok is the opposite: every post from an unaudited client
is forced to `SELF_ONLY` (private, visible to nobody but the creator), and lifting that takes a
2 to 4 week audit with multiple feedback rounds. YouTube is the same shape: uploads from an
unverified API project are locked to private, and unlocking takes a compliance audit. So the cost
of TikTok and YouTube is not code, it is weeks of calendar time spent on approvals for a
distribution experiment that is supposed to be running now. That asymmetry, not engineering
difficulty, is what splits the recommendation.

**Second: the manual step is real, and Later cannot remove it.** Later bulk-uploads media (up to 50
files) but still requires each post to be scheduled individually. That is precisely the labor the
founder wants gone. At 10 to 15 pieces a day it is an irritation. At 50 a day it is the bottleneck.
Meanwhile CRWN's generator already writes a deterministic per-post folder containing `caption.md`
and `slide-1.jpg` through `slide-4.jpg`. That folder is already a manifest. Nobody has to design
one, and no new content format is needed.

**Third, and this is worth more than the scheduling: `source_post_id` is already plumbed end to end
in CRWN and nothing supplies it.** It exists in the ManyChat payload schema, in `orchestration.ts`,
in `acquisitionFunnelMirror.ts` and in the admin acquisition view, and it **outranks `utm_content`**
as the video dimension. Today per-video attribution is broken by the "one-flow ceiling" documented
in [docs/acquisition/campaign-tagging.md](docs/acquisition/campaign-tagging.md): one ManyChat flow
serves every post using the same keyword, so a single `utm_content` value describes all of them at
once. If CRWN publishes the post, CRWN learns the Instagram media id at publish time and can hold a
real post-id to content-id map. Later can never give CRWN that map.

**But be honest about the limit of that third point.** Owning the post id is necessary for per-video
attribution and is *not sufficient*. ManyChat still has to send the triggering post id back to the
CRWN webhook, and whether ManyChat exposes that variable is **unverified** (the tagging doc says so
explicitly and warns against promising it). Publishing gives CRWN the map. ManyChat must supply the
key. Do not build this expecting attribution to close on its own.

**The gate, and the reason this is "partial" and staged rather than "build now".** The current
published cadence is 3 pieces/day (the running order in
[videos/ideas/2026-05-16-master-running-order.md](videos/ideas/2026-05-16-master-running-order.md)
schedules 362 posts at 3/day). The 50/day figure is a 16x bet that has not been placed yet. At
10 to 15/day, loading Later costs perhaps 20 to 30 minutes a day. A full queue-and-worker V1 is
**3 to 4 focused days**, which is roughly two months of that daily labor before it breaks even, and
the 3-to-10-artist acquisition experiment should be decided well before then. So the correct move
is not to build the queue first. It is to spend **half a day** proving the risky part (Meta auth and
a real carousel publish), take the 90% labor cut immediately with a publish-now script, and only
build the queue when actual volume makes unattended timing hurt. That sequence never delays the
acquisition experiment, because stage one is shorter than a single day of content production.

---

## 2. Current CRWN content workflow, and where the manual work is

Reconstructed from the repository, not from documentation.

```
  skill (/crwn-fan-economy, /crwn-fan-economy-carousel, /carousel, ...)
        |
        v
  videos/carousels/fan-economy/<n>-<slug>.md      <- IN THE REPO
        |    one markdown file per post, containing:
        |      **CAPTION:**            the full IG caption, CTA keyword included
        |      **SLIDE 2 PROMPT:**     image prompt
        |      **SLIDE 3 PROMPT:**     image prompt
        v
  node generate-fan-economy-carousel.mjs <range>   <- Gemini + sharp, 4K, colour-checked
        |
        v
  /mnt/c/Users/Josh/Dropbox/nano banana output/    <- NOT in the repo, NOT in R2
      Carousel Posts/Fan Economy/<slug>/
          caption.md
          slide-1.jpg    (copied from the video sheet)
          slide-2.jpg    (rendered)
          slide-3.jpg    (rendered)
          slide-4.jpg    (copied shared 128 end card)
        |
        v
  ===== MANUAL: founder opens Later, uploads 4 slides, pastes caption, =====
  ===== picks a time, repeats per post                                 =====
        |
        v
  Later -> Instagram / TikTok / YouTube
        |
        v
  fan comments the keyword -> ManyChat -> /api/integrations/manychat/webhook -> CRWN
```

**The manual step is exactly one step wide**, and it sits between a folder that is already perfectly
structured and a scheduler that cannot ingest folders. Everything upstream of it is automated and
deterministic. Everything downstream of it is automated and instrumented. That is an unusually clean
place to cut, and it is the reason this project is worth considering at all.

Two properties of the generator make the cut cheaper than expected:

- **Deterministic naming.** Slug directory, `caption.md`, `slide-N.jpg`. An ingest script needs no
  parsing heuristics and no new metadata format.
- **Reruns are safe.** Existing slide files are skipped. An ingest that runs repeatedly over the
  same tree is a no-op, which is the right property for an idempotent pipeline.

One property makes it harder: **the assets live in Dropbox on the Windows filesystem, not in R2.**
Meta cURLs media from a public URL at publish time, so every slide has to be uploaded somewhere
public first. That is a real step, but it is a solved one (see below).

---

## 3. Repository findings: what already exists and is reusable

### Reusable, directly

| Asset | Location | Why it matters |
|---|---|---|
| Public R2 upload | [src/lib/r2/client.ts](src/lib/r2/client.ts) | `uploadToR2()` already returns a public URL via `NEXT_PUBLIC_R2_PUBLIC_URL`. Meta requires publicly reachable media. This leg is already built. |
| Cron auth + due-row worker | [src/app/api/cron/scheduled-campaigns/route.ts](src/app/api/cron/scheduled-campaigns/route.ts) | `Bearer ${CRON_SECRET}`, query rows where `scheduled_at <= now`, transition status, count sent/failed. This is line-for-line the shape a publishing worker needs. |
| Idempotency-by-unique-insert | `acquisition_events UNIQUE(idempotency_key)`, `processed_webhook_events` | The established CRWN pattern for "a replay does zero work". Directly applicable to preventing duplicate posts. |
| Secret-column isolation | [supabase/schema-phase2-stripe-id-column-privs.sql](supabase/schema-phase2-stripe-id-column-privs.sql) + [src/lib/stripe/connectAccount.ts](src/lib/stripe/connectAccount.ts) | The exact pattern for a token column: SELECT revoked from `anon`/`authenticated`, read only through one service-role module. Reuse it verbatim for social access tokens. |
| Attribution normalizer | [src/lib/analytics/campaignAttribution.ts](src/lib/analytics/campaignAttribution.ts) | Eight allowlisted dimensions. A published post's campaign tag must be built through this, never stored raw. |
| `source_post_id` pipeline | [src/lib/manychat/schemas.ts](src/lib/manychat/schemas.ts), [src/lib/acquisition/orchestration.ts](src/lib/acquisition/orchestration.ts), [src/lib/analytics/acquisitionFunnelMirror.ts](src/lib/analytics/acquisitionFunnelMirror.ts) | Already accepted, stored, and preferred over `utm_content` as the video dimension. Publishing is the missing supplier. |
| Content calendar | [videos/ideas/2026-05-16-master-running-order.md](videos/ideas/2026-05-16-master-running-order.md) | 362 posts, dated, 3/day, block-ordered. The schedule already exists as data. |
| Drift registry | [src/lib/architecture/invariants.ts](src/lib/architecture/invariants.ts) | A new migration needs an `EXPECTED_MIGRATION_STATE` row and a probe line in [scripts/probe-migrations.mjs](scripts/probe-migrations.mjs). |

### Does not exist, at all

Grepped across `src/` for Graph API, `graph.facebook`, `instagram_business`, TikTok, YouTube upload,
social accounts, social posts, scheduled posts, and social OAuth. **Zero hits of a publishing
nature.** Every `instagram` hit is marketing copy, the ManyChat webhook, or an attribution
allowlist. There are 183 migrations in `supabase/` and none is social. There is no OAuth flow for
any social platform. This is greenfield: good news for design freedom, bad news for "it is mostly
done already".

### Discrepancies found between documentation and repository

1. **[docs/acquisition/instagram-manychat-architecture.md](docs/acquisition/instagram-manychat-architecture.md)
   claims "25 already exist" cron entries and that "the hourly slots are full."** The actual
   [vercel.json](vercel.json) has **13** entries, all daily, and none hourly. The doc is stale. The
   conclusion it was used to justify (piggyback the automation dispatcher on `platform-crm` rather
   than add a cron entry) is no longer supported on its stated grounds.
2. **[CLAUDE.md](CLAUDE.md) implies a low Vercel Hobby cron count limit.** Vercel lifted per-project
   cron limits to **100 on every plan** in January 2026. The cadence rule in CLAUDE.md is still
   correct and still binding (Hobby rejects any expression firing more than once a day), but the
   count constraint is obsolete. This materially changes the scheduler design (section 6).
3. **10 cron routes exist but are not registered in [vercel.json](vercel.json)**: `agent-health`,
   `clipper-rate-drops`, `fan-digest`, `inactive-subscribers`, `lead-scoring`, `recruiter-qualify`,
   `recruiter-recurring`, `sequence-conversions`, `team-split-accruals`, `team-split-selfcheck`.
   Out of scope here, but it matches the known "a heartbeat certified a dead cron" failure mode and
   is worth a separate look.
4. **`CLAUDE_PROMPT_FRAMEWORK.md` does not exist** anywhere in the repository. Documented once, as
   instructed. [docs/crwn-brain/15-AI-AGENT-INSTRUCTIONS.md](docs/crwn-brain/15-AI-AGENT-INSTRUCTIONS.md),
   [CLAUDE.md](CLAUDE.md) and the Brain were used as the operating framework instead.

---

## 4. Platform feasibility matrix

All rows verified against current official developer documentation in August 2026, not from memory.

| Platform | Images | Carousel | Short video | Caption | Direct publish | Native scheduling | Main blocker |
|---|---|---|---|---|---|---|---|
| **Instagram** | Yes | Yes, up to 10 items | Yes (Reels) | Yes | **Yes** | **No** | None for own account. CRWN must own the timing. |
| **Facebook Page** | Yes | Yes | Yes (Reels) | Yes | **Yes** | **Yes** (`published=false` + `scheduled_publish_time`) | None for own Page. |
| **TikTok** | Yes (photo carousel, up to 35 images) | Yes | Yes | Yes | Yes, but **forced private** | Effectively no | **Audit required.** Unaudited clients post `SELF_ONLY`. 2 to 4 weeks, multiple rounds. |
| **YouTube** | n/a | n/a | Yes (Shorts) | Yes (title/description) | Yes, but **locked private** | Yes (`publishAt`) | **Compliance audit required.** Unverified projects have uploads locked to private. |

### Instagram, in detail

- **Rate limit: 100 API-published posts per rolling 24 hours**, per Meta's official content
  publishing documentation. This covers images, carousels, Reels and Stories together. **A carousel
  counts as one post**, which is very favourable for CRWN's format. Third-party blogs still quote 25
  and 50; the official doc says 100. Usage is queryable at `GET /<IG_ID>/content_publishing_limit`,
  so the worker can check before it burns the cap.
- **Two-phase publish.** Create a media container, then publish it. For carousels: create one child
  container per slide, then a parent container listing the children, then publish the parent. For
  Reels, video processing takes 30 seconds to several minutes and the container must be polled at
  `GET /<container-id>?fields=status_code` until it reads `FINISHED` before publishing. States are
  `IN_PROGRESS`, `FINISHED`, `PUBLISHED`, `EXPIRED`, `ERROR`.
- **Containers expire after 24 hours.** This forbids pre-staging a week of content. Containers must
  be created close to publish time.
- **Media must be on a publicly accessible server.** Meta cURLs the URL at publish time. This is why
  the R2 public leg is load-bearing.
- **No native scheduling.** Meta's own docs note that apps allowing scheduled posts should enforce
  the rate limit themselves. CRWN owns the clock for Instagram.
- **Account type:** Instagram professional (Business or Creator). Two API paths exist. *Instagram API
  with Facebook Login* requires the account to be linked to a Facebook Page. *Instagram API with
  Instagram Login* does **not** require a Facebook Page. Since CRWN wants Facebook publishing too,
  the Facebook Login path is the right one: one app, one OAuth, both surfaces.

### Facebook, in detail

Same Meta app, same OAuth flow, same access-level rules. `/{page-id}/feed` with `published=false` and
`scheduled_publish_time` gives **native scheduling**, accepted as a UNIX timestamp or an ISO 8601
string. Facebook therefore needs no CRWN-side clock at all: hand it the future timestamp and forget
it. Facebook is the cheapest platform in the whole set, and it comes essentially free once Instagram
is wired, because the auth is shared.

### TikTok, in detail

Technically the most capable of the four for CRWN's format (photo carousels of up to 35 images, well
beyond Instagram's 10). Blocked by policy, not capability:

- Every post from an unaudited client is restricted to private viewing. This is a **client-level**
  restriction, not a user-level one, so "it is only my own account" does not exempt it.
- The audit takes 2 to 4 weeks and typically runs several rounds of feedback.
- Rate limits are also the tightest: roughly 6 requests/minute per user token, and a **per-account
  cap of roughly 15 to 25 posts per day, shared across all API clients**. That cap is shared with
  Later, so a partial migration would contend for the same budget.

### YouTube, in detail

The quota story improved and is no longer the problem. Google reduced `videos.insert` from roughly
1,600 units to roughly 100 in December 2025 and moved uploads into their own daily bucket of about
100 calls, separate from the 10,000-unit pool. So roughly 100 uploads/day on the free default tier.
The blocker is the same as TikTok's: **uploads from an unverified API project are locked to private**
until a compliance audit passes, and creators receive an email telling them their video was locked.
`publishAt` gives native scheduling once that is cleared.

---

## 5. The 10 / 15 / 50 posts-per-day analysis

The distinction the brief asks for matters a great deal: 50 unique pieces is not 50 API posts if each
piece goes to four platforms, it is 200.

### 50 unique pieces per day, each to one platform

| Volume | Instagram | Facebook | TikTok | YouTube |
|---|---|---|---|---|
| 10/day | Fine (10% of cap) | Fine | Fine | Fine |
| 15/day | Fine (15% of cap) | Fine | At the edge of the 15 to 25 cap | Fine |
| 50/day | **Fine** (50% of cap) | Fine | **Not possible** | Fine on quota, blocked by audit |

### 50 unique pieces per day, each cross-posted to all four platforms

| Platform | API posts/day | Verdict |
|---|---|---|
| Instagram | 50 | Fine, half the cap |
| Facebook | 50 | Fine |
| TikTok | 50 | **Exceeds the per-account cap of ~15 to 25, which is also shared with Later** |
| YouTube | 50 | Within the ~100/day upload bucket, but audit-blocked |

**Monthly:** 300/month and 450/month are comfortable on Instagram and Facebook. 1,500/month is
50/day sustained, which both support.

**The platform that breaks first is TikTok, and it breaks on its own daily cap, independent of the
audit.** Even a fully audited TikTok client could not take 50/day to one account. TikTok at high
volume requires multiple accounts, which is a content strategy decision, not an engineering one.

### The constraint nobody asked about, which matters more than any of the above

Instagram will *accept* 50 posts a day. That does not mean 50 posts a day to one account is a good
idea. Historical performance is around 1,000 views per piece with carousel outliers at 20,000 to
30,000. Multiplying posting volume by 16 on a single account is far more likely to reduce views per
piece than to hold them flat, and the goal is 3 to 10 ICP artists, not 1,500 impression events.

The repository hints the founder already anticipates this: there is a
`2026-05-30-cousin-account-access-checklist.md` in [videos/ideas/](videos/ideas/), which implies
multi-account distribution. **Multi-account changes the math favourably**, because the 100/24h
Instagram limit is per account, and it should be treated as a design input if 50/day is real. It also
adds a token per account, which the schema below already accommodates.

This is not an argument against the engine. It is an argument that the engine's value is *throughput
of experiments*, not raw post count, and that V1 should not be sized for 50/day before 50/day is
proven to be the right strategy.

---

## 6. What "scheduling" actually requires

Two architectures were evaluated.

**A. Native platform scheduling.** Available on Facebook (`scheduled_publish_time`) and YouTube
(`publishAt`). Not available on Instagram. Not usefully available on TikTok. Where it exists it is
strictly better: the platform owns the clock, downtime on CRWN's side cannot cause a missed post, and
there is nothing to retry.

**B. CRWN-controlled scheduling.** Mandatory for Instagram. CRWN stores the asset, caption, target,
timestamp and status, and a worker publishes when due.

**Correct answer: use native scheduling wherever it exists, and own the clock only for Instagram.**
That is the smaller system.

### The Vercel cron question, and its resolution

CLAUDE.md's rule stands: on Hobby, any cron expression that would fire more than once a day is
rejected at deploy time. A per-minute publishing worker is therefore impossible on Hobby.

But Vercel lifted the **per-project** cron limit to **100 on every plan** in January 2026, and
[vercel.json](vercel.json) currently uses 13. The cadence restriction applies to each *expression*,
not to the project. So:

> **N separate daily cron entries at N different hours, all pointing at the same
> `/api/cron/publish-tick` route, gives N publishing slots per day on the current plan, at no cost.**

Ten to twelve entries (`0 9 * * *`, `0 11 * * *`, `0 13 * * *`, and so on) covers 10 to 12 posting
slots a day and stays far under the 100 ceiling. Each is a compliant once-per-day expression. This
removes the hosting question entirely and means **no plan upgrade and no redesign of hosting is
required for the recommended V1.**

If minute-level precision is ever wanted, Vercel Pro at $20/month unlocks per-minute cadence, and
that upgrade costs less than the Later subscription it would replace. It is not needed now. Do not
buy it as part of this project.

Slot-based publishing is also the honest match for the product: content posting wants "roughly 11am",
never "11:03:00".

---

## 7. Minimal architecture

```
   videos/carousels/fan-economy/<slug>.md        (caption, in the repo)
   Dropbox/nano banana output/.../<slug>/        (slide-1..4.jpg, on disk)
                    |
                    |  node publish-carousel.mjs <slug>        <- the ingest
                    v
        upload slides to R2 public prefix  (reuses uploadToR2)
                    |
                    v
        POST /api/admin/social/publish   (admin session, service role)
                    |
        +-----------+-----------+
        |                       |
        v                       v
   Instagram adapter       Facebook adapter
   create N child              /{page}/feed
   containers -> parent        published=false +
   -> poll FINISHED            scheduled_publish_time
   -> media_publish            (platform owns the clock)
        |                       |
        +-----------+-----------+
                    |
                    v
        social_post_targets row updated
        status, platform_post_id, permalink,
        provider response (tokens stripped)
                    |
                    v
        content_id  <->  platform_post_id  map
        (feeds source_post_id attribution later)
```

Stage two adds a queue and a worker between the ingest and the adapters:

```
   ingest -> social_posts (queued, scheduled_for)
                    |
        /api/cron/publish-tick   <- 10-12 daily cron entries, CRON_SECRET
                    |
             due rows -> adapters -> state
```

Deliberately **not** in the diagram: an approval step, a calendar UI, an analytics surface, a caption
editor, multi-user roles, and any customer-facing configuration. See section 8.

### Data model (3 tables, one migration)

- `social_accounts`: platform, account handle, external account id, access token, token expiry. The
  token column has SELECT **revoked from `anon` and `authenticated`**, readable only through one
  service-role module, exactly like `artist_profiles.stripe_connect_id`.
- `social_posts`: content slug, caption, asset URLs, scheduled_for, status, approval flag.
- `social_post_targets`: one row per (post, platform, account). This is what makes partial
  cross-platform success representable: Instagram can succeed while Facebook fails. Carries
  `platform_post_id`, `permalink`, `attempt_count`, `last_error`, and a **UNIQUE(post_id, platform,
  account_id)** constraint that is the duplicate-post guard.

---

## 8. V1 scope

### Stage 1: "publish now" (recommended to start immediately)

**Build:**
- One Meta app in development mode, with the founder's Instagram and Page holding a role. No OAuth
  flow; a long-lived token generated once and stored server-side. (Deleting the OAuth flow is the
  single biggest simplification available, and it is legitimate because there is exactly one user who
  is also the app admin.)
- `uploadSocialAsset()` on top of the existing `uploadToR2`, writing to a **public** prefix that is
  not the private audio bucket.
- An Instagram adapter: carousel (N children plus parent, poll, publish) and single image.
- A Facebook Page adapter using native `scheduled_publish_time`.
- One admin-authenticated route that takes a slug and publishes it.
- A `publish-carousel.mjs` script the founder runs, which reads the caption from the repo markdown
  and the slides from the Dropbox folder, uploads, and calls the route.
- Record `platform_post_id` and `permalink`.

**Do not build:** a queue, a worker, cron entries, an approval step, any UI, retries beyond a simple
re-run, TikTok, YouTube.

This removes essentially all of the repetitive labor. The founder runs one command instead of doing a
browser upload per post. Timing becomes "the founder runs it three times a day", which is exactly
what a human already does with Later, minus the uploading.

### Stage 2: unattended timing (build only when volume actually hurts)

**Add:** the `social_posts` queue, `/api/cron/publish-tick`, 10 to 12 daily cron slot entries, retry
with retryable-versus-permanent classification, idempotency on
`UNIQUE(post_id, platform, account_id)`, a token-expiry alert email through the existing Resend
sender, and a minimal admin list view (status, retry, error) inside the existing `/admin` shell.

**Gate for starting stage 2:** the founder is actually publishing more than about 15 pieces/day and
the run-the-script step has become the annoyance. Not before.

### Explicitly NOT built, at any stage

Social inbox, comment management, team collaboration, social listening, an analytics surface
(`/admin` Lead Magnets already owns the content scorecard), AI caption generation (the skills
already own it), media editing, link-in-bio, competitor analysis, and a calendar view.

**Superseded in part (2026-08-29):** this list originally also excluded "DM automation, any
ManyChat replacement, any multi-tenant or artist-facing capability", warning that an artist-facing
version would be "a different product with a different threat model." The founder then explicitly
commissioned exactly that product, and it was built AS the different product this note predicted:
artist Fan Automations, with multi-tenant Meta OAuth, per-artist encrypted tokens, closed tables,
and provider-signed webhooks, sharing nothing with this founder publishing engine. Canonical doc:
`docs/crwn-brain/31-FAN-AUTOMATIONS.md`. The exclusion still stands for THIS engine's own scope.

---

## 9. Build versus Later

| Dimension | Later | CRWN engine (IG + FB) |
|---|---|---|
| Ingest from generated content | **None.** Bulk media upload up to 50 files, but each post is still scheduled individually. This is the bottleneck. | Reads the existing slug folder directly. Zero per-post handling. |
| Bulk scheduling | Manual, per post | One command per batch |
| IG carousel publish | Yes | Yes |
| IG Reel publish | Yes | Yes |
| Facebook publish | Yes | Yes, with native scheduling |
| TikTok publish | **Yes, audited client** | No, would need a 2 to 4 week audit |
| YouTube Shorts | **Yes, verified client** | No, would need a compliance audit |
| Volume ceiling | Platform limits | Same platform limits |
| Reliability | Later's problem | **CRWN's problem** |
| Token refresh, API version churn | Later absorbs it | **CRWN absorbs it.** Meta deprecates a Graph version roughly every quarter on a ~2 year lifecycle. This is the real ongoing tax. |
| Cost | Roughly $25 to $80/month | Effectively zero (R2 and crons already paid for) |
| Control | None | Full |
| Post id to content id map | **Impossible** | **Yes, and CRWN already has the consumer for it** |

**What Later is absorbing that CRWN would take on:** OAuth token lifecycle and refresh, Meta Graph API
version deprecations, media hosting and format compliance, upload retries, platform-side outage
handling, and (for TikTok and YouTube) being an audited and verified client. The first two are the
durable maintenance cost. They are modest for two Meta surfaces and would be significant for four
platforms across two more approval regimes, which is a second reason to stop at Instagram and
Facebook.

**Cost is not the reason to build this.** Saving a Later subscription does not justify four days of
founder-adjacent engineering. The reasons are the per-post labor at volume and the attribution map.

---

## 10. Complexity estimate

Separated as requested, because a small codebase can still be blocked by an approval queue.

| Component | Effort | Notes |
|---|---|---|
| Meta app setup, token, roles | 1 to 2 hours | Dashboard work, no code, **no review** |
| R2 public asset upload | 1 hour | Reuses `uploadToR2` |
| Instagram carousel adapter | 0.5 to 1 day | Two-phase, N children, polling, error states. The bulk of the risk. |
| Facebook adapter | 1 to 2 hours | Genuinely easy, shares auth, native scheduling |
| Ingest script | 2 to 3 hours | Deterministic folder, no parsing heuristics needed |
| Admin publish route + auth | 2 hours | Existing `apiAuth` patterns |
| **Stage 1 subtotal** | **~1.5 to 2 focused days** | |
| Queue, worker, cron slots | 0.5 day | `scheduled-campaigns` is a direct template |
| Retry, idempotency, failure classification | 0.5 day | |
| Token expiry alert + minimal admin view | 0.5 day | |
| Migration, invariants row, probe line, tests | 0.5 day | Required by the drift-prevention contract |
| **Stage 2 subtotal** | **~2 focused days** | |
| **Full V1 total** | **3.5 to 4 focused days** | |

**Testing complexity is the part that is systematically underestimated.** Every end-to-end test is a
real post on a real account. There is no sandbox for Instagram publishing. That means slow feedback
loops, manual cleanup, and a deliberately quiet test account or a willingness to delete posts. Budget
real time for this; it is why the estimate is not smaller.

### Is "1 to 2 focused days" realistic?

**For the full queue-and-worker V1: no.** That is 3.5 to 4 days honestly, and the classification is
**Moderate**, not Small.

**For Stage 1 as scoped above: yes, and a useful subset is achievable in half a day.** A script that
publishes one carousel to Instagram, with a hardcoded token and no database, proves the entire risky
surface (auth, container flow, carousel assembly, public media URL) in an afternoon. That half-day
should happen before anything else is committed to, because if Instagram carousel publishing
misbehaves for CRWN's specific 3:4 4K JPEG assets, every downstream estimate changes.

### External approval elapsed time, stated separately

| Platform | Approval work | Elapsed time |
|---|---|---|
| Instagram | **None** (Standard Access, role-holder) | **Zero** |
| Facebook | **None** (Standard Access, role-holder) | **Zero** |
| TikTok | Content Posting API form, then audit | **2 to 4 weeks**, multiple rounds |
| YouTube | Audit and Quota Extension form | **Weeks**, outcome not guaranteed |

This table is the recommendation in miniature.

### Ongoing maintenance

Roughly a few hours per quarter: Graph API version bumps, token refresh monitoring, and occasional
media-spec changes. Low, but not zero, and it is permanent.

---

## 11. Security and reliability risks, ranked

**1. Access token exposure (highest severity).** A leaked long-lived Meta token allows anyone to post
as CRWN. Controls: store it in a column with SELECT revoked from `anon` and `authenticated`, read it
only through one service-role module (the `connectAccount.ts` pattern), never in a `NEXT_PUBLIC_`
variable, never in a log line, and strip it from any stored provider response. Note the CRWN-specific
trap: naming a revoked column from a browser client fails the **entire statement**, joins included,
and returns no row rather than a row with a missing field. Any browser-side query touching
`social_accounts` must never name the token column.

**2. Duplicate publishing on retry.** A worker that retries after a timeout can publish twice, and on
Instagram the second publish is a real, visible, duplicate post. Controls: `UNIQUE(post_id, platform,
account_id)` on the target row, store the container id as soon as it is created so a retry resumes
from the container instead of creating a new one, and treat a populated `platform_post_id` as an
absolute bar on re-publishing. This is the single most likely way the system embarrasses the founder,
so it deserves the strongest guard.

**3. Privilege escalation if the feature ever widens.** V1 is founder-only, but the authorization must
be session-derived `role === 'admin'` from the start. A caller-supplied account id must never be the
actor's identity; that confusion was SEC-001 in CRWN's own audit history. Middleware excludes
`/api/`, so every one of these routes establishes its own authority.

**4. Instagram container expiry and mid-flight failure.** Containers die after 24 hours, and a process
that dies between "container created" and "media published" leaves an orphan. Controls: never create a
container more than a couple of hours before publish, persist the container id, and treat `EXPIRED` as
a permanent failure that requeues from the start rather than retrying the publish call.

**5. Token expiry causing silent non-publication.** Long-lived Meta tokens expire in about 60 days. A
queue that silently stops is worse than one that never existed, because the founder believes content
is going out. Control: proactive refresh, plus a failure email through the existing Resend sender.
This is a "the founder must be told" case, not a "log it" case.

**6. Retryable versus permanent misclassification.** A permanent failure (invalid media, caption too
long, policy rejection) retried on a loop burns the 100/24h publishing budget and can starve valid
posts. Control: 4xx is permanent and stops, 5xx and explicit rate-limit responses are retryable with
backoff, and the worker checks `content_publishing_limit` before a batch.

**7. Partial cross-platform success reported as success.** Control: state lives on the per-target row,
never on the post row. A post is not "published"; each target is.

**8. OAuth CSRF, if OAuth is ever added.** Not applicable to Stage 1 (no OAuth flow). If a later stage
adds one, the `state` parameter must be signed and single-use.

**9. Public asset bucket leaking private media.** Social assets must go to a public R2 prefix that is
categorically separate from the private audio bucket. CRWN already had one incident where a paid track
master returned 200 to a bare curl. Do not reuse that bucket.

---

## 12. Recommended rollout

```
Phase 0  (half a day, do this first, gates everything else)
         Meta app in dev mode. One hardcoded script. Publish ONE real carousel
         to Instagram from the existing Dropbox folder. Prove the format works
         with CRWN's 3:4 4K assets. If this fails, stop and reassess.

Phase 1  (~1.5 days, do this next)
         R2 public upload + Instagram adapter + Facebook adapter +
         admin publish route + publish-carousel.mjs.
         Founder runs one command per batch. Later is dropped for IG and FB.

  ==== GATE: only continue past here if volume actually exceeds ~15/day ====

Phase 2  (~2 days)
         Queue, publish-tick worker, 10-12 daily cron slots, retries,
         idempotency, token-expiry alert, minimal admin list.
         Publishing becomes unattended.

Phase 3  (conditional, do NOT start until Phase 2 is stable and the
         ManyChat post-id question is ANSWERED)
         Verify whether ManyChat can emit the triggering post id. If yes,
         join platform_post_id to content and close per-video attribution
         through the EXISTING source_post_id pipeline. If no, this phase
         does not exist and no code should be written for it.

Phase 4  (only if TikTok/YouTube volume is proven to matter)
         Submit the TikTok audit and the YouTube audit. Keep Later or manual
         posting for both until they clear. Note TikTok cannot exceed
         ~15-25 posts/day/account regardless of audit outcome.
```

TikTok and YouTube are deliberately last, and deliberately conditional. Starting their approval
paperwork now would be reasonable *only* if the audits are treated as background work that blocks
nothing, since they cost calendar time rather than engineering time.

---

## 13. Acceptance criteria for a future implementation

Written so a later implementation task can be verified rather than trusted.

**Phase 0**
1. A real, public, four-slide carousel appears on the founder's Instagram account, posted entirely by
   a CRWN script, with the caption taken verbatim from the repo markdown.
2. No slide is cropped, rotated, or re-encoded in a way that visibly degrades the 3:4 sheet.
3. The script prints the returned Instagram media id and permalink.

**Phase 1**
4. `node publish-carousel.mjs <slug>` publishes to Instagram and schedules the Facebook post, reading
   the caption from `videos/carousels/fan-economy/<slug>.md` and the slides from the generator's
   output folder, with no other founder input.
5. Slides are uploaded to a **public** R2 prefix that is provably not the private audio bucket
   (verified by a bare curl returning 200 on a slide and 403 on an audio master).
6. Running the same command twice for the same slug does **not** produce a second Instagram post.
7. The access token appears in no log line, no client bundle, no API response, and no stored provider
   response. Grep proves it.
8. A browser-client query against `social_accounts` that names the token column returns `42501`, and
   the same query without it succeeds.
9. `platform_post_id` and `permalink` are persisted for every successful target.
10. `npm run build`, `npm test` and `npm run verify:architecture` all pass, and the migration has an
    `EXPECTED_MIGRATION_STATE` row plus a probe line in [scripts/probe-migrations.mjs](scripts/probe-migrations.mjs).

**Phase 2**
11. A post queued for a future slot publishes within that slot without any founder action.
12. Killing the worker mid-publish and re-running it produces exactly one post, proven by test.
13. An invalid-media failure is marked permanent and is not retried; a simulated 5xx is retried with
    backoff and eventually succeeds.
14. Instagram failing while Facebook succeeds leaves one target `failed` and one `published`, and the
    admin view shows both truthfully.
15. An expired token produces an email to the founder, not a silent stall.
16. The worker checks `content_publishing_limit` and declines to start a batch that would exceed the
    24-hour cap.

---

## 14. Scope for the next implementation prompt

If the decision is accepted, the next prompt should build **Phase 0 and Phase 1 only**, and should be
explicitly forbidden from building the queue, the worker, the cron entries, the approval step, any
TikTok or YouTube adapter, and any UI beyond what already exists.

Specifically, it should:

1. Add one migration creating `social_accounts`, `social_posts`, `social_post_targets` as described in
   section 7, with the token column's SELECT revoked from `anon` and `authenticated`, a
   `UNIQUE(post_id, platform, account_id)` constraint, RLS enabled with no client write policy, and a
   self-verifying `DO $$ ... RAISE EXCEPTION ... $$` block. Add the `EXPECTED_MIGRATION_STATE` row and
   the probe line in the same commit, and add the migration to [TODO.md](TODO.md) as founder work,
   linked as a markdown link, since only the founder can apply it.
2. Add `src/lib/social/tokens.ts` as the ONE service-role module that reads a social access token,
   mirroring [src/lib/stripe/connectAccount.ts](src/lib/stripe/connectAccount.ts). No other file may
   name the token column.
3. Add `src/lib/social/instagram.ts` (carousel and single image: child containers, parent container,
   `status_code` polling, publish, error classification) and `src/lib/social/facebook.ts` (Page feed
   with `scheduled_publish_time`). Both pure enough to unit test the request construction and the
   retryable-versus-permanent classification without network access.
4. Add `uploadSocialAsset()` beside [src/lib/r2/client.ts](src/lib/r2/client.ts) writing to a public
   prefix, and confirm in the commit message that it is not the private audio bucket.
5. Add `src/app/api/admin/social/publish/route.ts`, authorized by a **session-derived** admin role,
   never a caller-supplied id.
6. Add `publish-carousel.mjs` at the repo root, matching the conventions of the existing generator
   scripts, taking a slug or an inclusive range exactly as `generate-fan-economy-carousel.mjs` does.
7. Add tests for the request construction, the failure classification, and the double-publish guard.
8. Update [docs/crwn-brain/10-INTEGRATIONS.md](docs/crwn-brain/10-INTEGRATIONS.md) with the new
   provider, correct the stale cron-count claim in
   [docs/acquisition/instagram-manychat-architecture.md](docs/acquisition/instagram-manychat-architecture.md),
   and correct the obsolete Vercel cron-count limit in [CLAUDE.md](CLAUDE.md).

It should NOT touch the ManyChat webhook, the attribution normalizer, the acquisition orchestration,
or `source_post_id` handling. Phase 3 is a separate decision that depends on an unanswered question.

---

## Remaining uncertainty

- **Whether ManyChat can emit the triggering post id is unverified**, and Phase 3's entire value
  depends on it. The tagging doc already warns against promising it. Someone should check the
  ManyChat plan's available system variables before anyone counts on per-video attribution.
- **Which Vercel plan CRWN is on was not confirmed.** 13 daily crons is consistent with Hobby under
  the current 100-per-project limit. The recommended slot design works on either plan, so this does
  not change the recommendation, but it should be confirmed before anyone writes a cron expression
  finer than daily.
- **Instagram's published limit is quoted as 100/24h by Meta's official documentation** while several
  third-party sources still say 25 or 50. The official figure was used. The worker should read
  `content_publishing_limit` at runtime rather than trusting any hardcoded number.
- **Whether 50 pieces/day is the right strategy at all is a founder decision, not an engineering
  one**, and the evidence that it improves ICP artist acquisition does not exist yet. The staged plan
  is designed so that question can be answered before much is spent on it.
- **Nothing here has been tested against a live Meta app.** Every platform claim comes from current
  official documentation. Phase 0 exists specifically to convert that documentation into evidence.
