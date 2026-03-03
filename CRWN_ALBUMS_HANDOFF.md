# CRWN Task: Albums Feature — Ian Handoff Brief

**Priority:** Phase 3 — Next feature after Phase 2 completion
**Prefix Rule:** Read CODEBASE.md and DEV_RULES.md first. Run `npm run build` before pushing.

---

## Overview

Add Albums functionality inside the Music tab. Artists can organize tracks into albums with cover art, descriptions, release dates, and tier gating. Fans can browse albums, view tracklists, and play albums front-to-back with auto-advance.

---

## 1. Database Schema

### New Table: `albums`

```sql
CREATE TABLE albums (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  artist_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  cover_image_url TEXT,
  release_date DATE,
  is_published BOOLEAN DEFAULT false,
  track_order JSONB DEFAULT '[]'::jsonb,  -- ordered array of track UUIDs
  tier_required TEXT DEFAULT NULL,          -- null = free, 'wave', 'inner_circle', 'throne'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for artist lookup
CREATE INDEX idx_albums_artist_id ON albums(artist_id);

-- Updated_at trigger (reuse existing pattern from other tables)
CREATE TRIGGER set_albums_updated_at
  BEFORE UPDATE ON albums
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

### Modify `tracks` Table

```sql
ALTER TABLE tracks ADD COLUMN album_id UUID REFERENCES albums(id) ON DELETE SET NULL;
ALTER TABLE tracks ADD COLUMN track_number INTEGER;

-- Index for album lookup
CREATE INDEX idx_tracks_album_id ON tracks(album_id);
```

### RLS Policies on `albums`

```sql
-- Enable RLS
ALTER TABLE albums ENABLE ROW LEVEL SECURITY;

-- Anyone can see published albums
CREATE POLICY "Public can view published albums"
  ON albums FOR SELECT
  USING (is_published = true);

-- Artists can see their own albums (including drafts)
CREATE POLICY "Artists can view own albums"
  ON albums FOR SELECT
  USING (artist_id = auth.uid());

-- Artists can insert their own albums
CREATE POLICY "Artists can create albums"
  ON albums FOR INSERT
  WITH CHECK (artist_id = auth.uid());

-- Artists can update their own albums
CREATE POLICY "Artists can update own albums"
  ON albums FOR UPDATE
  USING (artist_id = auth.uid())
  WITH CHECK (artist_id = auth.uid());

-- Artists can delete their own albums
CREATE POLICY "Artists can delete own albums"
  ON albums FOR DELETE
  USING (artist_id = auth.uid());
```

**⚠️ REMINDER FROM DEV_RULES:** If soft-delete is used anywhere, make sure owner override policies exist. Service role key required for any webhook-triggered Supabase writes.

---

## 2. Supabase Storage

Albums cover images go in the existing storage bucket (likely `tracks` or `images` bucket — check CODEBASE.md). Upload path pattern:

```
covers/{artist_id}/{album_id}.{ext}
```

---

## 3. TypeScript Types

```typescript
// types/album.ts
export interface Album {
  id: string;
  artist_id: string;
  title: string;
  description: string | null;
  cover_image_url: string | null;
  release_date: string | null;  // ISO date string
  is_published: boolean;
  track_order: string[];         // array of track UUIDs
  tier_required: string | null;  // null | 'wave' | 'inner_circle' | 'throne'
  created_at: string;
  updated_at: string;
}

export interface AlbumWithTracks extends Album {
  tracks: Track[];  // resolved from track_order
}

export interface CreateAlbumInput {
  title: string;
  description?: string;
  cover_image_url?: string;
  release_date?: string;
  tier_required?: string | null;
}

export interface UpdateAlbumInput extends Partial<CreateAlbumInput> {
  is_published?: boolean;
  track_order?: string[];
}
```

---

## 4. API Layer

Create `/lib/albums.ts` (or add to existing music API file — check CODEBASE.md for pattern):

```typescript
// Core CRUD
getAlbumsByArtist(artistId: string): Promise<Album[]>
getAlbumById(albumId: string): Promise<AlbumWithTracks>
createAlbum(input: CreateAlbumInput): Promise<Album>
updateAlbum(albumId: string, input: UpdateAlbumInput): Promise<Album>
deleteAlbum(albumId: string): Promise<void>

