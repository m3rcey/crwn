'use client';

// Artist Distribution Finder (founder tool, admin-only).
// Enter an artist before publishing a carousel and see which large Instagram
// pages recently posted about them. Results are BEST PUBLIC MATCHES FOUND,
// never an exhaustive index of Instagram: discovery coverage is inherently
// incomplete. Research and discovery only: nothing here contacts anyone.
//
// The provider work runs server-side (/api/admin/distribution/*). Apify actor
// runs take minutes, so this component polls the poll route until the search
// lands, then renders the ranked table.

import { useCallback, useRef, useState } from 'react';
import {
  BadgeCheck,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
} from 'lucide-react';
import { OptionSelect } from '@/components/ui/OptionSelect';

interface ScoreComponents {
  audience: number | null;
  recency: number | null;
  frequency: number | null;
  engagement: number | null;
  evidence: number | null;
}

interface MatchedPost {
  url: string;
  postedAt: string | null;
  likes: number | null;
  comments: number | null;
  matchReason: string;
  strongEvidence: boolean;
}

interface ResultRow {
  username: string;
  profile: {
    displayName: string | null;
    followers: number | null;
    verified: boolean | null;
    category: string | null;
    profileUrl: string;
  };
  matchedPosts: MatchedPost[];
  postCount: number;
  latestPostAt: string | null;
  latestPostUrl: string | null;
  avgEngagement: number | null;
  score: number;
  components: ScoreComponents;
}

interface DoneMeta {
  postsFound: number;
  unenrichedAuthors: string[];
  belowThresholdCount: number;
  partialProviderFailure?: boolean;
  enrichmentFailed?: boolean;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'searching'; label: string }
  | { kind: 'not_configured' }
  | { kind: 'error'; message: string }
  | { kind: 'done'; source: string; observedAt: string | null; results: ResultRow[]; meta: DoneMeta; notConfigured?: boolean; migrationPending?: boolean };

