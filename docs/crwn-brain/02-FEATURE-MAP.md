# 02 — Feature Map

## Tier Offer Experience — code live, two migrations PENDING (2026-09-02)

ONE universal renderer for the fan-facing sales presentation of any membership tier,
driven by rows in `tier_offer_experiences` (service-role only) parsed through the one
normalizer. REAL vs EXAMPLE truth is a required preview field; benefit-based CTAs are
enforced at the data boundary; media references must be public URLs. Renders inside the
existing /drop funnel via its single purchase cluster; no config = the previous compact
card. GB is the reference configuration. Canonical doc: 32-TIER-OFFER-EXPERIENCE.md.
The self-serve Offer Builder UI and AI generation are FUTURE, deliberately.

## Fan Automations: link-only funnels (2026-09-02)

A funnel's traffic source is a CHOICE, and a link is one of them. The wizard's first screen
asks where fans come from: **a link I share** (bio, story, QR code, or an external tool like
ManyChat), Instagram, or Facebook. Choosing the link skips the Listen and Reply screens
entirely, requires no Meta connection, OAuth or webhook, and produces the same
`/drop/[token]` funnel: capture, free join, magnet delivery, primary offer, downsell,
canonical checkout, attribution. What makes a funnel link-only at RUNTIME is
`connection_id` being null, and the comment matcher only routes events through automations
that HAVE an active connection, so nothing about the Meta path loosened. The artist copies
the funnel URL from the automation list. `provider = 'link'` is stored as such:
`schema-phase2-fan-automation-link-provider.sql` is applied (service-role evidence 2026-09-03,
a live funnel row carries it). Since 2026-09-03 Rise Mode enters this wizard in two guided
modes, `/build/magnet` and `/build/funnel` (CLAUDE.md, Rise Mode Guided Setup).

## Artist fan-sales engine, Build 1 — live, both migrations applied (2026-09-03)

ONE reusable funnel every artist configures; GB is the first configuration, never the
architecture. The engine's concepts: free membership, PRIMARY paid offer, optional
DOWNSELL, free fallback, nurture sequence, CONVERSION GOAL, attribution. The surfaces are
the existing ones (the `/drop/[token]` funnel and Song Lab offers); Build 1 added the
shared primitives underneath: `resolveFunnelOffers` (generic offer semantics over the
historical gold/silver columns), `conversionGoal.ts` + `goalExit.ts` (sequences stop
selling when the fan reaches the tier they sell, by price rank, exiting via webhook,
cron self-heal, and enrollment refusal), funnel-specific nurture
(`fan_automations.nurture_sequence_id`), first-touch attribution on both claim tables via
the canonical normalizer, validated checkout return paths (`stripe/returnPath.ts`), the
shared free-join disclosure contract, and link-only automation activation (no Meta
connection required; external ManyChat is just a traffic source). Sequences without a
goal are byte-for-byte legacy. Deliberately NOT in Build 1: artist VSLs, benefit
previews, proof/scarcity sections, guest checkout, branching nurture, any new surface.

## Member downloads (stems) — live (2026-09-01)

An artist adds a bundle of files in Studio, Music, and picks which rungs can download it.
Fans see every bundle on the artist page: entitled ones list their files, locked ones show a
title and the rung that unlocks them, because a benefit nobody can see is not a benefit. The
files are private from upload to download. Artist surface `MemberFilesManager`, fan surface
`MemberFilesSection`, logic `src/lib/memberFiles/core.ts` (pure, tested), routes under
`/api/member-files`. The migration is applied and probe-verified: anon reads and writes both
answer 42501, so the table is reachable only through the routes.

## Fan recognition — live (2026-09-01)

Two statuses that behave differently on purpose: **Day One** is earned and PERMANENT (from
`subscriptions.is_founder`, survives cancellation) and the **tier label** is CURRENT and ends
with the membership. Labels are the artist's own tier names, never an industry role, so a badge
can never be read as a songwriting or production credit. Resolved server-side by
`/api/recognition` because `subscriptions` RLS returns only the caller's own row; the route
returns names only, and only for people who have actually posted on that artist's page.

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
| Subscription tiers & benefits | `TierManager`, `TierBenefitsSelector`, `benefitRegistry.ts` (the ONE benefit map; `benefitCatalog.ts` is derived from it), `/api/tier-benefits`; `subscription_tiers`, `tier_benefits` | **Production-ready**. Since 2026-09-03 each key is recommended / additional / manual / retired (doc 33); retired keys still render for old rows |
| Promise to Delivery | `PromiseDeliveryPanel` on `/account/tiers`, `benefitReadiness.ts`, `/api/tier-benefits/readiness`, fast actions via `?benefit=&tier=` pointers into music / member files / playlists / lab / live / the page composer | **Production-ready** (2026-09-03, doc 33). Readiness derived on read, never stored, never a gate |
| Content gating | `is_free`+`allowed_tier_ids`; `useSubscription`; `GatedTrackPlayer`, `GatedCommunityPost`; entitlement views | **Production-ready** (legacy `useContentAccess`/`access_level` deprecated) |
| Checkout (sub/track/product/booking/live/platform/free) | 12 routes `src/app/api/stripe/*` | **Production-ready** |
| Payouts / Connect | `connect`, `connect/status` (`backfillTierPrices`), `balance`, `cashout`, `fan-cashout`, `team-split-cashout`; `PayoutDashboard`. **Artist bank payouts belong to Stripe** (Express, automatic daily, `delay_days: 2`); the `weekly-payout` cron was retired 2026-08-11 having never created a payout | **Production-ready** |
| Discount codes | `DiscountCodeManager`, `/api/discount-codes(+validate)`; Pro-gated | **Production-ready** |
| Stripe webhook | `/api/stripe/webhook`, `webhookHandlers.ts` | **Production-ready** |
| Team Splits | `TeamSplitBuilder`, `src/lib/teamSplits/*`, `/api/team-splits/*`, `/team/*`, accrual cron | **Production-ready** |
| Subscription mgmt (pause/cancel/update) | `/api/subscriptions/{pause,cancel}`, `/api/stripe/subscription-update` | **Production-ready** (downgrade Stripe-schedule step unverified) |
| Royalty Readiness Check | `/royalty-readiness`, `/api/royalty-readiness`, scorer `src/lib/royalty/readiness.ts`, `royalty_readiness` table, flag `admin_settings.royalty_readiness`, Studio tile hidden until the flag is on | **LIVE** (flag `royalty_readiness` ON and migration applied, both verified in production 2026-08-12 by `npm run verify:flags` + `npm run verify:migrations`; an earlier version of this line called it dark because the migration was believed unrun, which was never checked). DIAGNOSTIC ONLY: self-reported answers, a 0-100 coverage score, and actions pointing OUT to PRO / MLC / SoundExchange / administrators. Deliberately shows **no dollar figure** and holds no rights data. CRWN is not a publisher or administrator |
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
| Executive Producer Sessions | `/api/producer/*`, `session_submissions`/`session_polls`/`session_poll_votes`, `src/lib/producer/*`, `SubmissionReviewPanel`/`ProducerSubmitPanel`/`ProducerPolls`; submission columns on `live_sessions` | **Phase 1 LIVE** (`admin_settings.producer_sessions` ON and migration applied, both verified in production 2026-08-12). Fan submissions (beat/vocal/idea/reference, private R2), artist review queue, advisory in-session polls. Gated on the live-ticket resolver `src/lib/live/access.ts`. Fan agreement **FINAL and enforced** (`/submission-agreement`, submit route rejects a stale/absent `consent_version`; `consent.ts` stamps `2026-07-24.v1`, founder-approved). The old "pending attorney review, stamped `.draft1`" claim was stale: no such gate exists in code. Surfaces are grafted onto Live (`/studio/live` submission controls + review queue; fan-side offer and polls on the watch page), not a separate page. Stage/mic (`stage` role still unminted) + moderation are Phase 2. See `13-CURRENT-STATE.md` |
| Live tips + tip goals | `/api/stripe/live-tip-checkout`, `/api/live/tips`, `live_tips`/`live_goals`, `LiveTipBar`/`LiveGoalsEditor`, `lib/live/tips.ts` | **LIVE** (`admin_settings.live_tips` ON, verified in production 2026-08-12; the earnings type migration is applied, so a tip records on the earnings rail) |
| Booking tokens (live flow) | `/api/booking-tokens`, `BookingTokenButton` in `PurchasesSection` | **Production-ready** |
| Calendly booking (old flow) | `CalendlyBooking`/`SessionManager`/`BookingSettings` | **Legacy/unused** (not imported anywhere) |
| My Calendar (fan) | `(main)/my-calendar`, `CalendarMonthGrid` (read-only aggregation) | **Production-ready** |
| Promise Calendar (artist) | `/api/promise-calendar/*`, `PromiseCalendar`; `fulfillment_obligations` | **Production-ready** (not deep-verified) |

