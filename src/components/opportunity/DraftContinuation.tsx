'use client';

import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { getDeliverableSpec, type DraftValues } from '@/lib/opportunityDrafts/deliverableSpecs';

// The signup-boundary continuation: what they uncovered, then what they already built, then the
// form. Turns "create an account" into "save what you built".
//
// Reads the anonymous draft through the EXISTING public capability route (unclaimed-only, token in
// the URL the artist was already given). No new endpoint, no PII, no auth change: it renders the
// artist's own planning copy back to them.

interface DraftPayload {
  toolSlug?: string;
  values?: DraftValues;
  opportunitySummary?: string | null;
}

export function DraftContinuation({ token }: { token: string }) {
  const [draft, setDraft] = useState<DraftPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/opportunity-drafts/${encodeURIComponent(token)}`);
        if (!res.ok) return;
        const data = (await res.json()) as DraftPayload;
        if (!cancelled) setDraft(data);
      } catch {
        /* a missing draft simply renders nothing */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (!draft?.toolSlug) return null;
  const spec = getDeliverableSpec(draft.toolSlug);
  if (!spec) return null;

  // A draft saved before this tool's fields changed carries stale keys, so the server's sanitize
  // returns little or nothing. Fall back to the spec's generated defaults so the artist still sees
  // WHAT they built rather than an empty header. Their own values always win.
  const stored = draft.values || {};
  const hasStored = Object.values(stored).some((x) => (Array.isArray(x) ? x.length : String(x ?? '').length));
  const v: DraftValues = hasStored ? { ...spec.prefill({}), ...stored } : spec.prefill({});
  const asText = (x: unknown) => (typeof x === 'string' ? x : x == null ? '' : String(x));
  const asList = (x: unknown) => (Array.isArray(x) ? x.filter((i) => typeof i === 'string' && i.trim()) : []);

  // What they built, in the shape of the deliverable.
  const items: { title: string; detail?: string }[] = [];
  if (spec.preview.kind === 'ladder') {
    for (const t of spec.preview.tiers || []) {
      const name = asText(v[t.nameKey]);
      if (!name) continue;
      const price = t.priceKey ? v[t.priceKey] : undefined;
      const free = !t.priceKey || price === '' || price == null || Number(price) === 0;
      items.push({ title: name, detail: `${free ? 'Free' : `$${String(price)}/mo`} · ${asList(v[t.benefitsKey]).length} benefits` });
    }
  } else if (spec.preview.kind === 'campaigns') {
    for (const t of spec.preview.tiers || []) {
      const name = asText(v[t.nameKey]);
      if (name) items.push({ title: name, detail: 'Campaign message ready' });
    }
  } else {
    const title = spec.preview.titleKey ? asText(v[spec.preview.titleKey]) : '';
    if (title) items.push({ title });
    const bene = spec.preview.benefitsKey ? asList(v[spec.preview.benefitsKey]) : [];
    for (const b of bene.slice(0, 4)) items.push({ title: b });
  }

  const nothingToShow = !draft.opportunitySummary && items.length === 0;
  const claim = spec.claimLine || spec.signupContext;

  if (nothingToShow) {
    return (
      <div className="mb-5 rounded-2xl border border-crwn-gold/30 bg-crwn-gold/[0.06] p-4 text-center">
        <p className="text-sm text-crwn-text">{claim}</p>
      </div>
    );
  }

  // Deliberately compact: the founder needs the signup FORM above the fold, so this is one card,
  // not three. The number, how to claim it, and a one-line proof of what is already built.
  return (
    <div className="mb-5 rounded-2xl border border-crwn-gold/30 bg-crwn-gold/[0.08] px-4 py-4 text-center">
      {draft.opportunitySummary && (
        <div className="text-2xl sm:text-3xl font-bold text-crwn-gold leading-tight">
          {draft.opportunitySummary}
        </div>
      )}
      <p className="text-sm text-crwn-text mt-2 leading-snug">{claim}</p>
      {items.length > 0 && (
        <p className="text-xs text-crwn-text-secondary mt-2">
          {items.length} {items.length === 1 ? 'item' : 'items'} already built and waiting:{' '}
          {items.map((i) => i.title).filter(Boolean).slice(0, 4).join(', ')}
        </p>
      )}
      <p className="text-[11px] text-crwn-text-secondary mt-1">A planning estimate, not a guarantee.</p>
    </div>
  );
}
