'use client';

// Song Lab manager client. Three panels: Projects (songs + A/B/C decisions), Offers
// (free lead magnets with copy-able links), Results (counts, never rates). Everything
// writes through the session-authorized /api/song-lab/* routes; this component holds
// no authority and renders nothing for artists without the capability.

import { useCallback, useEffect, useState } from 'react';
import { Copy, Check, Plus, Loader2, QrCode, Trash2, Pencil } from 'lucide-react';
import { OptionSelect } from '@/components/ui/OptionSelect';
import { RECOGNITION_DISCLAIMER } from '@/lib/songLab/core';
import { DEFAULT_SHOW_TIMEZONE, EXTEND_MINUTES, formatTimeInZone, scheduleLabel } from '@/lib/songLab/schedule';
import { liveShowDefaults, validateShowWindows, DEFAULT_SHOW_TIMES } from '@/lib/songLab/liveShowTemplate';
import { claimSourceLabel } from '@/lib/songLab/claimSource';

/** The zones a US touring artist actually plays. Any IANA id works server-side. */
const COMMON_TIMEZONES = [
  { id: 'America/New_York', label: 'Eastern' },
  { id: 'America/Chicago', label: 'Central' },
  { id: 'America/Denver', label: 'Mountain' },
  { id: 'America/Phoenix', label: 'Arizona' },
  { id: 'America/Los_Angeles', label: 'Pacific' },
];

/**
 * Open a print-ready sheet for one offer link: a high-contrast QR, plain-language
 * scan instructions (many people at a live show have never scanned a QR), and the
 * short URL in large type as the no-QR fallback. Client-only; the qrcode encoder
 * is dynamically imported so it costs nothing anywhere else.
 */
