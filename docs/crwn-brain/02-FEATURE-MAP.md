# 02 — Feature Map

> Complete inventory grounded in `src/`. Status vocabulary: **Production-ready** (routed + real Supabase data + protected) · **Partial** · **Experimental/dark-launched** · **Legacy/deprecated** · **Unused/dead** · **Unclear**. A component existing does NOT mean the feature works — status reflects wiring + data + protection.

## Navigation reality
The primary `(main)` sidebar nav is small — **Home, Explore, Studio (artist) / Command (fan), Messages, Profile** + notification bell (`Navigation.tsx`). But the app has **many extra top-level routes** reached from within features (setup, offers, missions, squads, bounties, campaigns, campaign-hub, city-unlocks, playbooks, proof-of-demand, clip-controls, action-plan, team, earn, impact, recruit, admin…). This gap is the clearest signal that CRWN has grown many parallel surfaces. `Confirmed`.

---

## Authentication & onboarding
| Feature | User | Routes | Key components / DB | Status |
|---|---|---|---|---|
| Login / signup | fan, artist | `(auth)/login`, `(auth)/signup` | `auth/AuthForm.tsx`; `profiles`; Supabase Auth (email/pw, magic link, Google/Apple per types) | **Production-ready** |
| `/welcome` (name/phone/role) | new signup | `(public)/welcome` | `profiles` update, `artist_profiles` insert, `/api/emails`, seed-defaults | **Production-ready** |
| Artist Setup Wizard | new artist | `/setup` | `useArtistSetup`, `onboardingItems.ts`, `OnboardingAvatarStep`; 9 one-field screens; hard gate in `(main)/layout.tsx` | **Production-ready** |
| Onboarding canary | ops | `/api/cron/onboarding-health` | synthetic user RLS/publish/upload check, emails founder on fail | **Production-ready** |
| Legacy `/onboarding` | — | `(auth)/onboarding` | static placeholder, unreferenced | **Unused/dead** |

## Artist profile & public content
| Feature | User | Routes | Status |
|---|---|---|---|
| Public artist profile | visitor/fan | `/[slug]` (+ `layout`, `not-found`, `loading`) → `ArtistProfileContent`, `SubscribeSection`, `ShopSection`, `ClipperProgram` | **Production-ready** |
| Track/Album/Post/Playlist share pages (OG) | visitor | `/[slug]/{track,album,post,playlist}/[id]` → `share/*Content` | **Production-ready** |
| Duplicate `artist/[slug]/*` subroutes | — | `/artist/[slug]/{track,album,post,playlist,book}` | **Legacy/dead** (near-byte-identical dupes, one field drifted; top-level page is a redirect) |
| Explore / discovery | fan | `(main)/explore` → `/api/explore` | **Partial/Unclear** (ranking logic not deep-verified) |
| Home feed | fan | `(main)/home` → posts + tracks + (SupporterMode if flag on) | **Production-ready** (Partial where Quest-flag content) |
| Fan library | fan | `(main)/library` → `PlaylistManager`, `PurchasesSection`; `favorites`, `playlists` | **Production-ready** |
| Favorites/likes | fan | `useFavorites.ts`; `favorites` | **Production-ready** |
| Embed player | external | `/embed/[trackId]` (free tracks only, signed audio) | **Production-ready** |

## Music / albums / playlists (artist)
Managers under `src/components/artist/`: `MusicManager` (`TrackUploadForm`), `AlbumManager`, `ArtistPlaylistManager`, `SortableTrackList`. Tables `tracks`/`albums`/`album_tracks`(`track_number`)/`playlists`/`playlist_tracks`(`position`). R2 audio (128/320), scheduled releases (`scheduled-releases` cron), pre-save. **Production-ready**. `Confirmed`.

