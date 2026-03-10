# CRWN Session Context — March 10, 2026

## What CRWN Is
All-in-one platform for music artists to monetize, connect with fans, and build community. "Patreon meets Spotify meets Discord." Built with Next.js 16 + TypeScript, Supabase, Stripe Connect, Vercel, Tailwind CSS. Dark neumorphic UI with gold accent (#D4AF37). URL: crwn-mauve.vercel.app. GitHub: m3rcey/crwn, master branch. Workspace: /home/merce/.openclaw/workspace-crwn/

## Platform Revenue Model
- 8% platform fee on all fan→artist transactions (6% for Label tier, 5% for Founding Artists)
- Artist SaaS tiers: STARTER (Free), PRO ($49/mo), LABEL ($149/mo)
- Founding Artists (first 500): free Pro tier for 1 year + 5% fee

## Test Data
- Artist: slug `m3rcey`, artist_id `0cfd2ad9-c37c-4b68-863e-6db0aa939893`, joshn.wms@gmail.com, auth user_id `612fa313-8d4f-4748-8148-7804fada0d0c`
- Fan: jay.winwinwin@gmail.com, fan_id `09fc302e-b7fe-4e09-835b-d7069501e5a3`
- Stripe Connect ID: `acct_1T6BD7EAbi5c531A`
- 3 active fan tiers: The Wave ($10), The Inner Circle ($50), The Throne ($200)

## What Was Built/Fixed March 10 (This Session)

### Tier Benefits Checkbox System (COMPLETE)
- **tier_benefits table** created with: id, tier_id, benefit_type, config (JSONB), is_active, sort_order
- **benefitCatalog.ts** — constant definitions for all benefit types with categories, config fields, icons
- **TierBenefitsEditor.tsx** — checkbox UI in artist dashboard tier edit form
- **Fan-facing tier cards** render structured benefits with icons from tier_benefits table
- **8 active benefits:** exclusive_tracks, exclusive_albums, exclusive_posts, early_access, community_badge, shop_discount, supporter_wall, priority_replies
- **6 coming-soon (greyed out):** one_on_one_call, group_live_qa, custom_song_request, monthly_merch, credits_on_releases, shoutout
- **SupporterWall.tsx** — avatar grid with gold borders for fans in tiers with supporter_wall benefit
- **Shop discount enforcement** — product-checkout route checks tier_benefits for discount
- **Community badge + priority replies** — gold pill badge and highlight styling in comments
- **Old access_config.benefits wiped** — `UPDATE subscription_tiers SET access_config = '{}'::jsonb, description = NULL`
- **Tier configs set:** Wave = tracks+posts, Inner Circle = all+7d early+badge+"Inner Circle"+10% discount, Throne = all+14d early+badge+"Royalty"+25% discount+priority+wall
- **Tier descriptions added:** Wave = "Your front row seat...", Inner Circle = "For the real ones...", Throne = "Day one energy..."

### Multi-Select Tracks with Bulk Actions
- **Checkboxes on left side** of each track in artist dashboard (via renderPrefix prop on SortableTrackList)
- **Select all** checkbox in header
- **Bulk action bar** appears when tracks selected: "Add to Album" dropdown, "Add to Playlist" dropdown, "Delete" button
- **handleBulkDelete** — sets is_active: false on all selected tracks
- **handleBulkAddToAlbum** — upserts into album_tracks with track_number
- **handleBulkAddToPlaylist** — upserts into playlist_tracks with position

### Quick Create Album/Playlist Modals
- **QuickCreateAlbumModal.tsx** — pops up from bulk action "Create New Album" option. Title, description, cover art, release date/Available Now toggle, tier access, price (auto-suggested from track prices × 0.8), shows selected tracks
- **QuickCreatePlaylistModal.tsx** — same pattern for playlists
- Both create the entity + link all selected tracks in one flow

### Album Page Matches Playlist Layout
- **AlbumShareContent.tsx rewritten** — now uses same layout as playlist page: hero banner with cover art, "ALBUM" label, GatedTrackPlayer cards for tracks, share buttons
- **Album cards on fan-side** now link to full album page (Link component) instead of expanding inline
- **Album hover edit/delete** fixed — added `group` class to card container for hover overlay
- **Share buttons added** to both album and playlist pages

### Track Delete (is_active) Fixes
- **is_active column added** to tracks table
- **All queries now filter is_active: true:**
  - Artist dashboard track fetch (TrackUploadForm.tsx)
  - Fan-side artist page tracks + track count
  - Explore API (new releases + popular tracks)
  - Playlist page (filter in .filter() after join)
  - Album page (filter in .map().filter() after join)
  - AlbumCard component
  - Album track counts (join to tracks, count active only)
  - Playlist track counts (join to tracks, count active only)

### Community Fixes
- **Post delete fixed** — RLS SELECT policy updated to allow owners to see their own posts: `is_active = true OR author_id = auth.uid() OR artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid())`
- **Post delete UPDATE policy** — added explicit WITH CHECK clause
- **Photo sizing** — max-h-[500px] object-contain on community post images (was cropping portrait photos)
- **Community tab** is default for subscribers, tiers tab for non-subscribers

### Artist Playlists Fixed
- **playlists table** was missing columns — added: artist_id, is_artist_playlist, is_free, allowed_tier_ids, is_active, price
- **ArtistPlaylistManager** now works in dashboard → Music → Playlists tab

### Other Fixes
- **album_tracks uses `track_number` NOT `position`** — fixed everywhere: AlbumCard, AlbumManager, QuickCreateAlbumModal, album page, TrackUploadForm bulk add
- **playlist_tracks uses `position`** — kept as-is, only album_tracks was wrong
- **CRWN logos** — gold crown (1024x1024) resized to apple-touch-icon (180x180), icon-512x512, icon-192x192 for PWA. Transparent crown resized to favicon.ico (32x32)
- **community-media storage bucket** created in Supabase (was missing, causing photo upload failures)

### Derek Agent Config Updated
- Model changed from simple string to object: `{ "primary": "minimax/minimax-m2.5", "fallbacks": ["moonshot/kimi-k2.5"] }` in openclaw.json
- **Critical lesson:** Always clean old HANDOFF files from Derek's workspace before firing — he reads whatever handoff he finds first and ignores the message
- Keep messages short and explicit, don't reference handoff files by name unless they're the ONLY file in workspace

## Git Commits March 10 (in order)
1. `560ebc1` — feat: multi-select tracks with bulk delete, add to album, add to playlist
2. `e357740` — fix: move track checkboxes to left side before numbers
3. Community post image fix (amend)
4. Community post delete debug + fix
5. Various album_tracks track_number fixes
6. `204b5e9` — feat: custom CRWN logo for PWA home screen, favicon, and apple touch icon
7. `9cc5360` — feat: album page matches playlist page layout exactly
8. `7de690c` — feat: album card links to full page, share buttons on both
9. Multiple is_active filter fixes across all fan-side queries
10. `12909f6` — fix: album and playlist track counts exclude deleted tracks

## Codebase Patterns (CRITICAL — Updated)
- Prices in **cents** everywhere
- Column: `stripe_connect_id` NOT `stripe_account_id`
- Column: `fan_id` on subscriptions NOT `user_id`
- **Never pass `stripeAccount` for subscription operations** — subs live on platform
- `is_free !== false` to handle null (null = free)
- Albums use `is_active` not `is_published`, no `slug` field
- **album_tracks uses `track_number`** NOT `position`
- **playlist_tracks uses `position`** NOT `track_number`
- **tracks table has `is_active`** — ALL queries must filter `.eq('is_active', true)`
- **RLS soft-delete pitfall:** SELECT policy with `is_active = true` blocks UPDATE to set is_active=false. Fix: add owner override to SELECT policy (`OR author_id = auth.uid()`)
- **Supabase client errors don't throw** — must check `{ error }` from response, catch block won't fire
- Toast system: use `useToast()` + `showToast(message, type)`, never `alert()`
- **Artist pages are PUBLIC** — no auth redirect
- **usePlayer enrichment effect** fetches artist name + slug when currentTrack changes
- **Track lists must pass full array to play()** — `play(track, tracks)` not `play(track)`
- **SortableTrackList** supports `renderPrefix` prop for left-side content (checkboxes) and `renderActions` for right-side
- **Community post images:** max-h-[500px] object-contain, no aspect-video forcing
- **Default tab logic:** `isSubscribed` state drives activeTab — tiers for non-subscribers, community for subscribers

## DB Migrations Run This Session
```sql
-- Tier benefits
CREATE TABLE tier_benefits (id UUID PK, tier_id UUID FK, benefit_type TEXT, config JSONB, is_active BOOLEAN, sort_order INTEGER, UNIQUE(tier_id, benefit_type));
ALTER TABLE tracks ADD COLUMN public_release_date TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE tracks ADD COLUMN is_active BOOLEAN DEFAULT true;

-- Playlists (missing columns)
ALTER TABLE playlists ADD COLUMN artist_id UUID REFERENCES artist_profiles(id);
ALTER TABLE playlists ADD COLUMN is_artist_playlist BOOLEAN DEFAULT false;
ALTER TABLE playlists ADD COLUMN is_free BOOLEAN DEFAULT true;
ALTER TABLE playlists ADD COLUMN allowed_tier_ids JSONB DEFAULT '[]'::jsonb;
ALTER TABLE playlists ADD COLUMN is_active BOOLEAN DEFAULT true;
ALTER TABLE playlists ADD COLUMN price INTEGER DEFAULT NULL;

-- Products (from Mar 9)
ALTER TABLE products ADD COLUMN is_free BOOLEAN DEFAULT true;
ALTER TABLE products ADD COLUMN allowed_tier_ids JSONB DEFAULT '[]'::jsonb;

-- RLS fixes
-- community_posts SELECT: is_active = true OR author_id = auth.uid() OR artist_id IN (artist_profiles where user_id = auth.uid())
-- community_posts UPDATE: WITH CHECK allowing author and artist owner
-- tracks UPDATE: WITH CHECK matching USING clause
-- community-media storage bucket created (public)
```

## Remaining / Next Priorities
1. **Onboard The G1ft** — first real artist besides m3rcey
2. **Weekly artist reports** (Resend email)
3. **AI Artist Manager agent** — CRWN's moat
4. **SMS Marketing** (Twilio) — keyword opt-in, mass messaging, personalization tokens, opt-out compliance. Pricing: platform tier feature (Pro: 500 msgs/mo, Label: 2500 msgs/mo)
5. **Fan Database / Audience Tab** — consolidate all fan data, smart filters
6. **Email Campaigns** — Resend broadcasts with personalization
7. **Welcome Sequences** — automated drip after subscribe
8. **Smart Links / Funnel Pages** — top-of-funnel data capture (ForeverFan-style)
9. **Physical Merch Shop** — product type: physical, shipping address at Stripe checkout, order tracking (paid→processing→shipped→delivered), tracking number, in-app notifications
10. **Full test plan** (bug #12)

## ForeverFan Research (Competitive Intel)
ForeverFan is a fan engagement platform ($15.99/mo) with: smart links (funnel links, presave links, link-in-bio), audience management with smart filters (location, streaming prefs), SMS + email campaigns with personalization, automated welcome sequences, custom phone numbers ($6/mo). CRWN's advantage: has music streaming + community + subscriptions + shop + analytics built in — ForeverFan is marketing-only. Key features to adopt: fan database, email/SMS campaigns, welcome sequences, smart links.

## Key File Locations (Updated)
- Tier benefits catalog: `src/lib/benefitCatalog.ts`
- Tier benefits editor: `src/components/artist/TierBenefitsEditor.tsx`
- Tier benefits API: `src/app/api/tier-benefits/route.ts`
- Supporter wall: `src/components/artist/SupporterWall.tsx`
- Quick create album modal: `src/components/artist/QuickCreateAlbumModal.tsx`
- Quick create playlist modal: `src/components/artist/QuickCreatePlaylistModal.tsx`
- Album share/full page: `src/components/share/AlbumShareContent.tsx`
- Album page route: `src/app/artist/[slug]/album/[id]/page.tsx`
- Playlist page route: `src/app/artist/[slug]/playlist/[id]/page.tsx`
- SortableTrackList (with renderPrefix): `src/components/shared/SortableTrackList.tsx`
- Track upload + bulk actions: `src/components/artist/TrackUploadForm.tsx`
- Artist playlist manager: `src/components/artist/ArtistPlaylistManager.tsx`
- Album manager: `src/components/artist/AlbumManager.tsx`
- Artist profile content (tab logic): `src/components/artist/ArtistProfileContent.tsx`
- Artist page server: `src/app/artist/[slug]/page.tsx`
- Explore API: `src/app/api/explore/route.ts`
- Community post card: `src/components/community/CommunityPostCard.tsx`
- Layout (metadata/icons): `src/app/layout.tsx`
- PWA manifest: `public/manifest.json`
- Service worker: `public/sw.js` (v3)

## Agent Workflow
- **Derek** is the primary CRWN agent (model: minimax with kimi-k2.5 fallback)
- Fire: `openclaw agent --agent derek --message "..." --deliver --reply-channel slack --reply-to "C0AC5CVSJN4"`
- **Always clean Derek's workspace** of old HANDOFF files before firing
- Copy CODEBASE.md + DEV_RULES.md to workspace-derek
- Keep messages SHORT and explicit — don't reference handoff files unless they're the only one
- Clear sessions before firing: `rm -f /home/merce/.openclaw/agents/derek/sessions/*.lock && rm -f /home/merce/.openclaw/agents/derek/sessions/*.json`
- `npm run build` must pass before pushing
- Vercel auto-deploys on push to master, takes ~2 min
- Service worker caches aggressively — clear Safari cache or incognito to test
