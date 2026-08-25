// Apify adapter for the Artist Distribution Finder. SERVER-SIDE ONLY:
// this module reads APIFY_API_TOKEN and must never be imported from a client
// component. Provider-specific response shapes stay inside this file; the
// rest of the feature operates on the normalized types in ./types.
//
// Actor runs take minutes, far past a Vercel function budget, so the adapter
// exposes start / status / items primitives and the API layer polls.
// Contract verified against the live Apify store on 2026-08-24:
//   apify/instagram-hashtag-scraper  (discovery; keywordSearch toggles keyword mode)
//   apify/instagram-profile-scraper  (enrichment; usernames[] input)

import type { DiscoveredPost, PageProfile, SourceKind } from './types';

const APIFY_BASE = 'https://api.apify.com/v2';
const DISCOVERY_ACTOR = 'apify~instagram-hashtag-scraper';
const PROFILE_ACTOR = 'apify~instagram-profile-scraper';
// Big Page Index refresh: recent posts of KNOWN profiles. Contract verified
// against the live Apify store 2026-08-24: `username` accepts an array,
// `resultsLimit` is PER PROFILE, `onlyPostsNewerThan` takes relative dates.
// Pay-per-result (~$2.30-2.70 per 1,000 posts).
const POSTS_ACTOR = 'apify~instagram-post-scraper';
// Direct big-page discovery: Instagram USER search by topic keyword. Contract
// verified against the live Apify store 2026-08-24: input is
// { search, searchType: 'user', searchLimit (per term, max 250) } and user
// results carry username, fullName, followersCount, verified, private,
// businessCategoryName and biography DIRECTLY, so topic candidates need no
// enrichment hop before the follower filter. Pay-per-result.
const SEARCH_ACTOR = 'apify~instagram-search-scraper';

/** Results requested per discovery query term. Cost control, not a UI knob. */
export const RESULTS_PER_QUERY = 40;

export class ApifyNotConfiguredError extends Error {
  constructor() {
    super('APIFY_API_TOKEN is not configured');
    this.name = 'ApifyNotConfiguredError';
  }
}

export class ApifyRequestError extends Error {
  status: number;
  constructor(status: number, context: string) {
    // Never include request bodies or headers here: this message can be logged.
    super(`Apify request failed (${status}) during ${context}`);
    this.name = 'ApifyRequestError';
    this.status = status;
  }
}

export function isApifyConfigured(): boolean {
  const token = process.env.APIFY_API_TOKEN;
  return typeof token === 'string' && token.length > 0 && !token.startsWith('dummy');
}

function token(): string {
  const t = process.env.APIFY_API_TOKEN;
  // Never fall back to a dummy value for a real provider request.
  if (!t || t.startsWith('dummy')) throw new ApifyNotConfiguredError();
  return t;
}

