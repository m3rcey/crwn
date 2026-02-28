# CRWN — Ian's Kickoff Brief

**Project:** CRWN (pronounced "Crown")
**Priority:** 🔴 HIGH — This is a full product build, not a daily app.
**Owner:** Josh (Platform Owner + Artist)
**Launch Artist:** The G1ft (currently on Spotify/Apple Music)
**Date:** February 27, 2026

---

## What Is CRWN?

CRWN is an all-in-one platform for music artists to monetize, connect with fans, and build community. Think Skool meets EVEN meets YouTube — but purpose-built for music creators. Artists own their revenue streams, subscriber relationships, and data.

**Full product spec:** Read `CRWN_Product_Plan.docx` in the workspace. That document is your bible for this build. Everything below is the operational kickoff — what you need to start coding today.

---

## Tech Stack (CRWN-Specific — NOT GitHub Pages Stack)

This is a full-stack application. **Do NOT use the Vite + GitHub Pages pipeline.** CRWN uses a different stack:

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Framework** | Next.js 14+ (App Router) | React/TypeScript. Server components + API routes. |
| **Styling** | Tailwind CSS | Dark mode ONLY. No light mode. See Design System below. |
| **Database** | Supabase (PostgreSQL) | Auth, Realtime, Storage, Row Level Security. |
| **Auth** | Supabase Auth | Email, social login, magic links. Roles: fan, artist, admin. |
| **Payments** | Stripe Connect (Express) | Embedded onboarding + embedded account management. Platform collects fees. |
| **Audio Storage** | Cloudflare R2 | Zero egress fees. Bucket: `crwn-media`. |
| **Audio Delivery** | Cloudflare CDN | HLS adaptive streaming. |
| **Scheduling** | Cal.com (Cloud Hosted) | Embedded via API for 1-on-1 and group bookings. |
| **Video/Live** | Phase 1: External links (FaceTime/Zoom). Phase 3: Mux or LiveKit. |
| **Deployment** | Vercel | Auto-deploy from GitHub. |
| **Repo** | `github.com/m3rcey/crwn` | Standard repo. `master` branch. |

### Why Next.js Instead of Vite?
CRWN needs server-side rendering, API routes, middleware (auth guards), and server components for SEO and performance. Vite + React is great for SPAs but doesn't have the backend capabilities this project requires.

---

## Design System — MANDATORY

**The UI is black with white text and gold accents. No exceptions.**

### Color Palette

| Role | Hex | Usage |
|------|-----|-------|
| Primary Background | `#0D0D0D` | Main app background, page canvas |
| Surface / Cards | `#1A1A1A` | Cards, modals, dropdowns, player bar |
| Elevated Surface | `#2A2A2A` | Hover states, active nav, selected elements |
| Primary Text | `#FFFFFF` | Headings, body, labels |
| Secondary Text | `#A0A0A0` | Timestamps, captions, metadata |
| **Gold Accent** | `#D4AF37` | CTAs, buttons, icons, badges, links, active states |
| Gold Hover | `#C9A032` | Button hover states |
| Gold Muted | `#8B7536` | Borders, dividers, accent lines |
| Success | `#4CAF50` | Confirmations, online status |
| Error | `#E53935` | Errors, warnings, destructive actions |

### Design Rules
- **Dark mode ONLY** — no light mode toggle at launch
- **Gold = interactive** — if it's gold, it's tappable
- **Generous spacing** — premium feel, nothing cramped
- **Layered surfaces** — use background levels for depth, not borders
- **Font:** Inter or Outfit (sans-serif)
- **Mobile-first** — design for phone, scale up to desktop
- **Persistent music player** — bottom bar on mobile, expandable

### Tailwind Config
```javascript
// tailwind.config.js
module.exports = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        crwn: {
          bg: '#0D0D0D',
          surface: '#1A1A1A',
          elevated: '#2A2A2A',
          gold: '#D4AF37',
          'gold-hover': '#C9A032',
          'gold-muted': '#8B7536',
          text: '#FFFFFF',
          'text-secondary': '#A0A0A0',
          success: '#4CAF50',
          error: '#E53935',
        }
      }
    }
  }
}
```

