# 08 — Design System & UX

> Grounded in `src/app/globals.css`, `src/app/styles/neumorphic.css`, `src/app/layout.tsx`, `src/components/ui/*`, `src/components/layout/Navigation.tsx`. Tailwind CSS v4 (CSS-first config; **there is no `tailwind.config.*` file**). `Confirmed` unless noted.

## 1. Brand & theme
Dark-mode only, black canvas + gold accent, "flat dark" (no neumorphic shadows despite the `neu-` class prefix, which is a naming leftover). **Gold = interactive** (if it's gold, it's tappable). Layered surfaces for depth, dividers over borders for lists. Mobile-first. `Confirmed` (`neumorphic.css:1` header, `CLAUDE.md`).

## 2. Color tokens (actual CSS values — note the mismatch)
Defined in `globals.css:1-18`, exposed as Tailwind utilities via `@theme inline`:

| Token | Value | Notes |
|---|---|---|
| `--crwn-bg` | `#0f0f0f` | ⚠️ but `layout.tsx` hardcodes `#0D0D0D` (and CLAUDE.md/PRD say `#0D0D0D`) — mismatch |
| `--crwn-surface` | `rgba(26,26,26,0.4)` | cards/panels |
| `--crwn-elevated` | `#222222` | hover/active/dividers |
| `--crwn-gold` | `#D4AF37` | accent (exact everywhere) |
| `--crwn-gold-hover` | `#C9A032` | |
| `--crwn-gold-muted` | `#8B7536` | borders/dividers |
| `--crwn-text` | `#f0f0f0` | primary |
| `--crwn-text-secondary` | `#8a8a9a` | |
| `--crwn-text-dim` | `#5a5a6a` | ⚠️ declared but NOT exposed in `@theme` → no `text-crwn-text-dim` utility |
| `--crwn-success` | `#4CAF50` | |
| `--crwn-error` | `#E53935` | |

**⚠️ `bg-crwn-card` is used in 56 files but the token `crwn-card` is never defined** (no config, no `@theme` entry) → in Tailwind v4 it likely compiles to nothing (transparent). The correct, defined token is `bg-crwn-surface`. This is a real, widespread bug. `Confirmed`.

## 3. Typography
`Inter` via `next/font/google` (`layout.tsx:2,13-16`, `--font-inter`). ⚠️ But `globals.css:70` sets `--font-sans: var(--font-geist-sans)` — a Geist starter leftover that `layout.tsx` never defines, so body text may fall back to `system-ui`. Verify in devtools. `Strongly inferred`.

## 4. Reusable UI primitives — `src/components/ui/` (REUSE THESE)
| Component | Use for |
|---|---|
| **`OptionSelect`** | The mandated single-choice dropdown (CLAUDE.md rule: pick-one-of-3+ = dropdown, never a grid). Controlled: `options/value/onChange`. |
| **`Wizard`** | Any multi-step flow (already replaced 4+ hand-rolled wizards: setup, suggest-mission, offer builder, squad/bounty/city/playbook builders). |
| `ConfirmModal` | Confirm/cancel (`variant: danger\|default`, haptic on confirm). |
| `EmptyState` | Empty list/query blocks (emoji + title + description). |
| `Skeleton` (+ `SkeletonTrack/Card/TierCard/Post/...`) | Loading placeholders. |
| `FadeIn` / `StaggerChildren` | Viewport-triggered entrance animation (`useInView`). |
| `BackgroundImage` | Full-bleed image + dark overlay. |

`shared/`: `Toast`, `ShareButtons`, `CohortRetentionChart`, `ClipperProgram`, `FoundingBadge`, `ImageCropModal`, `UpgradePrompt`, etc. (mixes true primitives with feature components — organizational drift). `Confirmed`.

## 5. Navigation
All in `src/components/layout/Navigation.tsx`:
- **Mobile:** fixed bottom nav, `grid-cols-6` (5 items + notification bell), iOS safe-area padding.
- **Desktop:** `hidden md:flex` left sidebar, `w-64`.
- Nav items: **Studio** (`/studio`, artists) or **Earn** (`/command`, fans) in the role-aware slot, plus Home, Explore, Messages, Profile, and `NotificationBell`. Role can lag right after signup (uses `useAuth` role). `Confirmed`.