## Gamified growth & fan engagement
| Feature | Routes / files | Status |
|---|---|---|
| Song Lab (GB The G1ft fan co-creation, ARTIST-SCOPED) | `/[slug]/lab` (public lab), `/[slug]/join/[offer]` (lead-magnet landing), `/studio/lab` (manager, hidden route: no Studio tile, no AccountHub entry, on purpose), `/api/song-lab/*` (8 routes), `src/lib/songLab/{core,access,server}.ts` (pure core is tested), `src/components/songlab/*`, tables `song_lab_{projects,decisions,votes,offers,offer_claims}` | **LIVE for gb only** (migration founder-applied and probe-verified 2026-08-20). Gate is PER-ARTIST: server-only `artist_profiles.song_lab_enabled` (launch_partner pattern), flipped for slug `gb` only by the migration; no slug literals in code. Async A/B/C decisions are ADVISORY (artist names the winner; a tally never binds), one vote per fan per decision at the DB, eligibility = `is_free` OR active tier in `allowed_tier_ids`. Offers are artist-configurable free lead magnets; claims enroll through the canonical free-join path and record `join_result` + `fresh_signup` as the attribution spine. Recognition is Special-Thanks-class ONLY (`RECOGNITION_DISCLAIMER`), delivered as the `day_one_anr` fan badge. Instagram keeps the top-of-funnel poll; CRWN never ingests Instagram votes |
| Quest Engine / Rise Mode / Supporter Mode | `RiseMode` (board at `/quests`; `/profile/artist` mounts it as `variant="driver"` so the engine keeps running with no board), `SupporterMode`, `src/lib/quests/*`, `/api/quests/*`; `admin_settings.quest_engine` is **ON in production** (verified 2026-08-11, 326 `quest_instances` rows) | **LIVE.** The code default is `false`, which is why this row said dark-launched long after the flag was flipped. Since 2026-09-03 the roadmap's launch stage is the funnel-centric **First revenue** chain and every configuration step opens a guided flow under `/build/<flow>` (five new quest templates, four funnel DomainChecks, `src/lib/funnelReadiness.ts`; CLAUDE.md, Rise Mode Guided Setup) |
| Membership strategy (Release Club / Vault) | `src/lib/membershipStrategy.ts` (pure, tested, deterministic), `/api/artist/strategy` (derived on read; override + declared facts stored on `artist_profiles`, migration `schema-phase2-membership-strategy.sql`), `StrategyCard` on `/account/tiers` (moved off Rise Mode 2026-08-13), `announce_membership_strategy` pop-up. Spec tier names are ROLES mapped onto the pinned Bronze/Silver/Gold/Platinum rungs | **Live** (2026-08-01) |
| Content classes (free forever / paid first / member only) | `classifyTrack`/`fieldsForClass` in `membershipStrategy.ts`; the ONE access control in `TrackUploadForm` (OptionSelect), encoded onto existing `is_free`/`allowed_tier_ids`/`public_release_date`. Replaced the two-toggle UI whose free+early-access combo locked a track for EVERYONE during the window | **Live** (2026-08-01) |
| Release waterfall (higher tiers first) | `src/lib/waterfall.ts` (spec offsets 30/14/7 by PRICE order, tested), schedule on `tracks.waterfall` (migration `schema-phase2-track-waterfall.sql`), opened ADDITIVELY by the daily scheduled-releases cron; entitlement gate untouched by design. Upload form offers all-at-once vs staggered; fail-soft pre-migration | **Live** (2026-08-01) |
| Live-session templates | `src/lib/liveSessionTemplates.ts` (7 formats incl. free monthly check-in + Executive Producer small room), OptionSelect picker in `LivestreamManager`, prefill-only over existing fields, `audienceTierIds` resolves top/paid/everyone against the real ladder | **Live** (2026-08-01) |
| Fan Testimonials (verified fan proof) | `src/lib/testimonials/{core,server,publicRead}.ts`, `/api/testimonials`, `/api/artist/testimonials`, `/api/cron/testimonial-requests` (`0 11 * * *`), `fan_share_experience` pop-up (priority 10, the catalog floor), `TestimonialRequestCard` on `/command`, `/studio/testimonials` library (hamburger-only), `PublicTestimonials` on `/[slug]`. Two triggers only: promise delivered +3d, and 30 days paid and still active. Artist features, fan consents, fan can withdraw. No email, no AI, no rewards | **LIVE 2026-08-12.** Migration applied and probe-verified the same day (public view reads 200; both base tables answer anon 42501). No feature flag: the migration was the gate. Generator ran live and created 7 asks; an immediate re-run created 0. **No testimonial has been collected yet**, which is a fan-response question, not a build question |
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
| Lead-magnet integrity rules | Every tool's `fix` must point to a CRWN feature that ACTUALLY exists. Every tool's hero must deliver the dollar its DM hook teased (no `$0`, no score gauge where money was promised), so audience-derived tools require only `social_followers` plus the proof question (`monetization_status`, always LAST, 2026-08-26: it feeds the ICP scorer, never the number) | **Enforced by convention, not by code, and the convention has already failed once.** `executive-producer-session` shipped promising "Fans pitch beats, vocals, and topics live" against a feature that does not exist; corrected 2026-07-24. A tool's `fix`, `cause`, `flow`, `fanLoss`, hero subheadline AND `emailInsights` all make product claims, so check all six |
| DM funnel handoff | ManyChat keyword (`dmKeywords` per tool) resolves a tool by `lead_magnet_id` via `getTool()`, runs the same adapter, returns a tokenized result link. **TWO questions since 2026-08-26**: the tool's own field, then `monetization_status`, without which `leadScoring` caps the fit at 60 and no DM lead can reach `sales_priority` (the founder alert band, and the band a call request must clear) | **Production-ready** (see `docs/acquisition/manychat-setup-guide.md`) |
| Opportunity Funnel layer | `src/lib/opportunityFunnels/{registry,analytics}.ts` — typed lifecycle/promotion **view** over the 18 tools (no re-registration); 10 `opportunity_*` + 16 journey + 9 personalized events on the existing sink. **The server allowlist in `/api/lead-magnets/analytics` is DERIVED from `ALL_OPPORTUNITY_EVENT_NAMES`**, not hand-copied: the two lists had drifted, so a client event the server list missed was silently dropped (200 response, row never written). Own Your Fans = **primary**, the unified calculator = **secondary** | **Production-ready (live)** |
| Fan Automations (artist comment-to-DM funnels) | Artists connect their own IG professional account / FB Page; a comment triggers the one permitted private reply carrying a `/drop/<token>` link; email capture delivers the magnet (signed R2 / free track), admits the fan via `joinFreeTier`, then Gold offer with Silver downsell through the canonical checkout. Entirely separate from the founder ManyChat engine. Canonical doc: `31-FAN-AUTOMATIONS.md` | **Built, DARK** (migration + Meta app setup pending founder) |
| Value-before-signup (Own Your Fans) | `FanCaptureBuilder` (+ signup-boundary variant), `/api/opportunity-drafts/*` (anon draft reuses `lead_magnet_results`, unclaimed-only), `(main)/own-your-fans/plan` resume; claim via existing `user_metadata` token, no migration | **Production-ready (live)** |
| Post-signup journey resolver | `src/lib/journey/resolveJourneyDestination.ts` — ONE resolver: account gate → setup gate (never bypassed) → prefilled builder (`buildDraftConfig`, 8 tools incl. Fan Mission + Proof of Demand) → safe dashboard; `safeInternalPath` returnTo guard; Rise Mode only appends returnTo when flag on | **Production-ready (live)** |
| Experiments (holistic experience A/B) | `src/lib/experiments/*`, `experiments`/`experiment_events` tables, admin **Experiments** tab (experience/funnel/tool/video-campaign/opportunity views + variant readout). Deterministic assignment, **prebuilt-code variants only** (cannot alter pricing/ownership/RLS); projection≠actual. Flag `admin_settings.experiments` **ON**; NO experiment is running (`oyf-signup-timing-v1` was retired 2026-08-25: content routes a different calculator per carousel post, so Own Your Fans no longer receives one coherent traffic stream). Deleting the CONFIG is the kill switch: a running DB row whose config is absent assigns nothing | **Production-ready (live, engine on)** |

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
  ownership, no `artistId` parameter by design) and rendered as the ONE next move by
  `NextMoveCard` on `/profile/artist` (2026-08-13: it used to be `ConstraintCard` stacked above
  `RoadmapCard`, and both of those files are gone).
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
### One operating flow (2026-08-11) — the rule to apply

