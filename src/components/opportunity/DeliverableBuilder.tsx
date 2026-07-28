'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Lock } from 'lucide-react';
import { OptionSelect } from '@/components/ui/OptionSelect';
import { Wizard } from '@/components/ui/Wizard';
import { JOURNEY_EVENTS, trackOpportunity } from '@/lib/opportunityFunnels/analytics';
import {
  getDeliverableSpec,
  sanitizeDeliverableValues,
  specFields,
  type DeliverableSpec,
  type DeliverableField,
  type DraftValues,
} from '@/lib/opportunityDrafts/deliverableSpecs';

// The UNIVERSAL pre-signup deliverable builder.
//
// One component turns any tool's spec into an editable, previewable draft, so every public
// calculator ends in something worth saving instead of a signup button. It creates no live record:
// no publish, no payment, no upload, no contact import, no fan data. Signup is requested only at the
// save boundary, and the draft is persisted server-side first so the work survives authentication.

const lsKey = (slug: string) => `crwn_deliverable_${slug}`;

export interface DeliverableBuilderProps {
  toolSlug: string;
  /** The tool's own modeled config, used for honest prefill. */
  conversionPayload?: Record<string, unknown>;
  mode?: 'anonymous' | 'authenticated';
  initialValues?: DraftValues | null;
  initialToken?: string | null;
  /** Called at the save boundary with the durable draft token. */
  onSave: (token: string | null, values: DraftValues) => void;
  /** Overrides the spec's save label (e.g. "Publish" once authenticated). */
  saveLabel?: string;
}

