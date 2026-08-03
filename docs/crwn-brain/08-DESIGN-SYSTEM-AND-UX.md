# 08 — Design System & UX

> Grounded in `src/app/globals.css`, `src/app/styles/neumorphic.css`, `src/app/layout.tsx`, `src/components/ui/*`, `src/components/layout/Navigation.tsx`. Tailwind CSS v4 (CSS-first config; **there is no `tailwind.config.*` file**). `Confirmed` unless noted.

## 0. v2 redesign (2026-08-02) — what changed and the new rules

The interface v2 handoff landed its foundation. All in `neumorphic.css` (custom CSS never goes in `globals.css`, Tailwind v4 purges it):

- **New tokens** in `:root`: `--crwn-raised` (gradient body), `--crwn-raised-edge` (1px top highlight), `--crwn-inset-bg`, `--crwn-ambient`, gold hi/lo/raised/tint/glow, radius scale, and the motion vocabulary (`--crwn-ease-spring` 260ms for movement, `--crwn-ease-out` 180ms for colour). Existing tokens were NOT redefined; `--crwn-surface` keeps its deliberate 40% alpha.
- **`.neu-raised` / `.neu-inset` redefined** (75+ call sites upgraded through the two classes): flat surfaces with a gradient body + one top highlight + one ambient shadow. Not stacked soft shadows.
- **Motion:** `.crwn-interactive` is the shared transition class; `:active` scales to 0.965. The shared `.neu-button*` / `.neu-icon-button` classes already carry it. Primary actions that navigate should swap their label for `.crwn-btn-spinner` (in the button's own ink, width pinned). Springs collapse under reduced-motion; the spinner stays.
- **Nav active state:** desktop sidebar is a rail marker (surface bg, gold ink, 3px gold left bar), never a filled gold block. Mobile stays gold-text-no-fill.
- **Contrast is measured, never guessed:** `src/lib/contrast.ts` (tested, `contrast.test.ts`) — `inkOn` / `fillFor` / `liftForInk` / `groundOf` / `accentTheme`. Any surface tinted by an arbitrary (sampled) colour must resolve its ink through these, not a constant.
- **Artist palette:** `src/lib/palette.ts` (`samplePalette`) runs ONCE at banner upload (`ArtistProfileForm`) and persists `accent_hex`/`accent2_hex`/`surface_hex` on `artist_profiles` (migration `schema-phase2-artist-palette.sql`, fail-soft before it runs). Never recompute per visit. Null palette = keep CRWN gold.
- **`src/lib/useLivingPhoto.ts`**: the living-photo idle motion + hero parallax hooks for calculator intros (not yet consumed).
- **Font fixed:** `--font-sans` now points at `--font-inter` (it pointed at the undefined `--font-geist-sans`, so the app was silently rendering system-ui). Inter is the brand font.
- **Home structural change:** the next-action (finish-setup) card is the first thing under the greeting, full width with progress; the old top-right pill is gone. Rise Mode secondary quests collapse to rows (`CollapsedQuestRow`) and expand in place.
- **Artist-page accent render (2026-08-02):** `accentPageVars()` (contrast.ts) overrides `--crwn-gold`/`-hover`/`-muted` on the `[slug]` page wrapper; gold utilities compile to `var(--crwn-gold)` (`@theme inline`), so tabs, play glyphs, tier cards and CTAs all follow the sampled accent with zero per-component edits. One variable is safe in both roles (fill under dark ink, ink on dark ground) because `liftForInk()` guarantees ≥4.5:1 vs near-black; a null palette or unliftable hue keeps CRWN gold. **Adding a column to `artist_profiles` requires a per-column GRANT and an `artist_profiles_public` view rebuild** (the view enumerates columns at creation) — pattern in `schema-phase2-artist-palette.sql`.
- **Artist page landed end to end (2026-08-03, four commits):**
  - **Visual pass:** contained ambient accent pool at the page top (pure CSS `color-mix` on the accent var; shader tier is a later pass), banner as a rounded media card with accent glow, lifted avatar tile, display-size name, accent-tinted verified chip, accent-tinted tier cards with pill Join buttons. `GatedTrackPlayer` deliberately untouched (it carries entitlement logic; its gold glyphs already follow the variable).
  - **Self-healing palette:** `PaletteBackfill` closes the null-palette gap. Sampling needs a browser canvas, so when the OWNER views their page with a banner but no stored palette it samples in place, persists, refreshes. Existing artists get their accent on the next visit, no re-upload (verified live: m3rcey backfilled `#d50000`).
  - **Banner reposition:** drag-to-reframe persists TWO NUMBERS (`object-position` percentages, `schema-phase2-banner-position.sql`, applied), never a re-encoded image. Owner-only, Escape cancels.
  - **Derived accent variants must survive as INK, not just the base:** `liftForInk()` puts the base exactly AT 4.5:1, so scaling produced hover 3.93:1 and muted 2.23:1 on the live red accent. Hover now brightens toward white (cannot fall below base); muted keeps the darker derivation but clamps back to the AA floor. Call sites wanting a dim edge use alpha (`/30`), which is compositing, not ink.
  - **Muted ink on tinted cards fails on the DEFAULT gold, not the accent:** `#8a8a9a` is 5.12:1 on a flat card but 3.85:1 under a 15% GOLD tint (red tint holds 4.68:1; red is dark in luminance). `--crwn-muted-on-tint` (`text-crwn-muted-tint`) is solved against the worst shipped tint (18% gold) and applied to the tier-card and Home next-action muted lines. Deliberately NOT used on untinted grounds, where `#8a8a9a` is correct.
  - **Contrast sweep:** `auditContrast()` is the pure decision (unit-tested), `sweepContrast()` the browser walk over `groundOf()` compositing gradient stops; dev builds expose `window.__crwnContrastSweep()`. CI wiring still pending.
  - **Sampler hue bug:** the design reference tested `180 - dh > 35` but `dh` already IS the circular hue distance, so it accepted identical hues and rejected exact complements. Now `dh > 35`, pinned by `palette.test.ts` in both directions.
- Still pending from the handoff (see TODO "On Claude's plate"): setup-wizard composition, Studio Music/Fan CRM layout, calculator-intro pattern, homepage ambient layer (the WebGL tier; the CSS pool shipped), living-photo heroes, player accent, CI wiring for the contrast sweep.

## 1. Brand & theme
Dark-mode only, black canvas + gold accent, "flat dark" (no neumorphic shadows despite the `neu-` class prefix, which is a naming leftover). **Gold = interactive** (if it's gold, it's tappable). Layered surfaces for depth, dividers over borders for lists. Mobile-first. `Confirmed` (`neumorphic.css:1` header, `CLAUDE.md`).

## 2. Color tokens (actual CSS values — note the mismatch)
Defined in `globals.css:1-18`, exposed as Tailwind utilities via `@theme inline`:

| Token | Value | Notes |
|---|---|---|
| `--crwn-bg` | `#0f0f0f` | ⚠️ but `layout.tsx` hardcodes `#0D0D0D` (and CLAUDE.md/PRD say `#0D0D0D`) — mismatch |
| `--crwn-surface` | `rgba(26,26,26,0.4)` | cards/panels. **40% alpha** — fine over the page, WRONG on anything that floats |
| `--crwn-surface-solid` | `#1a1a1a` | **opaque**. Use for floating overlays (dropdown menus, popovers) so page text does not show through |
| `--crwn-elevated` | `#222222` | hover/active/dividers |
| `--crwn-gold` | `#D4AF37` | accent (exact everywhere) |
| `--crwn-gold-hover` | `#C9A032` | |
| `--crwn-gold-muted` | `#8B7536` | borders/dividers |
| `--crwn-text` | `#f0f0f0` | primary |
| `--crwn-text-secondary` | `#8a8a9a` | |
| `--crwn-success` | `#4CAF50` | |
| `--crwn-error` | `#E53935` | |

**✅ FIXED 2026-07-11 (was: `bg-crwn-card` used in 56 files, token never defined).** Confirmed in the browser that it compiled to nothing, so every panel using it was fully see-through. All usages were renamed to the defined `bg-crwn-surface`, and the undefined token is gone from the codebase. `--crwn-text-dim` had the same defect (declared in `:root`, never exposed in `@theme`, so `text-crwn-text-dim` was a no-op); its usages were mapped to `crwn-text-secondary` and the dead var removed.

**Overlays must be opaque.** `crwn-surface` is 40% alpha, so it still bleeds when used on something that floats over content. Floating panels use `bg-crwn-surface-solid`. This bit the `OptionSelect` menu, `FanTable` segments and `TrackListItem` menu (all fixed). Modals were already safe because `.neu-modal` hardcodes `background: #1a1a1a`. `Confirmed`.

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
- Some outdated/marketing screens: `/about` footer says "© 2024". (The `recruit/page.tsx` stale-pricing copy was fixed 2026-07-31 in the Launch/Pro/Scale repricing.)

---

*See also: [09-CODING-CONVENTIONS.md](09-CODING-CONVENTIONS.md) · [02-FEATURE-MAP.md](02-FEATURE-MAP.md) · [13-CURRENT-STATE.md](13-CURRENT-STATE.md)*
