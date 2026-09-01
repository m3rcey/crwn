'use client';

// Member files: the artist's stem packs and other member-only downloads.
//
// Deliberately small. This is a delivery surface, not a project manager: a title, the
// files, and which rung gets them. Files upload straight to PRIVATE storage through a
// server-minted key, so nothing here ever holds a public URL.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Plus, Trash2, Download, FileAudio } from 'lucide-react';
import { TierAccessSelect } from '@/components/shared/TierAccessSelect';
import { MAX_FILES_PER_BUNDLE } from '@/lib/memberFiles/core';

interface Tier { id: string; name: string; price: number }
interface BundleFile { name: string; size: number | null }
interface Bundle {
  id: string;
  title: string;
  description: string | null;
  files: BundleFile[];
  allowedTierIds: string[];
  isActive: boolean;
}

function prettySize(bytes: number | null): string {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function MemberFilesManager() {
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tierIds, setTierIds] = useState<string[]>([]);
  const [staged, setStaged] = useState<Array<{ key: string; name: string; size: number; type: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/member-files');
      if (!res.ok) { setLoading(false); return; }
      const data = await res.json();
      setBundles(data.bundles || []);
      setTiers(data.tiers || []);
      setPending(!!data.pending);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const addFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    setError(null);
    setUploading(true);
    try {
      for (const file of Array.from(list).slice(0, MAX_FILES_PER_BUNDLE - staged.length)) {
        // The key is minted by the server under this artist's folder. The browser never
        // chooses where a file lands.
        const signRes = await fetch('/api/member-files/upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: file.name,
            contentType: file.type || 'application/octet-stream',
            fileSize: file.size,
          }),
        });
        const signed = await signRes.json().catch(() => ({}));
        if (!signRes.ok || !signed.uploadUrl) { setError(signed.error || 'Could not start upload.'); break; }

        const put = await fetch(signed.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
          body: file,
        });
        if (!put.ok) { setError(`${file.name} failed to upload.`); break; }

        setStaged((prev) => [...prev, {
          key: signed.key, name: file.name, size: file.size, type: file.type || '',
        }]);
      }
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/member-files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, files: staged, allowedTierIds: tierIds }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || 'Could not save that.'); return; }
      setTitle(''); setDescription(''); setStaged([]); setTierIds([]); setCreating(false);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string, name: string) => {
    if (!window.confirm(`Delete "${name}"? Members lose access to these files.`)) return;
    setBusy(true);
    try {
      await fetch(`/api/member-files?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      await load();
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (b: Bundle) => {
    setBusy(true);
    try {
      await fetch('/api/member-files', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: b.id, isActive: !b.isActive }),
      });
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 text-crwn-gold animate-spin" /></div>;
  }

  if (pending) {
    return (
      <div className="rounded-xl bg-crwn-surface p-4">
        <p className="text-sm text-crwn-text-secondary">
          Member downloads are not switched on yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-bold text-crwn-text">Member downloads</h3>
        <p className="text-sm text-crwn-text-secondary">
          Stems, packs and files your members can download. Everything here is private:
          only the tiers you pick can reach it.
        </p>
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      {bundles.map((b) => (
        <div key={b.id} className="rounded-xl bg-crwn-surface p-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-crwn-text">
                {b.title}
                {!b.isActive ? <span className="ml-2 text-xs text-crwn-text-secondary">(off)</span> : null}
              </p>
              {b.description ? <p className="text-xs text-crwn-text-secondary mt-0.5">{b.description}</p> : null}
              <p className="text-xs text-crwn-text-secondary/70 mt-1">
                {b.files.length} {b.files.length === 1 ? 'file' : 'files'}
                {b.files.length ? ` · ${b.files.map((f) => f.name).join(', ')}` : ''}
              </p>
            </div>
            <div className="flex gap-2 flex-wrap sm:shrink-0">
              <button
                disabled={busy}
                onClick={() => toggleActive(b)}
                className="text-xs px-3 py-1.5 rounded-full bg-crwn-surface-solid ring-1 ring-white/10 text-crwn-text disabled:opacity-50"
              >
                {b.isActive ? 'Turn off' : 'Turn on'}
              </button>
              <button
                disabled={busy}
                onClick={() => remove(b.id, b.title)}
                aria-label={`Delete ${b.title}`}
                className="p-2 rounded-full bg-crwn-surface-solid ring-1 ring-white/10 text-crwn-text disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="mt-3">
            <p className="text-[11px] text-crwn-text-secondary/70 mb-1.5">Who can download this:</p>
            <TierAccessSelect
              tiers={tiers}
              isFree={false}
              allowedTierIds={b.allowedTierIds}
              allowEveryone={false}
              onChange={({ allowedTierIds }) => {
                fetch('/api/member-files', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ id: b.id, allowedTierIds }),
                }).then(load);
              }}
            />
          </div>
        </div>
      ))}

      {creating ? (
        <div className="rounded-xl bg-crwn-surface p-4 space-y-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What is it? (Stems: Song #01)"
            className="w-full rounded-lg bg-crwn-surface-solid px-3 py-2 text-sm text-crwn-text outline-none"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Optional. What members get, in your words."
            className="w-full rounded-lg bg-crwn-surface-solid px-3 py-2 text-sm text-crwn-text outline-none"
          />

          <div>
            <input
              ref={fileInput}
              type="file"
              multiple
              onChange={(e) => addFiles(e.target.files)}
              className="block w-full text-xs text-crwn-text-secondary file:mr-3 file:py-2 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-crwn-surface-solid file:text-crwn-text"
            />
            <p className="text-[11px] text-crwn-text-secondary/70 mt-1">
              Up to {MAX_FILES_PER_BUNDLE} files, 200MB each. They upload privately as you pick them.
            </p>
            {uploading ? (
              <p className="text-xs text-crwn-gold mt-1 flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" /> Uploading...
              </p>
            ) : null}
            {staged.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {staged.map((f, i) => (
                  <li key={f.key} className="text-xs text-crwn-text flex items-center gap-2">
                    <FileAudio className="w-3.5 h-3.5 text-crwn-gold shrink-0" />
                    <span className="truncate">{f.name}</span>
                    <span className="text-crwn-text-secondary/70">{prettySize(f.size)}</span>
                    <button
                      onClick={() => setStaged((prev) => prev.filter((_, j) => j !== i))}
                      className="ml-auto text-crwn-text-secondary hover:text-crwn-text"
                      aria-label={`Remove ${f.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div>
            <p className="text-xs font-semibold text-crwn-text mb-1.5">Who can download this</p>
            <TierAccessSelect
              tiers={tiers}
              isFree={false}
              allowedTierIds={tierIds}
              allowEveryone={false}
              onChange={({ allowedTierIds }) => setTierIds(allowedTierIds)}
            />
          </div>

          <div className="flex gap-2">
            <button
              disabled={busy || !title.trim() || staged.length === 0 || tierIds.length === 0}
              onClick={create}
              className="px-4 py-2 rounded-full bg-crwn-gold text-crwn-bg text-sm font-semibold disabled:opacity-50"
            >
              Save
            </button>
            <button onClick={() => setCreating(false)} className="px-4 py-2 rounded-full text-sm text-crwn-text-secondary">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setCreating(true)} className="text-sm text-crwn-gold hover:underline flex items-center gap-1">
          <Plus className="w-4 h-4" /> Add member downloads
        </button>
      )}

      {bundles.length === 0 && !creating ? (
        <p className="text-xs text-crwn-text-secondary/70 flex items-center gap-1.5">
          <Download className="w-3.5 h-3.5" />
          Nothing yet. Stems are the usual first one.
        </p>
      ) : null}
    </div>
  );
}
