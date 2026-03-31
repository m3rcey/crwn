# CRWN Demo Video — Pitch Competition Script & Storyboard

**Context:** $125K pitch competition
**Target length:** 2:30–3:00 (judges have short attention spans — every second earns or loses money)
**Format:** Screen recording (desktop + mobile) with voiceover
**Tone:** Founder telling a story, not a product tour. Confident, urgent, personal.

---

## Key Principle

This is NOT a feature walkthrough. Judges don't fund features — they fund markets, traction, and vision. The demo should:
1. Make the **problem feel painful** (artists are broke, platforms exploit them)
2. Show CRWN as the **obvious solution** — fast, visual, "of course it should work this way"
3. Prove it's **real and working** — not a prototype, not a mockup
4. End with a **scale moment** — this isn't just one artist, it's a platform

Every screen shown should serve the narrative. If it doesn't advance the story, cut it.

---

## PRE-RECORDING SETUP

**Step 1: Run the seed script**
Paste `supabase/seed-demo-data.sql` into the Supabase SQL Editor and run it. This creates:
- 12 demo fans with realistic names
- 8 active subscriptions across your 3 tiers ($220 MRR)
- ~$730 in earnings over 90 days with a growth curve
- 4 shop products (stem pack, 1-on-1 session, sample pack, bundle)
- 5 community posts with 26 comments and likes
- 90 days of page visits (ramping traffic)
- 5 AI Manager insights ready to show
- Play counts on all your tracks
- 1 sent email campaign with 75% open rate

**Step 2: Verify in the app**
- Visit `/m3rcey` — should show music, tiers, community with engagement, shop with products
- Check artist dashboard — AI Manager should have 5 insight cards, Analytics should show charts
- Play a track — make sure the player is working

**Step 3: Prep for recording**
- Use a clean browser (no bookmarks bar, no extensions)
- Pre-load every page you'll show (no loading spinners on camera)
- Have a mobile device ready (real phone screen recording > browser DevTools)
- Pick a track that sounds good in the first 3 seconds

---

## THE SCRIPT

### COLD OPEN — The Problem (0:00–0:15)

**Show:** Black screen with white text stats, one at a time (edit these in post):
- "An artist needs 3.5 MILLION Spotify streams to earn minimum wage"
- "Platforms own the algorithm. Artists own nothing."

Then cut to: CRWN landing page hero — the animated revenue notifications sliding in ($10 subscription... $5 purchase... $3 tip...)

**Voiceover:**
> "Three and a half million streams to make minimum wage. That's the deal platforms offer artists. We built the opposite."

*~15 seconds. Judges now know the problem and the stakes.*

---

### THE PRODUCT — Artist Profile (0:15–0:45)

**Show (desktop):** Navigate to M3rcey's public artist profile (`/m3rcey`)
- Pause on the full page: banner, bio, social links, founding badge
- Click "Music" tab — show tracks with access badges (free vs. tier-gated)
- Click PLAY on a track — mini-player appears at bottom, music starts
- While music plays, scroll to "Tiers" tab — show the 3 subscription tiers with pricing and benefits
- Quick scroll past "Shop" tab (products visible) and "Community" tab (posts with engagement)

**Voiceover:**
> "This is an artist's page on CRWN. Their own storefront — music, subscriptions, merch, community — all in one place. Fans subscribe directly. No algorithm decides who sees what. Every dollar flows from fan to artist, minus a small platform fee."

**Switch to mobile (0:35–0:45):**
- Show the same artist profile on a phone — swipe through tabs, tap play on a track, show the mini-player, expand to full-screen player
- Quick swipe-to-close the full-screen player

**Voiceover:**
> "And it works beautifully on mobile — where fans actually are."

*~30 seconds. Judges see: this is real, it's polished, and the fan experience is tight.*

---

### THE ENGINE — Artist Dashboard (0:45–1:20)

**Show:** Artist dashboard — land on AI Manager tab (the default)