## Subscriptions, tiers, gating, payments
| Feature | Routes / files | Status |
|---|---|---|
| Subscription tiers & benefits | `TierManager`, `TierBenefitsSelector/Editor`, `benefitCatalog.ts`, `/api/tier-benefits`; `subscription_tiers`, `tier_benefits` | **Production-ready** (some benefits `available:false` "coming soon") |
| Content gating | `is_free`+`allowed_tier_ids`; `useSubscription`; `GatedTrackPlayer`, `GatedCommunityPost`; entitlement views | **Production-ready** (legacy `useContentAccess`/`access_level` deprecated) |
| Checkout (sub/track/product/booking/live/platform/free) | 12 routes `src/app/api/stripe/*` | **Production-ready** |
| Payouts / Connect | `connect`, `connect/status` (`backfillTierPrices`), `balance`, `cashout`, `fan-cashout`, `team-split-cashout`, weekly-payout cron; `PayoutDashboard` | **Production-ready** |
| Discount codes | `DiscountCodeManager`, `/api/discount-codes(+validate)`; Pro-gated | **Production-ready** |
| Stripe webhook | `/api/stripe/webhook`, `webhookHandlers.ts` | **Production-ready** |
| Team Splits | `TeamSplitBuilder`, `src/lib/teamSplits/*`, `/api/team-splits/*`, `/team/*`, accrual cron | **Production-ready** |
| Subscription mgmt (pause/cancel/update) | `/api/subscriptions/{pause,cancel}`, `/api/stripe/subscription-update` | **Production-ready** (downgrade Stripe-schedule step unverified) |
| Royalty Readiness Check | `/royalty-readiness`, `/api/royalty-readiness`, scorer `src/lib/royalty/readiness.ts`, `royalty_readiness` table, flag `admin_settings.royalty_readiness`, Studio tile hidden until the flag is on | **Shipped, DARK** (migration `schema-phase2-royalty-readiness.sql` unrun). DIAGNOSTIC ONLY: self-reported answers, a 0-100 coverage score, and actions pointing OUT to PRO / MLC / SoundExchange / administrators. Deliberately shows **no dollar figure** and holds no rights data. CRWN is not a publisher or administrator |
| Founder Window | `founder_window_enabled`/`founder_cap`/`founder_deadline` on `subscription_tiers`, `is_founder` on `subscriptions`; config UI in `TierManager`, cap + deadline enforced in `/api/stripe/checkout` (free and paid paths), persisted by `handleCheckoutCompleted` | **Production-ready** (migration run). Grandfathered/locked founder PRICING is NOT built (touches Stripe subscription pricing) |

## Messaging, notifications, community
| Feature | Routes / files | Status |
|---|---|---|
| Direct messages + voice notes | `(main)/messages`, `/api/messages/*`, `MessagesInbox`/`MessageThread`/`VoiceRecorderButton`, `messaging.ts`; `dm_conversations`/`dm_messages`; Pro-artist-gated | **Production-ready** |
| DM broadcast | `/api/messages/broadcast` (audience-targeted) | **Production-ready** |
| Notifications | `NotificationBell`, `notifications.ts`, `/api/notifications/*`; realtime bell | **Production-ready, no push** (dead `/community` link bug) |
| Community feed | `CommunityFeed`, `CommunityPostCard`, `CommentSection` (inside `/[slug]` Community tab); `community_posts/*` | **Production-ready** |
| Community channels | `CommunityChannels`; `community_channels/*`; RLS-gated realtime | **Production-ready** |
| Fan leaderboard | `FanLeaderboard`, `/api/leaderboard` (strips raw spend) | **Production-ready** |