async function openQrSheet(url: string, artistName: string) {
  const QR = await import('qrcode');
  const dataUrl = await QR.toDataURL(url, {
    width: 1200,
    margin: 4,
    errorCorrectionLevel: 'H',
    color: { dark: '#000000', light: '#FFFFFF' },
  });
  const shortUrl = url.replace(/^https?:\/\//, '');
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(`<!doctype html><html><head><title>${artistName} on CRWN</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  body { font-family: Arial, Helvetica, sans-serif; background: #fff; color: #000; text-align: center; padding: 24px; }
  img { width: min(90vw, 480px); height: auto; }
  h1 { font-size: 28px; margin: 8px 0 4px; }
  p { font-size: 20px; line-height: 1.4; margin: 10px auto; max-width: 520px; }
  .url { font-size: 26px; font-weight: bold; letter-spacing: 0.5px; word-break: break-all; }
  .small { font-size: 15px; color: #444; }
  @media print { .noprint { display: none; } }
</style></head><body>
  <h1>${artistName}</h1>
  <img src="${dataUrl}" alt="QR code for ${shortUrl}" />
  <p>Open your phone camera, point it at the square, then tap the link that appears.</p>
  <p>No camera? Type this into your phone&#39;s internet browser:</p>
  <p class="url">${shortUrl}</p>
  <p class="noprint"><button onclick="window.print()" style="font-size:18px;padding:12px 24px;">Print this page</button></p>
  <p class="small">Free to join. No card, ever.</p>
</body></html>`);
  w.document.close();
}

interface Tier { id: string; name: string; price: number }
interface Project { id: string; title: string; status: string; next_note: string | null; show_timezone?: string | null }
interface Decision {
  id: string; project_id: string; stage_label: string; question: string;
  options: Array<{ id: string; label: string }>;
  status: string; is_free: boolean; allowed_tier_ids: string[];
  opens_at: string | null; closes_at: string | null; winning_option_id: string | null;
}
interface Offer {
  id: string; slug: string; name: string; headline: string; description: string | null;
  cta_label: string; benefit_kind: string; decision_id: string | null; project_id: string | null; is_active: boolean;
  view_count: number; destination_path: string | null;
}
interface AnalyticsPayload {
  offers: Array<{ id: string; name: string; views: number; claims: number; freeJoins: number; freshSignups: number; participated: number; nowPaid: number; isActive: boolean; sources?: Record<string, number> }>;
  decisions: Array<{
    id: string; stageLabel: string; status: string; votes: number;
    options?: Array<{ id: string; label: string; votes: number; share: number | null }>;
    winningOptionId?: string | null;
  }>;
  participation: { participants: number; repeatParticipants: number; multiProjectParticipants: number; totalVotes: number; tierBreakdown: Record<string, number> };
}

type Panel = 'projects' | 'offers' | 'results';

export function SongLabManager() {
  const [status, setStatus] = useState<'loading' | 'off' | 'on'>('loading');
  const [slug, setSlug] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [panel, setPanel] = useState<Panel>('projects');
  const [projects, setProjects] = useState<Project[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    const [p, o] = await Promise.all([
      fetch('/api/song-lab/projects').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/song-lab/offers').then((r) => (r.ok ? r.json() : null)),
    ]);
    if (p) { setProjects(p.projects || []); setDecisions(p.decisions || []); }
    if (o) setOffers(o.offers || []);
  }, []);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/song-lab/artist');
      const data = res.ok ? await res.json() : { enabled: false };
      if (!data.enabled) { setStatus('off'); return; }
      setSlug(data.slug);
      setDisplayName(data.displayName || data.slug);
      setTiers(data.tiers || []);
      setStatus('on');
      loadAll();
    })();
  }, [loadAll]);

  useEffect(() => {
    if (panel === 'results' && status === 'on') {
      fetch('/api/song-lab/analytics').then((r) => (r.ok ? r.json() : null)).then((a) => a && setAnalytics(a));
    }
  }, [panel, status]);

  const call = async (url: string, body: Record<string, unknown>, method = 'POST') => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || 'Something went wrong'); return false; }
      await loadAll();
      return true;
    } catch {
      setError('Something went wrong');
      return false;
    } finally {
      setBusy(false);
    }
  };

  // Deletes carry their target in the query string. The routes refuse anything a fan has
  // already touched (a claim, a cast vote) and say what to do instead, so the refusal is
  // shown to the artist rather than swallowed.
  const remove = async (url: string, confirmText: string) => {
    if (!window.confirm(confirmText)) return false;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || 'Could not delete that'); return false; }
      await loadAll();
      return true;
    } catch {
      setError('Could not delete that');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const copyLink = (offerSlug: string, offerId: string) => {
    const url = `${window.location.origin}/${slug}/join/${offerSlug}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(offerId);
      setTimeout(() => setCopied(null), 1500);
    });
  };

  if (status === 'loading') {
    return <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 text-crwn-gold animate-spin" /></div>;
  }
  if (status === 'off') {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <p className="text-crwn-text-secondary">
          Song Lab is a limited experiment and is not switched on for this account.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex gap-2 mb-6">
        {(['projects', 'offers', 'results'] as Panel[]).map((p) => (
          <button
            key={p}
            onClick={() => setPanel(p)}
            className={`px-4 py-2 rounded-full text-sm font-semibold capitalize transition ${
              panel === p ? 'bg-crwn-gold text-crwn-bg' : 'bg-crwn-surface text-crwn-text-secondary hover:text-crwn-text'
            }`}
          >
            {p === 'offers' ? 'Lead magnets' : p}
          </button>
        ))}
      </div>

      {error ? <p className="text-sm text-red-400 mb-4">{error}</p> : null}

      {panel === 'projects' ? (
        <ProjectsPanel
          projects={projects}
          decisions={decisions}
          tiers={tiers}
          busy={busy}
          call={call}
          remove={remove}
          displayName={displayName}
          reload={loadAll}
        />
      ) : null}

      {panel === 'offers' ? (
        <OffersPanel
          offers={offers}
          projects={projects}
          decisions={decisions}
          busy={busy}
          call={call}
          remove={remove}
          copyLink={copyLink}
          copied={copied}
          slug={slug}
          displayName={displayName}
        />
      ) : null}

      {panel === 'results' ? <ResultsPanel analytics={analytics} /> : null}

      <p className="text-[11px] text-crwn-text-secondary/70 mt-10">{RECOGNITION_DISCLAIMER}</p>
    </div>
  );
}

/* ── New live show ────────────────────────────────────────────────────────────
   The whole night in one form. Everything that repeats week to week is filled in
   already; the artist types the show name, picks the date, and enters songs. */

function NewLiveShowForm({ displayName, busy, call, onCreated }: {
  displayName: string;
  busy: boolean;
  call: (url: string, body: Record<string, unknown>, method?: string) => Promise<boolean>;
  onCreated: () => void;
}) {
  const [eventName, setEventName] = useState('');
  const [date, setDate] = useState('');
  const [timeZone, setTimeZone] = useState(DEFAULT_SHOW_TIMEZONE);
  const defaults = liveShowDefaults(displayName, eventName);
  const [headline, setHeadline] = useState(defaults.headline);
  const [question, setQuestion] = useState('');
  const [description, setDescription] = useState('');
  const [show1, setShow1] = useState(['', '']);
  const [show2, setShow2] = useState(['', '']);
  const [close1, setClose1] = useState<string>(DEFAULT_SHOW_TIMES[0].closesAt);
  const [close2, setClose2] = useState<string>(DEFAULT_SHOW_TIMES[1].closesAt);
  const [twoShows, setTwoShows] = useState(true);
  const [created, setCreated] = useState<{ path: string } | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  // The question and the supporting line depend on the artist's name, which arrives
  // after the first render, so they seed from the template unless the artist edits them.
  const effectiveQuestion = question || defaults.question;
  const effectiveDescription = description || defaults.description;

  const submit = async () => {
    setLocalError(null);
    const shows = [
      { label: 'Show 1', options: show1, opensAt: null, closesAt: close1 },
      ...(twoShows ? [{ label: 'Show 2', options: show2, opensAt: close1, closesAt: close2 }] : []),
    ];
    const problem = validateShowWindows(shows);
    if (problem) { setLocalError(problem); return; }

    const res = await fetch('/api/song-lab/live-show', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventName, date, timeZone,
        headline, question: effectiveQuestion, description: effectiveDescription,
        shows,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setLocalError(data.error || 'Could not create the show'); return; }
    setCreated({ path: data.path });
    onCreated();
  };

  if (created) {
    return (
      <div className="rounded-2xl bg-crwn-surface p-4 space-y-2">
        <p className="text-sm font-semibold text-crwn-gold">Your show is ready.</p>
        <p className="text-sm text-crwn-text">
          One link for the whole night: <span className="text-crwn-text-secondary">{created.path}</span>
        </p>
        <p className="text-xs text-crwn-text-secondary">
          Print the QR from the Lead magnets tab. It shows Show 1 until it closes, then Show 2 by itself.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-crwn-surface p-4 space-y-3">
      <p className="text-sm font-semibold text-crwn-text">New live show</p>
      <p className="text-xs text-crwn-text-secondary">
        Only the show, the date and the songs change from night to night. The rest is filled in.
      </p>

      <label className="block text-xs font-semibold text-crwn-text pt-1">Show and date, as you would say it</label>
      <input value={eventName} onChange={(e) => setEventName(e.target.value)}
        placeholder="St. James Live Sept 26"
        className="w-full rounded-lg bg-crwn-surface-solid px-3 py-2 text-sm text-crwn-text outline-none" />

      <div className="flex gap-2">
        <div className="flex-1">
          <label className="block text-xs font-semibold text-crwn-text">Date of the show</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-lg bg-crwn-surface-solid px-3 py-2 text-sm text-crwn-text outline-none" />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-semibold text-crwn-text">Time zone of the venue</label>
          <OptionSelect
            options={COMMON_TIMEZONES.map((z) => ({ value: z.id, label: z.label }))}
            value={timeZone}
            onChange={(v) => setTimeZone(v || DEFAULT_SHOW_TIMEZONE)}
          />
        </div>
      </div>

      <div className="rounded-xl bg-crwn-surface-solid p-3 space-y-2">
        <p className="text-xs font-semibold text-crwn-text">Show 1 songs</p>
        {show1.map((s, i) => (
          <input key={i} value={s} aria-label={`Show 1 song ${i + 1}`}
            onChange={(e) => setShow1(show1.map((x, j) => (j === i ? e.target.value : x)))}
            placeholder={i === 0 ? '"Never Too Much" - Luther Vandross' : 'Second song'}
            className="w-full rounded-lg bg-crwn-surface px-3 py-2 text-sm text-crwn-text outline-none" />
        ))}
        {show1.length < 4 ? (
          <button onClick={() => setShow1([...show1, ''])} className="text-xs text-crwn-gold">+ one more song</button>
        ) : null}
        <div className="flex items-center gap-2 pt-1">
          <label className="text-xs text-crwn-text-secondary">Voting closes</label>
          <input type="time" value={close1} onChange={(e) => setClose1(e.target.value)}
            className="rounded-lg bg-crwn-surface px-2 py-1.5 text-xs text-crwn-text outline-none" />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-crwn-text-secondary">
        <input type="checkbox" checked={twoShows} onChange={(e) => setTwoShows(e.target.checked)} className="accent-crwn-gold" />
        There is a second show tonight
      </label>

      {twoShows ? (
        <div className="rounded-xl bg-crwn-surface-solid p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-crwn-text">Show 2 songs</p>
            <button onClick={() => setShow2([...show1])} className="text-xs text-crwn-gold">
              Same songs as Show 1
            </button>
          </div>
          {show2.map((s, i) => (
            <input key={i} value={s} aria-label={`Show 2 song ${i + 1}`}
              onChange={(e) => setShow2(show2.map((x, j) => (j === i ? e.target.value : x)))}
              placeholder={i === 0 ? 'First song' : 'Second song'}
              className="w-full rounded-lg bg-crwn-surface px-3 py-2 text-sm text-crwn-text outline-none" />
          ))}
          {show2.length < 4 ? (
            <button onClick={() => setShow2([...show2, ''])} className="text-xs text-crwn-gold">+ one more song</button>
          ) : null}
          <div className="flex items-center gap-2 pt-1">
            <label className="text-xs text-crwn-text-secondary">Opens when Show 1 closes, closes</label>
            <input type="time" value={close2} onChange={(e) => setClose2(e.target.value)}
              className="rounded-lg bg-crwn-surface px-2 py-1.5 text-xs text-crwn-text outline-none" />
          </div>
        </div>
      ) : null}

      <details className="rounded-xl bg-crwn-surface-solid p-3">
        <summary className="text-xs font-semibold text-crwn-text cursor-pointer">
          The words on the page (already written)
        </summary>
        <div className="space-y-2 pt-2">
          <label className="block text-xs text-crwn-text-secondary">Headline</label>
          <input value={headline} onChange={(e) => setHeadline(e.target.value)}
            className="w-full rounded-lg bg-crwn-surface px-3 py-2 text-sm text-crwn-text outline-none" />
          <label className="block text-xs text-crwn-text-secondary">Question fans see</label>
          <input value={effectiveQuestion} onChange={(e) => setQuestion(e.target.value)}
            className="w-full rounded-lg bg-crwn-surface px-3 py-2 text-sm text-crwn-text outline-none" />
          <label className="block text-xs text-crwn-text-secondary">Line underneath</label>
          <textarea value={effectiveDescription} onChange={(e) => setDescription(e.target.value)} rows={2}
            className="w-full rounded-lg bg-crwn-surface px-3 py-2 text-sm text-crwn-text outline-none" />
        </div>
      </details>

      {localError ? <p className="text-sm text-red-400">{localError}</p> : null}

      <button
        disabled={busy || !eventName.trim() || !date}
        onClick={submit}
        className="px-4 py-2 rounded-full bg-crwn-gold text-crwn-bg text-sm font-semibold disabled:opacity-50"
      >
        Create the night
      </button>
    </div>
  );
}

/* ── Projects ─────────────────────────────────────────────────────────────── */

function ProjectsPanel({ projects, decisions, tiers, busy, call, remove, displayName, reload }: {
  projects: Project[];
  decisions: Decision[];
  tiers: Tier[];
  busy: boolean;
  call: (url: string, body: Record<string, unknown>, method?: string) => Promise<boolean>;
  remove: (url: string, confirmText: string) => Promise<boolean>;
  displayName: string;
  reload: () => Promise<void>;
}) {
  const [newTitle, setNewTitle] = useState('');
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [creatingShow, setCreatingShow] = useState(false);

  return (
    <div className="space-y-6">
      {creatingShow ? (
        <NewLiveShowForm
          displayName={displayName}
          busy={busy}
          call={call}
          onCreated={() => { reload(); }}
        />
      ) : (
        <button
          onClick={() => setCreatingShow(true)}
          className="w-full py-3 rounded-xl bg-crwn-gold text-crwn-bg font-semibold"
        >
          + New live show
        </button>
      )}

      <div className="flex gap-2">
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Song title (Song #03)"
          className="flex-1 rounded-xl bg-crwn-surface px-4 py-3 text-crwn-text placeholder:text-crwn-text-secondary/60 outline-none focus:ring-1 focus:ring-crwn-gold"
        />
        <button
          disabled={busy || !newTitle.trim()}
          onClick={async () => { if (await call('/api/song-lab/projects', { title: newTitle })) setNewTitle(''); }}
          className="px-4 rounded-xl bg-crwn-gold text-crwn-bg font-semibold disabled:opacity-50"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {projects.length === 0 ? (
        <p className="text-sm text-crwn-text-secondary">
          No projects yet. A fan who never sees the process never joins it. Start Song #01.
        </p>
      ) : null}

      {projects.map((project) => (
        <div key={project.id} className="rounded-2xl bg-crwn-surface p-4">
          <div className="flex items-center justify-between gap-3 mb-2">
            <input
              defaultValue={project.title}
              aria-label="Project title"
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== project.title) call('/api/song-lab/projects', { projectId: project.id, title: v }, 'PATCH');
              }}
              className="flex-1 min-w-0 bg-transparent text-lg font-bold text-crwn-text outline-none focus:bg-crwn-surface-solid rounded px-1"
            />
            <div className="flex items-center gap-2 shrink-0">
              <OptionSelect
                className="w-36"
                options={[
                  { value: 'active', label: 'Active' },
                  { value: 'completed', label: 'Completed' },
                  { value: 'archived', label: 'Archived' },
                ]}
                value={project.status}
                onChange={(v) => call('/api/song-lab/projects', { projectId: project.id, status: v }, 'PATCH')}
              />
              <button
                disabled={busy}
                aria-label={`Delete ${project.title}`}
                title="Delete this project"
                onClick={() => remove(
                  `/api/song-lab/projects?projectId=${encodeURIComponent(project.id)}`,
                  `Delete "${project.title}" and its votes? This cannot be undone. If any fan has already voted, CRWN will refuse and you can archive it instead.`,
                )}
                className="p-2 rounded-full text-crwn-text-secondary hover:text-red-400 disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
          <input
            defaultValue={project.next_note ?? ''}
            placeholder='"Next decision: Friday" (shown to fans)'
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v !== (project.next_note ?? '')) call('/api/song-lab/projects', { projectId: project.id, nextNote: v || null }, 'PATCH');
            }}
            className="w-full rounded-lg bg-crwn-surface-solid px-3 py-2 text-sm text-crwn-text placeholder:text-crwn-text-secondary/50 outline-none mb-3"
          />

          {decisions.filter((d) => d.project_id === project.id).map((d) => (
            <DecisionRow
              key={d.id}
              decision={d}
              busy={busy}
              call={call}
              remove={remove}
              timeZone={project.show_timezone || DEFAULT_SHOW_TIMEZONE}
            />
          ))}

          {addingTo === project.id ? (
            <NewDecisionForm
              projectId={project.id}
              tiers={tiers}
              busy={busy}
              call={call}
              onDone={() => setAddingTo(null)}
            />
          ) : (
            <button
              onClick={() => setAddingTo(project.id)}
              className="mt-2 text-sm text-crwn-gold hover:underline"
            >
              + Add a decision (Beat, Melody, Hook...)
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/** Plain English for the poll's live state. No hidden override flags: every phrase here
 *  is derived from status plus the window, so Studio cannot disagree with the public page. */
function scheduleSentence(d: Decision, timeZone: string): string {
  const label = scheduleLabel(d as never, new Date());
  const opens = d.opens_at ? formatTimeInZone(d.opens_at, timeZone) : null;
  const closes = d.closes_at ? formatTimeInZone(d.closes_at, timeZone) : null;
  switch (label) {
    case 'draft': return 'Draft. Fans cannot see this.';
    case 'scheduled': return opens ? `Scheduled: opens ${opens}${closes ? `, closes ${closes}` : ''}` : 'Scheduled';
    case 'open': return `Open now, closes ${closes} on its own`;
    case 'open_no_end': return 'Open now with no end time. You close it by hand.';
    case 'closed_early': return 'Closed early by hand';
    case 'closed_on_time': return closes ? `Closed at ${closes}` : 'Closed';
    default: return '';
  }
}

function DecisionRow({ decision: d, busy, call, remove, timeZone }: {
  decision: Decision;
  busy: boolean;
  call: (url: string, body: Record<string, unknown>, method?: string) => Promise<boolean>;
  remove: (url: string, confirmText: string) => Promise<boolean>;
  timeZone: string;
}) {
  const [finalizing, setFinalizing] = useState(false);
  const [winner, setWinner] = useState<string | null>(d.winning_option_id);
  const [editing, setEditing] = useState(false);
  const [question, setQuestion] = useState(d.question);
  const [labels, setLabels] = useState(d.options.map((o) => o.label));

  // A published vote can be corrected: labels edit in place by position so any vote
  // already cast keeps pointing at the same choice. The route refuses REMOVING an option
  // once the vote is open, which is why the remove control only shows on a draft.
  const saveEdit = async () => {
    const ok = await call('/api/song-lab/decisions', {
      decisionId: d.id,
      action: 'edit',
      question,
      optionLabels: labels.map((l) => l.trim()).filter(Boolean),
    }, 'PATCH');
    if (ok) setEditing(false);
  };

  return (
    <div className="border-t border-white/5 py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-crwn-text">
            {d.stage_label}
            <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
              d.status === 'open' ? 'bg-crwn-gold/20 text-crwn-gold' : d.status === 'closed' ? 'bg-white/10 text-crwn-text-secondary' : 'bg-white/5 text-crwn-text-secondary'
            }`}>{d.status}</span>
          </p>
          <p className="text-xs text-crwn-text-secondary mt-0.5">{d.question}</p>
          <p className="text-xs text-crwn-text-secondary mt-0.5">
            {d.options.map((o) => o.label).join(' / ')}
            {d.winning_option_id ? ` · winner: ${d.options.find((o) => o.id === d.winning_option_id)?.label ?? d.winning_option_id}` : ''}
          </p>
          <p className="text-xs text-crwn-gold/80 mt-1">{scheduleSentence(d, timeZone)}</p>
        </div>
        <div className="flex gap-2 shrink-0 flex-wrap justify-end">
          {d.status === 'draft' ? (
            <button disabled={busy} onClick={() => call('/api/song-lab/decisions', { decisionId: d.id, action: 'open' }, 'PATCH')}
              className="text-xs px-3 py-1.5 rounded-full bg-crwn-gold text-crwn-bg font-semibold disabled:opacity-50">Open vote</button>
          ) : null}
          {/* Live music runs early and late. Start this set's vote now, whatever the
              schedule said; a future close time is kept so it still ends itself. */}
          {d.status !== 'closed' && scheduleLabel(d as never, new Date()) === 'scheduled' ? (
            <button disabled={busy} onClick={() => call('/api/song-lab/decisions', { decisionId: d.id, action: 'open_now' }, 'PATCH')}
              className="text-xs px-3 py-1.5 rounded-full bg-crwn-gold text-crwn-bg font-semibold disabled:opacity-50">Open now</button>
          ) : null}
          {d.status === 'open' ? (
            <button disabled={busy} onClick={() => call('/api/song-lab/decisions', { decisionId: d.id, action: 'close' }, 'PATCH')}
              className="text-xs px-3 py-1.5 rounded-full bg-crwn-surface-solid text-crwn-text ring-1 ring-white/10 disabled:opacity-50">Close now</button>
          ) : null}
          {/* Running long: push the close out from now. */}
          {d.status === 'open' ? (
            <OptionSelect
              className="w-32"
              options={EXTEND_MINUTES.map((m) => ({ value: String(m), label: `+${m} min` }))}
              value={null}
              onChange={(v) => v && call('/api/song-lab/decisions', { decisionId: d.id, action: 'extend', minutes: Number(v) }, 'PATCH')}
              placeholder="Extend"
            />
          ) : null}
          {d.status === 'closed' && !d.winning_option_id ? (
            <button onClick={() => setFinalizing((f) => !f)}
              className="text-xs px-3 py-1.5 rounded-full bg-crwn-surface-solid text-crwn-gold ring-1 ring-crwn-gold/40">Pick winner</button>
          ) : null}
          <button
            onClick={() => setEditing((e) => !e)}
            aria-label={`Edit ${d.stage_label}`}
            title="Edit the question and song titles"
            className="p-1.5 rounded-full text-crwn-text-secondary hover:text-crwn-text"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            disabled={busy}
            aria-label={`Delete ${d.stage_label}`}
            title="Delete this vote"
            onClick={() => remove(
              `/api/song-lab/decisions?decisionId=${encodeURIComponent(d.id)}`,
              `Delete the vote "${d.stage_label}"? If a fan has already voted, or a link points at it, CRWN will refuse and tell you what to do instead.`,
            )}
            className="p-1.5 rounded-full text-crwn-text-secondary hover:text-red-400 disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {editing ? (
        <div className="mt-3 rounded-xl bg-crwn-surface-solid p-3 space-y-2">
          <label className="block text-xs font-semibold text-crwn-text">Question fans see</label>
          <input value={question} onChange={(e) => setQuestion(e.target.value)}
            className="w-full rounded-lg bg-crwn-surface px-3 py-2 text-sm text-crwn-text outline-none" />
          <label className="block text-xs font-semibold text-crwn-text pt-1">Song choices</label>
          {labels.map((l, i) => (
            <input key={i} value={l} aria-label={`Choice ${i + 1}`}
              onChange={(e) => setLabels(labels.map((x, j) => (j === i ? e.target.value : x)))}
              className="w-full rounded-lg bg-crwn-surface px-3 py-2 text-sm text-crwn-text outline-none" />
          ))}
          <div className="flex items-center gap-2 pt-1">
            {labels.length < 4 ? (
              <button onClick={() => setLabels([...labels, ''])} className="text-xs text-crwn-gold">+ one more</button>
            ) : null}
            {d.status === 'draft' && labels.length > 2 ? (
              <button onClick={() => setLabels(labels.slice(0, -1))} className="text-xs text-crwn-text-secondary">
                remove last
              </button>
            ) : null}
          </div>
          <p className="text-[11px] text-crwn-text-secondary/70">
            Renaming a song is safe at any time: votes already cast stay with the same position on the ballot.
            Once the vote is open you can add a choice but not remove one.
          </p>
          <div className="flex gap-2">
            <button disabled={busy} onClick={saveEdit}
              className="px-4 py-2 rounded-full bg-crwn-gold text-crwn-bg text-sm font-semibold disabled:opacity-50">Save</button>
            <button onClick={() => { setEditing(false); setQuestion(d.question); setLabels(d.options.map((o) => o.label)); }}
              className="px-4 py-2 rounded-full text-sm text-crwn-text-secondary">Cancel</button>
          </div>
        </div>
      ) : null}
      {finalizing ? (
        <div className="flex items-center gap-2 mt-2">
          <OptionSelect
            className="w-48"
            options={d.options.map((o) => ({ value: o.id, label: o.label }))}
            value={winner}
            onChange={setWinner}
            placeholder="The winning option"
          />
          <button
            disabled={busy || !winner}
            onClick={async () => { if (await call('/api/song-lab/decisions', { decisionId: d.id, action: 'finalize', winningOptionId: winner }, 'PATCH')) setFinalizing(false); }}
            className="text-xs px-3 py-2 rounded-full bg-crwn-gold text-crwn-bg font-semibold disabled:opacity-50"
          >
            Finalize
          </button>
        </div>
      ) : null}
    </div>
  );
}