---

## Accounts & Credentials

Ian needs these environment variables. Josh will provide the actual values.

### Supabase
```
NEXT_PUBLIC_SUPABASE_URL=         # From Supabase dashboard → Settings → API
NEXT_PUBLIC_SUPABASE_ANON_KEY=    # Public anon key (safe for client)
SUPABASE_SERVICE_ROLE_KEY=        # Server-only. NEVER expose to client.
```

**Josh action required:** Create Supabase project at supabase.com → name it "crwn" → pick US East region → save the URL, anon key, and service role key.

### Stripe Connect
```
STRIPE_SECRET_KEY=                # From Stripe dashboard → Developers → API keys
STRIPE_PUBLISHABLE_KEY=           # Public key
STRIPE_WEBHOOK_SECRET=            # Created when setting up webhook endpoint
```

**Already set up:** Stripe Connect is enabled with:
- Embedded onboarding components
- Embedded account management components
- Platform-controlled fee collection
- Industry: On-demand services

**Platform fee:** 8% on all transactions via `application_fee_amount` on each payment. Label tier gets 6%.

### Cloudflare R2
```
CLOUDFLARE_ACCOUNT_ID=            # From Cloudflare dashboard
R2_ACCESS_KEY_ID=                 # From R2 → Manage R2 API Tokens
R2_SECRET_ACCESS_KEY=             # From R2 → Manage R2 API Tokens
R2_BUCKET_NAME=crwn-media
```

**Josh action required:** Cloudflare dashboard → R2 Object Storage → Create Bucket → name: `crwn-media`. Then Manage R2 API Tokens → Create API Token.

### Cal.com
```
CALCOM_API_KEY=                   # From Cal.com dashboard → Settings → Developer → API Keys
```

**Josh action required:** Sign up at cal.com → create account → generate API key.

### Vercel
No special env needed for deployment. Ian connects the `m3rcey/crwn` repo to Vercel and it auto-deploys.

**Josh action required:** None — Vercel account exists. Ian handles repo connection.

---

## Workspace

**Dedicated workspace:** `/home/merce/.openclaw/workspace-crwn/`

Create this directory and place this brief + the CRWN Product Plan doc inside it. All CRWN development happens here — isolated from other projects.

```bash
mkdir -p /home/merce/.openclaw/workspace-crwn
# Place CRWN_Kickoff_Brief.md and CRWN_Product_Plan.docx here
```

---

## Launch Artist: The G1ft

The first artist on CRWN is **The G1ft** — currently on Spotify and Apple Music. Ian should:

1. Research The G1ft's existing catalog (track names, album art style, genre)
2. Build the artist profile page and music upload flow using their real catalog as reference content
3. Coordinate with Josh on getting actual audio files and assets for the profile
4. Use The G1ft's profile as the primary test case for all artist-facing features

---

## Phase 1 Sprint Tickets (Weeks 1–8)

Ian should execute these in order. Each ticket is a deployable milestone.

### Ticket 1: Project Scaffolding (Week 1)
- [ ] Create GitHub repo: `m3rcey/crwn`
- [ ] Initialize Next.js 14+ with App Router, TypeScript, Tailwind CSS
- [ ] Configure Tailwind with CRWN color palette (see Design System above)
- [ ] Set up Supabase client (`@supabase/supabase-js` + `@supabase/ssr`)
- [ ] Set up Stripe (`stripe` + `@stripe/stripe-js`)
- [ ] Create `.env.local` template with all required variables
- [ ] Configure Vercel deployment (connect repo, set env vars)
- [ ] Set up project folder structure:
  ```
  src/
  ├── app/                    # Next.js App Router pages
  │   ├── (auth)/             # Auth pages (login, signup, onboarding)
  │   ├── (main)/             # Authenticated pages
  │   │   ├── home/           # Fan home feed
  │   │   ├── explore/        # Discover artists
  │   │   ├── community/      # Community feeds
  │   │   ├── library/        # Fan's music library
  │   │   └── profile/        # User profile & settings
  │   ├── artist/[slug]/      # Public artist pages
  │   ├── api/                # API routes
  │   └── layout.tsx          # Root layout with player
  ├── components/
  │   ├── ui/                 # Reusable UI components
  │   ├── player/             # Music player components
  │   ├── community/          # Community feed components
  │   └── layout/             # Nav, sidebar, footer
  ├── lib/
  │   ├── supabase/           # Supabase client + helpers
  │   ├── stripe/             # Stripe helpers
  │   └── utils/              # General utilities
  ├── hooks/                  # Custom React hooks
  └── types/                  # TypeScript types
  ```