## Live streaming & booking
| Feature | Routes / files | Status |
|---|---|---|
| Live streaming | `/[slug]/live/[sessionId]`, `/api/live/{token,session,chat,...}`, `LiveWatchRoom`/`BroadcasterStudio`/`LivestreamManager`, `livekit.ts`; Pro + agreement gated | **Production-ready** |
| VOD | `/api/live/{vod,watch,egress-webhook}`; egress→R2, signed URL | **Production-ready** |
| Live agreement | `(public)/live-agreement`, `live_agreement_acceptances` | **Production-ready** |
| Live pre-sale tickets | `/api/stripe/live-checkout`, `live_ticket_purchases`; **`src/lib/live/access.ts` is the ONE resolver for "ticket = access"** | **Production-ready** (repaired 2026-07-24). Six gates decided access and only three honored a ticket, so a buyer with no tier hit the Subscribe wall on the watch page and never reached the token route that would have admitted them. `LiveWatchRoom`, `/api/live/chat`, `/api/live/vod` and `calendarReminders` all call the resolver now. **Any new live gate must call it too.** A full refund revokes the ticket (`handleChargeRefunded`); a partial one does not |
| Executive Producer Sessions | `/api/producer/*`, `session_submissions`/`session_polls`/`session_poll_votes`, `src/lib/producer/*`, `SubmissionReviewPanel`/`ProducerSubmitPanel`/`ProducerPolls`; submission columns on `live_sessions` | **Phase 1 shipped, DARK** (`admin_settings.producer_sessions` off, migration `schema-phase2-producer-sessions.sql` unrun). Fan submissions (beat/vocal/idea/reference, private R2), artist review queue, advisory in-session polls. Gated on the live-ticket resolver `src/lib/live/access.ts`. Fan agreement DRAFTED + enforced (`/submission-agreement`, submit route rejects a stale/absent `consent_version`), **pending attorney review before the flag flips** (`consent.ts` stamped `2026-07-24.draft1`). Stage/mic (`stage` role still unminted) + moderation are Phase 2. See `13-CURRENT-STATE.md` |
| Live tips + tip goals | `/api/stripe/live-tip-checkout`, `/api/live/tips`, `live_tips`/`live_goals`, `LiveTipBar`/`LiveGoalsEditor`, `lib/live/tips.ts` | **Dark-launched** (`admin_settings.live_tips`, off) |
| Booking tokens (live flow) | `/api/booking-tokens`, `BookingTokenButton` in `PurchasesSection` | **Production-ready** |
| Calendly booking (old flow) | `CalendlyBooking`/`SessionManager`/`BookingSettings` | **Legacy/unused** (not imported anywhere) |
| My Calendar (fan) | `(main)/my-calendar`, `CalendarMonthGrid` (read-only aggregation) | **Production-ready** |
| Promise Calendar (artist) | `/api/promise-calendar/*`, `PromiseCalendar`; `fulfillment_obligations` | **Production-ready** (not deep-verified) |

## Gamified growth & fan engagement
| Feature | Routes / files | Status |
|---|---|---|
| Quest Engine / Rise Mode / Supporter Mode | `RiseMode`, `SupporterMode`, `src/lib/quests/*`, `/api/quests/*`; `admin_settings.quest_engine` flag **off** | **Experimental/dark-launched** (stays dark until the quest catalog is realigned to the membership strategies) |
| Membership strategy (Release Club / Vault) | `src/lib/membershipStrategy.ts` (pure, tested, deterministic), `/api/artist/strategy` (derived on read; override + declared facts stored on `artist_profiles`, migration `schema-phase2-membership-strategy.sql`), `StrategyCard` on `/profile/artist`, `announce_membership_strategy` pop-up. Spec tier names are ROLES mapped onto the pinned Bronze/Silver/Gold/Platinum rungs | **Live** (2026-08-01) |
| Content classes (free forever / paid first / member only) | `classifyTrack`/`fieldsForClass` in `membershipStrategy.ts`; the ONE access control in `TrackUploadForm` (OptionSelect), encoded onto existing `is_free`/`allowed_tier_ids`/`public_release_date`. Replaced the two-toggle UI whose free+early-access combo locked a track for EVERYONE during the window | **Live** (2026-08-01) |
| Release waterfall (higher tiers first) | `src/lib/waterfall.ts` (spec offsets 30/14/7 by PRICE order, tested), schedule on `tracks.waterfall` (migration `schema-phase2-track-waterfall.sql`), opened ADDITIVELY by the daily scheduled-releases cron; entitlement gate untouched by design. Upload form offers all-at-once vs staggered; fail-soft pre-migration | **Live** (2026-08-01) |
| Live-session templates | `src/lib/liveSessionTemplates.ts` (7 formats incl. free monthly check-in + Executive Producer small room), OptionSelect picker in `LivestreamManager`, prefill-only over existing fields, `audienceTierIds` resolves top/paid/everyone against the real ladder | **Live** (2026-08-01) |
| Missions | `/missions`, `/missions/new`, `(main)/my-missions`, `/api/missions/*`, `missions.ts` | **Production-ready** |
| Mission suggestions | `/[slug]/suggest-mission`, `/api/mission-suggestions/*` | **Production-ready** |
| Squads | `/squads(/new)`, `/my-squads`, `/api/squads/*`, `squads.ts` | **Production-ready** |
| Clip bounties | `/bounties(/new)`, `/my-bounties`, `/api/bounties/*`; non-cash rewards v1 | **Production-ready** |
| City unlocks | `/city-unlocks(/new)`, `/city/[id]`, `/api/city-unlocks/*` | **Production-ready** |
| Road campaigns | `/campaigns`, `/api/road-campaigns/*` | **Production-ready** (list also duplicated inside campaign-hub) |
| Proof of demand | `/proof-of-demand(/new)`, `/[slug]/demand/[testId]`, `/api/proof-of-demand/*` | **Production-ready** |
| Offers (aggregator) | `/offers(/new)` — read-only over tiers+products, no own table | **Production-ready** |
| Action plan | `/action-plan`, `/api/action-plan` (advisory router) | **Production-ready** |
| Earn / Impact / Command centers (fan money) | `(main)/earn`, `/impact`, `/command`; `/api/earn`,`/impact`; `referrals.ts`, `clipperRate.ts` | **Production-ready** |
| Clip controls (VOD → clip mission) | `/clip-controls`, `vod_markers`, `clipperRate.ts` | **Production-ready** |

