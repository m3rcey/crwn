'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Lock, Copy, Plus, X } from 'lucide-react';
import { OptionSelect } from '@/components/ui/OptionSelect';
import { Wizard } from '@/components/ui/Wizard';
import { JOURNEY_EVENTS, OPPORTUNITY_EVENTS, trackOpportunity } from '@/lib/opportunityFunnels/analytics';
import { readCampaignAttribution } from '@/lib/leadMagnets/analytics';
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

/**
 * Merge a stored draft over this spec's generated defaults.
 *
 * Only fields the artist actually filled in survive; anything missing, empty, or belonging to an
 * older version of the spec falls back to the prefill. This is what keeps a builder from EVER
 * rendering blank after the deliverable's fields change.
 */
function mergeOverPrefill(
  spec: DeliverableSpec,
  cp: Record<string, unknown>,
  stored: unknown,
): DraftValues {
  const base = spec.prefill(cp);
  const saved = sanitizeDeliverableValues(spec, stored);
  const out: DraftValues = { ...base };
  for (const [k, v] of Object.entries(saved)) {
    const empty = v == null || v === '' || (Array.isArray(v) && v.length === 0);
    if (!empty) out[k] = v;
  }
  return out;
}

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
  /**
   * The headline number the tool just revealed (e.g. "$4,865/mo on the table"). Stored on the draft
   * so the signup boundary can restate the opportunity and the work in one fetch. Display text only.
   */
  opportunitySummary?: string;
}

