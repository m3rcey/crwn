# CRWN — Product Requirements Document

**Version:** 1.3
**Date:** March 25, 2026
**Product:** CRWN (thecrwn.app)
**Status:** Live (Production)

---

## 1. Executive Summary

CRWN is a music monetization SaaS platform where independent artists sell subscriptions, tracks, albums, digital products, and experiences directly to fans. The platform enables direct artist-to-fan relationships with features for content creation, audience engagement, automated email/SMS campaigns, and earnings management.

**Business Model:** Artists pay platform subscription fees (Starter: free → Empire: $350/mo) with decreasing platform commission rates (8% → 3%). The platform takes a percentage of all fan-to-artist transactions processed through Stripe Connect.

**Tech Stack:** Next.js 16 (App Router + Turbopack), Supabase (Postgres/Auth/Storage), Stripe Connect, Tailwind CSS 4, Resend (email), Twilio (SMS), Cloudflare R2 (media storage). Deployed on Vercel.

---

## 2. User Roles

### 2.1 Fan
Discovers and supports artists through subscriptions, purchases, and referrals. Accesses gated music, community posts, and exclusive products.

### 2.2 Artist
Creates and monetizes music, digital products, and experiences. Manages subscribers, runs email/SMS campaigns, and tracks revenue analytics.

### 2.3 Partner (Influencer)
Music industry influencer or professional who earns flat fees, recurring commissions, and content bonuses for referring artists to the platform. Scored and tiered based on reach, engagement, and audience alignment.

### 2.4 Admin
Internal platform operator with access to KPI dashboards, sales pipeline, artist notes, and platform-wide automation sequences.

---

## 3. Authentication & Onboarding

### 3.1 Authentication
- Email/password signup and login
- Magic link (passwordless) login
- Google OAuth
- Apple OAuth
- Password reset flow via email
- Session management via Supabase Auth (PKCE code exchange, JWT cookies)

### 3.2 Onboarding Flow
1. **Role Selection** — Fan or Artist
2. **Profile Setup** — Display name, phone number (optional)
3. **Artist Setup** (if artist role) — Auto-creates artist profile with URL slug, tags `acquisition_source` (organic/recruiter/partner), records `onboarding_completed` activation milestone
4. **Conversion Marking** — If recruiter code present, marks the corresponding referral click as converted (30-day attribution window)
5. **Guided Tour** — Role-specific walkthrough using Driver.js
6. **Post-Tour Action Picker** (artists only) — "What do you want to do first?" modal with three quick-action options: upload first track, set up subscription tiers, or customize profile

---

## 4. Fan Features

### 4.1 Music Discovery & Playback

**Explore Page (`/explore`)**
- Search artists and tracks by keyword
- Trending tracks section
- New releases feed
- Featured/popular artists

**Music Player**
- Persistent mini-player across all pages (never lost during navigation)
- Full-screen player view with album art, queue, and controls
- Play/pause, skip, previous, seek, volume
- Queue management (add, remove, reorder)
- Audio quality selection: 128kbps (stream) or 320kbps (premium)
- Play count tracking per track

**Content Access Model**
Every piece of content (track, album, post, product) uses three fields for gating:
- `is_free` (boolean) — Anyone can access
- `allowed_tier_ids` (UUID array) — Only fans on specific subscription tiers
- `price` (integer, cents) — One-time purchase required

### 4.2 Artist Profiles (`/[slug]`)
Public-facing artist pages with:
- Bio, avatar, banner image, social links
- Subscription tiers with pricing and benefits
- Released music (tracks, albums, playlists)
- Community feed (posts, polls, media)
- Shop (digital products, merch, experiences, bundles)
- Booking (Calendly-integrated sessions)

### 4.3 Subscriptions
- Multiple tiers per artist (e.g., The Wave $10/mo, Inner Circle $50/mo, Throne $200/mo)
- Automatic renewal and failed payment handling
- See §4.7 Subscription Management for pause, cancel, and management details

### 4.4 Library (`/library`)
- **Purchases** — Owned digital products, albums, and tracks
- **Liked Songs** — Personal favorites playlist
- **Playlists** — Create and manage public/private playlists
- **Referrals** — Referral earnings dashboard

