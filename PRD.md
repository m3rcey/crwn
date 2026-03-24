# CRWN — Product Requirements Document

**Version:** 1.0
**Date:** March 24, 2026
**Product:** CRWN (thecrwn.app)
**Status:** Live (Production)

---

## 1. Executive Summary

CRWN is a music monetization SaaS platform where independent artists sell subscriptions, tracks, albums, digital products, and experiences directly to fans. The platform enables direct artist-to-fan relationships with features for content creation, audience engagement, automated email/SMS campaigns, and earnings management.

**Business Model:** Artists pay platform subscription fees (Starter: free → Empire: $350/mo) with decreasing platform commission rates (8% → 4%). The platform takes a percentage of all fan-to-artist transactions processed through Stripe Connect.

**Tech Stack:** Next.js 16 (App Router + Turbopack), Supabase (Postgres/Auth/Storage), Stripe Connect, Tailwind CSS 4, Resend (email), Twilio (SMS), Cloudflare R2 (media storage). Deployed on Vercel.

---

## 2. User Roles

### 2.1 Fan
Discovers and supports artists through subscriptions, purchases, and referrals. Accesses gated music, community posts, and exclusive products.

### 2.2 Artist
Creates and monetizes music, digital products, and experiences. Manages subscribers, runs email/SMS campaigns, and tracks revenue analytics.

### 2.3 Recruiter
Music industry professional (label, manager, distributor) who earns flat fees + recurring commissions for referring artists to the platform.

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
3. **Artist Setup** (if artist role) — Auto-creates artist profile with URL slug
4. **Guided Tour** — Role-specific walkthrough using Driver.js

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
- Subscribe to artist tiers (monthly or annual pricing, 25% annual discount)
- Multiple tiers per artist (e.g., The Wave $10/mo, Inner Circle $50/mo, Throne $200/mo)
- Manage subscriptions via Stripe Customer Portal
- Cancel immediately or at end of billing period
- Automatic renewal and failed payment handling

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
- Unsubscribe options: per-campaign, per-sequence, or unsubscribe-all from an artist
- SMS protections: max 1 SMS per month per fan per artist, quiet hours (9pm–9am)

### 4.7 Notifications
- In-app notification bell
- Email notifications for: new posts, new music, subscription confirmations, purchase receipts

---

## 5. Artist Features

### 5.1 Artist Dashboard (`/profile/artist`)
12-tab dashboard for managing all aspects of an artist's presence:

#### Tracks Tab
- Upload audio files (128kbps + 320kbps quality)
- Set metadata: title, genre, album art, duration
- Configure access: free, subscriber-only (by tier), or purchasable (price in cents)
- Edit, deactivate, or delete tracks
- Platform tier limits apply (Starter: 10 tracks max)

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

#### Billing Tab
- View current platform tier (Starter/Pro/Label/Empire)
- Upgrade or downgrade tier
- Toggle monthly/annual billing (25% annual discount)
- View invoice history via Stripe Portal

#### Analytics Tab
- Revenue trends: daily (30 days), weekly (12 weeks), monthly (6 months)
- Revenue breakdown by type: subscriptions, products, bookings
- Subscriber growth over time
- Page visit tracking (unique visitors)
- Top-performing products and tracks

#### Audience Tab
- Subscriber list with tier, signup date, and engagement data
- Segmentation by tier, date range, or location
- Import fan contacts via CSV upload
- View per-fan communication preferences

#### Payouts Tab
- Real-time Stripe Connect balance
- Payout history and scheduled payouts
- Stripe Connect onboarding (if not yet connected)
- Manual cashout trigger
- Stripe Express Dashboard access

#### Referrals Tab
- Configure fan referral commission rate (5–10%)
- View referral partner stats
- Track incoming commissions from fan referrals

#### AI Manager Tab
- AI-generated insights and growth recommendations
- Content suggestions (email copy, product ideas)
- Nudges for engagement opportunities
- Powered by OpenAI API

#### Sync Tab (Label/Empire tiers)
- Salesforce opportunity sync
- CRM data export
- Integration status monitoring