// Track management
addTrackToAlbum(albumId: string, trackId: string, position?: number): Promise<void>
removeTrackFromAlbum(albumId: string, trackId: string): Promise<void>
reorderAlbumTracks(albumId: string, trackOrder: string[]): Promise<void>

// Queries
getAlbumsByArtistPublic(artistSlug: string): Promise<Album[]>  // published only, for fan view
getSinglesByArtist(artistId: string): Promise<Track[]>          // tracks where album_id IS NULL
```

---

## 5. UI Components — Artist Side

### Music Tab Restructure

Current Music tab shows a flat list of tracks. Restructure to:

```
Music Tab
├── Albums section (grid of album cards)
│   ├── Album Card (cover art, title, track count, published/draft badge)
│   └── "+ Create Album" card
├── Singles section (tracks not in any album)
└── "+ Upload Track" button (existing)
```

### Create/Edit Album Page or Modal

Fields:
- **Title** (required, text input)
- **Description** (optional, textarea)
- **Cover Image** (upload with preview, drag-and-drop)
- **Release Date** (date picker, optional)
- **Tier Required** (dropdown: Free / Wave / Inner Circle / Throne)
- **Tracks** (drag-and-drop sortable list)
  - Show existing unassigned tracks as "available" to add
  - Allow uploading new tracks directly into the album
  - Drag to reorder
  - Remove track from album (returns to singles)
- **Publish/Unpublish** toggle
- **Delete Album** button (with confirmation — "This removes the album but keeps the tracks as singles")

**⚠️ DEV_RULES REMINDER:** All form state resets must include EVERY field. When resetting after save, clear title, description, cover, release_date, tier_required, and tracks.

### Album Detail Page (Artist View)

Route: `/dashboard/music/albums/[albumId]`

- Album header (cover, title, description, edit button)
- Track list with drag-and-drop reorder
- Stats (total plays across album tracks, if analytics exist)

---

## 6. UI Components — Fan Side

### Artist Profile → Music Tab

Restructure the fan-facing music tab:

```
Music Tab (Fan View)
├── Albums Grid
│   ├── Album Card (cover art, title, track count, duration, lock icon if gated)
│   └── Click → Album Detail View
├── Singles Section
│   └── Individual track cards (existing pattern)
```

### Album Detail View (Fan)

Route: `/[artistSlug]/music/[albumId]` (or modal — match existing pattern)

- Album cover (large)
- Title, description, release date
- **"Play All" button** → queues entire album in player
- Track list:
  - Track number, title, duration, play button per track
  - Currently playing indicator
  - If album is gated and fan doesn't have required tier → show lock icon + "Subscribe to [tier] to unlock"

### Content Gating Logic

Follow existing tier gating pattern from CODEBASE.md:
- `tier_required = null` → free for everyone
- `tier_required = 'wave'` → Wave ($10) and above
- `tier_required = 'inner_circle'` → Inner Circle ($50) and above
- `tier_required = 'throne'` → Throne ($500) only

Tier hierarchy: throne > inner_circle > wave > free

If fan's tier >= album's tier_required → full access
If fan's tier < album's tier_required → show gated state with upgrade CTA

---

## 7. Audio Player Integration

This is critical for good UX. When a fan clicks "Play All" on an album:

1. Load all tracks from `track_order` array (in order)
2. Set the player queue to the full album tracklist
3. Begin playing track 1
4. Auto-advance to next track when current finishes
5. Show context in player: **"Track 3 of 12 — Album Name"**
6. Allow skip forward/backward within album queue
7. When album finishes, stop (don't loop unless user enables repeat)

**Integration point:** Check how the existing audio player component manages its queue/playlist state. Extend it to accept an album tracklist. The player likely lives in a global context or provider — add `currentAlbum` and `albumQueue` to that state.

---

## 8. File Locations (Probable — Verify Against CODEBASE.md)

```
src/
├── types/
│   └── album.ts                          # New — Album types
├── lib/
│   └── albums.ts                         # New — Album API functions
├── app/
│   ├── dashboard/
│   │   └── music/
│   │       ├── page.tsx                  # Modify — Add albums grid + singles section
│   │       └── albums/
│   │           └── [albumId]/
│   │               └── page.tsx          # New — Artist album detail/edit page
│   └── [artistSlug]/
│       └── music/
│           └── [albumId]/
│               └── page.tsx              # New — Fan album detail view
├── components/
│   ├── albums/
│   │   ├── AlbumCard.tsx                 # New — Album grid card
│   │   ├── AlbumForm.tsx                 # New — Create/edit album form
│   │   ├── AlbumTrackList.tsx            # New — Sortable track list for albums
│   │   └── AlbumDetailFan.tsx            # New — Fan-facing album detail
│   └── player/
│       └── AudioPlayer.tsx               # Modify — Add album queue support
```

---

## 9. Migration Checklist

Run in Supabase SQL editor (or via migration file):

1. [ ] Create `albums` table
2. [ ] Add `album_id` and `track_number` columns to `tracks`
3. [ ] Create indexes
4. [ ] Create RLS policies
5. [ ] Create updated_at trigger
6. [ ] Test: artist can create album, add tracks, publish
7. [ ] Test: fan can view published album, play all, gating works
8. [ ] Test: unpublished albums hidden from fans
9. [ ] Test: deleting album sets tracks.album_id to NULL (tracks become singles)

---

## 10. Key Debugging Reminders (from DEV_RULES.md)

- `display_name` is on `profiles` NOT `artist_profiles`
- Prices in cents always
- All form state resets must include every field
- RLS soft-delete policies need owner override
- Service role key required for webhook Supabase writes
- `NEXT_PUBLIC_` env vars require redeploy without cache
- Stripe prices on platform account not connected account
- **Run `npm run build` before pushing — catch type errors early**

---

## 11. Ian Shell Command

```bash
openclaw agent --agent ian \
  --message "CRWN task. Read CODEBASE.md and DEV_RULES.md first. Run npm run build before pushing.