**AI Manager (0:45–0:55):**
- Show 2-3 insight cards: a revenue insight, a churn alert, a content nudge
- Hover or click one to show the detail

**Voiceover:**
> "Behind the scenes, every artist gets an AI manager. It watches their data and tells them exactly what to do — which fans are slipping, what to post, when to send that email. Not dashboards. Directions."

**Analytics (0:55–1:05):**
- Click Analytics tab — show revenue chart trending up, subscriber growth, cohort retention heatmap
- Quick scroll past the breakdown (subscriptions vs products vs bookings)

**Voiceover:**
> "Full revenue analytics — broken down by source, tracked by cohort. Artists see exactly what's working."

**Email Campaigns (1:05–1:15):**
- Click into campaign composer or sequence builder — show audience segmentation, personalization tokens
- Show the welcome sequence one-click banner (if visible)

**Voiceover:**
> "Built-in email marketing with automated sequences. A welcome series, abandoned cart recovery, loyalty surveys — all running without the artist lifting a finger."

**Payouts (1:15–1:20):**
- Flash the Payouts tab — Stripe balance, payout history

**Voiceover:**
> "Money goes straight to their bank. Weekly payouts, full transparency."

*~35 seconds. Judges see: this isn't a simple storefront — it's a full business operating system for artists.*

---

### THE MOAT — Platform Intelligence (1:20–2:10)

**Show:** Admin dashboard

**Funnel tab (1:20–1:30):**
- Show the acquisition funnel: clicks → signups → onboarded → first track → tiers → paid → first subscriber
- Point out conversion rates between stages
- Toggle the source filter (organic vs recruiter vs partner)

**Voiceover:**
> "On our side, we see the full funnel. Every artist from first click to first subscriber. We know exactly where they drop off — and we built automated sequences to catch them at every stage."

**Pipeline tab (1:30–1:40):**
- Show the 6-stage CRM pipeline with artist cards
- Click one artist to show the detail drawer (score, revenue, fans, notes)

**Voiceover:**
> "Every artist is scored and tracked through a six-stage pipeline. At-risk artists get flagged before they churn."

**AI Agent — THE MONEY SHOT (1:40–2:00):**
- Click "Diagnose" on the dashboard tab — wait for the AI response
- Show the diagnosis card: bottleneck, severity, impact chain
- Show supporting signals with sentiment colors
- Show 2-3 recommended actions with approve buttons
- **Click "Approve" on one action** (e.g., "Enroll 5 stalled artists in activation sequence") — show it execute

**Voiceover:**
> "And then there's this. Our AI agent analyzes the entire platform — funnel, revenue, churn, recruiter performance — and tells us exactly what's wrong and how to fix it. Not just insights. Executable actions. One click and it's done. This is what running a platform looks like when the platform runs itself."

*This is the judge wow-moment. Pre-record the Diagnose click and have it ready — don't risk a slow API response on camera.*

**Partners tab (2:00–2:10):**
- Show the recruiter table: Tanya (top performer), Camille (efficient), Jaylen (underperforming)
- Show the referral funnel: clicks → signups → qualified → paid

**Voiceover:**
> "Our recruiter program pays influencers to bring artists to the platform. Each one gets a tracked referral link with a full conversion funnel. We see exactly which recruiters deliver and which ones don't."

*~50 seconds. Judges now see: real-time AI ops, CRM pipeline, recruiter network — this is enterprise infrastructure.*

---

### THE BUSINESS (2:10–2:35)

**Show:** Landing page — scroll to the tier comparison or show the Billing tab

**Voiceover:**
> "Artists start free. As they grow, they upgrade to cut their platform fee from 8% down to 3%. We make money two ways: SaaS subscriptions from artists, and a cut of every fan transaction. Both grow as artists grow. Incentives perfectly aligned."

**Show:** Landing page founding artist counter (animated number)

**Voiceover:**
> "We're live today. $650 in monthly platform revenue, 25 artists on the platform, 4 active recruiters driving signups. Every artist who joins brings their existing fanbase — built-in network effects."

