'use client';

import { useRef, useState } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { Mic, Square, X, Loader2 } from 'lucide-react';

interface VoiceRecorderButtonProps {
  // Called with the uploaded public URL + duration once a recording is captured.
  onRecorded: (audioUrl: string, durationMs: number) => void;
  disabled?: boolean;
}

// Records a voice note with MediaRecorder, uploads it to the Supabase `audio`
// bucket (same bucket tracks use — audio/webm is whitelisted in uploadValidation),
// and hands the public URL + duration back to the caller to send. Self-contained
// so both 1:1 threads and broadcast can reuse it.
export function VoiceRecorderButton({ onRecorded, disabled }: VoiceRecorderButtonProps) {
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '');
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      cancelledRef.current = false;
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const durationMs = Date.now() - startedAtRef.current;
        stopTracks();
        setRecording(false);
        if (cancelledRef.current) return;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        void upload(blob, durationMs);
      };
      recorder.start();
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      setElapsed(0);
      setRecording(true);
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }, 250);
    } catch {
      setError('Mic blocked');
      stopTracks();
    }
  };

  const upload = async (blob: Blob, durationMs: number) => {
    // Guard against empty/too-short captures.
    if (blob.size < 1024 || durationMs < 500) { setError('Too short'); return; }
    setUploading(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError('Not signed in'); setUploading(false); return; }
      const ext = (blob.type.includes('ogg')) ? 'ogg' : 'webm';
      const path = `voice/${user.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('audio')
        .upload(path, blob, { contentType: blob.type || 'audio/webm', upsert: false });
      if (upErr) { setError('Upload failed'); setUploading(false); return; }
      const { data: pub } = supabase.storage.from('audio').getPublicUrl(path);
      if (!pub?.publicUrl) { setError('Upload failed'); setUploading(false); return; }
      onRecorded(pub.publicUrl, durationMs);
    } catch {
      setError('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const stop = () => recorderRef.current?.stop();
  const cancel = () => { cancelledRef.current = true; recorderRef.current?.stop(); };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  if (uploading) {
    return (
      <span className="p-2 flex items-center" title="Uploading voice note">
        <Loader2 className="w-4 h-4 animate-spin text-crwn-gold" />
      </span>
    );
  }

  if (recording) {
    return (
      <div className="flex items-center gap-1.5">
        <button onClick={cancel} className="p-2 text-crwn-text-secondary hover:text-crwn-error" aria-label="Cancel recording">
          <X className="w-4 h-4" />
        </button>
        <span className="text-crwn-error text-xs font-medium tabular-nums flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-crwn-error animate-pulse" /> {fmt(elapsed)}
        </span>
        <button onClick={stop} className="neu-button-accent p-2 rounded-xl" aria-label="Stop and send">
          <Square className="w-4 h-4" fill="currentColor" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={start}
      disabled={disabled}
      className="p-2 text-crwn-text-secondary hover:text-crwn-gold disabled:opacity-50"
      aria-label="Record voice note"
      title={error || 'Record voice note'}
    >
      <Mic className="w-4 h-4" />
    </button>
  );
}
