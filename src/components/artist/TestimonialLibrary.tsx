'use client';

// The artist's private testimonial library.
//
// TWO actions and no third: FEATURE (put it on my page) and HIDE. There is deliberately no edit
// control, because the artist decides whether a testimonial is shown and never what it says
// (TESTIMONIAL-001). The API route has no body parameter and the database reverts a body change,
// so this is the third of three lines rather than the only one.
//
// Counts are derived on read. No dashboard, no charts, no funnel: at this volume a header line is
// the whole of the useful measurement.

import { useCallback, useEffect, useState } from 'react';
import { MessageSquareQuote, Eye, EyeOff, Star, Loader2, ShieldCheck, Lock } from 'lucide-react';

interface LibraryTestimonial {
  id: string;
  body: string;
  displayName: string | null;
  verificationLabel: string | null;
  tenureLabel: string | null;
  contextKind: 'promise' | 'membership' | null;
  submittedAt: string;
  consentScope: 'private_to_artist' | 'crwn_only';
  publishable: boolean;
  featured: boolean;
  hidden: boolean;
  withdrawn: boolean;
  moderationStatus: string;
}

interface LibraryResponse {
  testimonials: LibraryTestimonial[];
  automationEnabled: boolean;
  counts: { total: number; publishable: number; featured: number; verified: number };
}

const CONTEXT_LABEL: Record<string, string> = {
  promise: 'After you delivered something you promised',
  membership: 'After a month on the inside',
};

export function TestimonialLibrary() {
  const [data, setData] = useState<LibraryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch('/api/artist/testimonials')
      .then((r) => r.json())
      .then((d) => { if (d?.testimonials) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const act = async (testimonialId: string, action: string) => {
    setBusyId(testimonialId);
    setError(null);
    try {
      const res = await fetch('/api/artist/testimonials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, testimonialId }),
      });
      const d = await res.json();
      if (!res.ok) setError(d?.error || 'Could not update that');
      else load();
    } catch {
      setError('Could not update that');
    } finally {
      setBusyId(null);
    }
  };

  const setAutomation = async (enabled: boolean) => {
    setError(null);
    try {
      await fetch('/api/artist/testimonials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set-automation', enabled }),
      });
      load();
    } catch {
      setError('Could not save that');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-crwn-gold" />
      </div>
    );
  }

  const items = data?.testimonials ?? [];
  const counts = data?.counts ?? { total: 0, publishable: 0, featured: 0, verified: 0 };

  return (
    <div className="space-y-5">
      {/* D4: the one setting. ON by default. Turning it off stops future asks and touches nothing
          that already exists. */}
      <div className="neu-raised rounded-xl p-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-crwn-text font-medium">Automatically ask fans for testimonials</p>
          <p className="text-xs text-crwn-text-secondary mt-1 max-w-lg">
            CRWN asks a supporter one question after they actually get something: a promise you
            delivered, or a month on the inside. Turn this off and nobody new gets asked. Nothing you
            already collected changes.
          </p>
        </div>
        <button
          onClick={() => setAutomation(!(data?.automationEnabled ?? true))}
          className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
            data?.automationEnabled
              ? 'bg-crwn-gold text-black'
              : 'bg-crwn-elevated text-crwn-text-secondary'
          }`}
        >
          {data?.automationEnabled ? 'On' : 'Off'}
        </button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {items.length === 0 ? (
        <div className="neu-raised rounded-xl p-8 text-center">
          <MessageSquareQuote className="w-12 h-12 text-crwn-gold/30 mx-auto mb-3" />
          <p className="text-crwn-text font-medium">No proof collected yet</p>
          <p className="text-sm text-crwn-text-secondary mt-2 max-w-md mx-auto">
            Right now the good things your supporters say live in DMs and disappear. Once you deliver
            something you promised, or a supporter passes a month, CRWN asks them one question and
            keeps their answer here.
          </p>
        </div>
      ) : (
        <>
          <p className="text-xs text-crwn-text-secondary">
            {counts.total} collected · {counts.verified} verified · {counts.featured} on your page
          </p>

          <div className="space-y-3">
            {items.map((t) => (
              <div key={t.id} className="neu-raised rounded-xl p-4">
                <p className="text-sm text-crwn-text whitespace-pre-wrap">{t.body}</p>

                <div className="flex flex-wrap items-center gap-2 mt-3 text-[11px]">
                  <span className="text-crwn-text-secondary font-medium">
                    {t.displayName ?? 'A verified supporter'}
                  </span>
                  {t.verificationLabel && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-crwn-gold/15 text-crwn-gold font-semibold">
                      <ShieldCheck className="w-3 h-3" />
                      {t.verificationLabel}
                    </span>
                  )}
                  {t.tenureLabel && (
                    <span className="text-crwn-text-secondary">{t.tenureLabel}</span>
                  )}
                  {t.contextKind && (
                    <span className="text-crwn-text-secondary">· {CONTEXT_LABEL[t.contextKind]}</span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 mt-3">
                  {t.withdrawn ? (
                    <span className="text-[11px] text-crwn-text-secondary inline-flex items-center gap-1">
                      <Lock className="w-3 h-3" /> This supporter took it back
                    </span>
                  ) : !t.publishable ? (
                    <span className="text-[11px] text-crwn-text-secondary inline-flex items-center gap-1">
                      <Lock className="w-3 h-3" /> Private feedback. They did not give permission to show it.
                    </span>
                  ) : (
                    <button
                      onClick={() => act(t.id, t.featured ? 'unfeature' : 'feature')}
                      disabled={busyId === t.id}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-40 ${
                        t.featured ? 'bg-crwn-gold text-black' : 'bg-crwn-elevated text-crwn-text'
                      }`}
                    >
                      <Star className="w-3 h-3" />
                      {t.featured ? 'On your page' : 'Put on my page'}
                    </button>
                  )}

                  {!t.withdrawn && (
                    <button
                      onClick={() => act(t.id, t.hidden ? 'unhide' : 'hide')}
                      disabled={busyId === t.id}
                      className="px-3 py-1.5 rounded-full text-xs font-semibold bg-crwn-elevated text-crwn-text-secondary inline-flex items-center gap-1 disabled:opacity-40"
                    >
                      {t.hidden ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                      {t.hidden ? 'Unhide' : 'Hide'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-crwn-text-secondary">
            You choose what gets shown. You cannot change what a supporter wrote, and they can take
            it back at any time.
          </p>
        </>
      )}
    </div>
  );
}