NEW FEATURE: Albums inside Music tab.

Full spec is in the message below. Work through it in order:
1. Run the SQL migration (create albums table, alter tracks table, RLS policies, indexes)
2. Create TypeScript types
3. Build API layer (lib/albums.ts)
4. Build artist-side UI (albums grid in Music tab, create/edit album form with drag-and-drop track ordering, publish/unpublish)
5. Build fan-side UI (album grid on artist profile, album detail view with tracklist, Play All button, tier gating)
6. Integrate with audio player (album queue, auto-advance, track X of Y display)
7. Test all flows end-to-end
8. npm run build — fix any errors
9. Push and deploy

Schema, component breakdown, file locations, and gating logic are all detailed in the spec file CRWN_ALBUMS_HANDOFF.md in the workspace. Read it fully before starting.

After build + deploy, fire Imani for QA:
openclaw agent --agent imani --message 'QA REQUEST: CRWN Albums Feature. URL: crwn-mauve.vercel.app. Test: artist can create/edit/delete/publish albums, assign tracks, reorder tracks, set tier gating. Fan can browse albums, view album detail, play all, auto-advance, gating enforced for locked albums. Check mobile responsiveness. If issues found, fire Ian back with fix list.' --deliver --reply-channel slack --reply-to C0AC5CVSJN4" \
  --deliver --reply-channel slack --reply-to C0AC5CVSJN4
```

---

## Summary

| Component | Action |
|-----------|--------|
| `albums` table | CREATE |
| `tracks` table | ALTER (add album_id, track_number) |
| RLS policies | CREATE (5 policies) |
| `types/album.ts` | CREATE |
| `lib/albums.ts` | CREATE |
| Artist Music tab | MODIFY (add albums grid + singles) |
| Album create/edit form | CREATE |
| Album detail (artist) | CREATE |
| Album detail (fan) | CREATE |
| Audio player | MODIFY (album queue + auto-advance) |
| Content gating | EXTEND (album-level gating) |