**One priority, one action, one return point.** `/profile/artist` is the artist's operating home and
composes the existing owners; it is NOT a new dashboard, aggregator or priority engine.

`resolveOperatingFlow` (`src/lib/constraint/presentation.ts`, pure) reads back which canonical owner
holds the single primary CTA, from the `ConstraintResult` the engine already returned:

| Phase | Trigger | Primary CTA owner |
|---|---|---|
| `launch` | `insufficient_evidence` **with** `missingEvidence` (engine Stage 0) | **Roadmap.** Growth advice is withheld and the artist is told why, in the engine's own words |
| `priority` | `diagnosed` | **Constraint.** The Roadmap drops to a quiet contextual link |
| `steady` | `insufficient_evidence` with **no** `missingEvidence` | **Roadmap.** No priority is invented to have something to say |
| `unknown` | read failed or in flight | **Roadmap**, exactly as before |

- **The page fetches `/api/artist/constraint` ONCE and hands it down.** Cards must not fetch it for
  themselves: two components each deciding they are the most important thing on the page is how two
  identical gold "Do it now" buttons ended up stacked, pointing at different destinations.
- **`withReturnTo(href)` on both canonical CTAs**, so acting on the priority returns the artist to
  the flow instead of stranding them in Studio. Same-site paths only: an absolute or
  protocol-relative URL is left alone rather than becoming an open redirect.
- **Nothing is persisted.** No current-constraint row, no operating state, no second Z3 issuance.
  Only `/api/artist/constraint` issues, so a diagnosis rendered here is still ONE recommendation.
- **`artist_resume_rise`** (Pop-up Engine) prompts an artist to finish Rise Mode work that is
  strictly part done (`quest_instances` open, progress between 0 and 100). Priority 40, below
  Stripe (100) and first broadcast (80); never on `/profile/artist`, which is where it sends them.
  Derived from existing rows, so there is no second progress system.

### Product Drift Prevention (2026-08-12) — the rule to apply

**LIVE.** Canonical doc: [`26-PRODUCT-DRIFT-PREVENTION.md`](26-PRODUCT-DRIFT-PREVENTION.md).
CRWN's ratified ownership boundaries, money rails, identifiers, terminology, reachability and
doc contracts are pinned by an invariant registry (`src/lib/architecture/invariants.ts`) and
enforced by `npm run verify:architecture` (deterministic, ~2.5s, no credentials). Intentional
deviations live ONLY in `src/lib/architecture/exceptions.ts`. The rule to apply: a failing
drift test is either real drift (fix the code) or an intentional rule change (update Brain rule
→ implementation → registry → test, in that order); weakening the test alone is forbidden.
When you add a feature: new destination → hub parity test will hold you to CLAUDE.md's rule;
new notification type → classify it in the taxonomy; new attribution dimension → register it in
`ATTRIBUTION_DIMENSIONS`; new migration → add an `EXPECTED_MIGRATION_STATE` row + probe line;
new pop-up → its key gets frozen and its flag must be in `ANNOUNCEABLE_FLAGS`.

### Fan Drives / Virality Engine V1 (Z11, 2026-08-11) — the rule to apply

`src/lib/campaigns/*`, `supabase/schema-phase3-fan-campaigns.sql`, `/fan-campaigns` (artist),
`/{slug}/campaign` (fan). Canonical architecture and the full live/deferred split:
[`22-VIRALITY-ENGINE-ARCHITECTURE.md`](22-VIRALITY-ENGINE-ARCHITECTURE.md) section 28.
**LIVE: the migration IS applied in production** (probe-verified 2026-08-12; both tables held 0
rows at verification, so live means reachable, not yet used). An earlier version of this line
called it dark, which is the F-11 drift class this file must not repeat.

**A campaign is a DIMENSION over existing evidence, never a second source of truth.** The falsifiable
rule: if a campaign row and the canonical rail can disagree about who earned what, the boundary is
wrong and one of the two is paying real money. `src/lib/campaigns/boundaries.test.ts` asserts this
against the source, so a future change has to argue with a test.

- **Zero new attribution.** No campaign dimension exists on `referrals`, the referral cookie, Stripe
  metadata or any money row. Outcomes are derived by asking the rail a narrower question: referrals
  for THIS artist, credited to someone in THIS participant set, created inside THIS window.
  `idx_fan_campaigns_one_active` (ONE active campaign per artist) is what makes that unambiguous;
  without it, overlapping windows would report one referral as two campaigns' outcome.