## 6. State patterns
- **Toasts:** `ToastProvider`/`useToast` (`src/components/shared/Toast.tsx`), 4 types (success/error/warning/info), auto-dismiss 4s, mounted in `layout.tsx` (`AuthProvider > ToastProvider > PlayerProvider`).
- **Loading:** `Skeleton` family + `animate-pulse`.
- **Empty:** `EmptyState`. **Error:** inline messages + toasts; API routes return `{error}` + 500.
- **Modals:** no single canonical shell — `ConfirmModal`/`CancelModal` exist; other modals hand-roll `fixed inset-0` + `neu-modal`. `Confirmed`.

## 7. Icons, charts, animation
- **Icons:** `lucide-react` (imported in ~200 files) — the only icon library.
- **Charts:** `recharts` (only ~4 files, analytics-heavy: `CohortRetentionChart`, `CancelReasonChart`, admin views).
- **Animation:** CSS classes in `neumorphic.css` — `stagger-fade-in` (inner list containers only, per rule), `page-fade-in`, `hover-lift`, `press-scale`, `card-hover`, Driver.js tour theme (`crwn-tour-*`), guide animations, Quest confetti/XP-pop. `Confirmed`.

## 8. Product tours
`driver.js` drives onboarding tours (`usePageTour`, `useTourCheck`, `*TourSteps.ts` files, `TourReplayButton`). Post-setup artist tour is trimmed (`getPostSetupTourSteps`). It **no longer auto-starts on dashboard entry**: `profile/artist/page.tsx` passes `enabled:false` to `usePageTour({tourId:'dashboard'})`. The guided tour auto-clicks across tabs and was hijacking the dashboard, so it is now replay-only via the header "?" `TourReplayButton`. `Confirmed`.

## 9. PWA / mobile
Installable PWA (`public/manifest.json`, `ServiceWorkerRegistration.tsx`). Service worker `public/sw.js` is network-first + `skipWaiting`, **cache version hand-bumped** (`CACHE_NAME='crwn-vNNN'`, currently ~v184) — must bump after each frontend change (CLAUDE.md). Skips `/api/*` and audio extensions (iOS range-request breakage). Media Session API for lock-screen player controls. **No push notifications.** Haptics via `src/lib/haptics`. `Confirmed`.

## 10. UX rules future agents MUST follow
1. **Pick-one-of-3+ selectors → `OptionSelect` dropdown** (never a grid/stack). 2-option binary toggles may stay as two buttons.
2. **Multi-step flows → `Wizard`**, one field per screen where the setup wizard pattern applies.
3. **Flows from Rise Mode honor `?returnTo=`**; back arrows use `smartBack(router, fallback)`, never a hardcoded route.
4. **No em dashes** in any user-facing copy — rewrite with comma/colon/two sentences.
5. Internal nav → `router.push()`, never `window.location.href` (external/Stripe only).
6. Prices: cents in DB, `(price/100).toFixed(2)` display, `Math.round(val*100)` input.

## 11. Known UI inconsistencies (fix toward these standards)
- **`bg-crwn-card` (56 files)** → use `bg-crwn-surface` (or define the token). `Confirmed`.
- **Color mismatch** `#0f0f0f` (var) vs `#0D0D0D` (hardcoded/docs). Pick one. `Confirmed`.
- **Font var leftover** (`--font-geist-sans`) — verify Inter renders. `Strongly inferred`.
- **Two stagger mechanisms** (CSS `.stagger-fade-in` vs `<StaggerChildren>`) — pick one.
- **No canonical Modal primitive** — modals are hand-rolled.
- Dead barrel files `ui/index.ts`, `hooks/index.ts` (`export {}`).
- Some outdated/marketing screens: `/about` footer says "© 2024"; `recruit/page.tsx` copy cites stale pricing.

---

*See also: [09-CODING-CONVENTIONS.md](09-CODING-CONVENTIONS.md) · [02-FEATURE-MAP.md](02-FEATURE-MAP.md) · [13-CURRENT-STATE.md](13-CURRENT-STATE.md)*
