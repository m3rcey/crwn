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

/** Fetch + normalize profile items. One bad profile never fails the batch. */
export async function getProfiles(runId: string): Promise<PageProfile[]> {
  const items = await getRunItems(runId);
  const profiles: PageProfile[] = [];
  for (const item of items) {
    const raw = item as Record<string, unknown>;
    const username = asString(raw.username)?.toLowerCase() ?? null;
    if (!username) continue;
    profiles.push({
      igUserId: asString(raw.id) ?? (typeof raw.id === 'number' ? String(raw.id) : null),
      username,
      displayName: asString(raw.fullName),
      followers: asCount(raw.followersCount),
      verified: typeof raw.verified === 'boolean' ? raw.verified : null,
      isPrivate: typeof raw.private === 'boolean' ? raw.private : null,
      category: asString(raw.businessCategoryName),
      biography: asString(raw.biography),
      profileUrl: asString(raw.url) ?? `https://www.instagram.com/${username}/`,
    });
  }
  return profiles;
}