### 4.5 Fan Referral Program
- Each fan gets a unique referral link: `thecrwn.app/[artistSlug]/r/[fanUsername]`
- Earn 5–10% commission on referred fans' subscription payments
- Referred fan must maintain a paid subscription for 30+ days to qualify
- Commissions tracked monthly, paid via Stripe Connect
- Dashboard showing active referrals, earnings history, and payout status

### 4.6 Communication Preferences
- Per-artist opt-in toggles for email marketing and SMS marketing
- Notification frequency: "Real-time" or "Weekly Digest" mode
- Digest-only mode sends one Sunday summary instead of individual emails
- Unsubscribe options: per-campaign, per-sequence, or unsubscribe-all from an artist
- SMS protections: max 1 SMS per month per fan per artist, quiet hours (9pm–9am)

### 4.7 Subscription Management
- Subscribe to artist tiers (monthly or annual pricing, 25% annual discount)
- **Pause subscription:** 30-day billing pause via Stripe `pause_collection` while keeping access (offered as alternative to cancellation)
- Cancel immediately or at end of billing period
- Cancellation flow collects reasons (multi-select + freeform) before redirecting to Stripe portal
- Manage subscriptions via Stripe Customer Portal

### 4.8 Weekly Fan Digest
- Sunday 3pm summary email of all activity from subscribed artists
- Covers new posts, releases, and products from the past week
- Respects email preferences and suppressions; only sends if activity exists

### 4.9 Loyalty Surveys
- Token-based public survey page for fans with 90+ day active subscriptions
- "Why Did You Stay?" mechanism to capture positive retention signals
- Responses stored in `survey_responses` table
- Triggered via `loyalty_survey` sequence type on the daily inactive-subscribers cron

### 4.10 Notifications
- In-app notification bell
- Email notifications for: new posts, new music, subscription confirmations, purchase receipts

---

## 5. Artist Features

### 5.1 Artist Dashboard (`/profile/artist`)
12-tab dashboard for managing all aspects of an artist's presence. Default tab is **AI Manager**. Referrals tab is hidden for Starter tier.

**Tab order:** AI Manager → Analytics → Audience → Music → Sync → Profile → Albums → Shop → Billing → Tiers → Payouts → Referrals

#### AI Manager Tab (Default)
- AI-generated insights and growth recommendations with priority levels (revenue, retention, acquisition, health, growth)
- Content suggestions (email copy, product ideas)
- Nudges for engagement opportunities
- **Actionable operations:** AI suggests specific actions (toggle sequences, update pipeline stages, send briefings) that require explicit artist/admin approval before execution
- Powered by Moonshot AI (Kimi) API

#### Analytics Tab
- Revenue trends: daily (30 days), weekly (12 weeks), monthly (6 months)
- Revenue breakdown by type: subscriptions, products, bookings
- Subscriber growth over time
- Page visit tracking (unique visitors)
- Top-performing products and tracks
- **Cohort retention heatmap:** Month-over-month retention by signup cohort
- **Retention benchmarks:** Churn rate vs platform average with rating badge (Top Tier / Above Average / Average / Below Average / Needs Work)
- Tooltips on all metrics and section headers

#### Audience Tab
- Subscriber list with tier, signup date, and engagement data
- **Fan lifecycle segments:** VIP, Active, At Risk, Churned, Cold, Lead
- **Saved audience segments:** Save, load, and reuse custom fan filter combinations across campaigns/sequences
- **10 True Regulars:** Top 10 most engaged fans with gold/silver/bronze badges, showing total spent, tier, and comment count
- Segmentation by tier, date range, or location
- Import fan contacts via CSV upload
- View per-fan communication preferences
- **Abandoned Cart Recovery tab:** Stats (total abandoned, recovered, recovery rate, 30-day trend), filter by status, tip banner linking to sequence builder

#### Music Tab (formerly "Tracks")
- Upload audio files (128kbps + 320kbps quality)
- Set metadata: title, genre, album art, duration
- Configure access: free, subscriber-only (by tier), or purchasable (price in cents)
- Edit, deactivate, or delete tracks
- Platform tier limits apply (Starter: 10 tracks max)

#### Sync Tab (Label/Empire tiers)
- Salesforce opportunity sync
- CRM data export
- Integration status monitoring

