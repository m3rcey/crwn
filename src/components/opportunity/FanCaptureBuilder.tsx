'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Mail, MessageSquare, Heart, Check, Lock } from 'lucide-react';
import { OptionSelect } from '@/components/ui/OptionSelect';
import { Wizard } from '@/components/ui/Wizard';
import { JOURNEY_EVENTS, trackOpportunity } from '@/lib/opportunityFunnels/analytics';
import {
  OYF_GOALS,
  OYF_CAPTURE_TYPES,
  sanitizeOwnYourFansDraft,
  type OwnYourFansDraft,
  type OyfCaptureType,
} from '@/lib/opportunityDrafts/ownYourFansDraft';

// The Own Your Fans pre-signup builder: an anonymous artist configures a fan-capture page (planning
// copy only, no fan data, no publishing) and previews it. The SAME component runs after signup on
// the plan page, so the artist resumes at the exact step. Publishing happens only in the real,
// ownership-gated smart-link surface (the `onFinish` action routes there); nothing here writes a
// live record, creates a Stripe object, or touches fan PII.

const GOAL_OPTIONS = [
  { value: OYF_GOALS[0], label: 'Grow an email list I own', icon: '📧' },
  { value: OYF_GOALS[1], label: 'Grow a text list I own', icon: '💬' },
  { value: OYF_GOALS[2], label: 'Turn fans into direct supporters', icon: '👑' },
];
const CAPTURE_OPTIONS = [
  { value: OYF_CAPTURE_TYPES[0], label: 'Collect emails', icon: '📧' },
  { value: OYF_CAPTURE_TYPES[1], label: 'Collect phone numbers', icon: '💬' },
  { value: OYF_CAPTURE_TYPES[2], label: 'Collect both', icon: '✅' },
];

const DEFAULT_DRAFT: OwnYourFansDraft = {
  goal: 'email_list',
  captureType: 'email',
  headline: 'Get everything first',
  subheadline: 'Join my list for unreleased music, early drops, and first access. No algorithm in the way.',
  ctaLabel: 'Join the list',
  primaryLink: '',
  step: 0,
};

const STEPS = [
  { id: 'goal', group: 'Plan', label: 'Goal' },
  { id: 'copy', group: 'Plan', label: 'Your words' },
  { id: 'capture', group: 'Plan', label: 'What you collect' },
  { id: 'preview', group: 'Preview', label: 'Preview' },
];

const LS_KEY = 'crwn_oyf_draft';

export interface FanCaptureBuilderProps {
  mode: 'anonymous' | 'authenticated';
  inputs: { social_followers: number };
  artistName?: string;
  initialToken?: string | null;
  initialDraft?: OwnYourFansDraft | null;
  /** Terminal action at the save/publish boundary. Receives the durable draft token (if any). */
  onFinish: (token: string | null, draft: OwnYourFansDraft) => void;
  finishLabel: string;
}

