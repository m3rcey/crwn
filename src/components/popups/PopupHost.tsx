'use client';

// PopupHost — the single client mount for the Pop-up Engine. It asks the server
// "is there one pop-up this user should see on this page?" and renders it. All the
// governing (one-per-day, frequency caps, targeting, dark-launch flag) happens
// server-side, so this component stays dumb: fetch, render, report the outcome.

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { X } from 'lucide-react';

interface PopupSurvey {
  question: string;
  lowLabel?: string;
  highLabel?: string;
  feedbackPrompt?: string;
}

interface PopupVisual {
  kind: 'progress';
  percent: number;
}

interface Popup {
  key: string;
  kind: 'modal' | 'banner' | 'survey';
  title: string;
  body: string;
  cta: { label: string; href: string; copyText?: string } | null;
  dismissLabel: string;
  survey: PopupSurvey | null;
  visual?: PopupVisual | null;
}

const GOLD = '#D4AF37';

/**
 * The one visual a CRWN pop-up may draw: the artist's ACTUAL progress, as a ring.
 *
 * Deliberately not a stock illustration. A picture earns its place here only if it says
 * something the sentence cannot, and a number the artist owns does exactly that: it is the
 * evidence for the claim being made, the way a dating app showing you your own liked photos
 * is evidence for "we are learning your type". Decoration on 20 pop-ups would be 20 assets
 * to keep on-brand and nothing gained.
 *
 * It animates on mount (the arc sweeps to the real value) because a ring that is simply
 * there reads as a static badge, while one that fills reads as progress.
 */
