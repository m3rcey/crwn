'use client';

// Artist Distribution Finder (founder tool, admin-only).
// HYBRID since the Big Page Index upgrade: a search merges the cached corpus
// of known significant pages with live global Instagram discovery. Results
// are BEST PUBLIC MATCHES FOUND, never an exhaustive index of Instagram.
// Research and discovery only: nothing here contacts anyone.
//
// All provider work runs server-side (/api/admin/distribution/*). Apify actor
// runs take minutes, so search, index refresh, page adding and bootstrap all
// poll their routes; the browser carries the job state (keep the tab open
// while a refresh or bootstrap runs).

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BadgeCheck,
  ChevronDown,
  ChevronRight,
  Database,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
} from 'lucide-react';
import { OptionSelect } from '@/components/ui/OptionSelect';

interface AffinityComponents {
  recency: number | null;
  frequency: number;
  evidence: number;
  engagement: number | null;
}
interface DistributionComponents {
  audience: number | null;
  engagement: number | null;
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
  affinity: number;
  affinityComponents: AffinityComponents;
  distributionValue: number;
  distributionComponents: DistributionComponents;
  priority: number;
  source: 'indexed' | 'global' | 'both';
}

interface DoneMeta {
  postsFound: number;
  indexedMatches?: number;
  totalMatchedPages?: number;
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

interface IndexSummary {
  pageCount: number;
  medianFollowers: number | null;
  staleCount: number;
  postsCached: number;
  lastRefreshAt: string | null;
  migrationPending: boolean;
}

interface IndexPage {
  username: string;
  followers: number | null;
  verified: boolean | null;
  category: string | null;
  discoverySource: string | null;
  lastPostsRefreshAt: string | null;
  profileUrl: string;
  artistsObserved: number;
}

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

async function postJson(path: string, body: Record<string, unknown>) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : `Request failed (${res.status})`);
  return json;
}

function SourceBadge({ source }: { source: 'indexed' | 'global' | 'both' }) {
  const label = source === 'both' ? 'Both' : source === 'indexed' ? 'Indexed' : 'Global';
  const cls =
    source === 'global'
      ? 'text-crwn-text-secondary border-crwn-elevated'
      : 'text-crwn-gold border-crwn-gold/40';
  return <span className={`text-[10px] uppercase tracking-wide border rounded-full px-1.5 py-0.5 ${cls}`}>{label}</span>;
}

// ---------------------------------------------------------------------------
// Big Page Index panel
// ---------------------------------------------------------------------------

