export const RESERVED_SLUGS = new Set([
  // App routes
  'home', 'explore', 'library', 'profile', 'login', 'signup',
  'welcome', 'onboarding', 'verify', 'about',
  // Auth routes
  'forgot-password', 'reset-password',
  // Legal
  'terms', 'privacy', 'dmca', 'artist-agreement',
  // API & system
  'api', 'admin', 'settings', 'dashboard',
  // Future-proofing
  'help', 'support', 'pricing', 'blog', 'press', 'careers',
  'download', 'app', 'search', 'notifications', 'messages',
  'feed', 'trending', 'new', 'popular', 'featured',
  // Brand protection
  'crwn', 'thecrwn', 'official', 'team', 'staff',
]);

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.toLowerCase());
}