#### Profile Tab
- Artist profile editing (bio, avatar, banner, social links)

#### Albums Tab
- Group tracks into albums with cover art
- Set `track_number` ordering (not `position`)
- Configure album-level access gating and pricing
- Schedule future release dates
- Albums use `is_active` flag (not `is_published`), no `slug` field

#### Shop Tab
- Create products with types: digital, physical, experience, bundle
- Set pricing (in cents), inventory limits, delivery type
- Delivery types: instant download, scheduled, custom fulfillment, shipped
- Bundles: group multiple products together
- Discount codes: percentage or fixed amount, usage limits, expiration dates

#### Billing Tab
- View current platform tier (Starter/Pro/Label/Empire)
- Upgrade or downgrade tier
- Toggle monthly/annual billing (25% annual discount)
- View invoice history via Stripe Portal

#### Tiers Tab
- Create and manage subscription tiers (limit based on platform tier)
- Set tier name, monthly price, annual price
- Configure tier benefits from catalog:
  - Exclusive music access
  - Community badges
  - Discounts on products
  - Experiences (1-on-1 calls, group sessions, merch)
  - Supporter wall listing
  - Early access to releases

#### Payouts Tab
- Real-time Stripe Connect balance
- Payout history and scheduled payouts
- Stripe Connect onboarding (if not yet connected)
- Manual cashout trigger
- Stripe Express Dashboard access

#### Referrals Tab (hidden for Starter tier)
- Configure fan referral commission rate (5–10%)
- View referral partner stats
- Track incoming commissions from fan referrals

### 5.2 Email Campaigns
- **Compose:** Subject line, rich-text body, audience filters (by tier, signup date)
- **Schedule:** Send immediately or at a future date/time
- **Limits:** Maximum 2 campaigns per week per artist
- **Tracking:** Open rates, click tracking per campaign
- **UTM Attribution:** Campaign emails auto-append UTM parameters (`utm_source=crwn_campaign`, `utm_medium=email`, `utm_campaign=<campaign_id>`) to internal links, enabling end-to-end revenue attribution from email → checkout → earnings
- **Revenue Attribution:** Direct attribution via `source_campaign_id` on earnings records; inferred attribution via 48-hour window (deduplicated)
- **Unsubscribe:** One-click unsubscribe links in every email; unsubscribe events logged with source campaign attribution

### 5.3 Email Sequences (Automation)
- **Trigger Types:** `new_subscription`, `new_purchase`, `new_post`, `abandoned_cart`, `tier_upgrade`, `loyalty_survey`
- **Multi-Step:** Configure delay (in days) between steps, each with subject + body
- **Enrollment:** Automatic when trigger fires; fans can unsubscribe from sequences
- **Toggle:** Enable/disable sequences without deleting
- **Welcome Sequence One-Click:** Golden banner prompts artists who lack a `new_subscription` sequence to auto-create a 3-email welcome series (day 0, day 3, day 7)
- **Abandoned Cart Recovery:** Automatic enrollment when fans abandon checkout (subscription, product, or booking)
- **Open/Click Tracking:** Sequence emails tracked via `sequence_sends` table (mirrors campaign_sends), with dedicated `/api/sequences/track` endpoint and click-wrapped links
- **UTM Attribution:** Sequence emails auto-append UTM parameters (`utm_source=crwn_sequence`, `utm_campaign=<sequence_id>`) for revenue attribution through checkout
- **Conversion Tracking:** Daily cron checks if target action occurred within 7-day window after sequence completion (e.g., did a `starter_upgrade_nudge` sequence lead to an upgrade?)
- **Cron:** Daily processing at 9am UTC; conversion checks at 7am UTC

### 5.4 SMS Marketing
- **Setup:** Provision a Twilio phone number for the artist
- **Categories:** Announcement, show nearby, update, reminder
- **Tier Limits:**
  - Starter: 0 SMS/month
  - Pro: 500 SMS/month
  - Label: 2,500 SMS/month
  - Empire: 10,000 SMS/month
- **Protections:** Quiet hours (9pm–9am fan timezone), max 1 SMS/month per fan per artist
- **Tracking:** Delivery status via Twilio webhooks, bounce handling
- **Monthly Reset:** Cron resets send counts on the 1st of each month