const WINDOW_OPTIONS = [
  { value: '30', label: 'Last 30 days' },
  { value: '60', label: 'Last 60 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '180', label: 'Last 180 days' },
];

const POLL_MS = 10_000;

function formatFollowers(n: number | null): string {
  if (n === null) return 'Unknown';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

function daysAgo(iso: string | null): string {
  if (!iso) return 'Unknown';
  const days = Math.floor((Date.now() - Date.parse(iso)) / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'Today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

export default function DistributionFinder() {
  const [artist, setArtist] = useState('');
  const [handle, setHandle] = useState('');
  const [aliases, setAliases] = useState('');
  const [windowDays, setWindowDays] = useState('90');
  const [minFollowers, setMinFollowers] = useState('50000');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [expanded, setExpanded] = useState<string | null>(null);
  // A search id so a stale poll loop from an abandoned search cannot write state.
  const searchSeq = useRef(0);

  const baseParams = useCallback(
    () => ({
      artist: artist.trim(),
      handle: handle.trim() || null,
      aliases: aliases
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean),
      windowDays: Number(windowDays),
      minFollowers: Number(minFollowers) || 0,
    }),
    [artist, handle, aliases, windowDays, minFollowers],
  );

  const runSearch = useCallback(
    async (refresh: boolean) => {
      const seq = ++searchSeq.current;
      const params = baseParams();
      if (params.artist.length < 2) {
        setStatus({ kind: 'error', message: 'Enter an artist name first.' });
        return;
      }
      setExpanded(null);
      setStatus({ kind: 'searching', label: 'Checking recent observations...' });

      const post = async (path: string, body: Record<string, unknown>) => {
        const res = await fetch(path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : `Request failed (${res.status})`);
        return json;
      };

      try {
        let state = await post('/api/admin/distribution/search', { ...params, refresh });

        while (searchSeq.current === seq) {
          if (state.phase === 'done') {
            setStatus({
              kind: 'done',
              source: state.source ?? 'live',
              observedAt: state.observedAt ?? null,
              results: state.results ?? [],
              meta: state.meta ?? { postsFound: 0, unenrichedAuthors: [], belowThresholdCount: 0 },
              notConfigured: state.notConfigured === true,
              migrationPending: state.migrationPending === true,
            });
            return;
          }
          if (state.phase === 'not_configured') {
            setStatus({ kind: 'not_configured' });
            return;
          }
          if (state.phase === 'discovery') {
            setStatus({ kind: 'searching', label: 'Searching public Instagram posts... (a few minutes)' });
          } else if (state.phase === 'enrichment') {
            setStatus({ kind: 'searching', label: 'Enriching page profiles...' });
          }
          await new Promise((r) => setTimeout(r, POLL_MS));
          if (searchSeq.current !== seq) return;
          const pollBody: Record<string, unknown> = { ...params, phase: state.phase };
          if (state.phase === 'discovery') pollBody.runs = state.runs;
          if (state.phase === 'enrichment') {
            pollBody.enrichRunId = state.enrichRunId;
            pollBody.discoveryRuns = state.discoveryRuns;
          }
          const next = await post('/api/admin/distribution/poll', pollBody);
          // A pending poll keeps the previous run references.
          state = next.pending ? { ...state, phase: next.phase } : next;
        }
      } catch (err) {
        if (searchSeq.current !== seq) return;
        setStatus({ kind: 'error', message: err instanceof Error ? err.message : 'Search failed.' });
      }
    },
    [baseParams],
  );

  const done = status.kind === 'done' ? status : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-crwn-text">Artist Distribution Finder</h2>
        <p className="text-sm text-crwn-text-secondary mt-1">
          Best public matches found, not every page on Instagram. Enter the artist you are about to
          post and see which large pages recently showed they care.
        </p>
      </div>

      <div className="bg-crwn-surface rounded-2xl p-5 space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-crwn-text-secondary mb-1">Artist</label>
            <input
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              placeholder="Ryan Leslie"
              className="w-full rounded-xl border border-crwn-elevated bg-crwn-surface-solid px-4 py-3 text-crwn-text placeholder:text-crwn-text-secondary/60"
            />
          </div>
          <div>
            <label className="block text-sm text-crwn-text-secondary mb-1">Instagram handle (optional)</label>
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="@ryanleslie"
              className="w-full rounded-xl border border-crwn-elevated bg-crwn-surface-solid px-4 py-3 text-crwn-text placeholder:text-crwn-text-secondary/60"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm text-crwn-text-secondary mb-1">Aliases or related terms (optional, comma-separated)</label>
          <input
            value={aliases}
            onChange={(e) => setAliases(e.target.value)}
            placeholder="R Les, Black Mozart"
            className="w-full rounded-xl border border-crwn-elevated bg-crwn-surface-solid px-4 py-3 text-crwn-text placeholder:text-crwn-text-secondary/60"
          />
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-crwn-text-secondary mb-1">Recent window</label>
            <OptionSelect options={WINDOW_OPTIONS} value={windowDays} onChange={setWindowDays} />
          </div>
          <div>
            <label className="block text-sm text-crwn-text-secondary mb-1">Minimum followers</label>
            <input
              type="number"
              min={0}
              step={5000}
              value={minFollowers}
              onChange={(e) => setMinFollowers(e.target.value)}
              className="w-full rounded-xl border border-crwn-elevated bg-crwn-surface-solid px-4 py-3 text-crwn-text"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => runSearch(false)}
            disabled={status.kind === 'searching'}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-crwn-gold text-black text-sm font-semibold disabled:opacity-50"
          >
            <Search className="w-4 h-4" />
            Find Distribution Pages
          </button>
          {done && (
            <button
              onClick={() => runSearch(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium text-crwn-text-secondary hover:text-crwn-text transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh from Instagram
            </button>
          )}
        </div>
      </div>

      {status.kind === 'searching' && (
        <div className="flex items-center gap-3 py-10 justify-center text-crwn-text-secondary">
          <Loader2 className="w-6 h-6 animate-spin text-crwn-gold" />
          <span className="text-sm">{status.label}</span>
        </div>
      )}

      {status.kind === 'error' && (
        <div className="bg-crwn-surface rounded-xl p-4 text-sm text-red-400">{status.message}</div>
      )}

      {status.kind === 'not_configured' && (
        <div className="bg-crwn-surface rounded-xl p-5 text-sm text-crwn-text-secondary space-y-2">
          <p className="text-crwn-text font-semibold">Provider not configured</p>
          <p>
            Set APIFY_API_TOKEN in Vercel (server-side env var, no NEXT_PUBLIC prefix) and redeploy.
            Until then the finder cannot search Instagram.
          </p>
        </div>
      )}

      {done && (
        <div className="space-y-3">
          <div className="text-xs text-crwn-text-secondary flex flex-wrap gap-x-4 gap-y-1">
            <span>
              {done.source === 'cache' && `Served from observations saved ${daysAgo(done.observedAt)}. Refresh to re-search Instagram.`}
              {done.source === 'stale-cache' && 'Provider not configured: showing older saved observations.'}
              {done.source === 'live' && 'Fresh from public Instagram data.'}
            </span>
            <span>{done.meta.postsFound} matched posts</span>
            {done.meta.belowThresholdCount > 0 && <span>{done.meta.belowThresholdCount} pages below the follower minimum</span>}
            {done.meta.unenrichedAuthors.length > 0 && <span>{done.meta.unenrichedAuthors.length} pages could not be profiled</span>}
            {done.meta.partialProviderFailure && <span className="text-amber-400">Some provider searches failed; coverage is partial.</span>}
            {done.migrationPending && <span className="text-amber-400">Results are not being saved: the distribution migration has not been applied.</span>}
          </div>

          {done.results.length === 0 ? (
            <div className="bg-crwn-surface rounded-2xl p-8 text-center text-sm text-crwn-text-secondary">
              No public pages matched this search. Try a wider window, a lower follower minimum, or
              add the artist&apos;s handle for stronger matching.
            </div>
          ) : (
            <div className="bg-crwn-surface rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-crwn-text-secondary">
                      <th className="px-4 py-3 font-medium">Page</th>
                      <th className="px-4 py-3 font-medium">Followers</th>
                      <th className="px-4 py-3 font-medium">Category</th>
                      <th className="px-4 py-3 font-medium">Posts</th>
                      <th className="px-4 py-3 font-medium">Latest</th>
                      <th className="px-4 py-3 font-medium">Avg Engagement</th>
                      <th className="px-4 py-3 font-medium">Score</th>
                      <th className="px-4 py-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {done.results.map((row) => (
                      <>
                        <tr key={row.username} className="border-t border-crwn-elevated/50">
                          <td className="px-4 py-3">
                            <button
                              onClick={() => setExpanded(expanded === row.username ? null : row.username)}
                              className="flex items-center gap-1.5 text-crwn-text font-medium"
                            >
                              {expanded === row.username ? (
                                <ChevronDown className="w-3.5 h-3.5 text-crwn-text-secondary" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5 text-crwn-text-secondary" />
                              )}
                              @{row.username}
                              {row.profile.verified && <BadgeCheck className="w-3.5 h-3.5 text-crwn-gold" />}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-crwn-text">{formatFollowers(row.profile.followers)}</td>
                          <td className="px-4 py-3 text-crwn-text-secondary">{row.profile.category ?? ''}</td>
                          <td className="px-4 py-3 text-crwn-text">{row.postCount}</td>
                          <td className="px-4 py-3 text-crwn-text-secondary">{daysAgo(row.latestPostAt)}</td>
                          <td className="px-4 py-3 text-crwn-text-secondary">
                            {row.avgEngagement === null ? 'Not visible' : row.avgEngagement.toLocaleString()}
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-crwn-gold font-semibold">{row.score}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="flex items-center gap-3">
                              <a
                                href={row.profile.profileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-crwn-text-secondary hover:text-crwn-text inline-flex items-center gap-1"
                              >
                                Profile <ExternalLink className="w-3 h-3" />
                              </a>
                              {row.latestPostUrl && (
                                <a
                                  href={row.latestPostUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-crwn-text-secondary hover:text-crwn-text inline-flex items-center gap-1"
                                >
                                  Latest post <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </span>
                          </td>
                        </tr>
                        {expanded === row.username && (
                          <tr key={`${row.username}-detail`} className="border-t border-crwn-elevated/30 bg-crwn-surface-solid/40">
                            <td colSpan={8} className="px-6 py-4">
                              <div className="text-xs text-crwn-text-secondary mb-2">
                                Score parts (0 to 100): audience {row.components.audience ?? 'n/a'} · recency{' '}
                                {row.components.recency ?? 'n/a'} · frequency {row.components.frequency ?? 'n/a'} ·
                                engagement {row.components.engagement ?? 'not visible'} · evidence{' '}
                                {row.components.evidence ?? 'n/a'}
                              </div>
                              <ul className="space-y-1.5">
                                {row.matchedPosts.map((p) => (
                                  <li key={p.url} className="text-xs flex flex-wrap items-center gap-x-3 gap-y-1">
                                    <a
                                      href={p.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-crwn-gold hover:underline inline-flex items-center gap-1"
                                    >
                                      Post <ExternalLink className="w-3 h-3" />
                                    </a>
                                    <span className="text-crwn-text-secondary">{daysAgo(p.postedAt)}</span>
                                    <span className="text-crwn-text-secondary">
                                      {p.likes === null && p.comments === null
                                        ? 'Engagement not visible'
                                        : `${((p.likes ?? 0) + (p.comments ?? 0)).toLocaleString()} likes + comments`}
                                    </span>
                                    <span className="text-crwn-text-secondary/80">Matched because: {p.matchReason}</span>
                                  </li>
                                ))}
                              </ul>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