- [ ] Deploy skeleton to Vercel — confirm it loads
- [ ] **Send to Imani for QA: Verify deployment, dark mode renders, no errors**

### Ticket 2: Auth System (Week 2)
- [ ] Supabase Auth: email + password signup/login
- [ ] Magic link login option
- [ ] Social login (Google, Apple — future: Spotify OAuth)
- [ ] Role-based system: `fan` (default), `artist`, `admin`
- [ ] Artist onboarding flow: request artist status → admin approval or self-serve
- [ ] Protected route middleware (redirect unauthenticated users)
- [ ] **Database tables:**
  - `profiles` (extends Supabase auth.users): id, role, display_name, avatar_url, bio, social_links (JSONB), created_at
  - Row Level Security policies: users can read/update own profile
- [ ] **Send to Imani for QA**

### Ticket 3: Artist Profiles + Music Upload (Weeks 2–3)
- [ ] Artist profile page: `/artist/[slug]`
  - Banner image, avatar, display name, bio, social links
  - Track listing with play buttons
  - Subscription tier display
- [ ] Artist settings dashboard: edit profile, upload banner/avatar
- [ ] Music upload flow:
  - Upload audio files to Cloudflare R2
  - Server-side transcoding to 128kbps (stream) + 320kbps (premium) via FFmpeg
  - Store track metadata in Supabase: title, duration, access_level, price, album_art_url
  - Set access level: free, subscriber-only, or purchase-only
- [ ] **Database tables:**
  - `artist_profiles`: id, user_id, slug, banner_url, tagline, stripe_connect_id, tier_config (JSONB)
  - `tracks`: id, artist_id, title, audio_url_128, audio_url_320, duration, access_level, price, album_art_url, release_date, play_count
  - `playlists`: id, artist_id, title, track_ids[], access_level
- [ ] **Build The G1ft's profile as the first real artist page**
- [ ] **Send to Imani for QA**

### Ticket 4: Audio Player (Weeks 3–4)
- [ ] Persistent mini-player bar (bottom of viewport, above mobile nav)
  - Album art thumbnail, track title, artist name
  - Play/pause, skip forward/back
  - Progress bar (gold fill on dark track)
  - Expand arrow to full-screen player view
- [ ] Full-screen player view:
  - Large album art
  - Full track controls: play/pause, skip, shuffle, repeat
  - Queue management (up next, drag to reorder)
  - Volume control
- [ ] Queue system: add to queue, play next, clear queue
- [ ] Play history tracking (store in Supabase)
- [ ] Favorites/liked tracks
- [ ] **PWA setup:**
  - Service Worker for background audio
  - Media Session API for lock-screen controls (play/pause, skip, track info, album art)
  - Web App Manifest for "Add to Home Screen"
- [ ] Gated playback: check user's subscription tier before streaming subscriber/purchase-only tracks
- [ ] HLS streaming from Cloudflare CDN
- [ ] **Send to Imani for QA: Test background play on Android + iOS (home screen PWA)**

### Ticket 5: Subscription Tiers + Stripe Billing (Weeks 4–5)
- [ ] Artist tier creation UI: name, price, description, access config
- [ ] Stripe Connect onboarding for artists (embedded components)
- [ ] Fan subscription flow: select tier → Stripe Checkout → active subscription
- [ ] Stripe webhooks: handle subscription.created, updated, canceled, invoice.paid, invoice.payment_failed
- [ ] Platform fee: `application_fee_amount` = 8% (6% for Label tier artists)
- [ ] Artist payout dashboard (embedded Stripe account components)
- [ ] **Database tables:**
  - `subscription_tiers`: id, artist_id, name, price, description, access_config (JSONB), stripe_price_id
  - `subscriptions`: id, fan_id, artist_id, tier_id, stripe_subscription_id, status, started_at, canceled_at