function IndexPanel({ onIndexChanged }: { onIndexChanged: number }) {
  const [summary, setSummary] = useState<IndexSummary | null>(null);
  const [pages, setPages] = useState<IndexPage[]>([]);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [handlesText, setHandlesText] = useState('');
  const [artistsText, setArtistsText] = useState('');
  const [bootstrapProgress, setBootstrapProgress] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const load = useCallback(async (q?: string) => {
    try {
      const res = await fetch(`/api/admin/distribution/index${q ? `?q=${encodeURIComponent(q)}` : ''}`);
      const json = await res.json();
      if (!alive.current || !res.ok) return;
      setSummary(json.summary ?? null);
      setPages(json.pages ?? []);
    } catch {
      /* the panel simply stays empty */
    }
  }, []);

  useEffect(() => {
    load(filter || undefined);
    // onIndexChanged bumps after searches/jobs so the panel stays current.
  }, [load, filter, onIndexChanged]);

  const addPages = useCallback(async () => {
    const handles = handlesText.split(/[\s,]+/).filter(Boolean);
    if (handles.length === 0) return;
    setBusy('add');
    setNotice(null);
    try {
      const start = await postJson('/api/admin/distribution/index/jobs', { action: 'add_start', handles });
      if (start.phase === 'not_configured') { setNotice('Provider not configured.'); return; }
      let done = false;
      while (!done && alive.current) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        const poll = await postJson('/api/admin/distribution/index/jobs', { action: 'add_poll', runId: start.runId });
        if (poll.phase === 'complete') {
          setNotice(`Added or updated ${poll.added} pages${poll.skippedPrivate ? `, skipped ${poll.skippedPrivate} private` : ''}.`);
          setHandlesText('');
          done = true;
        }
      }
      await load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Adding pages failed.');
    } finally {
      if (alive.current) setBusy(null);
    }
  }, [handlesText, load]);

  const refreshIndex = useCallback(async () => {
    setBusy('refresh');
    setNotice(null);
    try {
      let state = await postJson('/api/admin/distribution/index/jobs', { action: 'refresh_start' });
      if (state.phase === 'not_configured') { setNotice('Provider not configured.'); return; }
      if (state.phase === 'migration_pending') { setNotice('Run the index migration first (see TODO).'); return; }
      while (alive.current && state.phase === 'refreshing') {
        setNotice(`Refreshing ${state.job ? `${state.job.done} / ${state.job.total}` : '...'} pages...`);
        await new Promise((r) => setTimeout(r, POLL_MS));
        const next = await postJson('/api/admin/distribution/index/jobs', { action: 'refresh_poll', job: state.job });
        state = next.pending ? { phase: 'refreshing', job: next.job } : next;
      }
      if (state.phase === 'complete') {
        setNotice(
          state.nothingStale
            ? 'Nothing was stale: every indexed page is fresh.'
            : `Refreshed ${state.refreshed} of ${state.total} pages${state.failedBatches ? ` (${state.failedBatches} batches failed)` : ''}.`,
        );
      }
      await load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Refresh failed.');
    } finally {
      if (alive.current) setBusy(null);
    }
  }, [load]);

  const bootstrap = useCallback(async () => {
    const artists = artistsText.split(/\n|,/).map((a) => a.trim()).filter(Boolean).slice(0, 25);
    if (artists.length === 0) return;
    setBusy('bootstrap');
    setNotice(null);
    try {
      const { estimate } = await postJson('/api/admin/distribution/index/jobs', { action: 'estimate_bootstrap', artists });
      setBootstrapProgress(
        `About ${estimate.discoveryRuns + estimate.enrichmentRuns} provider runs across ${estimate.artists} artists. Starting...`,
      );
      let doneCount = 0;
      for (const artist of artists) {
        if (!alive.current) return;
        setBootstrapProgress(`Searching ${artist} (${doneCount + 1} of ${artists.length})...`);
        try {
          // Bootstrap IS the existing search flow: qualifying pages join the
          // index automatically in the normal finish path.
          let state = await postJson('/api/admin/distribution/search', { artist, refresh: true, minFollowers: 0, windowDays: 90 });
          while (alive.current && state.phase !== 'done' && state.phase !== 'not_configured') {
            await new Promise((r) => setTimeout(r, POLL_MS));
            const pollBody: Record<string, unknown> = { artist, minFollowers: 0, windowDays: 90, phase: state.phase };
            if (state.phase === 'discovery') pollBody.runs = state.runs;
            if (state.phase === 'enrichment') {
              pollBody.enrichRunId = state.enrichRunId;
              pollBody.discoveryRuns = state.discoveryRuns;
            }
            const next = await postJson('/api/admin/distribution/poll', pollBody);
            state = next.pending ? { ...state, phase: next.phase } : next;
          }
          if (state.phase === 'not_configured') { setNotice('Provider not configured.'); return; }
        } catch {
          // One artist failing never kills the bootstrap.
        }
        doneCount += 1;
      }
      setBootstrapProgress(null);
      setNotice(`Bootstrap complete: searched ${doneCount} artists. Now press Refresh Index to cache their pages' recent posts.`);
      setArtistsText('');
      await load();
    } catch (err) {
      setBootstrapProgress(null);
      setNotice(err instanceof Error ? err.message : 'Bootstrap failed.');
    } finally {
      if (alive.current) setBusy(null);
    }
  }, [artistsText, load]);

  return (
    <div className="bg-crwn-surface rounded-2xl p-5 space-y-4">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between">
        <span className="flex items-center gap-2 text-crwn-text font-semibold">
          <Database className="w-4 h-4 text-crwn-gold" />
          Big Page Index
          {summary && (
            <span className="text-sm font-normal text-crwn-text-secondary">
              {summary.pageCount} pages · {summary.postsCached.toLocaleString()} posts cached
              {summary.staleCount > 0 && ` · ${summary.staleCount} stale`}
            </span>
          )}
        </span>
        {open ? <ChevronDown className="w-4 h-4 text-crwn-text-secondary" /> : <ChevronRight className="w-4 h-4 text-crwn-text-secondary" />}
      </button>

      {open && (
        <div className="space-y-4">
          {summary?.migrationPending && (
            <p className="text-sm text-amber-400">
              The index migration has not been applied yet, so the index cannot store anything. See TODO.
            </p>
          )}
          {summary && !summary.migrationPending && (
            <p className="text-xs text-crwn-text-secondary">
              Median followers {formatFollowers(summary.medianFollowers)} · last refresh {daysAgo(summary.lastRefreshAt)}
            </p>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-sm text-crwn-text-secondary">Add pages by handle</label>
              <textarea
                value={handlesText}
                onChange={(e) => setHandlesText(e.target.value)}
                placeholder={'@pageone\n@pagetwo'}
                rows={3}
                className="w-full rounded-xl border border-crwn-elevated bg-crwn-surface-solid px-3 py-2 text-sm text-crwn-text placeholder:text-crwn-text-secondary/60"
              />
              <button
                onClick={addPages}
                disabled={busy !== null}
                className="px-4 py-2 rounded-full bg-crwn-gold text-black text-sm font-semibold disabled:opacity-50"
              >
                {busy === 'add' ? 'Adding...' : 'Add Pages'}
              </button>
            </div>
            <div className="space-y-2">
              <label className="block text-sm text-crwn-text-secondary">Bootstrap from reference artists (one per line)</label>
              <textarea
                value={artistsText}
                onChange={(e) => setArtistsText(e.target.value)}
                placeholder={'SZA\nBrent Faiyaz\nLucky Daye'}
                rows={3}
                className="w-full rounded-xl border border-crwn-elevated bg-crwn-surface-solid px-3 py-2 text-sm text-crwn-text placeholder:text-crwn-text-secondary/60"
              />
              <button
                onClick={bootstrap}
                disabled={busy !== null}
                className="px-4 py-2 rounded-full text-sm font-medium text-crwn-text bg-crwn-elevated disabled:opacity-50"
              >
                {busy === 'bootstrap' ? 'Bootstrapping...' : 'Bootstrap From Artists'}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={refreshIndex}
              disabled={busy !== null}
              className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium text-crwn-text bg-crwn-elevated disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${busy === 'refresh' ? 'animate-spin' : ''}`} />
              Refresh Index
            </button>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter pages..."
              className="rounded-full border border-crwn-elevated bg-crwn-surface-solid px-3 py-1.5 text-sm text-crwn-text placeholder:text-crwn-text-secondary/60"
            />
          </div>

          {bootstrapProgress && <p className="text-sm text-crwn-gold">{bootstrapProgress}</p>}
          {notice && <p className="text-sm text-crwn-text-secondary">{notice}</p>}

          {pages.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-crwn-text-secondary">
                    <th className="px-3 py-2 font-medium">Page</th>
                    <th className="px-3 py-2 font-medium">Followers</th>
                    <th className="px-3 py-2 font-medium">Category</th>
                    <th className="px-3 py-2 font-medium">Source</th>
                    <th className="px-3 py-2 font-medium">Posts refreshed</th>
                    <th className="px-3 py-2 font-medium">Artists seen</th>
                  </tr>
                </thead>
                <tbody>
                  {pages.map((p) => (
                    <tr key={p.username} className="border-t border-crwn-elevated/40">
                      <td className="px-3 py-2">
                        <a href={p.profileUrl} target="_blank" rel="noopener noreferrer" className="text-crwn-text hover:text-crwn-gold inline-flex items-center gap-1">
                          @{p.username}
                          {p.verified && <BadgeCheck className="w-3 h-3 text-crwn-gold" />}
                        </a>
                      </td>
                      <td className="px-3 py-2 text-crwn-text">{formatFollowers(p.followers)}</td>
                      <td className="px-3 py-2 text-crwn-text-secondary">{p.category ?? ''}</td>
                      <td className="px-3 py-2 text-crwn-text-secondary">{p.discoverySource === 'manual' ? 'Manual' : p.discoverySource === 'bootstrap' ? 'Bootstrap' : 'Search'}</td>
                      <td className="px-3 py-2 text-crwn-text-secondary">{p.lastPostsRefreshAt ? daysAgo(p.lastPostsRefreshAt) : 'Never'}</td>
                      <td className="px-3 py-2 text-crwn-text-secondary">{p.artistsObserved || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Finder
// ---------------------------------------------------------------------------

export default function DistributionFinder() {
  const [artist, setArtist] = useState('');
  const [handle, setHandle] = useState('');
  const [aliases, setAliases] = useState('');
  const [windowDays, setWindowDays] = useState('90');
  const [minFollowers, setMinFollowers] = useState('50000');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [indexBump, setIndexBump] = useState(0);
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
      setStatus({ kind: 'searching', label: 'Checking the index and recent observations...' });

      try {
        let state = await postJson('/api/admin/distribution/search', { ...params, refresh });

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
            setIndexBump((n) => n + 1);
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
          const next = await postJson('/api/admin/distribution/poll', pollBody);
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
  const matchedButFiltered =
    done && done.results.length === 0 && (done.meta.totalMatchedPages ?? 0) > 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-crwn-text">Artist Distribution Finder</h2>
        <p className="text-sm text-crwn-text-secondary mt-1">
          Best public matches found, not every page on Instagram. Searches combine the Big Page
          Index (known significant pages) with live global discovery.
        </p>
      </div>

      <IndexPanel onIndexChanged={indexBump} />

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
              {done.source === 'index-only' && 'Global discovery is unavailable right now: showing Big Page Index matches only.'}
              {done.source === 'live' && 'Fresh from public Instagram data plus the Big Page Index.'}
            </span>
            <span>{done.meta.postsFound} matched posts</span>
            {typeof done.meta.indexedMatches === 'number' && done.meta.indexedMatches > 0 && (
              <span>{done.meta.indexedMatches} from the index</span>
            )}
            {done.meta.unenrichedAuthors.length > 0 && <span>{done.meta.unenrichedAuthors.length} pages could not be profiled</span>}
            {done.meta.partialProviderFailure && <span className="text-amber-400">Some provider searches failed; coverage is partial.</span>}
            {done.migrationPending && <span className="text-amber-400">Results are not being saved: the distribution migration has not been applied.</span>}
          </div>

          {done.results.length === 0 ? (
            <div className="bg-crwn-surface rounded-2xl p-8 text-center text-sm text-crwn-text-secondary space-y-3">
              {matchedButFiltered ? (
                <>
                  <p className="text-crwn-text font-semibold">
                    {done.meta.totalMatchedPages} matching {done.meta.totalMatchedPages === 1 ? 'page was' : 'pages were'} found,
                    but {done.meta.totalMatchedPages === 1 ? 'it was' : 'all were'} below your{' '}
                    {Number(minFollowers).toLocaleString()} follower minimum.
                  </p>
                  <p>
                    Lower the minimum to see them, widen the date window, refresh the Big Page Index,
                    or add big page handles to the index above.
                  </p>
                </>
              ) : (
                <p>
                  No public pages matched this search. Try a wider window, add the artist&apos;s
                  handle for stronger matching, or bootstrap the Big Page Index with related artists.
                </p>
              )}
            </div>
          ) : (
            <div className="bg-crwn-surface rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-crwn-text-secondary">
                      <th className="px-4 py-3 font-medium">Page</th>
                      <th className="px-4 py-3 font-medium">Followers</th>
                      <th className="px-4 py-3 font-medium">Artist Posts</th>
                      <th className="px-4 py-3 font-medium">Latest</th>
                      <th className="px-4 py-3 font-medium">Avg Engagement</th>
                      <th className="px-4 py-3 font-medium">Affinity</th>
                      <th className="px-4 py-3 font-medium">Distribution</th>
                      <th className="px-4 py-3 font-medium">Priority</th>
                      <th className="px-4 py-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {done.results.map((row) => (
                      <>
                        <tr key={row.username} className="border-t border-crwn-elevated/50">
                          <td className="px-4 py-3">
                            <span className="flex items-center gap-2">
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
                              <SourceBadge source={row.source} />
                            </span>
                          </td>
                          <td className="px-4 py-3 text-crwn-text">{formatFollowers(row.profile.followers)}</td>
                          <td className="px-4 py-3 text-crwn-text">{row.postCount}</td>
                          <td className="px-4 py-3 text-crwn-text-secondary">{daysAgo(row.latestPostAt)}</td>
                          <td className="px-4 py-3 text-crwn-text-secondary">
                            {row.avgEngagement === null ? 'Not visible' : row.avgEngagement.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-crwn-text-secondary">{row.affinity}</td>
                          <td className="px-4 py-3 text-crwn-text-secondary">{row.distributionValue}</td>
                          <td className="px-4 py-3">
                            <span className="text-crwn-gold font-semibold">{row.priority}</span>
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
                            <td colSpan={9} className="px-6 py-4">
                              <div className="text-xs text-crwn-text-secondary mb-2">
                                Affinity parts: recency {row.affinityComponents.recency ?? 'n/a'} · frequency{' '}
                                {row.affinityComponents.frequency} · evidence {row.affinityComponents.evidence} · engagement{' '}
                                {row.affinityComponents.engagement ?? 'not visible'}. Distribution parts: audience{' '}
                                {row.distributionComponents.audience ?? 'n/a'} · engagement{' '}
                                {row.distributionComponents.engagement ?? 'not visible'}.
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