- **Zero new money.** `incentive_kind` is CHECK-constrained to `non_cash` at the database, the spine
  carries no money column (the migration asserts it), and the only reward is the EXISTING `promoter`
  badge via `awardFanBadge`, granted on a fact the referral rail already established.
- **Archetypes are DATA.** `src/lib/campaigns/archetypes.ts`. Adding one must touch that registry
  and toolkit copy, never the spine, the results reader or the attribution path. An archetype
  declaring a capability the spine has not built is refused rather than half-run.
- **The constraint gate is server-side and fails CLOSED.** REACH and FIRST_PAID only. FULFILLMENT
  and RETENTION are refused and the canonical action is restated verbatim instead;
  `insufficient_evidence` refuses; a failed constraint read refuses. **FREE_CAPTURE is not served**
  by any V1 archetype: its diagnosis is that visitors arrive and do not join, so more visitors treats
  a symptom upstream of the fault.
- **Reader, never a second recommender (Z4/Z5).** `campaignOfferFor` takes a `ConstraintResult` the
  engine already produced. No campaign surface calls `recordIssuedRecommendation`, so a diagnosis
  shown here and on the dashboard is still ONE logical recommendation; the campaign row stores Z3's
  existing `actionKey`. **There is no `VIRALITY` constraint type and there must never be one.**
- **Null is never zero.** Free members brought in by a participant are UNMEASURABLE
  (`/api/stripe/free-subscribe` writes no referral row), so they report `missing` with the reason on
  screen. So does external reach: CRWN has no social integration and will not rank, pay or recommend
  on a number someone typed in.
- **No leaderboard, and no `ranked` capability declared**, so one cannot appear by configuration.
  Participants see their OWN verified progress; the artist sees their own participant list.

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
  **Current readers:** `NextMoveCard` (via `/api/artist/constraint`), the `constraint-outcomes`
  cron (Z3 measurement), the **AI Manager** (BOTH model calls, see below), and the **Manager
  screen itself**, which renders the canonical priority above its own output and links back to
  Rise Mode rather than duplicating the gold CTA. Growth actions are explicitly forbidden while
  FULFILLMENT or RETENTION stands, because those protect revenue already earned. Fail-soft
  everywhere: a failed read means a null brief and prior behavior, never a fabricated priority.