function NewDecisionForm({ projectId, tiers, busy, call, onDone }: {
  projectId: string;
  tiers: Tier[];
  busy: boolean;
  call: (url: string, body: Record<string, unknown>, method?: string) => Promise<boolean>;
  onDone: () => void;
}) {
  const [stageLabel, setStageLabel] = useState('');
  const [question, setQuestion] = useState('');
  const [labels, setLabels] = useState(['', '', '']);
  const [isFree, setIsFree] = useState(false);
  const [tierIds, setTierIds] = useState<string[]>(tiers.filter((t) => t.price === 0).map((t) => t.id));
  const [closesAt, setClosesAt] = useState('');
  const [openNow, setOpenNow] = useState(true);

  const submit = async () => {
    const ok = await call('/api/song-lab/decisions', {
      projectId,
      stageLabel,
      question,
      options: labels.filter((l) => l.trim()),
      isFree,
      allowedTierIds: tierIds,
      status: openNow ? 'open' : 'draft',
      closesAt: closesAt ? new Date(closesAt).toISOString() : null,
    });
    if (ok) onDone();
  };

  return (
    <div className="mt-3 rounded-xl bg-crwn-surface-solid p-4 space-y-3">
      <input value={stageLabel} onChange={(e) => setStageLabel(e.target.value)} placeholder="Stage (Beat, Melody, Hook...)"
        className="w-full rounded-lg bg-crwn-surface px-3 py-2 text-sm text-crwn-text outline-none" />
      <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Question fans see (Which hook makes the record?)"
        className="w-full rounded-lg bg-crwn-surface px-3 py-2 text-sm text-crwn-text outline-none" />
      {labels.map((l, i) => (
        <input key={i} value={l} onChange={(e) => setLabels(labels.map((x, j) => (j === i ? e.target.value : x)))}
          placeholder={`Option ${String.fromCharCode(65 + i)}`}
          className="w-full rounded-lg bg-crwn-surface px-3 py-2 text-sm text-crwn-text outline-none" />
      ))}
      {labels.length < 4 ? (
        <button onClick={() => setLabels([...labels, ''])} className="text-xs text-crwn-gold">+ one more option</button>
      ) : null}

      <div className="pt-1">
        <p className="text-xs font-semibold text-crwn-text mb-1.5">Who can vote</p>
        <label className="flex items-center gap-2 text-sm text-crwn-text-secondary mb-1">
          <input type="checkbox" checked={isFree} onChange={(e) => setIsFree(e.target.checked)} className="accent-crwn-gold" />
          Anyone signed in (no membership needed)
        </label>
        {!isFree ? tiers.map((t) => (
          <label key={t.id} className="flex items-center gap-2 text-sm text-crwn-text-secondary mb-1">
            <input
              type="checkbox"
              checked={tierIds.includes(t.id)}
              onChange={(e) => setTierIds(e.target.checked ? [...tierIds, t.id] : tierIds.filter((x) => x !== t.id))}
              className="accent-crwn-gold"
            />
            {t.name}{t.price === 0 ? ' (free)' : ` ($${(t.price / 100).toFixed(0)}/mo)`}
          </label>
        )) : null}
      </div>

      <div className="flex items-center gap-3">
        <label className="text-xs text-crwn-text-secondary">Closes (optional)</label>
        <input type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)}
          className="rounded-lg bg-crwn-surface px-2 py-1.5 text-xs text-crwn-text outline-none" />
      </div>
      <label className="flex items-center gap-2 text-sm text-crwn-text-secondary">
        <input type="checkbox" checked={openNow} onChange={(e) => setOpenNow(e.target.checked)} className="accent-crwn-gold" />
        Open the vote immediately
      </label>

      <div className="flex gap-2">
        <button disabled={busy} onClick={submit}
          className="px-4 py-2 rounded-full bg-crwn-gold text-crwn-bg text-sm font-semibold disabled:opacity-50">Create</button>
        <button onClick={onDone} className="px-4 py-2 rounded-full text-sm text-crwn-text-secondary">Cancel</button>
      </div>
    </div>
  );
}