### 5.5 Smart Links
- Create trackable URLs for external campaigns (Instagram bio, email signatures, print)
- Optional: collect visitor email, phone, or name on click
- Custom slug per artist
- Click analytics dashboard
- Optional redirect to external URL

### 5.6 Community Posts
- Create posts with: text, images, videos, audio, polls, links
- Gate posts by access level (free, subscriber-only, specific tier)
- Pin/highlight important posts
- Fan comments and likes
- New post notifications to subscribers (email + in-app)

### 5.7 Booking & Sessions
- Connect Calendly account for availability management
- Create "experience" products (1-on-1 calls, group sessions, mentoring)
- Token flow: fan purchases product → receives booking token → redeems for Calendly link
- Token states: unused, used, expired

---

## 6. Partner (Influencer) Program

### 6.1 Overview
Tiered influencer partnership program targeting music industry professionals, content creators, and influencers who refer artists to the platform. Partners are scored and placed into tiers based on reach, engagement, and audience alignment.

### 6.2 Partner Tiers (Score-Based)

| Tier | Score Range | Platform Access | Flat Fee | Recurring | Content Bonus |
|------|------------|-----------------|----------|-----------|---------------|
| Tier 1 ("Full Deal") | 24–30 | Free Label (12 mo) | $50/artist | 10% monthly on Label+ (12 mo) | $250/signup post |
| Tier 2 ("Standard Deal") | 18–23 | Free Label (12 mo) | $50/artist | 10% monthly on Label+ (12 mo) | $100–250/signup post |
| Tier 3 ("Light Deal") | 12–17 | Free Pro (6 mo) | $50/artist | — | — |

### 6.3 Mechanics
1. Partner applies at `/partner` and gets unique referral URL: `thecrwn.app/join/[code]`
2. Referral link clicks are tracked server-side in `referral_clicks` table (visitor hash, source type, conversion status)
3. Referred artist signs up through link and chooses a paid platform tier
4. On signup, the referral click is marked as converted (30-day attribution window)
5. Artist must remain on paid plan 30+ days to qualify
6. Flat fee paid on qualification day
7. Recurring commission (Tier 1 & 2 only) paid monthly for 12 months on Label+ tier artists
8. Content bonuses are performance-based ($100–250 per signup post)
9. Dashboard at `/recruit/dashboard` shows earnings, referred artists, payout history, and full conversion funnel

### 6.4 Partner-Facing Funnel
Partners see their own conversion funnel at `/recruit/dashboard`:
- **Link Clicks → Signups → Onboarded → First Track → Tiers Created → Paid Tier → First Subscriber**
- Stage-by-stage conversion percentages between each step
- Overall conversion rate (click-to-first-subscriber)
- Enables partners to self-diagnose whether their pitch attracts artists who activate vs. ghost

### 6.5 Payouts
- Partner connects Stripe account for payouts
- Monthly commission processing via cron job
- Qualification check runs daily

---

## 7. Platform Tier System

### 7.1 Tiers & Pricing

| Feature | Starter (Free) | Pro ($50/mo) | Label ($175/mo) | Empire ($350/mo) |
|---------|----------------|--------------|-----------------|-------------------|
| Tracks | 10 | Unlimited | Unlimited | Unlimited |
| Subscription Tiers | 1 | 5 | 10 | Unlimited |
| Members | 100 | Unlimited | Unlimited | Unlimited |
| Bundles | No | Yes | Yes | Yes |
| Scheduled Releases | No | Yes | Yes | Yes |
| Live Q&A | No | Yes | Yes | Yes |
| SMS/month | 0 | 500 | 2,500 | 10,000 |
| Artist Profiles | 1 | 1 | 10 | Unlimited |
| API Access | No | No | Yes | Yes |
| Platform Fee | 8% | 6% | 5% | 3% |
| Annual Price | Free | $37/mo | $131/mo | $262/mo |

### 7.2 Founding Artist Program
- Flat 5% platform fee for 6 months (regardless of tier)
- Badge on artist profile
- Auto-reverts to tier-based fee after 6 months

---

## 8. Admin Features

### 8.1 Admin Dashboard (`/admin`)