export function FanCaptureBuilder({
  mode,
  inputs,
  artistName,
  initialToken = null,
  initialDraft = null,
  onFinish,
  finishLabel,
}: FanCaptureBuilderProps) {
  const [draft, setDraft] = useState<OwnYourFansDraft>(() => initialDraft || DEFAULT_DRAFT);
  const [index, setIndex] = useState<number>(() => Math.min(initialDraft?.step ?? 0, STEPS.length - 1));
  const tokenRef = useRef<string | null>(initialToken);
  const startedRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const analyticsBase = useMemo(
    () => ({ opportunityKey: 'own-your-fans', toolKey: 'own-your-fans-calculator', resultVersion: 'lossResult@1' }),
    [],
  );

  // Anonymous: hydrate instantly from localStorage (survives a refresh even before the server round
  // trip returns). The server row remains the durable truth that survives auth and device changes.
  useEffect(() => {
    if (mode !== 'anonymous' || initialDraft) return;
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { token?: string; draft?: unknown };
        if (parsed.token) tokenRef.current = parsed.token;
        if (parsed.draft) {
          const d = sanitizeOwnYourFansDraft(parsed.draft);
          setDraft(d);
          setIndex(Math.min(d.step, STEPS.length - 1));
        }
      }
    } catch {
      /* ignore malformed local draft */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      trackOpportunity(JOURNEY_EVENTS.preSignupBuilderStarted, analyticsBase);
    }
  }, [analyticsBase]);

  // Persist (anonymous only): localStorage immediately + debounced server create/update. Never
  // blocks the UI; a network failure just leaves the local copy.
  const persist = (next: OwnYourFansDraft) => {
    if (mode !== 'anonymous') return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ token: tokenRef.current, draft: next }));
    } catch {
      /* storage may be full/blocked */
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void syncToServer(next), 600);
  };

  const syncToServer = async (next: OwnYourFansDraft) => {
    try {
      if (!tokenRef.current) {
        const res = await fetch('/api/opportunity-drafts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inputs, draft: next }),
        });
        const data = await res.json();
        if (res.ok && data.token) {
          tokenRef.current = data.token;
          try {
            localStorage.setItem(LS_KEY, JSON.stringify({ token: data.token, draft: next }));
          } catch {
            /* ignore */
          }
        }
      } else {
        await fetch(`/api/opportunity-drafts/${encodeURIComponent(tokenRef.current)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ draft: next }),
        });
      }
    } catch {
      /* analytics/persistence must never break the builder */
    }
  };

  const update = (patch: Partial<OwnYourFansDraft>) => {
    setDraft((d) => {
      const next = { ...d, ...patch, step: index };
      persist(next);
      return next;
    });
  };

  const [finishing, setFinishing] = useState(false);

  const goNext = async () => {
    trackOpportunity(JOURNEY_EVENTS.preSignupBuilderStepCompleted, { ...analyticsBase, variant: STEPS[index].id });
    if (index >= STEPS.length - 1) {
      trackOpportunity(JOURNEY_EVENTS.signupBoundaryReached, analyticsBase);
      // Guarantee the draft is durably saved (has a token) BEFORE the save boundary, so nothing
      // built is lost if the debounced sync had not fired yet.
      if (mode === 'anonymous' && !tokenRef.current) {
        setFinishing(true);
        if (saveTimer.current) clearTimeout(saveTimer.current);
        await syncToServer({ ...draft, step: index });
        setFinishing(false);
      }
      onFinish(tokenRef.current, { ...draft, step: index });
      return;
    }
    const nextIndex = index + 1;
    setIndex(nextIndex);
    const next = { ...draft, step: nextIndex };
    setDraft(next);
    persist(next);
    if (STEPS[nextIndex].id === 'preview') {
      trackOpportunity(JOURNEY_EVENTS.preSignupPreviewViewed, analyticsBase);
    }
  };

  const goBack = index > 0 ? () => setIndex((i) => Math.max(0, i - 1)) : undefined;
  const step = STEPS[index];

  return (
    <div className="space-y-5">
      <Wizard
        steps={STEPS}
        currentIndex={index}
        title="Build your fan page"
        subtitle="A place that is yours, that no app can take away. Nothing goes live until you choose to publish."
        onBack={goBack}
        onContinue={() => void goNext()}
        continueLabel={index >= STEPS.length - 1 ? finishLabel : 'Continue'}
        continueLoading={finishing}
      >
        {step.id === 'goal' && (
          <Field
            label="What do you want this page to do?"
            help="This decides what your page asks a fan for. You own whatever you collect."
          >
            <OptionSelect
              options={GOAL_OPTIONS}
              value={draft.goal}
              onChange={(v) => update({ goal: v as OwnYourFansDraft['goal'] })}
            />
          </Field>
        )}

        {step.id === 'copy' && (
          <div className="space-y-4">
            <Field label="Headline" help="The first thing a fan reads. Say what they get.">
              <TextInput value={draft.headline} maxLength={80} placeholder="Get everything first" onChange={(v) => update({ headline: v })} />
            </Field>
            <Field label="One line under it" help="Why it is worth their email or number.">
              <TextInput value={draft.subheadline} maxLength={160} placeholder="Unreleased music, early drops, first access." onChange={(v) => update({ subheadline: v })} />
            </Field>
            <Field label="Button label" help="What the button says.">
              <TextInput value={draft.ctaLabel} maxLength={40} placeholder="Join the list" onChange={(v) => update({ ctaLabel: v })} />
            </Field>
          </div>
        )}

        {step.id === 'capture' && (
          <Field
            label="What should fans hand you?"
            help="This is the contact you OWN. It moves with you if you ever leave a platform."
          >
            <OptionSelect
              options={CAPTURE_OPTIONS}
              value={draft.captureType}
              onChange={(v) => update({ captureType: v as OyfCaptureType })}
            />
          </Field>
        )}

        {step.id === 'preview' && (
          <div className="space-y-4">
            <CapturePreview draft={draft} artistName={artistName} />
            <LaunchChecklist mode={mode} />
          </div>
        )}
      </Wizard>
    </div>
  );
}

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-crwn-text mb-1">{label}</label>
      {help && <p className="text-xs text-crwn-text-secondary mb-2">{help}</p>}
      {children}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  maxLength,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <input
      value={value}
      maxLength={maxLength}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-crwn-surface border border-crwn-elevated rounded-xl px-4 py-3 text-base text-crwn-text placeholder-crwn-text-secondary/50 focus:outline-none focus:border-crwn-gold"
    />
  );
}

// The live preview of the public fan-capture card. Mirrors the smart-link editor's preview pane:
// dark card, headline, subhead, a greyed capture field, and a gold CTA. Renders copy as TEXT only.
function CapturePreview({ draft, artistName }: { draft: OwnYourFansDraft; artistName?: string }) {
  const showEmail = draft.captureType === 'email' || draft.captureType === 'both';
  const showPhone = draft.captureType === 'text' || draft.captureType === 'both';
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-crwn-text-secondary mb-2">Preview</div>
      <div className="rounded-2xl bg-crwn-surface-solid border border-crwn-elevated p-5 text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-crwn-gold/15 border border-crwn-gold/30 flex items-center justify-center text-crwn-gold">
          {draft.goal === 'paid_support' ? <Heart className="w-5 h-5" /> : showPhone && !showEmail ? <MessageSquare className="w-5 h-5" /> : <Mail className="w-5 h-5" />}
        </div>
        <div className="mt-2 text-xs text-crwn-text-secondary">{artistName || 'Your name'}</div>
        <h3 className="mt-1 text-lg font-bold text-crwn-text">{draft.headline || 'Your headline'}</h3>
        <p className="mt-1 text-sm text-crwn-text-secondary">{draft.subheadline || 'One line about why it is worth it.'}</p>
        <div className="mt-4 space-y-2">
          {showEmail && <div className="h-10 rounded-full bg-crwn-surface border border-crwn-elevated flex items-center px-4 text-sm text-crwn-text-secondary/60">Email address</div>}
          {showPhone && <div className="h-10 rounded-full bg-crwn-surface border border-crwn-elevated flex items-center px-4 text-sm text-crwn-text-secondary/60">Phone number</div>}
          <div className="h-11 rounded-full bg-crwn-gold text-crwn-bg font-semibold flex items-center justify-center">{draft.ctaLabel || 'Join'}</div>
        </div>
      </div>
    </div>
  );
}

// Honest planning-vs-publishing separator. Everything below the line needs an account and its own
// real requirements (publishing, payments, contacts); nothing here does any of it.
function LaunchChecklist({ mode }: { mode: 'anonymous' | 'authenticated' }) {
  const done = 'Your page is designed';
  const remaining = [
    'Create your account to save and own this page',
    'Publish it on your CRWN profile',
    'Connect payments if you want fans to support you',
    'Collect and own the contacts fans give you',
  ];
  return (
    <div className="rounded-2xl bg-crwn-surface border border-crwn-elevated p-4">
      <div className="text-sm font-semibold text-crwn-text mb-2">What is left before it goes live</div>
      <div className="flex items-center gap-2 text-sm text-crwn-text mb-2">
        <span className="w-5 h-5 rounded-full bg-crwn-gold/20 text-crwn-gold flex items-center justify-center"><Check className="w-3.5 h-3.5" /></span>
        {done}
      </div>
      {remaining.map((r) => (
        <div key={r} className="flex items-center gap-2 text-sm text-crwn-text-secondary mb-1.5">
          <span className="w-5 h-5 rounded-full bg-crwn-surface-solid border border-crwn-elevated flex items-center justify-center"><Lock className="w-3 h-3" /></span>
          {r}
        </div>
      ))}
      <p className="text-xs text-crwn-text-secondary mt-2">
        {mode === 'anonymous'
          ? 'This is planning, not publishing. Nothing is live and no one is contacted until you create your account and publish.'
          : 'Publishing, payments, and contacts each have their own steps inside CRWN.'}
      </p>
    </div>
  );
}