## Marketing / CRM / acquisition
| Feature | Routes / files | Status |
|---|---|---|
| Email campaigns | `CampaignBuilder`, `/api/campaigns/*`, `scheduled-campaigns` cron; open/click/UTM attribution | **Production-ready** |
| Email sequences | `SequenceBuilder`, `/api/sequences/*`, `sequences`/`sequence-conversions` crons | **Production-ready** |
| Segments | `saved_segments`, `/api/segments` | **Production-ready** |
| Artist CRM | `/api/crm/*`, `FanTable`/`FanDetailDrawer`/`FanCrmSuggestions` | **Production-ready** |
| Fan contacts import | `/api/fan-contacts(/import)`, `FanImportModal`. Import now REQUIRES the artist's versioned permission attestation (`src/lib/fanImportConsent.ts`), stored as `consent_attested_at`/`consent_attestation_version` per row (PGRST204 fallback pre-migration); first import records funnel `fans_imported` | **Production-ready** (attestation columns live; `schema-phase2-fan-invites.sql` applied 2026-07-30) |
| Fan invites (imported contacts) | `campaigns.filters.audience='contacts'` sends through the EXISTING campaign sender to attested, still-subscribed, non-suppressed `fan_contacts`; `testCount` caps to a small test group; unsubscribe flips `fan_contacts.is_subscribed_email`; cron sender refuses scheduled contact campaigns; records funnel `fan_invited`. Launch entry: `/offers/new` done screen → `/studio/fans?view=compose&audience=contacts` | **Production-ready (live)** (`schema-phase2-fan-invites.sql` applied 2026-07-30) |
| Qualified call requests (hand-raiser) | `CallRequestCard` below the unified calculator's pre-signup builder; `POST /api/lead-magnets/call-request` recomputes qualification via canonical `scoreLead`, claims idempotency on `acquisition_events` (one/phone/day), founder alert is EMAIL always (joshn.wms@gmail.com) for `sales_priority` only, optionally mirrored to a carrier email-to-SMS gateway via `FOUNDER_ALERT_SMS_EMAIL` (plain Resend, no Twilio; Twilio SMS alert removed with the SMS feature 2026-07-31); full CRM record in `response_snapshot`, surfaced in `/admin` → Acquisition → Calls with manual statuses | **Production-ready** |
| Smart links / pre-save | `(public)/link/[slug]`, `SmartLinkCapture`/`PreSaveCapture`, `/api/smart-links/*` | **Production-ready** |
| SMS marketing | REMOVED 2026-07-31 (founder decision: A2P 10DLC compliance cost not worth it). `SmsSetup`, `/api/sms/*`, `twilio.ts`, the CRM SMS tab and all SMS limits/mentions were deleted; `sms_*` tables kept dormant for consent history | **Removed** |
| Campaign hub | `/campaign-hub` (Overview/Promotion/Missions tabs) | **Production-ready** (Overview duplicates `/campaigns`; per-campaign breakdown "coming soon") |
| Referrals (fan→artist) | `/[slug]/r/[code]`, `ReferralDashboard`, `/api/referrals/*` | **Production-ready** |
| Recruiter/partner (artist→platform) | `/join/[code]`, `(main)/recruit`, `/recruit/dashboard`, `/partner`, `/api/recruit/*`, recruiter crons | **Production-ready** (pitch page uses intentional mocks + stale pricing copy) |
| Playbooks | `/playbooks(/[runId])`, `/api/playbooks/*`, `ai-playbooks.sql` | **Partial** (run engine thin) |
| **Unified Opportunity Calculator** | The 18th tool and the only ALL-IN-ONE one. `/tools/opportunity-calculator`, model `src/lib/opportunity/unifiedModel.ts` (`unifiedOpportunity@1`), presentation `unifiedAdapter.ts`, live re-derivation `recalcUnified.ts`, coordinated `system` builder in `deliverableSpecs.ts`. **Refuses to add the other tools together**: ONE normalized audience (max, never a sum), ONE unique paying-supporter count, ONE membership ladder with the Vault as its middle TIER, Share-to-Earn and Clip-to-Earn as acquisition (a supporter and attribution split, never a revenue line), and incremental purchases sold ONLY to non-members so a member is never also a ticket buyer. Headline is a conservative-to-high RANGE, with current direct revenue subtracted. 82 tests assert the invariants. `?from=<tool-slug>` entry contexts reorder the wizard for a single-opportunity video. No migration, no flag. Full spec: `docs/UNIFIED_OPPORTUNITY.md` | **Production-ready (live)**, promotion `secondary` (Own Your Fans stays `primary` because it is the assigned experience of the running `oyf-signup-timing-v1` experiment) |
| Lead magnets (loss-revelation tools) | 18 tools (17 single-opportunity + the unified one). Catalog `src/lib/leadMagnets/registry.ts`, adapters `src/lib/acquisition/toolAdapters.ts` (`ACQUISITION_TOOLS`), shared engine `src/lib/acquisition/lossResult.ts` (`buildLossResult`). Public `(public)/tools/[slug]` + tokenized `/tools/[slug]/result/[token]`, artist `/artist/tools/[slug]`. Hero photos `public/tool-*.jpg` | **Production-ready** |
| Loss-result engine | ONE structure for every tool: `headline` (or a `score` gauge when a dollar figure is not defensible), `derivation` infographic, estimate tiles, `scenarios`, `fanLoss`, `flow`, `fix`, assumptions, email-only `emailInsights`. `usesLossEngine: true` in the registry makes the WEB clients render from the adapter, so web and DM show one identical result | **Production-ready** |
| Lead-magnet integrity rules | Every tool's `fix` must point to a CRWN feature that ACTUALLY exists. Every tool's hero must deliver the dollar its DM hook teased (no `$0`, no score gauge where money was promised), so audience-derived tools require only `social_followers` | **Enforced by convention, not by code, and the convention has already failed once.** `executive-producer-session` shipped promising "Fans pitch beats, vocals, and topics live" against a feature that does not exist; corrected 2026-07-24. A tool's `fix`, `cause`, `flow`, `fanLoss`, hero subheadline AND `emailInsights` all make product claims, so check all six |
| DM funnel handoff | ManyChat keyword (`dmKeywords` per tool) resolves a tool by `lead_magnet_id` via `getTool()`, runs the same adapter, returns a tokenized result link | **Production-ready** (see `docs/acquisition/manychat-setup-guide.md`) |
| Opportunity Funnel layer | `src/lib/opportunityFunnels/{registry,analytics}.ts` — typed lifecycle/promotion **view** over the 18 tools (no re-registration); 10 `opportunity_*` + 16 journey + 9 personalized events on the existing sink. **The server allowlist in `/api/lead-magnets/analytics` is DERIVED from `ALL_OPPORTUNITY_EVENT_NAMES`**, not hand-copied: the two lists had drifted, so a client event the server list missed was silently dropped (200 response, row never written). Own Your Fans = **primary**, the unified calculator = **secondary** | **Production-ready (live)** |
| Value-before-signup (Own Your Fans) | `FanCaptureBuilder` (+ signup-boundary variant), `/api/opportunity-drafts/*` (anon draft reuses `lead_magnet_results`, unclaimed-only), `(main)/own-your-fans/plan` resume; claim via existing `user_metadata` token, no migration | **Production-ready (live)** |
| Post-signup journey resolver | `src/lib/journey/resolveJourneyDestination.ts` — ONE resolver: account gate → setup gate (never bypassed) → prefilled builder (`buildDraftConfig`, 8 tools incl. Fan Mission + Proof of Demand) → safe dashboard; `safeInternalPath` returnTo guard; Rise Mode only appends returnTo when flag on | **Production-ready (live)** |
| Experiments (holistic experience A/B) | `src/lib/experiments/*`, `experiments`/`experiment_events` tables, admin **Experiments** tab (experience/funnel/tool/video-campaign/opportunity views + variant readout). Deterministic assignment, **prebuilt-code variants only** (cannot alter pricing/ownership/RLS); projection≠actual. Flag `admin_settings.experiments` **ON**; `oyf-signup-timing-v1` **running** | **Production-ready (live, engine on)** |