**Metrics Tab**
- LGP (Lifetime Gross Payments) — All-time platform revenue
- MRR (Monthly Recurring Revenue) — Active subscriptions
- CAC (Customer Acquisition Cost) — Amortized over average artist lifespan, accounts for full recruiter payout structure
- Churn rate — Subscription cancellation percentage
- Active artists and fans (30-day activity window)
- Revenue breakdown by platform tier
- Per-tier Hormozi health check table (LGP:CAC ratio, payback period, gross margin)
- Pro→Label+ upgrade rate tracking (color-coded: green ≥30%, gold ≥15%, red <15%)

**Pipeline Tab**
- **6-stage CRM pipeline:** Signed Up → Onboarding → Free → Paid → At Risk → Churned
- Lead scoring (0–355 points based on Stripe connection, tracks, fans, revenue, activity recency, community engagement, tenure, paid tier)
- Clickable stage cards filter artist table
- Sortable by lead score, revenue, last active
- Search by name, email, or slug
- Artist detail drawer with score, revenue, fans, tracks, Stripe status
- Salesforce sync (bi-weekly)

**Funnel Tab**
- Full acquisition funnel visualization: Link Clicks → Signups → Onboarded → First Track → Tiers Created → Stripe Connected → Paid Tier → First Subscriber
- Stage-by-stage conversion rates with drop-off arrows
- Filterable by acquisition source: All, Organic, Recruiter, Partner, Founding
- Filterable by time period: 30d, 90d, All Time
- Summary cards: click→signup rate, signup→activated rate, avg time to first track, overall conversion
- Average time-to-milestone breakdown (days from signup to each activation event)
- Signups by source bar chart (when viewing "All Sources")
- Weekly trend area chart: signups vs activated (12 weeks)

**Platform Sequences Tab**
- 9 automated platform-to-artist sequences: `new_signup`, `onboarding_incomplete`, `starter_upgrade_nudge`, `paid_at_risk`, `paid_churned`, `upgrade_abandoned`, `activation_no_track`, `activation_no_tiers`, `activation_no_subscribers`
- Inline email copy editor (edit subject/body without SQL)
- Token personalization (name, slug, tier, URLs)
- Auto-enrollment when pipeline stage changes
- Abandoned platform upgrade checkout triggers recovery sequence
- **Activation nudge sequences:** Auto-enroll stalled artists based on `activation_milestones` JSONB:
  - `activation_no_track`: 3 days after onboarding with no track uploaded (3 emails over 10 days)
  - `activation_no_tiers`: 2 days after first track with no tiers created (2 emails over 3 days)
  - `activation_no_subscribers`: 7 days after Stripe connected with no subscribers (3 emails over 14 days)
- **Auto-cancel:** When an artist completes a milestone, the corresponding nudge sequence is immediately canceled to prevent stale emails
- Enrollment cron: daily at 2am UTC (`/api/cron/activation-nudges`)

**Cohort Retention Tab**
- Month-over-month retention heatmap by signup cohort
- Cancellation reason analytics (aggregated from in-app cancel modal data)

**Email Health Tab**
- Deliverability rate across all campaigns and sequences
- Global suppression list management (hard bounces + spam complaints)
- Aggregate campaign performance metrics (open rate, click rate, unsubscribe rate)
- Aggregate sequence performance metrics (open rate, click rate by trigger type)
- Conversion rates by sequence trigger type (7-day attribution window)
- Unsubscribe event log with source attribution (which campaign/sequence triggered each unsubscribe)

### 8.2 AI Agent
- Analyzes platform metrics using Moonshot AI (Kimi) API
- Returns up to 8 prioritized insights using Alex Hormozi framework (LGP:CAC ratio, churn, payback period, gross margin)
- Suggests up to 3 **actionable operations** requiring explicit admin approval:
  - `toggle_sequence`: Enable/disable platform email sequences
  - `update_pipeline_stages`: Move artists between pipeline stages
  - `send_briefing`: Send admin email briefing
- Execute endpoint processes approved actions

### 8.3 Admin Tools
- **Daily Briefing:** AI-generated email with platform insights (daily cron)
- **Artist Notes:** Internal notes on individual artists
- **Visitor Analytics:** Non-blocking page visit tracking (hashed IP + UA fingerprint, bot-filtered)
- **SMS Monitoring:** Platform-wide SMS usage
- **Account Management:** Deactivate/reactivate accounts, set default tier
- **Command Center:** Linked from admin profile (admin-only visibility)