/* ── Offers ───────────────────────────────────────────────────────────────── */

/**
 * A vote link's three scopes, widest first. Encoded as one string so a single dropdown
 * can express all three, then split back into the two columns the API stores.
 */
function bindingOptions(projects: Project[], decisions: Decision[], offer: Offer | null) {
  const opts = [
    { value: 'any', label: 'Any vote that is open', hint: 'Never goes stale. Follows every vote, in every song.' },
    ...projects.map((p) => ({
      value: `project:${p.id}`,
      label: `Every vote in ${p.title}`,
      hint: 'Hands over as each vote in that song closes.',
    })),
    ...decisions
      .filter((d) => d.status !== 'closed' || d.id === offer?.decision_id)
      .map((d) => ({
        value: `decision:${d.id}`,
        label: `${d.stage_label}: ${d.question}`,
        hint: 'This one vote only. The link ends when it closes.',
      })),
  ];
  return opts;
}

function bindingValue(offer: Offer): string {
  if (offer.decision_id) return `decision:${offer.decision_id}`;
  if (offer.project_id) return `project:${offer.project_id}`;
  return 'any';
}

/** Turn the dropdown's value back into the two columns, always setting BOTH. */
function bindingPatch(value: string): { projectId: string | null; decisionId: string | null } {
  if (value.startsWith('decision:')) return { projectId: null, decisionId: value.slice(9) };
  if (value.startsWith('project:')) return { projectId: value.slice(8), decisionId: null };
  return { projectId: null, decisionId: null };
}