async function apifyFetch(path: string, init: RequestInit, context: string): Promise<unknown> {
  const res = await fetch(`${APIFY_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new ApifyRequestError(res.status, context);
  return res.json();
}

export type ApifyRunStatus =
  | 'READY'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'TIMED-OUT'
  | 'ABORTED'
  | 'ABORTING';

interface RunRef {
  runId: string;
}

function parseRunRef(body: unknown, context: string): RunRef {
  const id = (body as { data?: { id?: unknown } })?.data?.id;
  if (typeof id !== 'string' || id.length === 0) throw new ApifyRequestError(502, `${context} (malformed run response)`);
  return { runId: id };
}

/** Start one discovery run. kind='hashtag' searches tags; 'keyword' free text. */
export async function startDiscoveryRun(terms: string[], kind: SourceKind): Promise<RunRef> {
  const body = await apifyFetch(
    `/acts/${DISCOVERY_ACTOR}/runs`,
    {
      method: 'POST',
      body: JSON.stringify({
        hashtags: terms,
        keywordSearch: kind === 'keyword',
        resultsType: 'posts',
        resultsLimit: RESULTS_PER_QUERY,
      }),
    },
    'discovery start',
  );
  return parseRunRef(body, 'discovery start');
}

export async function startProfileRun(usernames: string[]): Promise<RunRef> {
  const body = await apifyFetch(
    `/acts/${PROFILE_ACTOR}/runs`,
    { method: 'POST', body: JSON.stringify({ usernames }) },
    'profile start',
  );
  return parseRunRef(body, 'profile start');
}

/** Start one recent-posts run over a batch of known usernames. */
export async function startPostsRun(
  usernames: string[],
  postsPerPage: number,
  newerThanDays: number,
): Promise<RunRef> {
  const body = await apifyFetch(
    `/acts/${POSTS_ACTOR}/runs`,
    {
      method: 'POST',
      body: JSON.stringify({
        username: usernames,
        resultsLimit: postsPerPage,
        onlyPostsNewerThan: `${newerThanDays} days`,
      }),
    },
    'posts start',
  );
  return parseRunRef(body, 'posts start');
}

/** Start one topic profile-search run (one term per run: clean provenance). */
export async function startProfileSearchRun(term: string, resultsPerTerm: number): Promise<RunRef> {
  const body = await apifyFetch(
    `/acts/${SEARCH_ACTOR}/runs`,
    {
      method: 'POST',
      body: JSON.stringify({ search: term, searchType: 'user', searchLimit: resultsPerTerm }),
    },
    'profile search start',
  );
  return parseRunRef(body, 'profile search start');
}

export async function getRunStatus(runId: string): Promise<ApifyRunStatus> {
  const body = await apifyFetch(`/actor-runs/${encodeURIComponent(runId)}`, { method: 'GET' }, 'run status');
  const status = (body as { data?: { status?: unknown } })?.data?.status;
  if (typeof status !== 'string') throw new ApifyRequestError(502, 'run status (malformed response)');
  return status as ApifyRunStatus;
}

export function isTerminalStatus(status: ApifyRunStatus): boolean {
  return status === 'SUCCEEDED' || status === 'FAILED' || status === 'TIMED-OUT' || status === 'ABORTED';
}

async function getRunItems(runId: string): Promise<unknown[]> {
  const body = await apifyFetch(
    `/actor-runs/${encodeURIComponent(runId)}/dataset/items?clean=true`,
    { method: 'GET' },
    'dataset items',
  );
  return Array.isArray(body) ? body : [];
}

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function asCount(v: unknown): number | null {
  // Apify returns -1 for hidden like counts: that is "not observable", never 0.
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return null;
  return Math.round(v);
}

/** Fetch + normalize discovery items. Malformed items are skipped, not fatal. */
export async function getDiscoveredPosts(
  runId: string,
  sourceQuery: string,
  sourceKind: SourceKind,
): Promise<DiscoveredPost[]> {
  const items = await getRunItems(runId);
  const posts: DiscoveredPost[] = [];
  for (const item of items) {
    const raw = item as Record<string, unknown>;
    const ownerUsername = asString(raw.ownerUsername)?.toLowerCase() ?? null;
    const url = asString(raw.url);
    if (!ownerUsername || !url) continue;
    posts.push({
      postId: asString(raw.id),
      shortcode: asString(raw.shortCode),
      url,
      caption: asString(raw.caption),
      postedAt: asString(raw.timestamp),
      likes: asCount(raw.likesCount),
      comments: asCount(raw.commentsCount),
      views: asCount(raw.videoViewCount) ?? asCount(raw.videoPlayCount),
      ownerUsername,
      ownerId: asString(raw.ownerId) ?? (typeof raw.ownerId === 'number' ? String(raw.ownerId) : null),
      sourceQuery,
      sourceKind,
    });
  }
  return posts;
}

/**
 * Fetch + normalize a posts-run's items into corpus posts (sourceKind
 * 'corpus': caption evidence only, no provenance fallback in matching).
 * Malformed items are skipped, not fatal.
 */
export async function getPagePosts(runId: string): Promise<DiscoveredPost[]> {
  const items = await getRunItems(runId);
  const posts: DiscoveredPost[] = [];
  for (const item of items) {
    const raw = item as Record<string, unknown>;
    const ownerUsername = asString(raw.ownerUsername)?.toLowerCase() ?? null;
    const url = asString(raw.url);
    if (!ownerUsername || !url) continue;
    posts.push({
      postId: asString(raw.id),
      shortcode: asString(raw.shortCode),
      url,
      caption: asString(raw.caption),
      postedAt: asString(raw.timestamp),
      likes: asCount(raw.likesCount),
      comments: asCount(raw.commentsCount),
      views: asCount(raw.videoViewCount) ?? asCount(raw.videoPlayCount),
      ownerUsername,
      ownerId: asString(raw.ownerId) ?? (typeof raw.ownerId === 'number' ? String(raw.ownerId) : null),
      sourceQuery: '',
      sourceKind: 'corpus',
    });
  }
  return posts;
}

function itemToProfile(item: unknown): PageProfile | null {
  const raw = item as Record<string, unknown>;
  const username = asString(raw.username)?.toLowerCase() ?? null;
  if (!username) return null;
  return {
    igUserId: asString(raw.id) ?? (typeof raw.id === 'number' ? String(raw.id) : null),
    username,
    displayName: asString(raw.fullName),
    followers: asCount(raw.followersCount),
    verified: typeof raw.verified === 'boolean' ? raw.verified : null,
    isPrivate: typeof raw.private === 'boolean' ? raw.private : null,
    category: asString(raw.businessCategoryName),
    biography: asString(raw.biography),
    profileUrl: asString(raw.url) ?? `https://www.instagram.com/${username}/`,
  };
}

