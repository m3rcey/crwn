'use client';

import { useEffect, useMemo, useState } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { COLLABORATOR_ROLES, DEAL_TYPES, SOURCE_TYPES_FOR_DEAL, SOURCE_LABELS, DEFAULTS, dealTypeMeta } from '@/lib/teamSplits/constants';
import { analyzeDeal } from '@/lib/teamSplits/warnings';
import { TEAM_SPLIT_DISCLAIMER_PARAGRAPHS, dealTypeLegalNote } from '@/lib/teamSplits/disclaimer';
import type { DealType, RevenueSourceType, PayoutBasis } from '@/lib/teamSplits/types';
import { X, ArrowLeft, AlertTriangle, Loader2, Check, Plus, Trash2 } from 'lucide-react';

interface SourceOption { id: string; label: string; type: RevenueSourceType; }
interface DeliverableDraft { title: string; description: string; dueAt: string; approvalRequired: boolean; }

interface Props {
  artistId: string;
  artistFeePct?: number;
  onClose: () => void;
  onCreated: () => void;
}

const STEPS = ['Role', 'Collaborator', 'Deal type', 'Revenue source', 'Split', 'Duration & cap', 'Deliverables', 'Protection', 'Review'];

export function TeamSplitBuilder({ artistId, artistFeePct = 12, onClose, onCreated }: Props) {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sources, setSources] = useState<SourceOption[]>([]);

  const [form, setForm] = useState({
    role: 'videographer',
    customRole: '',
    collaboratorName: '',
    collaboratorEmail: '',
    dealType: DEFAULTS.dealType as DealType,
    revenueSourceType: 'road_campaign' as RevenueSourceType,
    revenueSourceId: '',
    revenueSourceLabel: '',
    title: '',
    percentage: DEFAULTS.percentage,
    payoutBasis: DEFAULTS.payoutBasis as PayoutBasis,
    upfrontAmount: '',            // dollars
    milestoneAmount: '',          // dollars
    milestoneDescription: '',
    capEnabled: DEFAULTS.capEnabled,
    capAmount: (DEFAULTS.capAmountCents / 100).toString(), // dollars
    durationDays: DEFAULTS.durationDaysCampaign,
    startTrigger: DEFAULTS.startTrigger,
    holdPeriodDays: DEFAULTS.holdPeriodDays,
    payoutStartsAfterDeliverableApproval: DEFAULTS.payoutStartsAfterDeliverableApproval,
    cancellationPolicy: '',
    rightsNotes: '',
    externalAgreementUrl: '',
    agreementAccepted: false,
  });
  const [deliverables, setDeliverables] = useState<DeliverableDraft[]>([]);

  const meta = dealTypeMeta(form.dealType);
  const allowedSourceTypes = SOURCE_TYPES_FOR_DEAL[form.dealType];

  function patch(p: Partial<typeof form>) { setForm((f) => ({ ...f, ...p })); }

  // Load the artist's revenue sources once.
  useEffect(() => {
    let active = true;
    (async () => {
      const [tiers, products, campaigns] = await Promise.all([
        supabase.from('subscription_tiers').select('id, name, price').eq('artist_id', artistId).eq('is_active', true),
        supabase.from('products').select('id, title, price').eq('artist_id', artistId).eq('is_active', true),
        supabase.from('road_campaigns').select('id, title').eq('artist_id', artistId),
      ]);
      if (!active) return;
      const opts: SourceOption[] = [];
      (campaigns.data || []).forEach((c: { id: string; title: string }) => opts.push({ id: c.id, label: c.title, type: 'road_campaign' }));
      (tiers.data || []).forEach((t: { id: string; name: string; price: number }) => opts.push({ id: t.id, label: `${t.name} ($${(t.price / 100).toFixed(0)}/mo)`, type: 'tier' }));
      (products.data || []).forEach((p: { id: string; title: string; price: number }) => opts.push({ id: p.id, label: `${p.title} ($${(p.price / 100).toFixed(0)})`, type: 'product' }));
      setSources(opts);
    })();
    return () => { active = false; };
  }, [supabase, artistId]);

  // Keep source type aligned with the chosen deal type.
  useEffect(() => {
    if (!allowedSourceTypes.includes(form.revenueSourceType)) {
      patch({ revenueSourceType: allowedSourceTypes[0], revenueSourceId: '', revenueSourceLabel: '' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.dealType]);

  const sourceOptionsForType = sources.filter((s) => s.type === form.revenueSourceType);

  const warnings = useMemo(() => analyzeDeal({
    dealType: form.dealType,
    role: form.role,
    sourceType: form.revenueSourceType,
    percentage: meta.requiresPercentage ? Number(form.percentage) : null,
    payoutBasis: form.payoutBasis,
    capAmount: form.capEnabled && form.capAmount ? Math.round(parseFloat(form.capAmount) * 100) : null,
    durationDays: form.durationDays,
    hasDeliverables: deliverables.length > 0,
    artistFeePct,
  }), [form, deliverables, meta, artistFeePct]);

  const legalNote = dealTypeLegalNote(form.role, form.revenueSourceType);

  function canContinue(): boolean {
    switch (step) {
      case 1: return !!form.collaboratorName.trim();
      case 3: return meta.requiresSource ? !!form.revenueSourceId : true;
      case 4:
        if (meta.key === 'milestone_bonus') return !!form.milestoneAmount;
        return meta.requiresPercentage ? Number(form.percentage) > 0 : true;
      default: return true;
    }
  }

  async function submit(action: 'draft' | 'send') {
    setSubmitting(true); setError(null);
    try {
      const payload = {
        action,
        role: form.role,
        customRole: form.role === 'other' ? form.customRole : null,
        collaboratorName: form.collaboratorName.trim(),
        collaboratorEmail: form.collaboratorEmail.trim() || null,
        title: form.title.trim() || `${form.collaboratorName || 'Collaborator'} — ${meta.label}`,
        dealType: form.dealType,
        revenueSourceType: meta.requiresSource ? form.revenueSourceType : (form.revenueSourceType || 'none'),
        revenueSourceId: form.revenueSourceId || null,
        revenueSourceLabel: form.revenueSourceLabel || SOURCE_LABELS[form.revenueSourceType],
        payoutBasis: form.payoutBasis,
        percentage: meta.requiresPercentage ? Number(form.percentage) : null,
        milestoneAmount: form.milestoneAmount ? Math.round(parseFloat(form.milestoneAmount) * 100) : null,
        milestoneDescription: form.milestoneDescription || null,
        upfrontAmount: form.upfrontAmount ? Math.round(parseFloat(form.upfrontAmount) * 100) : null,
        capAmount: form.capEnabled && form.capAmount ? Math.round(parseFloat(form.capAmount) * 100) : null,
        durationDays: form.durationDays || null,
        startTrigger: form.startTrigger,
        holdPeriodDays: form.holdPeriodDays,
        payoutStartsAfterDeliverableApproval: form.payoutStartsAfterDeliverableApproval,
        cancellationPolicy: form.cancellationPolicy || null,
        rightsNotes: form.rightsNotes || null,
        externalAgreementUrl: form.externalAgreementUrl || null,
        agreementAccepted: action === 'send' ? form.agreementAccepted : false,
        deliverables: deliverables.filter((d) => d.title.trim()).map((d) => ({
          title: d.title.trim(), description: d.description || null, dueAt: d.dueAt || null, approvalRequired: d.approvalRequired,
        })),
      };
      const res = await fetch('/api/team-splits', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong.');
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-crwn-bg overflow-y-auto">
      <div className="max-w-lg mx-auto px-4 py-6 min-h-screen flex flex-col">
        {/* header */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={step === 0 ? onClose : () => setStep((s) => s - 1)} className="p-2 -ml-2 text-crwn-text-secondary hover:text-crwn-text">
            {step === 0 ? <X className="w-5 h-5" /> : <ArrowLeft className="w-5 h-5" />}
          </button>
          <p className="text-sm font-medium text-crwn-text-secondary">Team Split Builder</p>
          <button onClick={onClose} className="p-2 -mr-2 text-crwn-text-secondary hover:text-crwn-text"><X className="w-5 h-5" /></button>
        </div>
        {/* progress */}
        <div className="h-1 bg-crwn-elevated rounded-full mb-6 overflow-hidden">
          <div className="h-full bg-crwn-gold transition-all" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>

        <div className="flex-1">
          <h2 className="text-xl font-bold text-crwn-text mb-1">{STEPS[step]}</h2>

          {/* STEP 0 — role */}
          {step === 0 && (
            <div className="mt-4">
              <p className="text-sm text-crwn-text-secondary mb-4">Who are you bringing onto your team?</p>
              <div className="grid grid-cols-2 gap-2">
                {COLLABORATOR_ROLES.map((r) => (
                  <button key={r.key} onClick={() => patch({ role: r.key })}
                    className={`px-3 py-2.5 rounded-xl text-sm text-left transition-colors ${form.role === r.key ? 'bg-crwn-gold text-crwn-bg font-semibold' : 'bg-crwn-card text-crwn-text hover:bg-crwn-elevated'}`}>
                    {r.label}
                  </button>
                ))}
              </div>
              {form.role === 'other' && (
                <input value={form.customRole} onChange={(e) => patch({ customRole: e.target.value })} placeholder="Describe the role"
                  className="mt-3 w-full bg-crwn-card rounded-xl px-4 py-3 text-crwn-text placeholder:text-crwn-text-secondary outline-none" />
              )}
            </div>
          )}

          {/* STEP 1 — collaborator */}
          {step === 1 && (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-crwn-text-secondary mb-2">Who is this deal with?</p>
              <input value={form.collaboratorName} onChange={(e) => patch({ collaboratorName: e.target.value })} placeholder="Their name"
                className="w-full bg-crwn-card rounded-xl px-4 py-3 text-crwn-text placeholder:text-crwn-text-secondary outline-none" />
              <input value={form.collaboratorEmail} onChange={(e) => patch({ collaboratorEmail: e.target.value })} placeholder="Their email (to send the invite)" type="email"
                className="w-full bg-crwn-card rounded-xl px-4 py-3 text-crwn-text placeholder:text-crwn-text-secondary outline-none" />
              <p className="text-xs text-crwn-text-secondary">If they already have a CRWN account with this email, the deal links to them automatically. Otherwise they get an email invite to join and accept.</p>
            </div>
          )}

          {/* STEP 2 — deal type */}
          {step === 2 && (
            <div className="mt-4 space-y-2">
              {DEAL_TYPES.map((d) => (
                <button key={d.key} onClick={() => patch({ dealType: d.key })}
                  className={`w-full text-left px-4 py-3 rounded-xl transition-colors ${form.dealType === d.key ? 'bg-crwn-gold/15 border border-crwn-gold' : 'bg-crwn-card border border-transparent hover:bg-crwn-elevated'}`}>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-crwn-text">{d.label}</span>
                    {d.recommended && <span className="text-[10px] uppercase tracking-wide bg-crwn-gold text-crwn-bg px-1.5 py-0.5 rounded font-bold">Recommended</span>}
                    {d.highRisk && <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
                  </div>
                  <p className="text-xs text-crwn-text-secondary mt-1">{d.blurb}</p>
                </button>
              ))}
            </div>
          )}

          {/* STEP 3 — revenue source */}
          {step === 3 && (
            <div className="mt-4 space-y-3">
              {!meta.requiresSource ? (
                <p className="text-sm text-crwn-text-secondary">This deal type doesn’t attach to one specific source.</p>
              ) : (
                <>
                  {allowedSourceTypes.length > 1 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {allowedSourceTypes.filter((t) => t !== 'none' && t !== 'custom').map((t) => (
                        <button key={t} onClick={() => patch({ revenueSourceType: t, revenueSourceId: '', revenueSourceLabel: '' })}
                          className={`px-3 py-1.5 rounded-full text-xs ${form.revenueSourceType === t ? 'bg-crwn-gold text-crwn-bg font-semibold' : 'bg-crwn-card text-crwn-text-secondary'}`}>
                          {SOURCE_LABELS[t]}
                        </button>
                      ))}
                    </div>
                  )}
                  {form.revenueSourceType === 'all_earnings' ? (
                    <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 text-sm text-amber-200">
                      This shares a percentage of ALL your CRWN earnings. Advanced and high-risk — keep it small and short.
                    </div>
                  ) : sourceOptionsForType.length === 0 ? (
                    <p className="text-sm text-crwn-text-secondary">No {SOURCE_LABELS[form.revenueSourceType].toLowerCase()} found. Create one first, or pick a different source.</p>
                  ) : (
                    <div className="space-y-2">
                      {sourceOptionsForType.map((s) => (
                        <button key={s.id} onClick={() => patch({ revenueSourceId: s.id, revenueSourceLabel: s.label })}
                          className={`w-full text-left px-4 py-3 rounded-xl transition-colors ${form.revenueSourceId === s.id ? 'bg-crwn-gold/15 border border-crwn-gold' : 'bg-crwn-card border border-transparent'}`}>
                          <span className="text-crwn-text text-sm">{s.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {form.revenueSourceType === 'road_campaign' && (
                    <p className="text-xs text-crwn-text-secondary">A campaign share pays a percentage of all your CRWN revenue while this campaign is running.</p>
                  )}
                </>
              )}
            </div>
          )}

          {/* STEP 4 — split */}
          {step === 4 && (
            <div className="mt-4 space-y-4">
              {meta.key === 'milestone_bonus' ? (
                <>
                  <label className="block text-sm text-crwn-text-secondary">Bonus amount</label>
                  <div className="flex items-center bg-crwn-card rounded-xl px-4">
                    <span className="text-crwn-text-secondary">$</span>
                    <input value={form.milestoneAmount} onChange={(e) => patch({ milestoneAmount: e.target.value })} placeholder="250" inputMode="decimal"
                      className="w-full bg-transparent px-2 py-3 text-crwn-text outline-none" />
                  </div>
                  <input value={form.milestoneDescription} onChange={(e) => patch({ milestoneDescription: e.target.value })} placeholder="When is it paid? (e.g. 100 supporters)"
                    className="w-full bg-crwn-card rounded-xl px-4 py-3 text-crwn-text placeholder:text-crwn-text-secondary outline-none" />
                </>
              ) : (
                <>
                  <label className="block text-sm text-crwn-text-secondary">Their percentage</label>
                  <div className="flex items-center bg-crwn-card rounded-xl px-4">
                    <input value={form.percentage} onChange={(e) => patch({ percentage: Number(e.target.value) })} type="number" min={0} max={100}
                      className="w-full bg-transparent px-2 py-3 text-crwn-text outline-none" />
                    <span className="text-crwn-text-secondary">%</span>
                  </div>
                  <div>
                    <label className="block text-sm text-crwn-text-secondary mb-2">Calculated from</label>
                    <div className="flex gap-2">
                      {(['net_artist_revenue', 'gross_revenue'] as PayoutBasis[]).map((b) => (
                        <button key={b} onClick={() => patch({ payoutBasis: b })}
                          className={`flex-1 px-3 py-2.5 rounded-xl text-sm ${form.payoutBasis === b ? 'bg-crwn-gold text-crwn-bg font-semibold' : 'bg-crwn-card text-crwn-text'}`}>
                          {b === 'net_artist_revenue' ? 'Net (recommended)' : 'Gross'}
                        </button>
                      ))}
                    </div>
                  </div>
                  {meta.key === 'hybrid' && (
                    <div>
                      <label className="block text-sm text-crwn-text-secondary mb-1">Upfront payment (optional, paid outside CRWN)</label>
                      <div className="flex items-center bg-crwn-card rounded-xl px-4">
                        <span className="text-crwn-text-secondary">$</span>
                        <input value={form.upfrontAmount} onChange={(e) => patch({ upfrontAmount: e.target.value })} placeholder="100" inputMode="decimal"
                          className="w-full bg-transparent px-2 py-3 text-crwn-text outline-none" />
                      </div>
                    </div>
                  )}
                </>
              )}
              <LiveWarnings warnings={warnings} />
            </div>
          )}

          {/* STEP 5 — duration & cap */}
          {step === 5 && (
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm text-crwn-text-secondary mb-2">Duration</label>
                <div className="flex flex-wrap gap-2">
                  {[{ d: 90, l: '3 months' }, { d: 180, l: '6 months' }, { d: 365, l: '12 months' }].map((o) => (
                    <button key={o.d} onClick={() => patch({ durationDays: o.d })}
                      className={`px-3 py-2 rounded-full text-sm ${form.durationDays === o.d ? 'bg-crwn-gold text-crwn-bg font-semibold' : 'bg-crwn-card text-crwn-text'}`}>{o.l}</button>
                  ))}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm text-crwn-text-secondary">Payout cap</label>
                  <button onClick={() => patch({ capEnabled: !form.capEnabled })}
                    className={`text-xs px-2 py-1 rounded-full ${form.capEnabled ? 'bg-crwn-gold text-crwn-bg' : 'bg-crwn-card text-crwn-text-secondary'}`}>
                    {form.capEnabled ? 'On' : 'Off'}
                  </button>
                </div>
                {form.capEnabled && (
                  <div className="flex items-center bg-crwn-card rounded-xl px-4">
                    <span className="text-crwn-text-secondary">$</span>
                    <input value={form.capAmount} onChange={(e) => patch({ capAmount: e.target.value })} inputMode="decimal"
                      className="w-full bg-transparent px-2 py-3 text-crwn-text outline-none" />
                  </div>
                )}
                <p className="text-xs text-crwn-text-secondary mt-2">Caps protect you from unlimited long-term obligations. The deal completes once the cap is paid or the duration ends, whichever comes first.</p>
              </div>
              <LiveWarnings warnings={warnings} />
            </div>
          )}

          {/* STEP 6 — deliverables */}
          {step === 6 && (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-crwn-text-secondary">What does {form.collaboratorName || 'the collaborator'} have to deliver? Payouts can be held until these are approved.</p>
              {deliverables.map((d, i) => (
                <div key={i} className="bg-crwn-card rounded-xl p-3 space-y-2">
                  <div className="flex gap-2">
                    <input value={d.title} onChange={(e) => setDeliverables((ds) => ds.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} placeholder="Deliverable (e.g. Final edited video)"
                      className="flex-1 bg-transparent text-crwn-text placeholder:text-crwn-text-secondary outline-none" />
                    <button onClick={() => setDeliverables((ds) => ds.filter((_, j) => j !== i))} className="text-crwn-text-secondary hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <input type="date" value={d.dueAt} onChange={(e) => setDeliverables((ds) => ds.map((x, j) => j === i ? { ...x, dueAt: e.target.value } : x))}
                      className="bg-crwn-elevated rounded px-2 py-1 text-crwn-text-secondary outline-none" />
                    <label className="flex items-center gap-1 text-crwn-text-secondary">
                      <input type="checkbox" checked={d.approvalRequired} onChange={(e) => setDeliverables((ds) => ds.map((x, j) => j === i ? { ...x, approvalRequired: e.target.checked } : x))} />
                      Approval required
                    </label>
                  </div>
                </div>
              ))}
              <button onClick={() => setDeliverables((ds) => [...ds, { title: '', description: '', dueAt: '', approvalRequired: true }])}
                className="flex items-center gap-1.5 text-sm text-crwn-gold font-medium"><Plus className="w-4 h-4" /> Add deliverable</button>
            </div>
          )}

          {/* STEP 7 — protection */}
          {step === 7 && (
            <div className="mt-4 space-y-4">
              <label className="flex items-start gap-3 bg-crwn-card rounded-xl p-3">
                <input type="checkbox" className="mt-1" checked={form.payoutStartsAfterDeliverableApproval} onChange={(e) => patch({ payoutStartsAfterDeliverableApproval: e.target.checked })} />
                <span className="text-sm text-crwn-text">Only release payouts after required deliverables are approved</span>
              </label>
              <div>
                <label className="block text-sm text-crwn-text-secondary mb-1">Refund hold (days)</label>
                <input value={form.holdPeriodDays} type="number" min={0} onChange={(e) => patch({ holdPeriodDays: Number(e.target.value) })}
                  className="w-full bg-crwn-card rounded-xl px-4 py-3 text-crwn-text outline-none" />
                <p className="text-xs text-crwn-text-secondary mt-1">Earnings stay held this long so refunds/chargebacks can clear before cashout.</p>
              </div>
              <textarea value={form.rightsNotes} onChange={(e) => patch({ rightsNotes: e.target.value })} placeholder="Rights / usage notes (optional) — e.g. how the footage or beats may be used"
                className="w-full bg-crwn-card rounded-xl px-4 py-3 text-crwn-text placeholder:text-crwn-text-secondary outline-none min-h-[70px]" />
              <input value={form.externalAgreementUrl} onChange={(e) => patch({ externalAgreementUrl: e.target.value })} placeholder="Link to a separate written agreement (optional)"
                className="w-full bg-crwn-card rounded-xl px-4 py-3 text-crwn-text placeholder:text-crwn-text-secondary outline-none" />
              {legalNote && (
                <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-200">{legalNote}</div>
              )}
            </div>
          )}

          {/* STEP 8 — review */}
          {step === 8 && (
            <div className="mt-4 space-y-4">
              <input value={form.title} onChange={(e) => patch({ title: e.target.value })} placeholder={`${form.collaboratorName || 'Collaborator'} — ${meta.label}`}
                className="w-full bg-crwn-card rounded-xl px-4 py-3 text-crwn-text placeholder:text-crwn-text-secondary outline-none" />
              <div className="bg-crwn-card rounded-xl p-4 text-sm space-y-1.5">
                <Row k="Collaborator" v={`${form.collaboratorName || '—'}${form.collaboratorEmail ? ` (${form.collaboratorEmail})` : ''}`} />
                <Row k="Role" v={form.role === 'other' ? form.customRole || 'Custom' : COLLABORATOR_ROLES.find((r) => r.key === form.role)?.label || form.role} />
                <Row k="Deal" v={meta.label} />
                {meta.requiresSource && <Row k="Source" v={form.revenueSourceLabel || SOURCE_LABELS[form.revenueSourceType]} />}
                {meta.requiresPercentage && <Row k="Split" v={`${form.percentage}% of ${form.payoutBasis === 'gross_revenue' ? 'gross' : 'net'} revenue`} />}
                {meta.key === 'milestone_bonus' && <Row k="Bonus" v={`$${form.milestoneAmount || '0'}`} />}
                {form.capEnabled && form.capAmount && <Row k="Cap" v={`$${form.capAmount}`} />}
                <Row k="Duration" v={`${form.durationDays} days`} />
                <Row k="Deliverables" v={deliverables.filter((d) => d.title).length ? `${deliverables.filter((d) => d.title).length}` : 'None'} />
              </div>
              <LiveWarnings warnings={warnings} />
              <div className="bg-crwn-card rounded-xl p-4 text-xs text-crwn-text-secondary space-y-2 max-h-40 overflow-y-auto">
                {TEAM_SPLIT_DISCLAIMER_PARAGRAPHS.map((p, i) => <p key={i}>{p}</p>)}
              </div>
              <label className="flex items-start gap-3">
                <input type="checkbox" className="mt-1" checked={form.agreementAccepted} onChange={(e) => patch({ agreementAccepted: e.target.checked })} />
                <span className="text-sm text-crwn-text">I understand this is a record of my agreement, not legal advice, and I accept these terms.</span>
              </label>
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-400 mt-3">{error}</p>}

        {/* footer */}
        <div className="mt-6 flex gap-2 sticky bottom-0 bg-crwn-bg pt-2 pb-1">
          {step < STEPS.length - 1 ? (
            <button disabled={!canContinue()} onClick={() => setStep((s) => s + 1)}
              className="flex-1 bg-crwn-gold text-crwn-bg font-semibold py-3 rounded-full disabled:opacity-40">Continue</button>
          ) : (
            <>
              <button disabled={submitting} onClick={() => submit('draft')} className="px-4 py-3 rounded-full bg-crwn-card text-crwn-text text-sm">Save draft</button>
              <button disabled={submitting || !form.agreementAccepted || !form.collaboratorEmail} onClick={() => submit('send')}
                className="flex-1 bg-crwn-gold text-crwn-bg font-semibold py-3 rounded-full disabled:opacity-40 flex items-center justify-center gap-2">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Send deal
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-crwn-text-secondary">{k}</span>
      <span className="text-crwn-text text-right font-medium">{v}</span>
    </div>
  );
}

function LiveWarnings({ warnings }: { warnings: { code: string; level: string; message: string }[] }) {
  if (!warnings.length) return null;
  return (
    <div className="space-y-2">
      {warnings.map((w) => (
        <div key={w.code} className={`flex gap-2 rounded-xl p-2.5 text-xs ${w.level === 'high' ? 'bg-red-500/10 text-red-300' : w.level === 'warning' ? 'bg-amber-500/10 text-amber-200' : 'bg-crwn-elevated text-crwn-text-secondary'}`}>
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{w.message}</span>
        </div>
      ))}
    </div>
  );
}