function OffersPanel({ offers, projects, decisions, busy, call, remove, copyLink, copied, slug, displayName }: {
  offers: Offer[];
  projects: Project[];
  decisions: Decision[];
  busy: boolean;
  call: (url: string, body: Record<string, unknown>, method?: string) => Promise<boolean>;
  remove: (url: string, confirmText: string) => Promise<boolean>;
  copyLink: (offerSlug: string, offerId: string) => void;
  copied: string | null;
  slug: string;
  displayName: string;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [headline, setHeadline] = useState('');
  const [description, setDescription] = useState('');
  const [ctaLabel, setCtaLabel] = useState('Join free');
  const [benefitKind, setBenefitKind] = useState('vote');
  // Defaults to the widest scope: the link an artist posts once and leaves up.
  const [binding, setBinding] = useState('any');
  const [destinationPath, setDestinationPath] = useState('');

  const submit = async () => {
    const scope = benefitKind === 'vote' ? bindingPatch(binding) : { projectId: null, decisionId: null };
    const ok = await call('/api/song-lab/offers', {
      name, slug: name, headline, description, ctaLabel, benefitKind,
      ...scope,
      destinationPath: destinationPath.trim() || null,
    });
    if (ok) {
      setCreating(false);
      setName(''); setHeadline(''); setDescription(''); setCtaLabel('Join free'); setBinding('any');
      setDestinationPath('');
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-crwn-text-secondary">
        A lead magnet is the reason an Instagram viewer joins free. Test several; the Results
        panel shows which one actually fills the room.
      </p>

      {offers.map((o) => (
        <div key={o.id} className="rounded-2xl bg-crwn-surface p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="font-semibold text-crwn-text">{o.name}
                {!o.is_active ? <span className="ml-2 text-xs text-crwn-text-secondary">(off)</span> : null}
              </p>
              <p className="text-xs text-crwn-text-secondary mt-0.5">{o.headline}</p>
              <p className="text-xs text-crwn-text-secondary/70 mt-0.5">/{slug}/join/{o.slug} · {o.view_count} views</p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => copyLink(o.slug, o.id)}
                className="p-2 rounded-full bg-crwn-surface-solid ring-1 ring-white/10 text-crwn-text"
                aria-label="Copy link">
                {copied === o.id ? <Check className="w-4 h-4 text-crwn-gold" /> : <Copy className="w-4 h-4" />}
              </button>
              <button
                onClick={() => openQrSheet(`${window.location.origin}/${slug}/join/${o.slug}`, displayName)}
                className="p-2 rounded-full bg-crwn-surface-solid ring-1 ring-white/10 text-crwn-text"
                aria-label="Print a QR sheet for this link"
                title="Print a QR sheet"
              >
                <QrCode className="w-4 h-4" />
              </button>
              <button disabled={busy}
                onClick={() => call('/api/song-lab/offers', { offerId: o.id, isActive: !o.is_active }, 'PATCH')}
                className="text-xs px-3 py-1.5 rounded-full bg-crwn-surface-solid ring-1 ring-white/10 text-crwn-text disabled:opacity-50">
                {o.is_active ? 'Turn off' : 'Turn on'}
              </button>
              <button
                disabled={busy}
                aria-label={`Delete ${o.name}`}
                title="Delete this link"
                onClick={() => remove(
                  `/api/song-lab/offers?offerId=${encodeURIComponent(o.id)}`,
                  `Delete the link "${o.name}"? If any fan has already joined through it, CRWN will refuse so you keep the record, and you can turn it off instead.`,
                )}
                className="p-2 rounded-full text-crwn-text-secondary hover:text-red-400 disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {o.benefit_kind === 'vote' ? (
            <div className="mt-3">
              <p className="text-[11px] text-crwn-text-secondary/70 mb-1.5">
                What this link opens (the button always reads &quot;Cast my vote&quot;):
              </p>
              <OptionSelect
                options={bindingOptions(projects, decisions, o)}
                value={bindingValue(o)}
                onChange={(v) => call('/api/song-lab/offers', { offerId: o.id, ...bindingPatch(v) }, 'PATCH')}
              />
              {!o.project_id && !o.decision_id ? (
                <p className="text-[11px] text-crwn-gold/80 mt-1.5">
                  This link never goes stale. Put it in your bio once and it follows every vote you open.
                </p>
              ) : null}
            </div>
          ) : null}

          {o.benefit_kind !== 'vote' && o.benefit_kind !== 'recognition' ? (
            <p className="text-[11px] text-crwn-text-secondary/70 mt-2">
              CRWN records the claim and enrolls the fan. Delivering this benefit is on you.
            </p>
          ) : null}

          <OfferEditor offer={o} busy={busy} call={call} />
        </div>
      ))}

      {creating ? (
        <div className="rounded-2xl bg-crwn-surface p-4 space-y-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Internal name (Final Vote)"
            className="w-full rounded-lg bg-crwn-surface-solid px-3 py-2 text-sm text-crwn-text outline-none" />
          <input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Public headline (GET THE FINAL VOTE)"
            className="w-full rounded-lg bg-crwn-surface-solid px-3 py-2 text-sm text-crwn-text outline-none" />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
            placeholder="Why it matters (Instagram picked the finalists. The Day Ones decide what makes the record.)"
            className="w-full rounded-lg bg-crwn-surface-solid px-3 py-2 text-sm text-crwn-text outline-none" />
          {benefitKind !== 'vote' ? (
            <input value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} placeholder="Button label"
              className="w-full rounded-lg bg-crwn-surface-solid px-3 py-2 text-sm text-crwn-text outline-none" />
          ) : null}
          <div>
            <p className="text-xs font-semibold text-crwn-text mb-1.5">What they get</p>
            <OptionSelect
              options={[
                { value: 'vote', label: 'A vote', hint: 'The link opens the ballot itself. CRWN delivers it.' },
                { value: 'recognition', label: 'Recognition', hint: 'Day One A&R status on the Lab.' },
                { value: 'content', label: 'Content access', hint: 'You point the reward at a CRWN page.' },
                { value: 'other', label: 'Something else', hint: 'You deliver it yourself.' },
              ]}
              value={benefitKind}
              onChange={setBenefitKind}
            />
          </div>
          {benefitKind === 'vote' ? (
            <div>
              <OptionSelect
                options={bindingOptions(projects, decisions, null)}
                value={binding}
                onChange={setBinding}
              />
              <p className="text-[11px] text-crwn-text-secondary/70 mt-1">
                The songs on the open vote become the buttons fans tap. &quot;Any vote that is open&quot; is
                the one to pick for a link you post once and leave up: it follows every vote you open,
                in every song, so you never have to swap the link. The button always reads
                &quot;Cast my vote&quot;.
              </p>
            </div>
          ) : null}
          <div>
            <input value={destinationPath} onChange={(e) => setDestinationPath(e.target.value)}
              placeholder={benefitKind === 'vote' ? 'Reward link, optional (/your-page or a post link)' : 'Where the reward lives (/your-page or a post link)'}
              className="w-full rounded-lg bg-crwn-surface-solid px-3 py-2 text-sm text-crwn-text outline-none" />
            <p className="text-[11px] text-crwn-text-secondary/70 mt-1">
              {benefitKind === 'vote'
                ? 'A CRWN link the thank-you screen offers after they vote and join, like a free live performance post. Leave empty to send them to the vote results.'
                : 'A CRWN link only, starting with /.'}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              disabled={busy || !name.trim() || !headline.trim()}
              onClick={submit}
              className="px-4 py-2 rounded-full bg-crwn-gold text-crwn-bg text-sm font-semibold disabled:opacity-50"
            >
              Create
            </button>
            <button onClick={() => setCreating(false)} className="px-4 py-2 rounded-full text-sm text-crwn-text-secondary">Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setCreating(true)} className="text-sm text-crwn-gold hover:underline">
          + New lead magnet
        </button>
      )}
    </div>
  );
}

