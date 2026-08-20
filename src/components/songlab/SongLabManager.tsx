'use client';

// Song Lab manager client. Three panels: Projects (songs + A/B/C decisions), Offers
// (free lead magnets with copy-able links), Results (counts, never rates). Everything
// writes through the session-authorized /api/song-lab/* routes; this component holds
// no authority and renders nothing for artists without the capability.

import { useCallback, useEffect, useState } from 'react';
import { Copy, Check, Plus, Loader2 } from 'lucide-react';
import { OptionSelect } from '@/components/ui/OptionSelect';
import { RECOGNITION_DISCLAIMER } from '@/lib/songLab/core';

interface Tier { id: string; name: string; price: number }
interface Project { id: string; title: string; status: string; next_note: string | null }
interface Decision {
  id: string; project_id: string; stage_label: string; question: string;
  options: Array<{ id: string; label: string }>;
  status: string; is_free: boolean; allowed_tier_ids: string[];
  opens_at: string | null; closes_at: string | null; winning_option_id: string | null;
}
interface Offer {
  id: string; slug: string; name: string; headline: string; description: string | null;
  cta_label: string; benefit_kind: string; decision_id: string | null; is_active: boolean;
  view_count: number;
}
interface AnalyticsPayload {
  offers: Array<{ id: string; name: string; views: number; claims: number; freeJoins: number; freshSignups: number; participated: number; nowPaid: number; isActive: boolean }>;
  decisions: Array<{ id: string; stageLabel: string; status: string; votes: number }>;
  participation: { participants: number; repeatParticipants: number; multiProjectParticipants: number; totalVotes: number; tierBreakdown: Record<string, number> };
}

type Panel = 'projects' | 'offers' | 'results';

export function SongLabManager() {
  const [status, setStatus] = useState<'loading' | 'off' | 'on'>('loading');
  const [slug, setSlug] = useState('');
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
        />
      ) : null}

      {panel === 'offers' ? (
        <OffersPanel
          offers={offers}
          decisions={decisions}
          busy={busy}
          call={call}
          copyLink={copyLink}
          copied={copied}
          slug={slug}
        />
      ) : null}

      {panel === 'results' ? <ResultsPanel analytics={analytics} /> : null}

      <p className="text-[11px] text-crwn-text-secondary/70 mt-10">{RECOGNITION_DISCLAIMER}</p>
    </div>
  );
}

/* ── Projects ─────────────────────────────────────────────────────────────── */