---

## 9. Integrations

### 9.1 Stripe Connect
- Platform account processes all transactions
- Per-artist connected accounts receive payouts
- Subscriptions: `application_fee_percent` (8/6/5/3%)
- One-time purchases: `application_fee_amount` (calculated per transaction)
- Weekly automated payouts to artist bank accounts
- Webhook handling for all payment events (subscriptions, purchases, disputes, refunds)

### 9.2 Resend (Email)
- Transactional emails from `hello@thecrwn.app`
- Campaign and sequence emails sent from artist name via CRWN
- Templates: welcome, subscription confirmation, purchase receipt, new post notification, payout report, campaign emails, partner notifications
- **Bounce handling:** Resend webhook at `/api/webhooks/resend` processes hard bounces and spam complaints
- **Global suppression list:** `email_suppressions` table; hard bounces are globally suppressed, spam complaints also opt out of all artist email marketing
- Campaign and sequence senders check suppression list before sending; enrollments canceled for dead emails

### 9.3 Twilio (SMS)
- Per-artist provisioned phone numbers
- Delivery status tracking via webhooks
- Monthly usage reset cron

### 9.4 Calendly
- OAuth integration for artist availability
- Booking token redemption flow

### 9.5 Cloudflare R2 / AWS S3
- Audio file storage (two quality tiers per track)
- Image storage (avatars, banners, album art, product images)

### 9.6 Moonshot AI (Kimi)
- AI Manager insights for artists (growth recommendations, churn alerts, content nudges)
- Admin AI agent analysis with actionable operations
- Daily admin briefing analysis

### 9.7 Salesforce (Label/Empire)
- Bi-weekly opportunity sync
- Lead scoring
- CRM data export

---

## 10. Scheduled Jobs (Cron)

| Schedule | Job | Description |
|----------|-----|-------------|
| Mon 11am | Weekly Payouts | Process artist payouts via Stripe |
| Mon 2pm | Artist Reports | Send weekly revenue report emails |
| Daily 12pm | Recruiter Check | Verify 30-day qualification window |
| 1st of month 1pm | Recruiter Commission | Process monthly recurring commissions |
| Daily 1pm | AI Manager | Generate artist growth insights |
| Daily 9am | Sequence Steps | Process email automation steps |
| 1st of month 12am | SMS Reset | Reset monthly SMS send counts |
| Daily 12pm | Admin Briefing | Generate daily platform briefing |
| Mon & Thu 10am | Salesforce Sync | Sync CRM opportunities |
| Daily 3am | Lead Scoring | Score and rank prospects |
| Daily 4am | Inactive Detection | Flag inactive subscribers |
| Daily 6am | Scheduled Releases | Publish pre-scheduled music |
| Daily 8am | Scheduled Campaigns | Send scheduled email campaigns |
| Daily 5am | CRM Sync | Platform-wide CRM data sync |
| Sun 3pm | Fan Digest | Weekly summary email to fans of subscribed artist activity |
| Daily 7am | Sequence Conversions | Check 7-day conversion window for completed sequences |
| Daily 2am | Activation Nudges | Detect stalled artists, enroll in milestone-based nudge sequences |
| Daily 10am | Onboarding Sequences | Process platform onboarding emails |

---

## 11. Data Model (Key Tables)

