// The CRWN link handle: lowercase letters, numbers and hyphens only, collapsed,
// no leading/trailing hyphen, capped at 30 chars. Used both to auto-fill the
// handle from the artist's name and to sanitize what they type. Shared by the
// setup wizard (client) and /api/onboarding/identity (server) so the two can
// never disagree about what a valid handle is.
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)
    .replace(/-+$/g, '');
}
