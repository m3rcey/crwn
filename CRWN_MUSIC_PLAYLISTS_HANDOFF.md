# CRWN Task: Music Upload + Playlists + Drag Reorder — Ian Handoff

**Prefix Rule:** Read CODEBASE.md and DEV_RULES.md first. Run `npm run build` before pushing.

---

## CRITICAL: Lessons from Last Build (READ THIS FIRST)

The last Albums feature had build errors that took an hour to fix. DO NOT repeat these mistakes:

1. **DO NOT declare duplicate variable names** — check existing variables in any file before adding new ones
2. **DO NOT reference fields that don't exist on types** — check `src/types/index.ts` before using any property
3. **DO NOT add `slug` or `is_published` to albums** — these don't exist. Albums use `is_active` for visibility and `is_free` + `allowed_tier_ids` + `price` for access control
4. **DO NOT hardcode tier options** — tiers are fetched dynamically from `subscription_tiers` table
5. **DO NOT create garbled JSX** — double-check all className strings are valid
6. **`display_name` is on `profiles` NOT `artist_profiles`**
7. **Prices are always in cents** in the DB
8. **All form state resets must include EVERY field**
9. **Run `npm run build` and fix ALL errors before pushing**

---

## Overview

Three features in one build:

1. **Upload music directly inside the Create/Edit Album form**
2. **Playlists tab with "Add to Playlist" from tracks**
3. **Drag-and-drop reorder on Music tab, Album tab, and Playlist tab**

---

## Feature 1: Upload Music Inside Album Form

### Current State
- The Create Album form in `src/components/artist/AlbumManager.tsx` only lets artists assign existing tracks to an album
- Track uploading is a separate flow in the Music/Tracks tab
- Artists want to upload new tracks directly into the album they're creating

### What to Build
- Add an "Upload Track" button inside the album form's track selection area (below the existing "Add tracks" section)
- When clicked, show a file input that accepts audio files (mp3, wav, flac, aac)
- On file select, upload the audio to Supabase storage (same pattern as existing track upload)
- Auto-detect duration using Web Audio API (existing pattern in codebase)
- Prompt for track title (default to filename without extension)
- After upload completes, automatically add the new track to the album's selected tracks list
- The track should be created in the `tracks` table AND added to `selectedTracks` state

### Key Files to Modify
- `src/components/artist/AlbumManager.tsx` — add upload UI and logic inside the form

### Reference
Look at how existing track upload works in the Music tab. Replicate that upload logic (storage bucket, path pattern, duration detection) but integrate it inline in the album form.

---

## Feature 2: Playlists Tab

### Database

**Table `playlists` already exists in types** — check `src/types/index.ts` for the existing `PlaylistTrack` interface. Verify if the `playlists` table exists in Supabase. If not, create:

```sql
CREATE TABLE IF NOT EXISTS playlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  cover_image_url TEXT,
  is_public BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE playlists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own playlists" ON playlists FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Public playlists visible to all" ON playlists FOR SELECT USING (is_public = true);

CREATE INDEX IF NOT EXISTS idx_playlists_user ON playlists(user_id);
```

**Table `playlist_tracks`** — check if exists, create if not:

```sql
CREATE TABLE IF NOT EXISTS playlist_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id UUID NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  track_id UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 1,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(playlist_id, track_id)
);

ALTER TABLE playlist_tracks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own playlist tracks" ON playlist_tracks FOR ALL USING (
  auth.uid() IN (
    SELECT user_id FROM playlists WHERE id = playlist_tracks.playlist_id
  )
);
CREATE POLICY "Anyone can view public playlist tracks" ON playlist_tracks FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM playlists WHERE id = playlist_tracks.playlist_id AND is_public = true
  )
);

CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist ON playlist_tracks(playlist_id);
```

### UI: Playlists Tab (Artist/User Side)

Add a "Playlists" tab alongside "Tracks" and "Albums" in the Music management area.

Components needed:
- `src/components/artist/PlaylistManager.tsx` — CRUD for playlists
  - Create playlist (title, description, optional cover image)
  - View list of user's playlists with track count
  - Edit playlist (rename, reorder tracks, remove tracks)
  - Delete playlist
  - Drag-and-drop track reorder within playlist