### 5.2 Email Campaigns
- **Compose:** Subject line, rich-text body, audience filters (by tier, signup date)
- **Schedule:** Send immediately or at a future date/time
- **Limits:** Maximum 2 campaigns per week per artist
- **Tracking:** Open rates, click tracking per campaign
- **Unsubscribe:** One-click unsubscribe links in every email

### 5.3 Email Sequences (Automation)
- **Trigger Types:** `new_subscription`, `new_purchase`, `new_post`
- **Multi-Step:** Configure delay (in days) between steps, each with subject + body
- **Enrollment:** Automatic when trigger fires; fans can unsubscribe from sequences
- **Toggle:** Enable/disable sequences without deleting
- **Cron:** Daily processing at 9am UTC

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

## 6. Recruiter Program

### 6.1 Overview
Recruitment affiliate program targeting music industry professionals who refer artists to the platform.

### 6.2 Recruiter Tiers

| Tier | Artists Referred | Flat Fee | Recurring Commission |
|------|-----------------|----------|---------------------|
| First Referral | 1 | $50 | — |
| Starter | 2–5 | $25/artist | — |
| Connector | 6–15 | $50/artist | 5% monthly (12 months) |
| Ambassador | 16+ | $75/artist | 10% monthly (12 months) |

### 6.3 Mechanics
1. Recruiter signs up at `/recruit` and gets unique referral URL: `thecrwn.app/join/[code]`
2. Referred artist signs up through link and chooses a paid platform tier
3. Artist must remain on paid plan 30+ days to qualify
4. Flat fee paid on qualification day
5. Recurring commission (if applicable) paid monthly for 12 months
6. Dashboard at `/recruit/dashboard` shows earnings, referred artists, payout history

### 6.4 Payouts
- Recruiter connects Stripe account for payouts
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
- CAC (Customer Acquisition Cost) — Recruiter ROI analysis
- Churn rate — Subscription cancellation percentage
- Active artists and fans (30-day activity window)
- Revenue breakdown by platform tier

**Pipeline Tab**
- Sales pipeline view (prospect → qualified → onboarding → active)
- Opportunity tracking
- Lead scoring (daily cron)
- Salesforce sync (bi-weekly)

**Platform Sequences Tab**
- Global onboarding email sequences for new artists
- Automation rules and enrollment tracking

### 8.2 Admin Tools
- **Daily Briefing:** AI-generated email with platform insights (daily cron)
- **Artist Notes:** Internal notes on individual artists
- **Visitor Analytics:** Non-blocking page visit tracking (hashed IP + UA fingerprint)
- **SMS Monitoring:** Platform-wide SMS usage
- **Account Management:** Deactivate/reactivate accounts, set default tier

---

## 9. Integrations

### 9.1 Stripe Connect
- Platform account processes all transactions
- Per-artist connected accounts receive payouts
- Subscriptions: `application_fee_percent` (8/6/4%)
- One-time purchases: `application_fee_amount` (calculated per transaction)
- Weekly automated payouts to artist bank accounts
- Webhook handling for all payment events (subscriptions, purchases, disputes, refunds)

### 9.2 Resend (Email)
- Transactional emails from `hello@thecrwn.app`
- Templates: welcome, subscription confirmation, purchase receipt, new post notification, payout report, campaign emails, recruiter notifications

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

### 9.6 OpenAI
- AI Manager insights for artists
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
| Daily 10am | Onboarding Sequences | Process platform onboarding emails |

---

## 11. Data Model (Key Tables)

| Table | Purpose |
|-------|---------|
| `profiles` | User accounts (display_name, avatar_url, role, bio) |
| `artist_profiles` | Artist data (slug, banner, tagline, stripe_connect_id, tier limits) |
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
| `earnings` | Revenue ledger (artist_id, type, gross/net amounts) |
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
| `fan_communication_prefs` | Per-artist notification preferences |
| `artist_page_visits` | Visitor analytics (hashed fingerprint) |
| `processed_webhook_events` | Stripe webhook idempotency guard |

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
- Advanced analytics (cohort analysis, LTV predictions)
- A/B testing for email campaigns
