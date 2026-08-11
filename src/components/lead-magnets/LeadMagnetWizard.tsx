'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Wizard } from '@/components/ui/Wizard';
import { LeadMagnetField } from './LeadMagnetField';
import { validateStep, isInputVisible, isStepVisible } from '@/lib/leadMagnets/validation';
import { orderStepsForEntry, entryNote } from '@/lib/leadMagnets/entryContext';
import { LM_EVENTS, trackLeadMagnet, readUtm } from '@/lib/leadMagnets/analytics';
import type { LeadMagnetConfig, LeadMagnetInputValues } from '@/lib/leadMagnets/types';

type Value = string | number | boolean | string[] | null;

// Config-driven wizard engine. Owns values + step state, autosaves to localStorage,
// validates per step, and calls onComplete with the collected values. The last
// wizard step ("review") shows a summary before generating the result.
export function LeadMagnetWizard({
  config,
  initialValues,
  storageKey,
  context,
  entryContext = null,
  submitting = false,
  submitLabel = 'See my result',
  onComplete,
  onClose,
}: {
  config: LeadMagnetConfig;
  initialValues?: LeadMagnetInputValues;
  storageKey?: string;
  context: 'public' | 'artist';
  /** `?from=` value, when the visitor arrived from a specific opportunity's video or keyword. */
  entryContext?: string | null;
  submitting?: boolean;
  submitLabel?: string;
  onComplete: (values: LeadMagnetInputValues) => void;
  onClose?: () => void;
}) {
  const [values, setValues] = useState<LeadMagnetInputValues>(() => {
    if (initialValues) return initialValues;
    if (storageKey && typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem(storageKey);
        if (raw) return JSON.parse(raw);
      } catch {
        /* ignore */
      }
    }
    return {};
  });
  const [stepIndex, setStepIndex] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const started = useRef(false);

  // Entry context reorders (never adds or removes) the steps, then branching hides the ones whose
  // every input was branched away. Both are pure functions of the config + current answers, so the
  // progress bar and the Back button always agree with what is actually on screen.
  const orderedSteps = useMemo(() => orderStepsForEntry(config, entryContext), [config, entryContext]);
  const steps = useMemo(
    () => orderedSteps.filter((s) => isStepVisible(config, s.id, values)),
    [orderedSteps, config, values],
  );
  const safeIndex = Math.min(stepIndex, Math.max(0, steps.length - 1));
  const step = steps[safeIndex];
  const isReview = step?.id === 'review';
  const isLast = safeIndex >= steps.length - 1;
  const note = entryNote(config, entryContext);

  // Autosave (privacy-safe: local only, never a public DB write before consent).
  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(values));
    } catch {
      /* ignore quota */
    }
  }, [values, storageKey]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    trackLeadMagnet(LM_EVENTS.started, { toolSlug: config.slug, context, totalSteps: steps.length, ...readUtm() });
  }, [config.slug, context, steps.length]);

  const stepInputs = useMemo(
    () => config.inputs.filter((d) => d.step === step?.id && isInputVisible(d, values)),
    [config.inputs, step?.id, values],
  );

  const requiredOnStep = stepInputs.some((d) => d.required);
  const canSkip = !isReview && !requiredOnStep && stepInputs.length > 0;

  const setValue = (key: string, v: Value) => {
    setValues((prev) => ({ ...prev, [key]: v }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: '' } : prev));
  };

  const advance = () => {
    if (isReview || isLast) {
      onComplete(values);
      return;
    }
    const stepErrors = validateStep(config, step.id, values);
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors);
      return;
    }
    trackLeadMagnet(LM_EVENTS.stepCompleted, { toolSlug: config.slug, context, step: safeIndex + 1, totalSteps: steps.length });
    setStepIndex(Math.min(safeIndex + 1, steps.length - 1));
  };

  const goBack = () => {
    trackLeadMagnet(LM_EVENTS.stepBack, { toolSlug: config.slug, context, step: safeIndex + 1, totalSteps: steps.length });
    setStepIndex(Math.max(0, safeIndex - 1));
  };

  return (
    <Wizard
      steps={steps}
      currentIndex={safeIndex}
      title={step?.title}
      subtitle={step?.subtitle}
      onBack={goBack}
      onContinue={advance}
      onSkip={canSkip ? () => setStepIndex(Math.min(safeIndex + 1, steps.length - 1)) : undefined}
      continueLabel={isReview || isLast ? submitLabel : 'Continue'}
      continueLoading={submitting}
      onClose={onClose}
    >
      {note && safeIndex === 0 && (
        <p className="mb-5 rounded-xl bg-crwn-gold/10 border border-crwn-gold/25 px-3 py-2.5 text-xs text-crwn-gold">{note}</p>
      )}
      {isReview ? (
        <ReviewStep config={config} values={values} steps={steps} onEdit={setStepIndex} />
      ) : (
        <div className="space-y-6">
          {stepInputs.map((def) => (
            <div key={def.key}>
              <LeadMagnetField def={def} value={values[def.key] ?? null} onChange={(v) => setValue(def.key, v)} />
              {errors[def.key] && <p className="text-xs text-crwn-error mt-1.5">{errors[def.key]}</p>}
            </div>
          ))}
        </div>
      )}
    </Wizard>
  );
}

function ReviewStep({
  config,
  values,
  steps,
  onEdit,
}: {
  config: LeadMagnetConfig;
  values: LeadMagnetInputValues;
  steps: { id: string }[];
  onEdit: (i: number) => void;
}) {
  const rows = config.inputs
    .filter((d) => isInputVisible(d, values))
    .map((d) => ({ def: d, value: values[d.key] }))
    .filter((r) => r.value !== null && r.value !== undefined && r.value !== '' && !(Array.isArray(r.value) && r.value.length === 0));

  // Index into the VISIBLE, entry-ordered steps, not the raw config order, or "edit" jumps to the
  // wrong screen the moment a branch is hidden or an entry context reorders things.
  const stepIndexOf = (stepId: string) => steps.findIndex((s) => s.id === stepId);

  const display = (def: (typeof config.inputs)[number], value: unknown): string => {
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (def.type === 'currency') return `$${value}`;
    if (def.type === 'option' || def.type === 'binary') {
      const opt = def.options?.find((o) => o.value === value);
      return opt?.label ?? String(value);
    }
    return String(value);
  };

  return (
    <div className="space-y-1">
      {rows.map(({ def, value }) => (
        <button
          key={def.key}
          type="button"
          onClick={() => {
            const i = stepIndexOf(def.step);
            if (i >= 0) onEdit(i);
          }}
          className="w-full flex items-start justify-between gap-3 py-2.5 border-b border-crwn-elevated/60 text-left"
        >
          <span className="text-sm text-crwn-text-secondary shrink-0 max-w-[45%]">{def.label}</span>
          <span className="text-sm text-crwn-text text-right">{display(def, value)}</span>
        </button>
      ))}
      {/* A tool with NO questions at all (its result is the same for every artist) must not be told
          to go back and fill in steps that do not exist. Say plainly why there is nothing here. */}
      {rows.length === 0 && config.inputs.length === 0 && (
        <p className="text-sm text-crwn-text-secondary">Nothing to fill in. This result is the same for every artist.</p>
      )}
      {rows.length === 0 && config.inputs.length > 0 && (
        <p className="text-sm text-crwn-text-secondary">Add a few details on the previous steps to see your result.</p>
      )}
    </div>
  );
}
