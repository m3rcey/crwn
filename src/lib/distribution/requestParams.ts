// Request-body validation shared by the two admin distribution routes.
// Pure and tested; the routes stay thin.

import type { ArtistIdentity, SearchOptions } from './types';
import { normalizeArtistIdentity } from './queries';

export const WINDOW_PRESETS = [30, 60, 90, 180] as const;
export const DEFAULT_WINDOW_DAYS = 90;
export const DEFAULT_MIN_FOLLOWERS = 50_000;

export interface ParsedSearchParams {
  identity: ArtistIdentity;
  options: SearchOptions;
  refresh: boolean;
}

export function parseSearchParams(body: unknown, now: Date): ParsedSearchParams | { error: string } {
  const raw = (body ?? {}) as Record<string, unknown>;
  const name = typeof raw.artist === 'string' ? raw.artist.trim() : '';
  if (name.length < 2 || name.length > 120) {
    return { error: 'Enter an artist name (2 to 120 characters).' };
  }
  const handle = typeof raw.handle === 'string' ? raw.handle.slice(0, 60) : null;
  const aliases = Array.isArray(raw.aliases)
    ? raw.aliases.filter((a): a is string => typeof a === 'string' && a.trim().length > 0).slice(0, 6).map((a) => a.slice(0, 80))
    : [];

  const windowRaw = Number(raw.windowDays);
  const windowDays = Number.isFinite(windowRaw)
    ? Math.min(365, Math.max(1, Math.round(windowRaw)))
    : DEFAULT_WINDOW_DAYS;

  const minRaw = Number(raw.minFollowers);
  const minFollowers = Number.isFinite(minRaw)
    ? Math.min(50_000_000, Math.max(0, Math.round(minRaw)))
    : DEFAULT_MIN_FOLLOWERS;

  return {
    identity: normalizeArtistIdentity({ name, handle, aliases }),
    options: { windowDays, minFollowers, now },
    refresh: raw.refresh === true,
  };
}

export interface RunRefPayload {
  runId: string;
  term: string;
  kind: 'keyword' | 'hashtag';
}

/** Validate the client-carried run references on poll requests. */
export function parseRunRefs(value: unknown): RunRefPayload[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 10) return null;
  const out: RunRefPayload[] = [];
  for (const item of value) {
    const raw = item as Record<string, unknown>;
    const runId = typeof raw.runId === 'string' ? raw.runId : '';
    const term = typeof raw.term === 'string' ? raw.term : '';
    const kind = raw.kind === 'hashtag' ? 'hashtag' : raw.kind === 'keyword' ? 'keyword' : null;
    if (!/^[A-Za-z0-9]{5,40}$/.test(runId) || term.length === 0 || term.length > 120 || !kind) return null;
    out.push({ runId, term, kind });
  }
  return out;
}