### UI: "Add to Playlist" from Tracks

On the Music tab's track list (screenshot shows tracks like "Born In The Wild", "pURITY", etc.):
- Add a "+" or "..." menu button on the right side of each track (next to the play and delete buttons)
- On click, show a dropdown/modal listing the user's playlists
- Clicking a playlist adds the track to that playlist
- Show a checkmark next to playlists the track is already in
- Include a "Create New Playlist" option at the bottom of the dropdown

### UI: Playlists in Library Tab

The existing Library tab (`/library`) should show the user's playlists:
- Grid or list of playlist cards
- Click to view playlist detail with tracklist
- Play all button

---

## Feature 3: Drag-and-Drop Reorder

### Library Choice
Use `@dnd-kit/core` and `@dnd-kit/sortable` — they're the standard React DnD library. Install:
```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

### Where to Add Drag Reorder

**1. Music Tab — Track List**
- Allow reordering tracks in "Your Tracks" list
- Save order to DB (add `position` column to tracks if not exists, or use a separate ordering mechanism)
- Show drag handle (grip icon) on the left of each track

**2. Album Tab — Tracks Within Album**
- Already has up/down arrow reorder in AlbumManager
- Replace the up/down arrows with proper drag-and-drop
- Save order to `album_tracks.position`

**3. Playlist Tab — Tracks Within Playlist**
- Drag to reorder tracks in a playlist
- Save order to `playlist_tracks.position`

### Implementation Pattern
Create a reusable `SortableTrackList` component:

```typescript
// src/components/shared/SortableTrackList.tsx
interface SortableTrackListProps {
  tracks: Track[];
  onReorder: (tracks: Track[]) => void;
  onRemove?: (trackId: string) => void;
  renderActions?: (track: Track) => React.ReactNode;
}
```

This component wraps `@dnd-kit/sortable` and is reused in AlbumManager, PlaylistManager, and the Music tab.

---

## File Structure

```
src/components/
├── artist/
│   ├── AlbumManager.tsx          # MODIFY — add upload inside form, replace arrows with DnD
│   ├── PlaylistManager.tsx       # NEW — playlist CRUD
│   └── TrackListItem.tsx         # NEW — shared track row with add-to-playlist menu
├── shared/
│   └── SortableTrackList.tsx     # NEW — reusable drag-and-drop track list
```

---

## Type Updates (src/types/index.ts)

Check if these already exist before adding:

```typescript
export interface Playlist {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  cover_image_url: string | null;
  is_public: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Joined
  tracks?: Track[];
  track_count?: number;
}
```

`PlaylistTrack` already exists at line ~100 in index.ts.

---

## DO NOT

- DO NOT create duplicate variable names in any file
- DO NOT reference properties not defined in the type interfaces
- DO NOT add new columns to existing tables without checking if they already exist (use IF NOT EXISTS)
- DO NOT hardcode tier names or prices anywhere
- DO NOT use `is_published` on albums — it doesn't exist
- DO NOT forget to handle form state resets for ALL fields
- DO NOT skip `npm run build` before pushing

---

## Build Order

1. Install `@dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`
2. Run SQL migrations (check what exists first)
3. Add types to `src/types/index.ts` (check for duplicates first)
4. Build `SortableTrackList` shared component
5. Add upload-in-album to `AlbumManager.tsx`
6. Build `PlaylistManager.tsx`
7. Add "Add to Playlist" menu to track list items
8. Wire playlists into Library tab
9. Replace album track arrows with DnD
10. `npm run build` — fix all errors
11. Push and deploy

After build + deploy, fire Imani for QA:
openclaw agent --agent imani --message "QA REQUEST: CRWN Music Upload + Playlists + Drag Reorder. URL: crwn-mauve.vercel.app. Test: 1) Upload track directly inside Create Album form 2) Playlists tab CRUD 3) Add to Playlist from track list 4) Drag reorder on tracks, albums, playlists 5) Mobile responsiveness. If issues found fire Ian back with fix list." --deliver --reply-channel slack --reply-to C0AC5CVSJN4