## Admin & AI
| Feature | Routes / files | Status |
|---|---|---|
| Admin dashboard | `/admin` (Metrics/Pipeline/Funnel/Sequences/CRM/Email tabs), `AdminDashboard`, `/api/admin/*` | **Production-ready** |
| Artist AI Manager | `AiManagerCard`, `/api/ai-manager/*`, `src/lib/ai/*` (DeepSeek); Pro+ (Free gets rule-based nudges) | **Production-ready** |
| Admin autonomous agent | `AutonomousOpsBar`, `/api/admin/agent/*`, coordination lock, whitelist auto-exec + human escalation; agent tables | **Experimental/internal (dark-launched)** |
| Analytics | `AnalyticsDashboard`, `/api/analytics`; cohort retention, churn benchmark | **Production-ready** |
| Platform sequences / activation nudges | `/api/admin/platform-sequences`, activation-nudges cron | **Production-ready** |
| Sync opportunities | `sync-opportunities` cron (OpenAI-generated listings), `SyncDashboard` | **Production-ready** (synthetic data) |

## Support & help center (shipped 2026-07-31)
| Feature | Routes / files | Status |
|---|---|---|
| Help center | `/support`: search across the 14 getting-started guides, link to `/getting-started`, live chat, and the existing contact form (now CCs joshn.wms@gmail.com and accepts auto-captured context) | **Production-ready** |
| Support live chat | Tables `support_conversations`/`support_messages` (migration `supabase/schema-phase2-support-chat.sql`, **APPLIED 2026-08-01**). Client reads via RLS + realtime; ALL writes via API service-role. `/api/support/chat` (user side, session-auth), `/api/admin/support-chat` (`requireAdmin`). AI answers: DeepSeek `deepseek-chat` with a knowledge prompt from real guide content (`src/lib/supportKnowledge.ts`, env `DEEPSEEK_API_KEY`). **Escalation splits JUDGMENT from FAULT (2026-08-01):** a deliberate escalation ("Talk to a human", or the assistant flagging it) sets `human_requested` and the AI steps back; a FAULT (key unset, API error, empty response) alerts the founder but does NOT lock the thread, so it self-heals once fixed. The prompt leads with TRY FIRST: a vague opener gets a clarifying question, never a hand-off. A "New question" control (`new_thread`) closes the current conversation and opens a fresh one, because the panel always resumes the newest thread and one escalation was otherwise a permanent dead end. Founder emailed a link to `/admin?tab=support` (`SupportChatView`) with a SPECIFIC reason string; admin replies email the user | **Live** |
| Bug-report widget | `BugReportButton`, mounted in the root layout (hidden on auth/setup screens): subtle flag button bottom-right on every page, posts to `/api/support` with category Bug Report + auto-captured page URL/user agent/user id | **Production-ready** |
| Launch announcement | One-time popup `announce_support_chat` (2026-07-31) in the popup registry | **Production-ready** |

