'use client';

import { useEffect, useState, useCallback } from 'react';
import { X, Loader2, Play, Download, Star, Check, Trash2, ExternalLink, FileAudio } from 'lucide-react';
import type { SessionSubmission, SubmissionStatus } from '@/types/producer';

interface Props {
  sessionId: string;
  sessionTitle: string;
  onClose: () => void;
}

const KIND_LABEL: Record<string, string> = {
  beat: 'Beat',
  vocal: 'Vocal',
  idea: 'Idea',
  reference: 'Reference',
  other: 'Other',
};

const FILTERS: { key: 'all' | SubmissionStatus; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'New' },
  { key: 'shortlisted', label: 'Shortlist' },
  { key: 'featured', label: 'Featured' },
  { key: 'rejected', label: 'Passed' },
];

// The artist's review queue for one session's fan submissions. Approve / shortlist
// / feature / pass, play or download the file, read the pitch. Owner-only (the API
// enforces it); this just renders and mutates.
export function SubmissionReviewPanel({ sessionId, sessionTitle, onClose }: Props) {
  const [subs, setSubs] = useState<SessionSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | SubmissionStatus>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [playUrl, setPlayUrl] = useState<{ id: string; url: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/producer/submissions?sessionId=${sessionId}`);
      const data = await res.json();
      setSubs(data.submissions || []);
    } catch {
      // leave prior state
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => { load(); }, [load]);

  const review = async (id: string, patch: { status?: SubmissionStatus; reviewNote?: string }) => {
    setBusyId(id);
    try {
      const res = await fetch('/api/producer/submissions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId: id, ...patch }),
      });
      const data = await res.json();
      if (data.submission) setSubs((prev) => prev.map((s) => (s.id === id ? data.submission : s)));
    } finally {
      setBusyId(null);
    }
  };

  const play = async (s: SessionSubmission) => {
    setBusyId(s.id);
    try {
      const res = await fetch(`/api/producer/submissions/file?id=${s.id}`);
      const data = await res.json();
      if (data.url) setPlayUrl({ id: s.id, url: data.url });
    } finally {
      setBusyId(null);
    }
  };

  const download = async (s: SessionSubmission) => {
    setBusyId(s.id);
    try {
      const res = await fetch(`/api/producer/submissions/file?id=${s.id}&download=1`);
      const data = await res.json();
      if (data.url) { const a = document.createElement('a'); a.href = data.url; a.rel = 'noopener'; a.click(); }
    } finally {
      setBusyId(null);
    }
  };

  const shown = filter === 'all' ? subs : subs.filter((s) => s.status === filter);
  const countFor = (k: 'all' | SubmissionStatus) => (k === 'all' ? subs.length : subs.filter((s) => s.status === k).length);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-crwn-surface-solid w-full sm:max-w-2xl sm:rounded-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-crwn-elevated">
          <div className="min-w-0">
            <h2 className="text-crwn-text font-semibold truncate">Submissions</h2>
            <p className="text-crwn-text-secondary text-xs truncate">{sessionTitle}</p>
          </div>
          <button onClick={onClose} className="text-crwn-text-secondary hover:text-crwn-text p-2"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex gap-1.5 px-4 py-2 border-b border-crwn-elevated overflow-x-auto">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${filter === f.key ? 'neu-button-accent' : 'neu-button text-crwn-text-secondary'}`}
            >
              {f.label} {countFor(f.key)}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 text-crwn-gold animate-spin" /></div>
          ) : shown.length === 0 ? (
            <p className="text-crwn-text-secondary text-sm text-center py-10">Nothing here yet.</p>
          ) : (
            shown.map((s) => (
              <div key={s.id} className="rounded-xl border border-crwn-elevated/60 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded text-[11px] font-semibold bg-crwn-elevated text-crwn-text-secondary">{KIND_LABEL[s.kind] || s.kind}</span>
                      {s.status === 'featured' && <span className="text-crwn-gold text-[11px] font-semibold flex items-center gap-0.5"><Star className="w-3 h-3 fill-crwn-gold" /> Featured</span>}
                      {s.status === 'shortlisted' && <span className="text-crwn-text text-[11px] font-semibold">Shortlisted</span>}
                      {s.status === 'rejected' && <span className="text-crwn-text-secondary text-[11px]">Passed</span>}
                    </div>
                    {s.title && <p className="text-crwn-text font-medium mt-1 truncate">{s.title}</p>}
                    {s.note && <p className="text-crwn-text-secondary text-sm mt-1 whitespace-pre-wrap break-words">{s.note}</p>}
                    {s.link_url && (
                      <a href={s.link_url} target="_blank" rel="noopener noreferrer" className="text-crwn-gold text-sm mt-1 inline-flex items-center gap-1 break-all">
                        <ExternalLink className="w-3.5 h-3.5" /> {s.link_url}
                      </a>
                    )}
                  </div>
                </div>

                {s.file_key && (
                  <div className="mt-2">
                    {playUrl?.id === s.id ? (
                      /* eslint-disable-next-line jsx-a11y/media-has-caption */
                      <audio src={playUrl.url} controls autoPlay className="w-full h-9" />
                    ) : (
                      <div className="flex items-center gap-2">
                        <button onClick={() => play(s)} disabled={busyId === s.id} className="neu-button px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50">
                          {busyId === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} Play
                        </button>
                        <button onClick={() => download(s)} disabled={busyId === s.id} className="neu-button px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50">
                          <Download className="w-3.5 h-3.5" /> Download
                        </button>
                        <span className="text-crwn-text-secondary text-xs flex items-center gap-1 truncate"><FileAudio className="w-3.5 h-3.5 shrink-0" />{s.file_name}</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-1.5 mt-3">
                  <button onClick={() => review(s.id, { status: 'featured' })} disabled={busyId === s.id} className="neu-button px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1 text-crwn-gold disabled:opacity-50" title="Feature">
                    <Star className="w-3.5 h-3.5" /> Feature
                  </button>
                  <button onClick={() => review(s.id, { status: 'shortlisted' })} disabled={busyId === s.id} className="neu-button px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1 disabled:opacity-50" title="Shortlist">
                    <Check className="w-3.5 h-3.5" /> Shortlist
                  </button>
                  <button onClick={() => review(s.id, { status: 'rejected' })} disabled={busyId === s.id} className="neu-button px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1 text-crwn-text-secondary disabled:opacity-50 ml-auto" title="Pass">
                    <Trash2 className="w-3.5 h-3.5" /> Pass
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