/** Fetch + normalize profile items. One bad profile never fails the batch. */
export async function getProfiles(runId: string): Promise<PageProfile[]> {
  const items = await getRunItems(runId);
  const profiles: PageProfile[] = [];
  for (const item of items) {
    const profile = itemToProfile(item);
    if (profile) profiles.push(profile);
  }
  return profiles;
}

/**
 * Fetch + normalize a topic profile-search run's items. The search actor's
 * user results share the profile-scraper field names, so one mapper serves
 * both; malformed items are skipped, not fatal.
 */
export async function getSearchProfiles(runId: string): Promise<PageProfile[]> {
  return getProfiles(runId);
}

export interface RelatedProfileStub {
  username: string;
  verified: boolean | null;
  isPrivate: boolean | null;
}

/**
 * Related-profile stubs from a profile-scraper run, keyed by the SEED page
 * that listed them. Stubs carry no follower counts (verified against the live
 * output schema 2026-08-24), so expansion candidates need one enrichment run.
 */
export async function getRelatedProfiles(runId: string): Promise<Map<string, RelatedProfileStub[]>> {
  const items = await getRunItems(runId);
  const bySeed = new Map<string, RelatedProfileStub[]>();
  for (const item of items) {
    const raw = item as Record<string, unknown>;
    const seed = asString(raw.username)?.toLowerCase() ?? null;
    if (!seed || !Array.isArray(raw.relatedProfiles)) continue;
    const stubs: RelatedProfileStub[] = [];
    for (const rel of raw.relatedProfiles) {
      const rawRel = rel as Record<string, unknown>;
      const username = asString(rawRel.username)?.toLowerCase() ?? null;
      if (!username) continue;
      stubs.push({
        username,
        verified: typeof rawRel.is_verified === 'boolean' ? rawRel.is_verified : null,
        isPrivate: typeof rawRel.is_private === 'boolean' ? rawRel.is_private : null,
      });
    }
    bySeed.set(seed, stubs);
  }
  return bySeed;
}