## Constraint Engine (artist next-action, shipped 2026-08-03)

CRWN's first artist-facing closed feedback loop, and the consumer of the evidence layer shipped
the same day. **Deterministic end to end: no AI provider is involved, and with every model
offline it returns the same answer.** It reads and never writes: no tier, price, promise,
campaign, quest, XP or Revenue Ramp state is touched, and no roadmap step is ever marked
complete from it.

- **Pure brain** `src/lib/constraint/engine.ts` (`readConstraint(evidence)`), thresholds in ONE
  policy object (`thresholds.ts`, founder-adjustable, no migration to change), evidence
  assembled server-side by `assembler.ts`, surfaced by `GET /api/artist/constraint` (session-only
  ownership, no `artistId` parameter by design) and rendered by `ConstraintCard` **above**
  `RoadmapCard` on `/profile/artist`.
- **Order:** launch gate (delegated to the Roadmap) → FULFILLMENT → RETENTION → REACH →
  FREE_CAPTURE → FIRST_PAID → PAID_TIER_INTEREST → CHECKOUT_COMPLETION → DEPTH → none.
  Fulfillment and retention run FIRST because they protect revenue already earned, while
  acquisition wins revenue not yet earned.
- **Launch readiness stays owned by the Roadmap.** The engine only asks whether enough of the
  machine exists for its numbers to mean anything, via the Quest Engine's own
  `evaluateCondition`. There is no second completion oracle.