- [ ] **Send to Imani for QA: Test full payment flow with Stripe test mode**

### Ticket 6: Content Gating (Week 5)
- [ ] Middleware/hook that checks user's active subscription tier before serving content
- [ ] Gated tracks: 30-second preview for locked tracks, full play for authorized users
- [ ] Gated community channels (prep for Ticket 7)
- [ ] Gated content indicators in UI: lock icon, "Subscribe to unlock" CTA with gold styling
- [ ] **Send to Imani for QA**

### Ticket 7: Community Feed (Weeks 6–7)
- [ ] Per-artist community space
- [ ] Post types: text, image, video embed, audio clip, poll, link
- [ ] Post creation UI for both artists and fans
- [ ] Comments with threading (one level deep)
- [ ] Likes on posts and comments
- [ ] Pin posts (artist only)
- [ ] Artist-highlighted posts (spotlight feature with badge)
- [ ] Gated channels: certain channels visible only to specific tiers
- [ ] Supabase Realtime for live feed updates
- [ ] **Database tables:**
  - `posts`: id, author_id, artist_community_id, content, post_type, media_urls (JSONB), access_level, pinned, highlighted, created_at
  - `comments`: id, post_id, author_id, content, parent_comment_id, created_at
  - `likes`: id, user_id, likeable_type (post/comment), likeable_id, created_at
- [ ] **Send to Imani for QA**

### Ticket 8: PWA Finalization + Soft Launch (Week 7–8)
- [ ] Full PWA audit: Service Worker caching, offline fallbacks, manifest
- [ ] Performance optimization: lazy loading, image optimization, code splitting
- [ ] Mobile responsiveness pass on all pages
- [ ] Error handling and loading states throughout
- [ ] SEO basics: meta tags, Open Graph for artist pages
- [ ] Onboard The G1ft: real catalog uploaded, profile complete, tiers configured
- [ ] **Send to Imani for FULL QA PASS — every feature, every page, every flow**
- [ ] **Soft launch on Vercel URL**

---

## What Ian Does NOT Do in Phase 1

These are Phase 2+ features. Do not build them yet:
- Bundles & experiences marketplace
- Gamification / leaderboard / points system
- 1-on-1 scheduling (Cal.com integration)
- Group Live Q&A
- Content submission + Coincidence Protection Waiver
- Analytics dashboard
- Notification system (email/push)
- Discovery/explore page (cross-community)
- Native mobile apps

---

## Deployment Pipeline (CRWN)

This is NOT the GitHub Pages pipeline. CRWN deploys via Vercel.

1. Push to `master` branch on `m3rcey/crwn`
2. Vercel auto-detects Next.js and builds
3. Environment variables set in Vercel dashboard (not committed to repo)
4. Preview deployments on PRs, production on `master`
5. Domain will be connected later (for now: `crwn.vercel.app`)

---

## QA Protocol

Same as always — **Ian never presents directly to Josh.** Every build and every change goes to Imani first.

```
Ian builds → Imani reviews → Fix loop until PASS → Imani presents to Josh
```

---

## Questions for Josh (Ian Should Ask If Needed)

1. Audio files from The G1ft — when will these be available for upload?
2. Does The G1ft have specific branding (colors, logos) for their artist page, or should Ian design it within the CRWN system?
3. Supabase project credentials — need URL + keys once created.
4. Cloudflare R2 API credentials — need account ID + access keys once bucket is created.
5. Cal.com API key — need once account is created.

---

## Summary

**Ian's job:** Build CRWN Phase 1 from this brief + the Product Plan doc. Dark mode, gold accents, mobile-first. Next.js + Supabase + Stripe Connect + Cloudflare R2. Deploy to Vercel. The G1ft is the launch artist. Send every milestone to Imani. Ship it clean.

---

*Built by Claude for Josh | OpenClaw Systems | February 2026*