function ProjectsPanel({ projects, decisions, tiers, busy, call }: {
  projects: Project[];
  decisions: Decision[];
  tiers: Tier[];
  busy: boolean;
  call: (url: string, body: Record<string, unknown>, method?: string) => Promise<boolean>;
}) {
  const [newTitle, setNewTitle] = useState('');
  const [addingTo, setAddingTo] = useState<string | null>(null);

  return (
    <div className="space-y-6">
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
            <h3 className="text-lg font-bold text-crwn-text">{project.title}</h3>
            <OptionSelect
              className="w-40"
              options={[
                { value: 'active', label: 'Active' },
                { value: 'completed', label: 'Completed' },
                { value: 'archived', label: 'Archived' },
              ]}
              value={project.status}
              onChange={(v) => call('/api/song-lab/projects', { projectId: project.id, status: v }, 'PATCH')}
            />
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
            <DecisionRow key={d.id} decision={d} busy={busy} call={call} />
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

function DecisionRow({ decision: d, busy, call }: {
  decision: Decision;
  busy: boolean;
  call: (url: string, body: Record<string, unknown>, method?: string) => Promise<boolean>;
}) {
  const [finalizing, setFinalizing] = useState(false);
  const [winner, setWinner] = useState<string | null>(d.winning_option_id);

  return (
    <div className="border-t border-white/5 py-3">
      <div className="flex items-center justify-between gap-2">
        <div>
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
        </div>
        <div className="flex gap-2 shrink-0">
          {d.status === 'draft' ? (
            <button disabled={busy} onClick={() => call('/api/song-lab/decisions', { decisionId: d.id, action: 'open' }, 'PATCH')}
              className="text-xs px-3 py-1.5 rounded-full bg-crwn-gold text-crwn-bg font-semibold disabled:opacity-50">Open vote</button>
          ) : null}
          {d.status === 'open' ? (
            <button disabled={busy} onClick={() => call('/api/song-lab/decisions', { decisionId: d.id, action: 'close' }, 'PATCH')}
              className="text-xs px-3 py-1.5 rounded-full bg-crwn-surface-solid text-crwn-text ring-1 ring-white/10 disabled:opacity-50">Close vote</button>
          ) : null}
          {d.status === 'closed' && !d.winning_option_id ? (
            <button onClick={() => setFinalizing((f) => !f)}
              className="text-xs px-3 py-1.5 rounded-full bg-crwn-surface-solid text-crwn-gold ring-1 ring-crwn-gold/40">Pick winner</button>
          ) : null}
        </div>
      </div>
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

function OffersPanel({ offers, decisions, busy, call, copyLink, copied, slug }: {
  offers: Offer[];
  decisions: Decision[];
  busy: boolean;
  call: (url: string, body: Record<string, unknown>, method?: string) => Promise<boolean>;
  copyLink: (offerSlug: string, offerId: string) => void;
  copied: string | null;
  slug: string;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [headline, setHeadline] = useState('');
  const [description, setDescription] = useState('');
  const [ctaLabel, setCtaLabel] = useState('Join free');
  const [benefitKind, setBenefitKind] = useState('vote');
  const [decisionId, setDecisionId] = useState<string | null>(null);

  const submit = async () => {
    const ok = await call('/api/song-lab/offers', {
      name, slug: name, headline, description, ctaLabel, benefitKind,
      decisionId: benefitKind === 'vote' ? decisionId : null,
    });
    if (ok) {
      setCreating(false);
      setName(''); setHeadline(''); setDescription(''); setCtaLabel('Join free'); setDecisionId(null);
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
              <button disabled={busy}
                onClick={() => call('/api/song-lab/offers', { offerId: o.id, isActive: !o.is_active }, 'PATCH')}
                className="text-xs px-3 py-1.5 rounded-full bg-crwn-surface-solid ring-1 ring-white/10 text-crwn-text disabled:opacity-50">
                {o.is_active ? 'Turn off' : 'Turn on'}
              </button>
            </div>
          </div>
          {o.benefit_kind !== 'vote' && o.benefit_kind !== 'recognition' ? (
            <p className="text-[11px] text-crwn-text-secondary/70 mt-2">
              CRWN records the claim and enrolls the fan. Delivering this benefit is on you.
            </p>
          ) : null}
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
          <input value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} placeholder="Button label"
            className="w-full rounded-lg bg-crwn-surface-solid px-3 py-2 text-sm text-crwn-text outline-none" />
          <div>
            <p className="text-xs font-semibold text-crwn-text mb-1.5">What they get</p>
            <OptionSelect
              options={[
                { value: 'vote', label: 'A vote', hint: 'Deep-links a decision. CRWN delivers it.' },
                { value: 'recognition', label: 'Recognition', hint: 'Day One A&R status on the Lab.' },
                { value: 'content', label: 'Content access', hint: 'You point the reward at a CRWN page.' },
                { value: 'other', label: 'Something else', hint: 'You deliver it yourself.' },
              ]}
              value={benefitKind}
              onChange={setBenefitKind}
            />
          </div>
          {benefitKind === 'vote' ? (
            <OptionSelect
              options={decisions.filter((d) => d.status !== 'closed').map((d) => ({ value: d.id, label: `${d.stage_label}: ${d.question}` }))}
              value={decisionId}
              onChange={setDecisionId}
              placeholder="Which decision the link lands on"
            />
          ) : null}
          <div className="flex gap-2">
            <button disabled={busy || !name.trim() || !headline.trim()} onClick={submit}
              className="px-4 py-2 rounded-full bg-crwn-gold text-crwn-bg text-sm font-semibold disabled:opacity-50">Create</button>
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