- **Evidence discipline:** every input is nullable and null means "cannot evaluate", never zero,
  so a missing table reads as silence rather than as a failing artist. Below a stage's minimum
  sample there is NO diagnosis, not a low-confidence one. Confidence is sample sufficiency
  (`medium` at the minimum, `high` at 2x).
- **Renders nothing** on loading, error, insufficient evidence or a healthy artist, so the
  default experience is exactly today's roadmap. `Confirmed`.
### Cross-artist evidence (Z10, 2026-08-11) — the rule to apply

`src/lib/crossArtistEvidence.ts` (pure, `crossArtistEvidence@1`). **Admin/internal evidence only. It
must not reach an artist.**

**A live leak was found and closed.** `ai/crossArtistPatterns.ts` was injecting a global benchmark
into EVERY artist's Manager prompt with "Weight these patterns when choosing actions". Three defects:
its `n` counted outcome ROWS while the copy said *"Across n artists"* (two rows from ONE artist made
a "cross-artist" claim); that claim carried the other artist's **MRR movement in dollars**; and it
ran without `excludeArtistId`, so an artist could be shown a pattern derived from their own data. It
was also built on Manager's self-derived, zero-defaulted snapshots. **The injection is removed.**

**Three separate gates, never collapsed into one `n`:**
- **Privacy floor** — `PRIVACY_MIN_ARTISTS = 8` **distinct artists**, deduped, before an aggregate may exist.
- **Evidence floor** — `EVIDENCE_MIN_OBSERVATIONS = 200` underlying observations.
- **Reliability gate** — no single artist over `RELIABILITY_MAX_ARTIST_SHARE = 50%` of observations, or the "cohort" is one artist in disguise.

**Method: median of per-artist rates, not a pooled event rate.** Pooled lets the largest artist set
the number for everyone; the median answers "what is typical for an artist here". Unavailable is a
first-class result with a reason, and never a 0. No money is aggregated, no score, no percentile, no
artist id ever appears in the output, and the module holds no database client so it cannot widen its
own cohort.

### Artist-specific learning (Z9, 2026-08-11) — the rule to apply

**Artist A's own past may inform Artist A's own future. Nothing else.** `src/lib/constraint/artistObserved.ts`
(pure) derives this artist's measured rates from the ConstraintEvidence the assembler already
builds: no new query, no schema, no persistence.

- **Two rates today:** free capture (`freeJoinsInWindow / uniqueVisits`) and checkout completion
  (`joins / checkoutStarts`, summed across rungs, never a mean of per-rung rates).
- **Three states:** `no_evidence` / `insufficient_sample` / `artist_observed`. Only the last is
  `active`. A missing value is `null`, **never 0** — "we cannot see your traffic" and "nobody
  visited" are opposite facts.
- **Sample floors and windows are POLICY, read from `thresholds.ts`, never learned.** An artist's
  own history may not move the bar that judges it.
- **Fallback is mandatory.** `rateOrModel()` returns the generic model whenever the artist's rate is
  absent, thin or stale, and always reports which was used. Nobody gets a worse product because
  learning has no data.
- **Provenance, not a score.** Every rate carries numerator, denominator, sample, window, status and
  a plain sentence. Nothing is combined into an index, rating or confidence number.
- **Consumer:** the AI Manager prompt, which may QUOTE an eligible rate and is explicitly forbidden
  from calculating one, estimating an unlisted one, or comparing this artist to anyone else.
- **Cross-artist is impossible by signature:** the module takes one artist's evidence object and has
  no database client at all. Benchmarks, cohorts and "artists like you" remain Z10 questions.

### Recommendation ownership (Z5, 2026-08-11) — the rule to apply

**One recommendation owner, many execution and read surfaces.** Before changing any surface that
tells an artist what to do, place it in exactly one of these five roles. If it wants two, it is
wrong.