/** Post-publish editing for a live link: the words on the page and the reward it offers.
 *  The link slug itself is deliberately NOT editable, because a printed QR code and every
 *  claim already recorded point at it. */
function OfferEditor({ offer, busy, call }: {
  offer: Offer;
  busy: boolean;
  call: (url: string, body: Record<string, unknown>, method?: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(offer.name);
  const [headline, setHeadline] = useState(offer.headline);
  const [description, setDescription] = useState(offer.description ?? '');
  const [destinationPath, setDestinationPath] = useState(offer.destination_path ?? '');

  const save = async () => {
    const ok = await call('/api/song-lab/offers', {
      offerId: offer.id,
      name,
      headline,
      description,
      destinationPath: destinationPath.trim() || null,
    }, 'PATCH');
    if (ok) setOpen(false);
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="mt-3 text-xs text-crwn-gold hover:underline">
        Edit the words on this page
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-xl bg-crwn-surface-solid p-3 space-y-2">
      <label className="block text-xs font-semibold text-crwn-text">Name (yours only, fans never see it)</label>
      <input value={name} onChange={(e) => setName(e.target.value)}
        className="w-full rounded-lg bg-crwn-surface px-3 py-2 text-sm text-crwn-text outline-none" />
      <label className="block text-xs font-semibold text-crwn-text pt-1">Headline fans see</label>
      <input value={headline} onChange={(e) => setHeadline(e.target.value)}
        className="w-full rounded-lg bg-crwn-surface px-3 py-2 text-sm text-crwn-text outline-none" />
      <label className="block text-xs font-semibold text-crwn-text pt-1">Line underneath</label>
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
        className="w-full rounded-lg bg-crwn-surface px-3 py-2 text-sm text-crwn-text outline-none" />
      <label className="block text-xs font-semibold text-crwn-text pt-1">Reward link, optional</label>
      <input value={destinationPath} onChange={(e) => setDestinationPath(e.target.value)}
        placeholder="/your-page"
        className="w-full rounded-lg bg-crwn-surface px-3 py-2 text-sm text-crwn-text outline-none" />
      <p className="text-[11px] text-crwn-text-secondary/70">
        The web address stays the same, so any QR code you already printed keeps working.
      </p>
      <div className="flex gap-2">
        <button disabled={busy} onClick={save}
          className="px-4 py-2 rounded-full bg-crwn-gold text-crwn-bg text-sm font-semibold disabled:opacity-50">Save</button>
        <button onClick={() => setOpen(false)} className="px-4 py-2 rounded-full text-sm text-crwn-text-secondary">Cancel</button>
      </div>
    </div>
  );
}

/* ── Results ──────────────────────────────────────────────────────────────── */

function ResultsPanel({ analytics }: { analytics: AnalyticsPayload | null }) {
  if (!analytics) {
    return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 text-crwn-gold animate-spin" /></div>;
  }
  const p = analytics.participation;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          ['Participants', p.participants],
          ['Repeat voters', p.repeatParticipants],
          ['Multi-project', p.multiProjectParticipants],
          ['Total votes', p.totalVotes],
        ].map(([label, n]) => (
          <div key={label as string} className="rounded-xl bg-crwn-surface p-3 text-center">
            <p className="text-2xl font-bold text-crwn-text">{n as number}</p>
            <p className="text-xs text-crwn-text-secondary">{label as string}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl bg-crwn-surface p-4 overflow-x-auto">
        <p className="text-sm font-semibold text-crwn-text mb-2">Lead magnets, compared</p>
        <p className="text-xs text-crwn-text-secondary mb-3">
          Counts, not percentages: the sample is small and a rate would overstate what we know.
          &quot;Now paid&quot; counts current paid members among the fans each magnet brought in.
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-crwn-text-secondary">
              <th className="py-1.5 pr-3">Magnet</th>
              <th className="py-1.5 pr-3">Views</th>
              <th className="py-1.5 pr-3">Claims</th>
              <th className="py-1.5 pr-3">New signups</th>
              <th className="py-1.5 pr-3">Free joins</th>
              <th className="py-1.5 pr-3">Voted</th>
              <th className="py-1.5">Now paid</th>
            </tr>
          </thead>
          <tbody className="text-crwn-text">
            {analytics.offers.map((o) => (
              <tr key={o.id} className="border-t border-white/5">
                <td className="py-2 pr-3">{o.name}{!o.isActive ? ' (off)' : ''}</td>
                <td className="py-2 pr-3">{o.views}</td>
                <td className="py-2 pr-3">{o.claims}</td>
                <td className="py-2 pr-3">{o.freshSignups}</td>
                <td className="py-2 pr-3">{o.freeJoins}</td>
                <td className="py-2 pr-3">{o.participated}</td>
                <td className="py-2">{o.nowPaid}</td>
              </tr>
            ))}
            {analytics.offers.length === 0 ? (
              <tr><td colSpan={7} className="py-3 text-crwn-text-secondary text-xs">No lead magnets yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="rounded-2xl bg-crwn-surface p-4">
        <p className="text-sm font-semibold text-crwn-text mb-2">Votes per decision</p>
        {analytics.decisions.map((d) => (
          <div key={d.id} className="flex items-center justify-between py-1.5 border-t border-white/5 text-sm">
            <span className="text-crwn-text-secondary">{d.stageLabel} <span className="text-xs">({d.status})</span></span>
            <span className="text-crwn-text font-semibold">{d.votes}</span>
          </div>
        ))}
      </div>

      {Object.keys(p.tierBreakdown).length ? (
        <div className="rounded-2xl bg-crwn-surface p-4">
          <p className="text-sm font-semibold text-crwn-text mb-2">Participants by current tier</p>
          {Object.entries(p.tierBreakdown).map(([name, n]) => (
            <div key={name} className="flex items-center justify-between py-1.5 border-t border-white/5 text-sm">
              <span className="text-crwn-text-secondary">{name}</span>
              <span className="text-crwn-text font-semibold">{n}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