export function DeliverableBuilder({
  toolSlug,
  conversionPayload = {},
  mode = 'anonymous',
  initialValues = null,
  initialToken = null,
  onSave,
  saveLabel,
  opportunitySummary,
}: DeliverableBuilderProps) {
  const spec = getDeliverableSpec(toolSlug);
  const [values, setValues] = useState<DraftValues>(() => {
    if (!spec) return {};
    // Same merge rule for a claimed draft restored after signup.
    return initialValues ? mergeOverPrefill(spec, conversionPayload, initialValues) : spec.prefill(conversionPayload);
  });
  const [index, setIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const tokenRef = useRef<string | null>(initialToken);
  const startedRef = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const analyticsBase = useMemo(() => ({ toolKey: toolSlug, opportunityKey: toolSlug }), [toolSlug]);

  // Instant restore from localStorage on refresh (server row remains the durable truth).
  //
  // BACKWARD COMPATIBILITY: a draft saved before this tool's fields changed only carries the OLD
  // keys, and sanitize drops anything outside the CURRENT spec. Replacing state with that result
  // emptied the builder (a pre-rewrite Streaming Loss draft wiped all four tiers). So a restored
  // draft is MERGED OVER the prefill: unknown/missing fields fall back to the generated defaults,
  // and the artist's own edits still win. Never replace, always merge.
  useEffect(() => {
    if (mode !== 'anonymous' || initialValues || !spec) return;
    try {
      const raw = localStorage.getItem(lsKey(toolSlug));
      if (raw) {
        const parsed = JSON.parse(raw) as { token?: string; values?: unknown };
        if (parsed.token) tokenRef.current = parsed.token;
        if (parsed.values) setValues(mergeOverPrefill(spec, conversionPayload, parsed.values));
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

  // Fires once, the first time an edit actually moves the number. Recording every keystroke would
  // drown the signal we care about: did the artist change the SHAPE of the plan, not the wording.
  const recalcValue = spec?.recalc ? spec.recalc(values, conversionPayload) : null;
  const recalcChanged = !!recalcValue?.changed;
  useEffect(() => {
    if (recalcChanged) trackOpportunity(OPPORTUNITY_EVENTS.estimateRecalculated, analyticsBase);
  }, [recalcChanged, analyticsBase]);

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
          // The tagged link that brought them, so a pre-signup draft carries the same attribution
          // an emailed result does. Re-normalized server-side before anything is stored.
          body: JSON.stringify({ toolSlug, values: next, opportunitySummary, attribution: readCampaignAttribution() }),
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
          body: JSON.stringify({ toolSlug, values: next, opportunitySummary }),
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
    trackOpportunity(OPPORTUNITY_EVENTS.recommendationEdited, { ...analyticsBase, variant: key });
  };

  const last = index >= spec.steps.length - 1;

  const next = async () => {
    trackOpportunity(JOURNEY_EVENTS.preSignupBuilderStepCompleted, { ...analyticsBase, variant: spec.steps[index].id });
    if (last) {
      trackOpportunity(JOURNEY_EVENTS.signupBoundaryReached, analyticsBase);
      // ALWAYS flush at the save boundary, even when a token already exists. Previously this only
      // ran when there was no token, so an artist resuming an older draft never wrote the latest
      // values or the opportunity summary, and the signup screen had no number to show.
      if (mode === 'anonymous') {
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
  const recalc = recalcValue;

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
        stickyFooter
      >
        <div className="space-y-4">
          {step.fields.map((f) => (
            <Field key={f.key} field={f} value={values[f.key]} onChange={(v) => update(f.key, v)} />
          ))}
        </div>
      </Wizard>

      {/* When the artist's edits move the money, the money moves on screen. A builder that keeps
          showing the calculator's original headline after they removed half the plan is telling
          them a number their own choices already invalidated. */}
      {recalc && (
        <div
          className={`rounded-2xl border p-4 text-center ${
            recalc.changed ? 'border-crwn-gold/40 bg-crwn-gold/[0.08]' : 'border-crwn-elevated bg-crwn-surface'
          }`}
        >
          <div className="text-xs uppercase tracking-wide text-crwn-text-secondary mb-1">
            {recalc.changed ? 'Updated for your edits' : 'Your plan is worth'}
          </div>
          <div className="text-2xl font-bold text-crwn-gold leading-tight">{recalc.value}</div>
          <p className="text-xs text-crwn-text-secondary mt-1">{recalc.label}</p>
          {recalc.note && <p className="text-xs text-crwn-text mt-2 leading-snug">{recalc.note}</p>}
        </div>
      )}

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

      {field.type === 'checklist' ? (
        <BenefitChecklist field={field} value={Array.isArray(value) ? value : []} onChange={onChange} />
      ) : field.type === 'option' ? (
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

function BenefitChecklist({
  field,
  value,
  onChange,
}: {
  field: DeliverableField;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [custom, setCustom] = useState('');
  // Everything the template offers, plus anything the artist typed in themselves.
  const options = (field.options || []).map((o) => o.value);
  const extras = value.filter((v) => !options.includes(v));
  const all = [...options, ...extras];

  const toggle = (label: string) => {
    onChange(value.includes(label) ? value.filter((v) => v !== label) : [...value, label]);
  };
  const add = () => {
    const t = custom.trim().slice(0, 200);
    if (!t || value.includes(t)) return;
    onChange([...value, t]);
    setCustom('');
  };

  return (
    <div className="space-y-2">
      {all.map((label) => {
        const on = value.includes(label);
        return (
          <button
            key={label}
            type="button"
            onClick={() => toggle(label)}
            aria-pressed={on}
            className={`w-full flex items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
              on ? 'border-crwn-gold/40 bg-crwn-gold/[0.06]' : 'border-crwn-elevated bg-crwn-surface opacity-60'
            }`}
          >
            <span
              className={`mt-0.5 w-5 h-5 rounded-md shrink-0 flex items-center justify-center border ${
                on ? 'bg-crwn-gold border-crwn-gold text-crwn-bg' : 'border-crwn-elevated text-transparent'
              }`}
            >
              <Check className="w-3.5 h-3.5" />
            </span>
            <span className={`text-sm ${on ? 'text-crwn-text' : 'text-crwn-text-secondary line-through'}`}>{label}</span>
          </button>
        );
      })}

      <div className="flex gap-2 pt-1">
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Add your own"
          maxLength={200}
          className="flex-1 bg-crwn-surface border border-crwn-elevated rounded-xl px-4 py-2.5 text-sm text-crwn-text placeholder-crwn-text-secondary/50 focus:outline-none focus:border-crwn-gold"
        />
        <button
          type="button"
          onClick={add}
          className="shrink-0 inline-flex items-center gap-1 px-4 rounded-xl bg-crwn-elevated text-crwn-text text-sm font-medium"
        >
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>
      <p className="text-xs text-crwn-text-secondary">
        {value.length} of {all.length} included. Tap any line to remove it.
      </p>
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

        {(p.kind === 'ladder' || p.kind === 'system') && (
          <div className="space-y-3">
            {(p.tiers || []).map((t) => {
              const price = t.priceKey ? values[t.priceKey] : undefined;
              const isFree = !t.priceKey || price === '' || price == null || Number(price) === 0;
              return (
                <div key={t.nameKey} className="rounded-xl border border-crwn-elevated bg-crwn-surface p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-semibold text-crwn-text">{asText(values[t.nameKey]) || 'Tier'}</span>
                    <span className={`text-sm font-bold ${isFree ? 'text-crwn-text-secondary' : 'text-crwn-gold'}`}>
                      {isFree ? 'Free' : `$${String(price)}/mo`}
                    </span>
                  </div>
                  {asList(values[t.benefitsKey]).length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {asList(values[t.benefitsKey]).map((b, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-crwn-text-secondary">
                          <Check className="w-3.5 h-3.5 text-crwn-gold shrink-0 mt-0.5" />
                          {b}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* The coordinated system: the ladder above, then everything that hangs off it, so the
            artist can see it is ONE business rather than a set of unrelated drafts. */}
        {p.kind === 'system' && (
          <div className="mt-4 pt-4 border-t border-crwn-elevated">
            <div className="text-xs font-semibold uppercase tracking-wide text-crwn-text-secondary mb-2">
              And how it all connects
            </div>
            <Rows spec={spec} values={values} keys={p.itemKeys} labelFor={labelFor} />
          </div>
        )}

        {p.kind === 'campaigns' && (
          <div className="space-y-3">
            {(p.tiers || []).map((t) => (
              <CampaignCard
                key={t.nameKey}
                name={asText(values[t.nameKey]) || 'Offer'}
                message={asText(values[t.benefitsKey])}
              />
            ))}
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

function CampaignCard({ name, message }: { name: string; message: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard may be blocked; the text is selectable either way */
    }
  };
  return (
    <div className="rounded-xl border border-crwn-elevated bg-crwn-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold text-crwn-text">{name}</span>
        <button
          onClick={copy}
          className="shrink-0 inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-crwn-elevated text-crwn-text"
        >
          <Copy className="w-3.5 h-3.5" />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {message && <p className="text-sm text-crwn-text-secondary mt-2 whitespace-pre-wrap">{message}</p>}
      <p className="text-[11px] text-crwn-text-secondary mt-2">
        Your personal share link is generated with your account, then it goes at the end of this message.
      </p>
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