| Table | Purpose |
|-------|---------|
| `profiles` | User accounts (display_name, avatar_url, role, bio) |
| `artist_profiles` | Artist data (slug, banner, tagline, stripe_connect_id, tier limits, acquisition_source, activation_milestones) |
| `subscription_tiers` | Artist subscription tiers (name, price, benefits, Stripe price IDs) |
| `subscriptions` | Fan-to-artist subscriptions (status, period dates, Stripe sub ID) |
| `tracks` | Audio files (title, URLs, duration, access level, play count) |
| `albums` | Track collections (title, release date, artwork, is_active) |
| `album_tracks` | Track-to-album mapping (track_number ordering) |
| `playlists` | User/artist playlists (public/private) |
| `playlist_tracks` | Playlist membership (position ordering) |
| `products` | Shop items (title, price, type, quantity, delivery) |
| `bundle_items` | Bundle-to-product mapping |
| `purchases` | One-time purchase records (amount, status, payment intent) |
| `earnings` | Revenue ledger (artist_id, type, gross/net amounts, UTM attribution, source_campaign_id, source_sequence_id) |
| `campaigns` | Email campaigns (name, body, filters, status) |
| `campaign_sends` | Individual email delivery records (status, open/click events) |
| `sequences` | Email automations (trigger type, steps) |
| `sequence_steps` | Automation steps (delay_days, subject, body) |
| `sequence_enrollments` | Automation participants (status: active/completed/canceled) |
| `smart_links` | Tracking URLs (slug, destination, collection options) |
| `smart_link_captures` | Click data (visitor info, captured email/phone) |
| `referrals` | Fan referral relationships (referrer, referred, commission rate) |
| `referral_earnings` | Referral commission ledger |
| `booking_tokens` | Session booking tokens (status: unused/used/expired) |
| `sms_subscribers` | SMS opt-ins (fan, artist, phone, timezone) |
| `sms_sends` | SMS delivery records (status, events) |
| `artist_phone_numbers` | Provisioned Twilio numbers |
| `posts` | Community feed posts (content, media, access level) |
| `comments` | Post comments (threaded via parent_comment_id) |
| `likes` | Post/comment likes |
| `fan_communication_prefs` | Per-artist notification preferences (includes `digest_only` flag) |
| `artist_page_visits` | Visitor analytics (hashed fingerprint) |
| `processed_webhook_events` | Stripe webhook idempotency guard |
| `cancellation_reasons` | Subscription cancellation reasons (multi-select + freeform) |
| `survey_responses` | Loyalty survey responses from long-term fans |
| `email_suppressions` | Global suppression list (hard bounces + spam complaints) |
| `saved_segments` | Saved audience filter combinations for reuse |
| `sequence_sends` | Individual sequence email delivery records (mirrors campaign_sends with open/click tracking) |
| `sequence_conversions` | Tracks whether target action occurred within 7-day window after sequence completion |
| `unsubscribe_events` | Logs which campaign/sequence triggered each fan unsubscribe |
| `abandoned_carts` | Incomplete checkout sessions (subscription, product, booking) |
| `referral_clicks` | Partner/recruiter link click tracking (visitor hash, conversion status, 30-day attribution) |

---

## 12. Design System

- **Theme:** Dark mode
- **Background:** #0D0D0D
- **Cards:** #1A1A1A
- **Elevated surfaces:** #2A2A2A
- **Accent color:** Gold #D4AF37
- **Font:** Inter
- **Icons:** Lucide React
- **Charts:** Recharts
- **Style:** Flat/minimal, pill-shaped buttons, solid gold accents, no neumorphic shadows
- **Layout:** Mobile-first responsive
- **Animations:** `stagger-fade-in` for list containers

---

## 13. Security & Compliance

- **Authentication:** Supabase Auth with PKCE, JWT cookies, auto-refresh
- **Route Protection:** Middleware guards all authenticated routes
- **Row-Level Security:** Supabase RLS policies on all tables
- **Two Supabase Clients:** Browser (anon key, RLS-enforced) and Server (service role, RLS-bypassed)
- **Webhook Idempotency:** Deduplication via `processed_webhook_events` table
- **Visitor Privacy:** Hashed IP + UA fingerprint (no raw PII stored)
- **Legal Pages:** Privacy Policy, Terms of Service, DMCA, Artist Agreement
- **Bot Detection:** Middleware blocks crawlers from analytics tracking

---

## 14. Known Constraints

- **Vercel Hobby Plan:** Cron jobs limited to once per day maximum
- **No Test Framework:** Manual QA only; build validation via `npm run build`
- **Service Worker Caching:** Aggressive on iOS Safari; requires version bump on frontend changes
- **Database Migrations:** Applied manually via Supabase SQL Editor (not automated)
- **Environment Variables:** `NEXT_PUBLIC_` vars require full Vercel redeploy

---

## 15. Future Roadmap

- Live Q&A sessions (feature-flagged, not yet active)
- API access for Label/Empire tiers
- HubSpot CRM integration
- Podcast hosting integration
- Advanced playlist management
- Social token system
- Artist collaborations
- Physical merch with print-on-demand
- A/B testing for email campaigns
