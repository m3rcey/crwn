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
| Quest Engine / Rise Mode / Supporter Mode | `RiseMode`, `SupporterMode`, `src/lib/quests/*`, `/api/quests/*`; `admin_settings.quest_engine` flag **off** | **Experimental/dark-launched** (actively worked, 2 recent bugfixes) |
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
| Fan contacts import | `/api/fan-contacts(/import)` | **Production-ready** |
| Smart links / pre-save | `(public)/link/[slug]`, `SmartLinkCapture`/`PreSaveCapture`, `/api/smart-links/*` | **Production-ready** |
| SMS marketing | `SmsSetup`, `/api/sms/*`, `twilio.ts`; Pro+ | **Partial** (quiet-hour deferral not implemented; dev-stubbed) |
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