| Role | Owner | Answers |
|---|---|---|
| **Diagnosis + priority** | **Constraint Engine** (`readConstraint`) | What matters most right now, and the one corrective action |
| **Launch readiness** | **Roadmap** | What must exist before any of that means anything |
| **Fulfillment obligations** | **Promise Calendar** | What this artist owes a fan, and when |
| **Coaching + execution of the canonical action** | **Manager** | Why it matters and how to handle it (it may re-word the priority, never re-rank it) |
| **Events, deadlines, and unfinished work** | **`/action-plan`, surfaced as "Needs You"** | What happened, what is due, what fans are waiting on |

Everything else (Rise Mode, quests, builders, Studio, playbooks, campaign flows) is **execution**:
it helps complete an action chosen elsewhere and must not select priority.

**Z5 removed, rather than coordinated.** Three Action Plan rules (`no-offer-yet`, `promotion-off`,
`no-demand-test`) fired on a STANDING STATE and were therefore strategy: `no-offer-yet` re-derived
launch readiness the Roadmap already owns, and the other two were evidence-free growth advice that
could appear while the engine had diagnosed FULFILLMENT. They were deleted, not moved: the engine
covers them from evidence and stays silent when the evidence is thin. Every event and deadline rule
was kept, because "a fan pitched you a mission" is a fact, not an opinion about what matters most.
No aggregator, ranking layer or unified-recommendations table was created. Pinned by
`src/lib/constraint/ownership.test.ts`.

**Manager and Action Plan are NOT redundant** (they answer different questions) but they *looked*
redundant: two adjacent Studio tiles with the same category hue, both reading as "tell me what to
do". That is what made Manager appear listed twice. The events feed is now labelled **"Needs You"**;
its route, tour steps and analytics are unchanged.

- **Readership contract (Z4, 2026-08-11):** `src/lib/constraint/readership.ts`, pure.
  **One fact, one owner, many readers.** `readConstraint` owns "what is limiting this artist and
  what is the one next move"; every other surface READS it. A reader MAY re-word it (a manager
  coaches, a mission instructs, a card states). A reader MAY NOT: re-rank it, issue a Z3
  recommendation record (only `/api/artist/constraint` issues, so one diagnosis on five surfaces is
  still ONE logical recommendation), turn `insufficient_evidence` into confident generic advice, or
  touch product state. `constraintRank`/`outranks`/`protectsEarnedRevenue` derive from the ORDER OF
  `CONSTRAINT_TYPES`, so there is no second threshold system to drift.
  **Current readers:** `ConstraintCard` (via `/api/artist/constraint`), the `constraint-outcomes`
  cron (Z3 measurement), and the **AI Manager** cron, which receives `canonicalPriorityBrief()` at
  the top of its prompt and is told it outranks its own decision framework. Growth actions are
  explicitly forbidden while FULFILLMENT or RETENTION stands, because those protect revenue already
  earned. Fail-soft everywhere: a failed read means a null brief and prior behavior, never a
  fabricated priority.

## Cross-cutting
- **PWA** (`sw.js`, manifest) — Production-ready, no push. **Visitor analytics** (hashed fingerprint, bot-filtered) — Production-ready. **Legal pages** (`(public)/{terms,privacy,dmca,artist-agreement,live-agreement}`) — Production-ready. **Marketing pages** (`/about` stale, `getting-started` guides) — mixed. `(public)/worth` is NO LONGER mock UI: it is the Streaming Loss Calculator (renamed 2026-07-18), a real loss-engine experience that also hosts the reusable `IndependenceSection`.

## Duplication watch (for future agents)
- `[slug]/*` (canonical) vs `artist/[slug]/*` (dead dupes).
- `/campaigns` (road_campaigns list) vs `campaign-hub` Overview (same list) — hub is canonical.
- `campaigns` (email) vs `campaign-hub` (growth) vs `road-campaigns` (fan goals) vs `sequences` — distinct concepts, confusingly named.
- Fan **referrals** (→ subscribers) vs **recruiters/partners** (→ artists) — different systems, both use "referral" language.
- Three social layers: legacy `posts/comments/likes` vs `community_posts/*` vs `community_channels/*`.

---

*See also: [06-ROUTES-AND-USER-FLOWS.md](06-ROUTES-AND-USER-FLOWS.md) · [13-CURRENT-STATE.md](13-CURRENT-STATE.md) · [16-GLOSSARY.md](16-GLOSSARY.md)*