- **Manager reconciliation (2026-08-11).** Z4 wired the canonical brief into `generateActions` and
  **missed `generateInsights`**, which renders the largest block on the Manager screen. That feed
  carried its own priority policy in prose ("fix retention before anything else", "consider a price
  increase", "acquisition problem"), emitted it as `urgent`, and its title format demanded an
  action verb, so an artist diagnosed as FULFILLMENT could open Manager and read *"Raise Silver
  tier to $15"* in gold. It also hardcoded a cross-artist claim (*"ARPU low relative to peers
  ($8-15/mo is typical)"*) that survived every Z10 gate because it was never a query. Fixed:
  - `src/lib/ai/coachingBrief.ts` is the ONE builder of coaching context (Z4 brief + Z9 rates,
    one evidence read, fail-soft to null). Both Manager routes use it, including the artist's own
    "Refresh" button, which previously ran the insight model with **no canonical context at all**.
  - The insight prompt now states the canonical diagnosis outranks its guides, forbids peer or
    benchmark comparison, forbids computing a rate, and forbids implying a past action CAUSED a
    money change. The peer line is deleted.
  - The Manager screen no longer says "What to do next" or "24/7 assistant": it renders the
    canonical priority first and describes itself as help working that priority.
  - The artist-facing outcome verdict ("Worked" / "No lift" / an MRR figure per action) is
    **removed**. The measurement is unchanged and still feeds Manager's own prompt; it is simply
    no longer presented as a causal result. See the quarantine note under Z3/Z9.
  - `ai/crossArtistPatterns.ts` (the removed Z10 injection) had zero importers and is **deleted**.
  Pinned by `src/lib/ai/managerBoundaries.test.ts` (25 assertions), which fails if any Manager path
  calls `generateInsights(data)` without a brief, issues a Z3 record, reintroduces a peer claim, or
  renders an outcome verdict.

- **Manager measurement loop: PARTIAL RETIREMENT SHIPPED 2026-08-11.**

  **STILL LIVE — Manager action telemetry.** `artist_agent_actions` and `artist_agent_runs` keep
  recording what Manager did: action type, label, params, risk, approval state, execution
  timestamp, result message, failure state, and the coordination lock. This is the one job nothing
  else in CRWN does, and it is what any future admin observability panel reads.

  **RETIRED — the private outcome-scoring layer.** Baseline capture, `outcome_delta` /
  `outcome_metrics` writes, `outcome_score` (all three copies), the `pastOutcomes` prompt block,
  the POSITIVE/NEGATIVE/NEUTRAL verdicts, and "repeat what worked, avoid what failed".
  `src/lib/ai/snapshotMetrics.ts` is DELETED (zero live callers remained; the FRL
  `snapshotMetrics: true` flag in the Money Model is an unrelated identifier). Both Manager
  prompts now explicitly forbid claiming a past action produced a result.

  **CANONICAL EVIDENCE is Z3 + Z9 + the Feedback Loop.** Z3 (`constraint-outcomes`) owns
  recommendation-to-outcome linkage; Manager actions were NOT migrated into it and remain a
  different entity. Z9 reaches Manager through `coachingBrief` unchanged (no sample floors,
  windows or eligibility touched). No replacement learning system was built, deliberately.

  **`cron/outcome-measure` was NOT deleted.** Its name is now historical. Two live consumers that
  have nothing to do with Manager measurement still run there: `expireStallLocks` (shared with the
  ADMIN agent's execute route) and `refreshAllOpportunities` (the opportunity ledger). It returns
  `managerOutcomeMeasurement: 'retired'` so a cron log reads honestly. Two `agent-health` checks
  that measured the retired loop were removed rather than left reporting a permanent zero.

  **SEPARATE FOUNDER DECISION: whether autonomous Manager should be reactivated.** It has been
  dormant since 2026-04-03 (see below) and this task deliberately did not wake it.
  **SEPARATE INFRASTRUCTURE DECISION: what to do with the redundant `weekly-payout`.** Untouched.

  **No admin Manager observability exists.** Not built, not started.

  The original defect analysis, kept because it is the reasoning behind the disposition:

  **What it was.** Manager recommends → action executes → `snapshotArtistMetrics` captures a
  baseline → the `outcome-measure` cron re-snapshots and stores `outcome_delta` → the next
  ai-manager run reads the last 10 measured outcomes, scores each
  (`mrr + activeSubs*100 - churnRate*500`), labels it POSITIVE/NEGATIVE/NEUTRAL and appends
  *"Use these results to inform your recommendations. Repeat what worked. Avoid what failed."*

  **Four defects, in ascending order of severity:**
  1. `snapshotArtistMetrics` zero-defaults everything (`subs || []`, no error check), so a failed
     query is indistinguishable from an artist with no revenue. `revenueRampSeed.currentMrrCents`
     computes the **identical MRR formula** and correctly returns `null` on failure, so the right
     semantics already exist in the repo one file away.
  2. The "7-day window" is a 7-day **minimum** with a 30-day cap (`lte(7d)`, `gte(30d)`), and the
     elapsed time is never recorded. Deltas measured over 7 and 29 days are stored in the same
     field and then ranked against each other.
  3. Measurement is **per-artist, not per-action**: one snapshot per artist is diffed against every
     pending action's own baseline. Whatever the artist's account did in the interval is attributed
     to every action at once. This is not weak attribution, it is no attribution.
  4. It makes the causal claim Z3 exists to forbid. `recommendationOutcome.ts` states no field may
     be named `caused`, `impact`, `attributed` or `score`; this loop has `outcome_score` in three
     places (TS in the cron, the `artist_action_outcomes` SQL view, and the `PastOutcome` type) and
     instructs a model to repeat "what worked".

  **The decision: retire the LEARNING half, keep the TELEMETRY half.**
  - RETIRE: `outcome_score` (all three copies), `outcome_delta`, `outcome_metrics`, baseline
    capture, the `pastOutcomes` prompt block, the view's score column.
  - KEEP: `artist_agent_actions` and `artist_agent_runs` as **execution telemetry** (what Manager
    did, when, result, status). That is the one job nothing else in CRWN does: Z3 records constraint
    recommendations, not Manager actions; Z9 records rates; the Feedback Loop records neither.
  - REPLACE the prompt input with facts rather than verdicts: "this action was already taken on
    date X" prevents redundant recommendations with no causal claim attached.
  - Manager's learning need is already met by Z4 (canonical priority), Z9 (its own eligible rates)
    and Z3 (whether the constraint later cleared). It does not need a private scoring system.

  **Historical cost is zero.** Production holds **0 rows with `baseline_metrics` and 0 with
  `outcome_delta`**, ever; the `artist_action_outcomes` view returns 0 rows. Nothing to migrate,
  nothing to reinterpret, no reason to keep columns for history that does not exist. The JSONB
  columns may simply stop being written.

  **Schema cleanup deliberately deferred.** The `baseline_metrics` / `outcome_metrics` /
  `outcome_delta` columns and the `artist_action_outcomes` view (with its `outcome_score`
  expression) are still structurally present. Nothing reads or writes them. Dropping them needs a
  migration that buys no safety on a table holding zero such rows, so they are marked legacy here
  rather than removed. Do not treat their existence as evidence the loop is live.

- **Manager approval is not perpetual authorization (shipped 2026-08-11).**
  `src/lib/ai/actionValidity.ts` is the deterministic gate. An action executes only when it is
  **authorized AND approved where required AND still valid**, where validity is re-derived from
  current state at the moment of execution, never assumed from the fact that it was once suggested.

  **The defect it closes:** `artist_agent_actions` had no expiry of any kind.
  `/api/ai-manager/execute` matched on `status = 'pending'` and nothing else, and the Manager
  screen rendered an Approve button for every pending row regardless of age. Production carried
  three actions generated 2026-04-03, still offered 130 days later, one of them an
  `adjust_tier_price` marked risk=high. Approving it would have rewritten a live tier price from
  April's analysis of April's numbers.

  **TTL = 14 days, inherited not invented.** CRWN already decided how long Manager output stays
  current: `ai_insights` rows are written `expires_at = now + 14 days` and every reader filters on
  it. An insight is Manager's advice; an action is that advice plus a proposed write, so the write
  may not outlive the reasoning behind it. Deliberately NOT reused: the 7-day action dedup window
  and the 1-hour coordination lock, which are different concepts that happen to be durations.

  **Validity is age THEN target state**, returning one of `expired` / `target_missing` /
  `already_satisfied`. Target checks are artist-scoped, so a stored `tier_id` belonging to someone
  else reads as `target_missing` rather than resolving: `action_params` is a generation-time
  snapshot and is never treated as a trusted pointer. The gate runs BEFORE the coordination lock
  and before any handler, so a stale action costs no lock and no partial write, and it sits inside
  `executeAction`, the ONE function both callers funnel through, so the dormant autonomous path
  inherits it automatically if canonical-priority automation is ever enabled.

  **No schema.** Expiry is derived from `created_at`; the `status` CHECK is unchanged and no
  `expired` value was added. A refused action is recorded `failed` with a structured
  `result_message` (`not_executed:<reason> — <message>`), because `rejected` would falsely imply
  the artist declined it. **No history is deleted or migrated**: the three April rows stay exactly
  as they are and simply stop being offered.

  **Canonical-priority revalidation is NOT implemented, and the reason is structural.** Action rows
  store no constraint type, no `actionKey` and no diagnosis snapshot, so "was this generated under
  REACH, and is the artist now FULFILLMENT?" is not answerable from the row. Adding a *current*
  priority veto at the execution boundary would be a new product rule about what artists may do,
  and a second constraint reader inside execution, so it was refused rather than guessed. Stamping
  canonical context into `action_params` at generation time is the enabling step, and it belongs
  with any future canonical-priority automation.

- **Autonomous (scheduled) Manager: KEEP DORMANT, do not delete. Founder decision OPEN,
  investigated 2026-08-11. Nothing was implemented, reactivated or removed.**

  **Manager is not one feature.** Separate them or the decision is unanswerable:
  *artist-requested* Manager (`/api/ai-manager/generate`, session-auth, works, does NOT depend on
  the broken query), *scheduled* generation (`/api/cron/ai-manager`, dormant), *execution*
  (`/api/ai-manager/execute`, artist-approved, works), *auto-execution* (cron to execute, dormant),
  and *telemetry* (works). Only the scheduled and auto-execution halves are dormant.

  **TWO gates hold it shut, and only one is a bug.** (1) The artist query filters
  `artist_profiles.is_active`, which does not exist. (2) `runAutonomousAgent` returns early for
  `platform_tier === 'starter'`, and **all 9 production artists are `starter`**. So fixing the
  query alone would resume daily rule-based nudges and push notifications for 9 artists but
  generate **zero** actions and execute nothing. **Autonomy re-arms itself the day one artist
  upgrades to Pro**, with no further code change. That is the real deadline on this decision.

  **The auto-execute allowlist is two actions and both email fans without the artist seeing it.**
  `toggle_sequence` (activating a sequence starts its sends) and `send_reengagement` (enrols up to
  50 inactive fans, which `/api/cron/sequences` then emails). **`send_reengagement` duplicates
  `/api/cron/inactive-subscribers`**, which already does the same 14-day-inactive enrolment
  deterministically, daily at 04:00, and 7 active `inactive_subscriber` sequences exist. If
  autonomy ever returns, that action should be dropped from the allowlist rather than restored.

  **The action vocabulary is misaligned with CRWN's own priority order.** None of the 8 action
  types can serve FULFILLMENT or RETENTION, the two constraints that outrank everything else. So
  when the canonical brief correctly forbids growth actions, Manager's entire toolkit is
  ineligible and the best available outcome is zero actions.

  **The coaching brief cannot tell launch-gated from steady-state.** `canonicalPriorityBrief`
  returns null for BOTH (neither is `diagnosed`), so a half-launched artist and a healthy artist
  produce the same null, and the model falls back to its own decision framework in both cases.
  `resolveOperatingFlow` makes that distinction for the UI; the brief does not. Any future
  automation must close this gap first.

  **Evidence status: proactive need is UNKNOWN, not supported.** Z3
  (`constraint_recommendations`) holds **0 rows**, so CRWN has never recorded a canonical priority
  going unresolved and cannot yet show an execution gap exists. Approval history across the whole
  dataset is 1 approved, 1 rejected, 3 abandoned for 130 days. Nothing here supports the claim that
  artists want, trust, or benefit from autonomous execution, and absence of evidence is not
  converted into a need.

  **Reconsider only when:** Z3 shows canonical priorities repeatedly going unresolved (metric
  exists, threshold is a founder call), artist-requested Manager shows real usage, and the same
  safe action class is repeatedly approved by hand with low rejection. If autonomy returns it
  should be **canonical-priority automation only** (act in service of the existing Constraint
  Engine answer), never an independent strategist.

- **The Manager has not run since 2026-04-03.** `/api/cron/ai-manager` filters
  `artist_profiles.eq('is_active', true)` and **that column does not exist** (`42703` in
  production; `profiles.is_active` is a different table). No error check, so `data` is `null` and
  the cron early-returns "No active artists" daily, while its heartbeat makes `agent-health`
  report it healthy. `/api/cron/weekly-report` and `/api/cron/weekly-payout` share the bug.
  **No artist is unpaid:** all 7 connected accounts are on Stripe's own `daily` automatic payout
  schedule, so weekly-payout is redundant rather than a leak, though it still takes the weekly
  `cron_run_log` lock before failing. Tracked in `TODO.md`. Resurrecting the Manager is a product
  decision, not a bug fix, and is sequenced after the retirement above.

- **Promise reminders: ONE owner, settled 2026-08-11.** `promiseReminders` (via the
  `scheduled-releases` cron) is the **only** system that emails an artist about a fan promise. It
  filters through `onlyFanPromises` and honours each obligation's `reminder_offsets` (default
  `[7,3,1]`). `calendarReminders` (via the `sequences` cron) **no longer reads
  `fulfillment_events`** and is now **fan-only**: livestream reminders plus campaign / mission /
  bounty / proof-of-demand deadlines.

  **Why it changed:** both read the same table and emailed three hours apart, deduping against
  ledgers that cannot see each other (`metadata.reminded_offsets` vs the `calendar_reminders` claim
  table). Production had already claimed 16 `fulfillment_event` reminders on both channels. The
  earlier eligibility fix made this worse in the sense that mattered, since what remained doubled
  up was the genuine obligations. `promiseReminders` won because configurable lead times are a real
  artist-facing setting the other sender structurally cannot honour.

  **Ownership, durable:** Promise Calendar = what is owed to fans. Revenue Ramp = business
  progression, never a fan obligation. Lifecycle email (`activation-nudges`, `onboarding-reminder`)
  = state-aware CRWN coaching. Constraint = current priority. Manager = explanation and execution.

  **Lifecycle email is already state-aware**, verified rather than assumed: `activation-nudges`
  gates each rule on a milestone PRESENT and another ABSENT, so possessing `stripe_connected`
  disqualifies an artist from the connect-Stripe nudge. Checked across all 9 production artists and
  7 milestone combinations: **no reachable stale-stage email exists.** Nothing was invented to
  "personalize" a system that already was.

  **Gap CLOSED (F-06, 2026-08-12):** the artist-facing direct `notifications` inserts were routed
  through `createNotification`, the remaining direct writers are the documented fan-facing /
  artist-authored allowlist, and `src/lib/comms/chokepoint.test.ts` walks the whole tree and
  enforces the allowlist in both directions.

- **Rise Mode Resume reconciled 2026-08-11. It is a POP-UP OVER CANONICAL QUEST STATE, not a
  Resume Engine.** There is no resume table, no resume progress store and no second ranking.

  **Source of truth:** `quest_instances`. `resumable` is derived in `/api/popups` as the single
  highest-progress OPEN instance with `0 < progress_percent < 100`. That is the same rule as
  `recommendNextQuest`'s "finish what is underway" branch, deliberately, so the prompt and Rise
  Mode can never disagree about which piece of work is meant. **Cross-device works for free**
  because nothing is stored client-side.

  **Precedence and frequency:** priority 40, below Stripe (100) and first broadcast (80), so
  continuation never outranks money that cannot reach the artist. `everyN` 4 days, max 3, plus the
  engine's one-pop-up-per-user-per-day cap. `/profile/artist` is excluded from its pages, so it
  cannot fire on its own destination. Dismissal is a pop-up-engine concern and never marks the
  quest abandoned; completion ends eligibility naturally with no `resume_completed` record.

  **THE CORRECTION: quest progress does not prove engagement.** The prompt used to open with
  *"You left something half done"* and *"Work you already started is sitting there unfinished"*.
  CRWN cannot support that. `syncQuest` sets `in_progress` automatically whenever an evaluated
  condition rises above 0 (`nextStatus = result.progressPercent > 0 ? 'in_progress' : ...`), and
  those conditions are DomainChecks over live database state. Progress climbs because the ACCOUNT
  changed, not because anyone opened a quest. There is no `started_at`, no accept step and no quest
  event log. Measured in production: **all 16 eligible instances were `domain`-kind**, including
  *"Reach $1,000 per month in recurring support" at 4%* and *"Reach 25 supporters" at 40%* — outcome
  targets that advance as the business grows, with no position to return to. The copy now claims
  only that a goal is partway, which is true at 4% and at 90%.

  **Known limitation, documented rather than hidden:** eligibility still cannot distinguish "the
  artist began this and stopped" from "these conditions happen to be partly satisfied". Narrowing
  it needs an engagement signal CRWN does not record, and changing this predicate alone would
  desync it from `recommendNextQuest`. Founder decision, logged in TODO.

  **Distinct from onboarding resume**, which is `/setup`'s own DB-derived completion gate, and
  **distinct from the Constraint Engine**, which owns what matters now. Resume owns continuity of
  unfinished execution only, and it does not diagnose, rank opportunities, issue Z3 or involve
  Manager. Pinned by `src/lib/riseResume.test.ts`.

- **Needs You boundary reconciliation SHIPPED 2026-08-11.** Needs You now owns **events, deadlines
  and unfinished attention, and nothing else.**

  **Removed:** the calculator-derived mission block. It turned a pre-signup calculator into a ranked
  recommendation ("Build Membership ($X/mo)") and hardcoded the top one to `high`, so an artist
  diagnosed FULFILLMENT could see "deliver your overdue promise" on Rise Mode and a growth mission
  ranked high on Needs You at the same moment. Manager is forbidden from contradicting the canonical
  priority (Z4); this path had never been given that rule.

  **NOT removed: the calculator commitment itself.** `buildLeadMagnetMissions` is untouched and
  Rise Mode still calls it in `/api/quests`, still leading with `missions[0]`. Rise Mode is the
  right home because a calculator commitment is a long-term destination and Rise Mode is what
  remembers progress against it. There is now exactly ONE reader, pinned by test. Production blast
  radius: **1 artist, 7 items**, zero rows deleted (17 claimed results and 326 quest_instances
  unchanged).

  **Urgency is not priority.** `ActionPlanPriority`/`ActionPlanRecommendation` became
  `NeedsYouUrgency`/`NeedsYouItem`. `high` here means a deadline is close or something is overdue,
  never "this is your most important business problem". Ordering deadlines is legitimate; ranking
  strategy is not. The wire field stays `priority` deliberately: renaming it would break the page
  for terminology alone.

  **`/action-plan` and `/api/action-plan` are LEGACY COMPATIBILITY PATHS and stay.** The
  user-facing concept has been Needs You since Z5. Do not "fix" the path: `tourId: 'action-plan'`
  is a persistence key, so renaming it would replay the tour for every artist who already dismissed
  it, and historical analytics are keyed to the surviving item ids (`clip-window-closing`,
  `pending-fan-suggestions`, `proof-of-demand-met`), which are unchanged.

  **A prior test assertion was deliberately reversed.** Z5's `ownership.test.ts` listed
  `lead-magnet-mission` as an event signal that must SURVIVE. That classification was wrong and is
  now in the must-NOT-appear list, with the reasoning inline.

- **"Action Plan vs Manager" investigation, 2026-08-11 (the reasoning behind the change above):**

  **The question is partly a naming artifact, and that is the first finding.** There is no surface
  called "Action Plan" any more: Z5 renamed it and `ownership.test.ts` pins the rename in both
  navigation surfaces. The Studio tile, the AccountHub entry and the page `<h1>` all say **"Needs
  You"**. What still says "Action Plan" is the *internal* vocabulary: the route `/action-plan`, the
  API path, `ActionPlanRecommendation`, `ActionPlanPriority`, `actionPlanTourSteps.ts` and the API
  header comment ("the artist's next best moves, ranked"). The route path is kept deliberately so
  existing links and analytics resolve, and that is pinned too. **The label moved; the code did
  not, and that drift is why this question keeps getting asked.**

  **Manager and Needs You are NOT the live redundancy.** Z5 separated them and Z4 subordinated
  Manager to the Constraint Engine. Manager produces at most 5 insights or 4 approval-gated
  actions, all under a canonical brief that outranks its own framework. It generates no ordered
  multi-step plan and no launch sequencing.

  **The live overlap is inside Needs You**, which does two different jobs:
  1. **Events and deadlines** (3 deterministic rules: `clip-window-closing`,
     `pending-fan-suggestions`, `proof-of-demand-met`). This is its canonical job and it is correct.
  2. **The calculator commitment** (`buildLeadMagnetMissions`): the pre-signup calculator an artist
     completed becomes a mission like "Build Membership ($X/mo)". **One source, two readers** by
     design: Needs You renders them all ranked, Rise Mode leads with `missions[0]`.

  **The conflict, stated precisely.** The top calculator mission is assigned
  `priority: i === 0 ? 'high' : 'medium'` and the code comment says it "leads the whole plan". That
  ranking is derived from a pre-signup calculator and is **not subordinate to the Constraint
  Engine**. So an artist diagnosed FULFILLMENT can see "deliver your overdue promise" on Rise Mode
  and "Build Membership ($X/mo) — high" on Needs You at the same time. Manager may not contradict
  the canonical priority (Z4 forbids it); this path never received that constraint.

  **Production, 2026-08-11 (supported, not proven — 9 artists is a tiny sample):** Rise Mode
  dominates with **326 quest_instances**. Needs You's event rules have almost nothing to fire on
  (0 pending mission suggestions, 0 clip bounties, 1 proof-of-demand). Of 17 claimed calculator
  results, 7 map to a mission but they belong to **1 distinct artist**. Manager holds 7 actions and
  7 insights. Z3 holds **0** rows, so the Constraint Engine has never actually issued.

  **Recommended boundary (not implemented):** Needs You owns EVENTS. The calculator commitment
  belongs where it is already primary (Rise Mode) or must be explicitly subordinated to the
  canonical priority rather than self-ranking `high`. Then rename the internal vocabulary to match
  the label so the surface stops re-inviting this question. Sequence and full reasoning in the
  investigation report; no code was changed.

- **Communications Governor V1 (G1 + G2) SHIPPED 2026-08-11. Scope is deliberately narrow; read
  the scope line before assuming anything else is governed.**

  **GOVERNED:** artist-facing, CRWN-authored **notifications**. That is all.
  **NOT GOVERNED:** lifecycle email, the pop-up engine (it has its own channel-local governor and
  was not migrated), artist-authored fan campaigns and broadcasts, fan transactional mail, and
  receipts. Those are out of scope by decision, not by omission.

  - **`src/lib/comms/taxonomy.ts`** — eight classes in precedence order (`critical`,
    `fan_obligation`, `launch_blocker`, `constraint`, `event_deadline`, `continuation`, `growth`,
    `celebration`), owners, and the notification-type registry. **Manager is never the owner of a
    priority**: `ai_insight` is owned by `constraint`, because Manager is the voice and the engine
    is the owner. That is Z4/Z5 surviving into communications.
  - **`src/lib/comms/governor.ts`** — PURE. Its only import is the taxonomy, asserted by test. It
    governs ATTENTION and never diagnosis: no `readConstraint`, no database, no AI, no clock. It
    arbitrates between candidates whose legitimacy their owners already established.
  - **Integrated at `createNotification`**, the one chokepoint all twelve producers already call.
    **No producer changed**, because classification keys on the `type` string they already pass:
    the information needed to govern was flowing all along and was simply never read. Cost is an
    object lookup plus a pure call. **No new query, no new schema.**

  **Founder decisions encoded (2026-08-11):**
  1. **No global cross-channel cap.** There is no counter, budget, quota or cooldown anywhere in
     the governor, asserted by test. CRWN has no shared send history across email, notifications
     and pop-ups, so a global cap would be enforced against evidence CRWN does not have. Existing
     channel-local caps (pop-up one-per-day, `notify-subscribers` 8/day) remain authoritative.
  2. **Celebrations coexist but never displace.** In a feed a celebration is always delivered
     alongside a fan obligation. Where a channel admits one winner the obligation wins and the
     celebration is **deferred, never suppressed**: losing a moment is not being cancelled.

  **V1 emits no `suppress` at all.** The only non-delivering outcome is `defer`, and only for a
  growth-class notification when the caller **positively** knows the artist is launch-blocked or
  owes a paying fan. Context fields are optional and `undefined` means UNKNOWN, never false
  (`=== true` checks, asserted by test), so a producer that knows nothing gets exactly the previous
  behavior. Critical fails OPEN in every channel. An unclassified type delivers ungoverned, because
  a boundary introduced under live traffic that failed closed would silently mute a new feature.

  **Deliberately thin enforcement, and why.** Growth suppression against the canonical constraint
  would require a Constraint Engine read on every notification write, which was refused on
  performance grounds. V1 is therefore a boundary plus a classification with narrow enforcement,
  and enforcement grows only as producers supply context they already hold.

- **Promise reminder boundary FIXED 2026-08-11 (both communication readers).** Z12 applied
  `isFanPromiseEvent` to the three readers that DECIDE and missed both that COMMUNICATE.
  `promiseReminders` selected `metadata` and never filtered; `calendarReminders` did not select
  `metadata` at all, so it could not have filtered. Both were LIVE daily (06:00 and 09:00).
  **Measured on production at the moment of the fix: all 12 events inside the 8-day reminder
  window were Revenue Ramp steps** with titles like *"Personally message your 50 most engaged
  fans"*, each about to be emailed as "Promise due in N days" as though a paying fan were waiting.
  `calendarReminders` went from 94 pending events to 4. Both now use the shared boundary
  (`onlyFanPromises` in JS, `FAN_PROMISE_FILTER` in the query); neither re-expresses the rule with
  its own literal, asserted by test.

- **Communications governance investigation (2026-08-11), retained because the findings still
  describe what is NOT governed:**

  **How many systems can independently decide "the artist should pay attention to this now"?**
  That is the question that decides whether a governor is needed. Answer, from code: **one channel
  is governed, two are not.**
  - **Pop-ups: genuinely governed.** `src/lib/popups/index.ts` enforces max ONE pop-up per user per
    calendar day, per-pop-up frequency (once / max N / every N days), eligibility targeting, and
    priority-sorted single-winner selection. It is a real attention governor. It is also
    **channel-local**: it cannot see email or notifications, and they cannot see it. LIVE in
    production (`admin_settings.popup_engine = {enabled:true}`; CLAUDE.md still says "off by
    default", which is stale, `13-CURRENT-STATE.md` is correct).
  - **Notifications: ungoverned.** `createNotification` is a bare INSERT with no cap, no dedupe,
    no priority, no expiry. Any feature may create unlimited notifications, and 12 modules do.
    Production: 183 rows, **41 in a single day**, with quest/level-up/milestone celebrations the
    largest share. One quest completion can fire three notifications.
  - **Lifecycle email: locally suppressed, globally ungoverned.** Each sender has its own
    mechanism (a `onboarding_nudge_sent_at` column stamp, a sequence-enrollment row, a claim
    table, a rate-limit key). **There is no email send-history table**: `email_suppressions` is a
    bounce/complaint list for deliverability, not a log. So cross-channel frequency governance is
    **impossible today without new persistence**, and any claim otherwise is wrong.
  - Every `checkRateLimit` in the codebase is an **abuse limit on user-initiated actions**, not a
    cap on CRWN-originated attention. Different concept; do not count them as governance. The one
    genuine outbound cap is artist→fan `notify-subscribers` (burst + 8/day), which is correct and
    is **artist-authored**, not CRWN-originated.

  **The distinction that must survive into any implementation:** the governor governs ATTENTION,
  never diagnosis. It may decide which of several legitimately-owned communications is delivered,
  deferred or suppressed. It may never decide what the artist's problem is: that is
  `readConstraint`, and a second one would undo Z4/Z5.

  **Provable collisions (not hypothetical):** `promiseReminders` (06:00, via `scheduled-releases`)
  and `calendarReminders` (09:00, via `sequences`) can email the same artist about the SAME
  `fulfillment_event` on the same morning; each dedupes only against itself. Uncapped quest
  celebrations can burst alongside anything. See the fan-obligation defect below, which is a bug
  to fix directly, NOT something to defer into a governor.

  **Proposed shape (for review, not built):** a pure `governCommunications(context, candidates)`
  over candidates that already carry an owner, with classes ordered by CRWN's EXISTING decisions
  rather than a new hierarchy: `critical` (security/billing/transactional, always bypasses) >
  `fan_obligation` (Promise Calendar) > `launch_blocker` (Roadmap) > `constraint` (Constraint
  Engine) > `event_deadline` (Needs You) > `continuation` > `growth` > `celebration`. Dominance
  alone is insufficient: a payment failure and a fan promise due tomorrow both need delivery, so
  the model needs coexist/defer/suppress, not one winner. Fail OPEN for `critical`, defer for
  optional coaching, and treat unknown history as unknown (never as "nothing was sent").

- **Manager admin observability SHIPPED 2026-08-11: `/admin?tab=managerops`, labelled "Artist
  Manager". Read-only. It is an instrument, not a strategist and not a cockpit.**

  **Placement:** a tab inside the EXISTING admin shell, not a new route, so it inherits the admin
  gate, nav and layout. Labelled **Artist Manager** specifically so it cannot be confused with the
  Agent Diagnosis panel on the Dashboard tab, which is CRWN's OWN business agent (funnel, pipeline,
  partners, CRM → `autonomous_run_log`). Two agents, two subjects; the founder must never have to
  work out which one they are looking at.

  **What it answers:** is the daily job running and *doing anything*; is scheduled autonomy dormant
  (yes, by decision); when Manager last produced anything artist-visible; how many actions are
  awaiting approval vs expired unactioned; oldest valid pending age; approved / rejected /
  abandoned as COUNTS; executed and failed; failures classified by cause; insight volume and
  liveness; and a recent-actions table keyed by public artist slug.

  **The health rule.** `deriveCronState` has THREE states, and the middle one is the whole point:
  `running_no_work` is distinct from `running_with_work` and from `not_running`. CRWN has already
  been burned once by health-by-completion, when the ai-manager heartbeat let `agent-health` report
  a four-month outage as healthy. The heartbeat `detail` string is shown VERBATIM, because the cron
  itself already records the reason ("No active artists" vs "processed N, insights X…"), which is
  how "nothing to do" stays distinguishable from "broken" with no new telemetry.

  **No schema was added.** Everything derives from `artist_agent_actions`, `artist_agent_runs`,
  `ai_insights`, `cron_heartbeat` and `artist_profiles.slug`. Expiry is read from the ONE cutoff in
  `ai/actionValidity.ts`, so the panel can never disagree with the execution gate about what
  "expired" means.

  **Refused on purpose:** no outcome score, no POSITIVE/NEGATIVE verdict, no "worked"/"no lift", no
  MRR delta, no artist ranking, no cohort comparison, and **no approval percentage** (the sample is
  single digits; a rate there reads as a finding and carries none, so only counts are shown). The
  route selects explicit columns rather than `select('*')`, because the retired
  `outcome_delta`/`outcome_metrics`/`baseline_metrics` columns still physically exist and their
  existence is not permission to ship them. **No mutation exists**: no POST/PUT/PATCH/DELETE, no
  write call, no button, no click handler, and no `?artistId=` to point at anyone. Pinned by
  `src/lib/admin/managerOps.test.ts`.

  **Known instrumentation gap, reported rather than faked:** provider/model failures are NOT
  observable. When DeepSeek fails, `generateInsights` returns `[]` and `runAutonomousAgent` catches
  and inserts no run row, so a failed model call leaves no queryable trace. There is deliberately
  no provider-health panel guessing at it.

- **There is NO admin Manager STRATEGIST, by verification.** `admin/agent/*`, `AgentInsights` and
  `AutonomousOpsBar` are **CRWN's own business agent** (scopes: dashboard, pipeline, partners,
  funnel, sequences, email, CRM) writing `autonomous_run_log`. `ApprovalsManager` is user and
  invite-code approval. Neither is Manager, and **no `/admin` surface reads
  `artist_agent_actions`, `artist_agent_runs` or `ai_insights`.** The only observability of the
  artist Manager is the daily `agent-health` cron, which emails the founder. If one is ever built
  it must be **observability, not a second strategist**: an admin may inspect what Manager did and
  why, never decide what an artist should do next.

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
