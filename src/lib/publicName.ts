// Shared guard for public-facing artist names.
//
// `profiles.display_name` doubles as an artist's PUBLIC name everywhere (home
// tile, explore, /[slug]). But it defaults to the signup EMAIL at the database
// level (`handle_new_user` seeds `COALESCE(metadata.display_name, email)`), so an
// artist who breezes past /welcome without editing the field ends up publishing
// their raw email as their public identity. This guard lets display surfaces
// refuse to render an email as a name, and lets the name step reject one.

/**
 * True when a name looks like an email address (contains an `@` with text on
 * both sides). We deliberately only catch emails: a legal/full name is
 * indistinguishable from a chosen stage name, so we never try to filter those.
 */
export function isEmailLike(name: string | null | undefined): boolean {
  if (!name) return false;
  return /^\s*[^@\s]+@[^@\s]+\.[^@\s]+\s*$/.test(name.trim());
}

/**
 * True when a name is safe to show publicly as an artist name: present and not
 * an email. Use this to decide whether an artist tile is complete enough to
 * feature, the same way we require an avatar + music.
 */
export function isPresentableArtistName(name: string | null | undefined): boolean {
  return !!name && name.trim().length > 0 && !isEmailLike(name);
}
