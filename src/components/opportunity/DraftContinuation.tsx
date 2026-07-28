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

  const v = draft.values || {};
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

  return (
    <div className="mb-6 space-y-3">
      {draft.opportunitySummary && (
        <div className="rounded-2xl border border-crwn-gold/30 bg-crwn-gold/[0.08] p-4 text-center">
          <div className="text-xs uppercase tracking-wide text-crwn-text-secondary">What you uncovered</div>
          <div className="text-xl font-bold text-crwn-gold mt-1">{draft.opportunitySummary}</div>
        </div>
      )}

      {items.length > 0 && (
        <div className="rounded-2xl border border-crwn-elevated bg-crwn-surface p-4">
          <div className="text-sm font-semibold text-crwn-text mb-2">What you already built</div>
          <ul className="space-y-1.5">
            {items.map((it, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-crwn-text">
                <Check className="w-4 h-4 text-crwn-gold shrink-0 mt-0.5" />
                <span>
                  {it.title}
                  {it.detail && <span className="text-crwn-text-secondary"> · {it.detail}</span>}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-crwn-text-secondary mt-3">{spec.signupContext}</p>
        </div>
      )}
    </div>
  );
}
