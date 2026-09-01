'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, Upload, Check, Music2 } from 'lucide-react';
import { OptionSelect } from '@/components/ui/OptionSelect';
import { PRODUCER_SUBMISSION_AGREEMENT_VERSION } from '@/lib/producer/consent';
import type { SessionSubmission, SubmissionKind } from '@/types/producer';

interface Props {
  sessionId: string;
  prompt: string | null;
  deadline: string | null;
}

const KIND_OPTIONS = [
  { value: 'beat', label: 'A beat' },
  { value: 'vocal', label: 'A vocal or stem' },
  { value: 'idea', label: 'A song idea' },
  { value: 'reference', label: 'A reference link' },
  { value: 'other', label: 'Something else' },
];

const AUDIO_ACCEPT = '.mp3,.wav,.m4a,.aac,.ogg,.flac,.aiff,audio/*';

// Fan-facing submission form for an Executive Producer Session. A beat/vocal
// uploads to private R2 via a signed PUT, then a row is created. Ideas/references
// are text/link only. Only renders while the dark-launch flag is on and the
// session is accepting submissions before its deadline.
export function ProducerSubmitPanel({ sessionId, prompt, deadline }: Props) {
  const [mine, setMine] = useState<SessionSubmission[]>([]);
  const [kind, setKind] = useState<SubmissionKind>('beat');
  const [note, setNote] = useState('');
  const [title, setTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thanks, setThanks] = useState(false); // show a real success state after a send
  // Eligibility comes from the server, resolved by the same gate the write paths use.
  // null = still loading, so the form is never shown speculatively.
  const [canSubmit, setCanSubmit] = useState<boolean | null>(null);

  const wantsFile = kind === 'beat' || kind === 'vocal' || kind === 'other';

  const loadMine = useCallback(async () => {
    try {
      const res = await fetch(`/api/producer/submissions?sessionId=${sessionId}`);
      const data = await res.json();
      if (data.submissions) setMine(data.submissions);
      setCanSubmit(data.canSubmit === true);
    } catch {
      // A failed probe must not offer a form the server will refuse.
      setCanSubmit(false);
    }
  }, [sessionId]);

  useEffect(() => { loadMine(); }, [loadMine]);

  const deadlinePassed = !!deadline && new Date(deadline).getTime() < Date.now();

  const submit = async () => {
    setError(null);
    if (!agreed) { setError('Please confirm the submission terms first.'); return; }
    if (wantsFile && !file && !note.trim()) { setError('Add a file or a note.'); return; }
    if (!wantsFile && !note.trim() && !linkUrl.trim()) { setError('Add your idea or a link.'); return; }
    setSubmitting(true);
    try {
      let fileKey: string | null = null;
      if (wantsFile && file) {
        const signRes = await fetch('/api/producer/submissions/upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, filename: file.name, contentType: file.type || 'audio/mpeg', fileSize: file.size }),
        });
        const signed = await signRes.json();
        if (!signRes.ok) { setError(signed.error === 'no_access' ? 'You need a seat to submit.' : 'Could not start upload.'); setSubmitting(false); return; }
        const put = await fetch(signed.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type || 'audio/mpeg' }, body: file });
        if (!put.ok) { setError('Upload failed.'); setSubmitting(false); return; }
        fileKey = signed.key;
      }

      const res = await fetch('/api/producer/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId, kind, title: title.trim() || null, note: note.trim() || null,
          linkUrl: linkUrl.trim() || null, fileKey,
          fileName: file?.name || null, fileSize: file?.size || null, contentType: file?.type || null,
          consentVersion: PRODUCER_SUBMISSION_AGREEMENT_VERSION,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error === 'no_access' ? 'You need a seat to submit.' : data.error === 'closed' ? 'Submissions have closed.' : 'Could not submit.'); setSubmitting(false); return; }

      setNote(''); setTitle(''); setLinkUrl(''); setFile(null); setAgreed(false);
      setMine((prev) => [data.submission, ...prev]);
      setThanks(true); // a proper confirmation state, not a tiny counter line
    } finally {
      setSubmitting(false);
    }
  };

  // Still resolving: show nothing rather than a form that may be refused.
  if (canSubmit === null) return null;

  // In the room, but not on a submitting rung — or the artist allowed nobody to submit.
  // This is the fix for a Gold viewer being shown a full upload form and then told
  // "You need a seat", which is both wrong and insulting to someone who paid for one.
  // Their participation is real and named: they watch and they vote.
  if (!canSubmit) {
    return (
      <div className="rounded-2xl border border-crwn-elevated/60 p-4">
        <p className="text-crwn-text text-sm font-semibold">You&apos;re in for this one</p>
        <p className="text-crwn-text-secondary text-sm mt-1">
          Watch the session and vote on the calls as they happen. Sending in your own
          material is open to the top tier for this session.
        </p>
      </div>
    );
  }

  if (deadlinePassed) {
    return (
      <div className="rounded-2xl border border-crwn-elevated/60 p-4">
        <p className="text-crwn-text-secondary text-sm">Submissions for this session have closed.</p>
        {mine.length > 0 && <p className="text-crwn-text-secondary text-xs mt-1">You sent {mine.length}. The artist has it.</p>}
      </div>
    );
  }

  // A real success state after a send, instead of a tiny counter line under the button.
  if (thanks) {
    return (
      <div className="rounded-2xl border border-crwn-gold/40 bg-crwn-gold/10 p-6 text-center space-y-2">
        <div className="w-12 h-12 rounded-full bg-crwn-gold/20 flex items-center justify-center mx-auto">
          <Check className="w-6 h-6 text-crwn-gold" />
        </div>
        <h3 className="text-crwn-text font-bold text-lg">Sent to the session</h3>
        <p className="text-crwn-text-secondary text-sm">
          The artist will review it before the session starts. You&apos;ve sent {mine.length} so far.
        </p>
        <button
          onClick={() => setThanks(false)}
          className="mt-2 text-sm font-semibold text-crwn-gold hover:underline"
        >
          Send another
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-crwn-elevated/60 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Music2 className="w-4 h-4 text-crwn-gold" />
        <h3 className="text-crwn-text font-semibold">Send something to the session</h3>
      </div>
      {prompt && <p className="text-crwn-text-secondary text-sm">{prompt}</p>}

      <div>
        <label className="block text-crwn-text-secondary text-sm mb-1">What are you sending?</label>
        <OptionSelect
          value={kind}
          onChange={(v) => setKind(v as SubmissionKind)}
          options={KIND_OPTIONS}
        />
      </div>

      {wantsFile && (
        <label className="flex items-center gap-2 px-4 py-3 rounded-xl border border-dashed border-crwn-elevated cursor-pointer text-sm text-crwn-text-secondary">
          <Upload className="w-4 h-4" />
          {file ? file.name : 'Choose an audio file (max 100MB)'}
          <input type="file" accept={AUDIO_ACCEPT} className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </label>
      )}

      {(kind === 'reference') && (
        <input
          type="url"
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          placeholder="Paste a link (YouTube, Drive, etc.)"
          className="neu-inset w-full px-3 py-2 text-crwn-text placeholder-crwn-text-secondary focus:outline-none"
        />
      )}

      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (optional)"
        className="neu-inset w-full px-3 py-2 text-crwn-text placeholder-crwn-text-secondary focus:outline-none"
      />
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        placeholder={kind === 'idea' ? 'Your song idea, hook, or concept' : 'Anything the artist should know'}
        className="neu-inset w-full px-3 py-2 text-crwn-text placeholder-crwn-text-secondary focus:outline-none resize-none"
      />

      <label className="flex items-start gap-2 text-xs text-crwn-text-secondary cursor-pointer">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5" />
        <span>
          This is my own work or I have the rights to it, and I agree to the{' '}
          <a href="/submission-agreement" target="_blank" rel="noopener noreferrer" className="text-crwn-gold hover:underline">
            Session Submission Agreement
          </a>
          . I understand there is no guarantee it will be used, credited, or paid for, and the artist
          keeps full creative control.
        </span>
      </label>

      {error && <p className="text-crwn-error text-sm">{error}</p>}

      <button
        onClick={submit}
        disabled={submitting}
        className="neu-button-accent w-full py-2.5 rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
        {submitting ? 'Sending…' : 'Send it'}
      </button>

      {mine.length > 0 && (
        <p className="text-crwn-text-secondary text-xs text-center">You have sent {mine.length} to this session.</p>
      )}
    </div>
  );
}
