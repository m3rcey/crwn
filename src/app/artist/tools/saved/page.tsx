'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Archive, Trash2 } from 'lucide-react';
import { smartBack } from '@/lib/navigation';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase/client';
import { useToast } from '@/components/shared/Toast';
import { getLeadMagnet } from '@/lib/leadMagnets/registry';

interface SavedRow {
  id: string;
  tool_slug: string;
  title: string | null;
  status: string;
  converted_feature_type: string | null;
  updated_at: string;
  archived_at: string | null;
}

export default function SavedResultsPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const { showToast } = useToast();
  const [rows, setRows] = useState<SavedRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async (artistId: string) => {
    const res = await fetch(`/api/lead-magnets/results?artistId=${artistId}`);
    const data = await res.json();
    if (res.ok) setRows(data.results || []);
    setLoading(false);
  };

  useEffect(() => {
    if (isLoading || !user) return;
    (async () => {
      const { data: ap } = await supabase.from('artist_profiles').select('id').eq('user_id', user.id).maybeSingle();
      if (ap?.id) await load(ap.id);
      else setLoading(false);
    })();
  }, [isLoading, user]);

  const archive = async (id: string) => {
    const res = await fetch(`/api/lead-magnets/results/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archive: true }) });
    if (res.ok) {
      setRows((r) => r.map((x) => (x.id === id ? { ...x, status: 'archived', archived_at: new Date().toISOString() } : x)));
      showToast('Archived', 'success');
    }
  };

  const remove = async (id: string) => {
    const res = await fetch(`/api/lead-magnets/results/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setRows((r) => r.filter((x) => x.id !== id));
      showToast('Deleted', 'success');
    }
  };

  const active = rows.filter((r) => !r.archived_at);
  const archived = rows.filter((r) => r.archived_at);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <button onClick={() => smartBack(router, '/artist/tools')} className="flex items-center gap-1.5 text-sm text-crwn-text-secondary mb-4">
        <ArrowLeft className="w-4 h-4" /> Tools
      </button>
      <h1 className="text-2xl font-bold text-crwn-text mb-1">Saved results</h1>
      <p className="text-sm text-crwn-text-secondary mb-6">Reopen, edit, or build them into CRWN.</p>

      {loading ? (
        <p className="text-sm text-crwn-text-secondary">Loading…</p>
      ) : active.length === 0 && archived.length === 0 ? (
        <p className="text-sm text-crwn-text-secondary">No saved results yet. Open a tool and save your first plan.</p>
      ) : (
        <>
          <div className="space-y-2">
            {active.map((r) => (
              <Row key={r.id} row={r} onOpen={() => router.push(`/artist/tools/${r.tool_slug}?resultId=${r.id}`)} onArchive={() => archive(r.id)} onDelete={() => remove(r.id)} />
            ))}
          </div>
          {archived.length > 0 && (
            <>
              <div className="text-xs font-semibold uppercase tracking-wide text-crwn-text-secondary mt-8 mb-3">Archived</div>
              <div className="space-y-2 opacity-60">
                {archived.map((r) => (
                  <Row key={r.id} row={r} onOpen={() => router.push(`/artist/tools/${r.tool_slug}?resultId=${r.id}`)} onDelete={() => remove(r.id)} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Row({ row, onOpen, onArchive, onDelete }: { row: SavedRow; onOpen: () => void; onArchive?: () => void; onDelete: () => void }) {
  const config = getLeadMagnet(row.tool_slug);
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-crwn-surface border border-crwn-elevated p-4">
      <span className="text-2xl shrink-0">{config?.icon ?? '🛠️'}</span>
      <button onClick={onOpen} className="flex-1 min-w-0 text-left">
        <span className="block text-sm font-semibold text-crwn-text truncate">{row.title || config?.name || 'Result'}</span>
        <span className="block text-xs text-crwn-text-secondary mt-0.5">
          {config?.name} · {new Date(row.updated_at).toLocaleDateString()}
          {row.status === 'converted' && <span className="text-crwn-gold"> · Built in CRWN</span>}
        </span>
      </button>
      {onArchive && (
        <button onClick={onArchive} aria-label="Archive" className="p-2 text-crwn-text-secondary">
          <Archive className="w-4 h-4" />
        </button>
      )}
      <button onClick={onDelete} aria-label="Delete" className="p-2 text-crwn-text-secondary">
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}