export function DeliverableBuilder({
  toolSlug,
  conversionPayload = {},
  mode = 'anonymous',
  initialValues = null,
  initialToken = null,
  onSave,
  saveLabel,
}: DeliverableBuilderProps) {
  const spec = getDeliverableSpec(toolSlug);
  const [values, setValues] = useState<DraftValues>(() =>
    initialValues || (spec ? spec.prefill(conversionPayload) : {}),
  );
  const [index, setIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const tokenRef = useRef<string | null>(initialToken);
  const startedRef = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const analyticsBase = useMemo(() => ({ toolKey: toolSlug, opportunityKey: toolSlug }), [toolSlug]);

  // Instant restore from localStorage on refresh (server row remains the durable truth).
  useEffect(() => {
    if (mode !== 'anonymous' || initialValues || !spec) return;
    try {
      const raw = localStorage.getItem(lsKey(toolSlug));
      if (raw) {
        const parsed = JSON.parse(raw) as { token?: string; values?: unknown };
        if (parsed.token) tokenRef.current = parsed.token;
        if (parsed.values) setValues(sanitizeDeliverableValues(spec, parsed.values));
      }
    } catch {
      /* ignore malformed local draft */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!startedRef.current && spec) {
      startedRef.current = true;
      trackOpportunity(JOURNEY_EVENTS.preSignupBuilderStarted, analyticsBase);
    }
  }, [analyticsBase, spec]);

  if (!spec) return null;

  const persist = (next: DraftValues) => {
    if (mode !== 'anonymous') return;
    try {
      localStorage.setItem(lsKey(toolSlug), JSON.stringify({ token: tokenRef.current, values: next }));
    } catch {
      /* storage may be blocked */
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void sync(next), 700);
  };

  const sync = async (next: DraftValues) => {
    try {
      if (!tokenRef.current) {
        const res = await fetch('/api/opportunity-drafts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ toolSlug, values: next }),
        });
        const data = await res.json();
        if (res.ok && data.token) {
          tokenRef.current = data.token;
          try {
            localStorage.setItem(lsKey(toolSlug), JSON.stringify({ token: data.token, values: next }));
          } catch {
            /* ignore */
          }
        }
      } else {
        await fetch(`/api/opportunity-drafts/${encodeURIComponent(tokenRef.current)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ toolSlug, values: next }),
        });
      }
    } catch {
      /* persistence must never break the builder */
    }
  };

  const update = (key: string, v: string | number | string[]) => {
    setValues((cur) => {
      const next = { ...cur, [key]: v };
      persist(next);
      return next;
    });
  };

  const last = index >= spec.steps.length - 1;

  const next = async () => {
    trackOpportunity(JOURNEY_EVENTS.preSignupBuilderStepCompleted, { ...analyticsBase, variant: spec.steps[index].id });
    if (last) {
      trackOpportunity(JOURNEY_EVENTS.signupBoundaryReached, analyticsBase);
      // Guarantee the work is durably saved BEFORE we ask for identity.
      if (mode === 'anonymous' && !tokenRef.current) {
        setSaving(true);
        if (timer.current) clearTimeout(timer.current);
        await sync(values);
        setSaving(false);
      }
      onSave(tokenRef.current, values);
      return;
    }
    setIndex((i) => i + 1);
    trackOpportunity(JOURNEY_EVENTS.preSignupPreviewViewed, analyticsBase);
  };

  const step = spec.steps[index];

  return (
    <div className="space-y-4">
      <Wizard
        steps={spec.steps.map((s) => ({ id: s.id, group: s.group, label: s.label }))}
        currentIndex={index}
        title={spec.title}
        subtitle={spec.subtitle}
        onBack={index > 0 ? () => setIndex((i) => Math.max(0, i - 1)) : undefined}
        onContinue={() => void next()}
        continueLabel={last ? saveLabel || spec.saveLabel : 'Continue'}
        continueLoading={saving}
      >
        <div className="space-y-4">
          {step.fields.map((f) => (
            <Field key={f.key} field={f} value={values[f.key]} onChange={(v) => update(f.key, v)} />
          ))}
        </div>
      </Wizard>

      {/* The preview is always visible, so editing a field visibly changes the deliverable. */}
      <Preview spec={spec} values={values} />

      {mode === 'anonymous' && <NotPublishedNote spec={spec} />}
    </div>
  );
}

function Field({
  field,
  value,
  onChange,
}: {
  field: DeliverableField;
  value: string | number | string[] | undefined;
  onChange: (v: string | number | string[]) => void;
}) {
  const base =
    'w-full bg-crwn-surface border border-crwn-elevated rounded-xl px-4 py-3 text-base text-crwn-text placeholder-crwn-text-secondary/50 focus:outline-none focus:border-crwn-gold';
  return (
    <div>
      <label className="block text-sm font-semibold text-crwn-text mb-1">{field.label}</label>
      {field.help && <p className="text-xs text-crwn-text-secondary mb-2">{field.help}</p>}

      {field.type === 'option' ? (
        <OptionSelect
          options={field.options || []}
          value={typeof value === 'string' ? value : null}
          onChange={(v) => onChange(v)}
        />
      ) : field.type === 'textarea' ? (
        <textarea
          className={`${base} min-h-[96px]`}
          maxLength={field.max}
          placeholder={field.placeholder}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : field.type === 'lines' ? (
        <textarea
          className={`${base} min-h-[110px]`}
          placeholder={field.placeholder}
          value={Array.isArray(value) ? value.join('\n') : ''}
          onChange={(e) => onChange(e.target.value.split('\n'))}
        />
      ) : field.type === 'currency' || field.type === 'number' ? (
        <div className="relative">
          {field.type === 'currency' && (
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-crwn-text-secondary">$</span>
          )}
          <input
            type="number"
            inputMode="numeric"
            className={`${base} ${field.type === 'currency' ? 'pl-8' : ''}`}
            max={field.max}
            min={0}
            placeholder={field.placeholder}
            value={value === '' || value == null ? '' : String(value)}
            onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          />
        </div>
      ) : (
        <input
          className={base}
          maxLength={field.max}
          placeholder={field.placeholder}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

// ---- Preview -------------------------------------------------------------
function asList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()) : [];
}
function asText(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

function Preview({ spec, values }: { spec: DeliverableSpec; values: DraftValues }) {
  const p = spec.preview;
  const labelFor = (key: string) => specFields(spec).find((f) => f.key === key)?.label || key;

  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-crwn-text-secondary mb-2">Preview</div>
      <div className="rounded-2xl bg-crwn-surface-solid border border-crwn-elevated p-5">
        {p.kind === 'offer' && (
          <div className="text-center">
            <h3 className="text-lg font-bold text-crwn-text">{asText(values[p.titleKey || '']) || 'Your offer'}</h3>
            {p.subtitleKey && asText(values[p.subtitleKey]) && (
              <p className="text-sm text-crwn-text-secondary mt-1">{asText(values[p.subtitleKey])}</p>
            )}
            {p.priceKey && values[p.priceKey] !== '' && values[p.priceKey] != null && (
              <div className="mt-3 text-2xl font-bold text-crwn-gold">
                ${String(values[p.priceKey])}
                <span className="text-sm text-crwn-text-secondary font-normal"> / month</span>
              </div>
            )}
            {p.benefitsKey && asList(values[p.benefitsKey]).length > 0 && (
              <ul className="mt-4 space-y-1.5 text-left">
                {asList(values[p.benefitsKey]).map((b, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-crwn-text">
                    <Check className="w-4 h-4 text-crwn-gold shrink-0 mt-0.5" />
                    {b}
                  </li>
                ))}
              </ul>
            )}
            <Rows spec={spec} values={values} keys={p.itemKeys} labelFor={labelFor} />
          </div>
        )}

        {p.kind === 'page' && (
          <div className="mx-auto max-w-xs rounded-xl border border-crwn-elevated bg-crwn-bg p-4 text-center">
            <h3 className="text-lg font-bold text-crwn-text">{asText(values[p.titleKey || '']) || 'Your headline'}</h3>
            {p.subtitleKey && <p className="text-sm text-crwn-text-secondary mt-1">{asText(values[p.subtitleKey])}</p>}
            {p.benefitsKey && asList(values[p.benefitsKey]).length > 0 && (
              <ul className="mt-3 space-y-1 text-left">
                {asList(values[p.benefitsKey]).map((b, i) => (
                  <li key={i} className="text-sm text-crwn-text-secondary">• {b}</li>
                ))}
              </ul>
            )}
            <div className="mt-4 h-10 rounded-full bg-crwn-gold text-crwn-bg font-semibold flex items-center justify-center text-sm">
              {asText(values[p.ctaKey || '']) || 'Join'}
            </div>
            {p.secondaryCtaKey && asText(values[p.secondaryCtaKey]) && (
              <div className="mt-2 text-xs text-crwn-text-secondary underline">{asText(values[p.secondaryCtaKey])}</div>
            )}
          </div>
        )}

        {p.kind === 'list' && (
          <div>
            {p.titleKey && asText(values[p.titleKey]) && (
              <h3 className="text-base font-bold text-crwn-text mb-2">{asText(values[p.titleKey])}</h3>
            )}
            <Rows spec={spec} values={values} keys={p.itemKeys} labelFor={labelFor} />
          </div>
        )}

        {p.note && <p className="text-[11px] text-crwn-text-secondary mt-4">{p.note}</p>}
      </div>
    </div>
  );
}

function Rows({
  values,
  keys,
  labelFor,
}: {
  spec: DeliverableSpec;
  values: DraftValues;
  keys?: string[];
  labelFor: (k: string) => string;
}) {
  if (!keys?.length) return null;
  return (
    <div className="mt-3 space-y-2 text-left">
      {keys.map((k) => {
        const v = values[k];
        const list = asList(v);
        const text = asText(v);
        if (!list.length && !text) return null;
        return (
          <div key={k}>
            <div className="text-[11px] uppercase tracking-wide text-crwn-text-secondary">{labelFor(k)}</div>
            {list.length ? (
              <ul className="mt-0.5 space-y-0.5">
                {list.map((x, i) => (
                  <li key={i} className="text-sm text-crwn-text">• {x}</li>
                ))}
              </ul>
            ) : (
              <div className="text-sm text-crwn-text">{text}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function NotPublishedNote({ spec }: { spec: DeliverableSpec }) {
  return (
    <div className="rounded-2xl bg-crwn-surface border border-crwn-elevated p-4">
      <div className="text-sm font-semibold text-crwn-text mb-2">What is left before this is live</div>
      <div className="flex items-center gap-2 text-sm text-crwn-text mb-2">
        <span className="w-5 h-5 rounded-full bg-crwn-gold/20 text-crwn-gold flex items-center justify-center">
          <Check className="w-3.5 h-3.5" />
        </span>
        Your draft is built and saved on this device
      </div>
      {['Create your account to keep it', 'Publish it inside CRWN when it is ready'].map((t) => (
        <div key={t} className="flex items-center gap-2 text-sm text-crwn-text-secondary mb-1.5">
          <span className="w-5 h-5 rounded-full bg-crwn-surface-solid border border-crwn-elevated flex items-center justify-center">
            <Lock className="w-3 h-3" />
          </span>
          {t}
        </div>
      ))}
      <p className="text-xs text-crwn-text-secondary mt-2">
        This is planning, not publishing. Nothing is live, no fan is contacted, and no money moves until you publish it yourself.
      </p>
    </div>
  );
}