*~25 seconds. Judges hear: real revenue, real traction, real distribution.*

---

### CLOSE — The Ask (2:35–2:55)

**Show:** Landing page hero with the revenue notifications animating in, then the "Get Started" CTA

**Voiceover:**
> "Spotify pays artists fractions of a penny. We give them the tools to build a real business — subscriptions, merch, community, AI, marketing automation — all in one place. We're live, we're growing, and with this funding, we're going after every independent artist who's tired of streaming for free. This is CRWN."

**End card:** CRWN logo + thecrwn.app + tagline

*Total: ~2:55*

---

## RECORDING CHECKLIST

### Desktop Shots Needed
- [ ] Landing page (hero with animated notifications, tier section, founding counter)
- [ ] Artist profile `/m3rcey` — Music, Tiers, Shop, Community tabs
- [ ] Music playing with mini-player visible
- [ ] Artist dashboard — AI Manager tab with active insights
- [ ] Artist dashboard — Analytics tab with charts
- [ ] Artist dashboard — Campaign composer or sequence builder
- [ ] Artist dashboard — Payouts tab
- [ ] Admin dashboard — Funnel tab with conversion rates
- [ ] Admin dashboard — Pipeline tab with artist detail drawer
- [ ] Admin dashboard — AI Agent: click Diagnose, show diagnosis + actions, click Approve
- [ ] Admin dashboard — Partners tab with recruiter stats

### Mobile Shots Needed
- [ ] Artist profile `/m3rcey` — swipe through tabs
- [ ] Track playing — mini-player at bottom
- [ ] Full-screen player — expand and swipe-to-close
- [ ] Explore page — search and browse

### Post-Production
- [ ] Opening text cards (streaming stats)
- [ ] End card (logo + URL + tagline)
- [ ] Background music (use a track from the platform itself if possible)
- [ ] Smooth transitions between desktop and mobile segments
- [ ] Subtle zoom on key UI moments (revenue chart, AI insights, funnel)

---

## SHOT-BY-SHOT TIMING REFERENCE

| Time | What's on Screen | Key Message |
|------|-----------------|-------------|
| 0:00–0:05 | Black + white text stats | Problem: artists are broke |
| 0:05–0:15 | Landing page hero (notifications) | "We built the opposite" |
| 0:15–0:35 | Artist profile desktop (music, tiers, shop, community) | Full storefront, fan→artist |
| 0:35–0:45 | Artist profile mobile + player | Mobile-first, polished |
| 0:45–0:55 | AI Manager tab | AI tells artists what to do |
| 0:55–1:05 | Analytics tab | Revenue visibility |
| 1:05–1:15 | Email campaigns/sequences | Automated marketing |
| 1:15–1:20 | Payouts tab | Money in the bank |
| 1:20–1:30 | Admin funnel | Full-funnel visibility |
| 1:30–1:40 | Admin pipeline + artist drawer | CRM + lead scoring |
| 1:40–2:00 | **AI Agent: Diagnose → Actions → Approve** | **Platform runs itself** |
| 2:00–2:10 | Partners tab (recruiter stats + funnel) | Distribution engine |
| 2:10–2:25 | Tier pricing / billing | Business model |
| 2:25–2:35 | Founding counter + traction numbers | Real revenue, real GTM |
| 2:35–2:55 | Landing hero + CTA | The ask / close |

---

## TIPS FOR RECORDING

1. **Pre-load every page** before recording — no loading spinners on camera
2. **Use a clean browser** — no bookmarks bar, no extensions, no other tabs visible
3. **Mouse movements should be slow and deliberate** — judges are watching a screen they don't know
4. **Music should be playing** during the artist profile section — it sells the vibe
5. **Don't click too fast** through the admin dashboard — let charts render and breathe
6. **Mobile recording:** Use a real phone screen recording if possible (feels more authentic than browser DevTools)
7. **Voiceover:** Record separately, not live — you'll want multiple takes on the close
8. **Keep energy high but not hype-y** — you're a founder who built something real, not an infomercial