function ProgressRing({ percent }: { percent: number }) {
  const [drawn, setDrawn] = useState(false);
  const R = 42;
  const C = 2 * Math.PI * R;

  useEffect(() => {
    // Next frame, so the browser paints the empty arc first and the transition is visible.
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className="flex justify-center">
      <div className="relative w-28 h-28">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          <circle cx="50" cy="50" r={R} fill="none" stroke="#3A3A3A" strokeWidth="8" />
          <circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            stroke={GOLD}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={drawn ? C - (C * percent) / 100 : C}
            style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(0.22, 1, 0.36, 1)' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-white leading-none">{percent}%</span>
          <span className="text-[10px] uppercase tracking-wider text-gray-500 mt-1">done</span>
        </div>
      </div>
    </div>
  );
}

export function PopupHost() {
  const pathname = usePathname();
  const router = useRouter();
  const [popup, setPopup] = useState<Popup | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState('');
  const lastFetched = useRef<string>('');
  const shownFor = useRef<string>('');

  // Fetch at most once per pathname. The server decides whether anything shows.
  useEffect(() => {
    if (!pathname || lastFetched.current === pathname) return;
    lastFetched.current = pathname;
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/popups?page=${encodeURIComponent(pathname)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (active && data?.popup) {
          setPopup(data.popup);
          setRating(null);
          setFeedback('');
        }
      } catch {
        /* silent: a pop-up that cannot load is a pop-up that does not show */
      }
    })();
    return () => {
      active = false;
    };
  }, [pathname]);

  const report = useCallback(
    (key: string, action: string, extra?: { rating?: number; feedback?: string }) => {
      // Fire-and-forget; the UI never waits on the write.
      fetch('/api/popups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ popupKey: key, action, ...extra }),
      }).catch(() => {});
    },
    [],
  );

  // Record 'shown' exactly once per surfaced pop-up (arms the daily governor).
  useEffect(() => {
    if (popup && shownFor.current !== popup.key) {
      shownFor.current = popup.key;
      report(popup.key, 'shown');
    }
  }, [popup, report]);

  if (!popup) return null;

  const close = () => {
    report(popup.key, 'dismissed');
    setPopup(null);
  };

  const clickCta = async () => {
    report(popup.key, 'clicked');
    const href = popup.cta?.href;
    const copyText = popup.cta?.copyText;

    // COPY-style CTA: take something with you rather than go somewhere. Generic, not a Post-Win
    // special case. The pop-up stays open briefly so the artist sees the confirmation, because
    // closing instantly leaves them unsure whether the copy actually happened.
    if (copyText) {
      try {
        await navigator.clipboard.writeText(copyText);
        setCopied(true);
        setTimeout(() => setPopup(null), 1200);
        return;
      } catch {
        // Clipboard blocked (permissions, insecure context, older mobile browser). Fall through to
        // the href so the CTA still does something rather than appearing broken.
      }
    }

    setPopup(null);
    if (href) {
      if (href.startsWith('http')) window.location.href = href;
      else router.push(href);
    }
  };

  const submitSurvey = () => {
    if (rating == null) return;
    report(popup.key, 'completed', { rating, feedback: feedback.trim() || undefined });
    setPopup(null);
  };

  // ---- Banner: a slim strip, least intrusive ----
  if (popup.kind === 'banner') {
    return (
      <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-4 z-[90] px-4 md:pl-64">
        <div className="mx-auto max-w-2xl rounded-xl bg-[#1A1A1A] border border-[#2A2A2A] shadow-2xl p-4 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-sm">{popup.title}</p>
            <p className="text-gray-400 text-sm mt-0.5">{popup.body}</p>
          </div>
          {popup.cta && (
            <button
              onClick={clickCta}
              className="shrink-0 rounded-full px-4 py-2 text-sm font-semibold text-black"
              style={{ backgroundColor: GOLD }}
            >
              {copied ? "Link copied" : popup.cta.label}
            </button>
          )}
          <button onClick={close} aria-label="Dismiss" className="shrink-0 text-gray-500 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // ---- Modal + Survey: centered overlay ----
  //
  // CONTRAST IS THE POINT. This used to be a #1A1A1A card on a black/70 wash, which is the
  // SAME surface token as an ordinary card sitting on a page that is barely dimmed: the
  // interruption did not read as an interruption. A modal is the Elevated tier (#2A2A2A),
  // the backdrop is heavier and blurred so the page behind visibly recedes, and a real cast
  // shadow plus a faint gold ring separate the two planes. Dark-on-dark, but legibly layered:
  // a white card would read as a different product.
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
      <div
        className="guide-scale-in w-full max-w-md rounded-3xl bg-[#2A2A2A] p-7 relative ring-1 ring-[#D4AF37]/15"
        style={{ boxShadow: '0 24px 64px -12px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.04)' }}
      >
        <button
          onClick={close}
          aria-label="Close"
          className="absolute top-4 right-4 text-gray-500 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>

        {popup.kind === 'modal' && popup.visual?.kind === 'progress' && (
          <div className="mb-5 mt-1">
            <ProgressRing percent={popup.visual.percent} />
          </div>
        )}

        <h2 className="text-2xl font-bold text-white leading-tight pr-8">{popup.title}</h2>
        <p className="text-gray-300 mt-3 text-[15px] leading-relaxed">{popup.body}</p>

        {popup.kind === 'survey' && popup.survey ? (
          <div className="mt-5">
            <p className="text-sm text-gray-300 font-medium">{popup.survey.question}</p>
            <div className="flex items-center justify-between gap-2 mt-3">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setRating(n)}
                  className="flex-1 aspect-square rounded-lg text-sm font-semibold transition-colors"
                  style={
                    rating === n
                      ? { backgroundColor: GOLD, color: '#000' }
                      : { backgroundColor: '#2A2A2A', color: '#fff' }
                  }
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="flex justify-between text-xs text-gray-500 mt-1.5">
              <span>{popup.survey.lowLabel || '1'}</span>
              <span>{popup.survey.highLabel || '5'}</span>
            </div>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder={popup.survey.feedbackPrompt || 'Anything you want us to know?'}
              rows={3}
              className="mt-4 w-full rounded-lg bg-[#0D0D0D] border border-[#2A2A2A] p-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#D4AF37]"
            />
            <button
              onClick={submitSurvey}
              disabled={rating == null}
              className="mt-4 w-full rounded-full py-3 text-sm font-semibold text-black disabled:opacity-40"
              style={{ backgroundColor: GOLD }}
            >
              Send
            </button>
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-2">
            {popup.cta && (
              <button
                onClick={clickCta}
                className="w-full rounded-full py-3 text-sm font-semibold text-black"
                style={{ backgroundColor: GOLD }}
              >
                {copied ? "Link copied" : popup.cta.label}
              </button>
            )}
            <button onClick={close} className="w-full rounded-full py-3 text-sm font-medium text-gray-400 hover:text-white">
              {popup.dismissLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
