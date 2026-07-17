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

interface Popup {
  key: string;
  kind: 'modal' | 'banner' | 'survey';
  title: string;
  body: string;
  cta: { label: string; href: string } | null;
  dismissLabel: string;
  survey: PopupSurvey | null;
}

const GOLD = '#D4AF37';

export function PopupHost() {
  const pathname = usePathname();
  const router = useRouter();
  const [popup, setPopup] = useState<Popup | null>(null);
  const [rating, setRating] = useState<number | null>(null);
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

  const clickCta = () => {
    report(popup.key, 'clicked');
    const href = popup.cta?.href;
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
              {popup.cta.label}
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
  return (
    <div className="fixed inset-0 z-[95] flex items-end md:items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl bg-[#1A1A1A] border border-[#2A2A2A] shadow-2xl p-6 relative">
        <button
          onClick={close}
          aria-label="Close"
          className="absolute top-4 right-4 text-gray-500 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-xl font-bold text-white pr-8">{popup.title}</h2>
        <p className="text-gray-400 mt-2 text-sm leading-relaxed">{popup.body}</p>

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
                {popup.cta.label}
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
