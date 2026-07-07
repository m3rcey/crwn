'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Loader2, Check, X, ExternalLink, FileText } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/shared/Toast';

interface Step {
  id: string; step_index: number; step_type: string; title: string; description: string | null;
  status: string; generated_payload: any; executed_resource_type: string | null; executed_resource_id: string | null;
}
interface Run { id: string; playbook_name: string; status: string; }

const resourceRoute: Record<string, string> = {
  squad: '/squads', bounty: '/bounties', city_unlock: '/city-unlocks', mission: '/missions',
};

export default function PlaybookRunPage() {
  const router = useRouter();
  const params = useParams();
  const runId = params?.runId as string;
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [run, setRun] = useState<Run | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/playbooks/runs/${runId}`);
      const json = await res.json();
      if (!res.ok) { showToast(json.error || 'Not found', 'error'); router.push('/playbooks'); return; }
      setRun(json.run); setSteps(json.steps || []);
    } catch { /* silent */ } finally { setLoading(false); }
  }, [runId, router, showToast]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace('/login'); return; }
    load();
  }, [authLoading, user, router, load]);

  const act = async (stepId: string, action: 'approve' | 'skip') => {
    setBusy(stepId);
    try {
      const res = await fetch(`/api/playbooks/runs/${runId}/steps`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stepId, action }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setSteps(json.steps || []);
      if (json.completed) showToast('Playbook complete', 'success');
    } catch (e: any) { showToast(e.message || 'Failed', 'error'); } finally { setBusy(null); }
  };

  if (loading || authLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-crwn-gold" /></div>;
  if (!run) return null;

  const done = steps.filter(s => ['executed', 'approved', 'skipped'].includes(s.status)).length;
  const pct = steps.length > 0 ? Math.round((done / steps.length) * 100) : 0;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => router.push('/playbooks')} className="p-2 -ml-2 text-crwn-text-secondary hover:text-crwn-text"><ArrowLeft className="w-5 h-5" /></button>
        <div className="flex-1 min-w-0"><h1 className="text-lg font-bold text-crwn-text truncate">{run.playbook_name}</h1><p className="text-xs text-crwn-text-secondary capitalize">{run.status} · {done}/{steps.length} done</p></div>
      </div>

      <div className="h-1.5 w-full rounded-full bg-crwn-elevated overflow-hidden mb-4">
        <div className="h-full bg-crwn-gold rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>

      <p className="text-xs text-crwn-text-secondary bg-crwn-card rounded-xl px-4 py-3 border border-crwn-elevated mb-5">
        Nothing is created or sent until you approve it. Approving a build step creates the real thing; message and post steps are drafts you send yourself.
      </p>

      <div className="space-y-3">
        {steps.map(s => {
          const isDraft = s.step_type === 'draft_message' || s.step_type === 'draft_post';
          const terminal = ['executed', 'approved', 'skipped', 'failed'].includes(s.status);
          return (
            <div key={s.id} className={`bg-crwn-card rounded-xl border p-4 ${s.status === 'failed' ? 'border-red-400/40' : terminal ? 'border-crwn-elevated opacity-80' : 'border-crwn-elevated'}`}>
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-crwn-text">{s.title}</p>
                  {s.description && <p className="text-xs text-crwn-text-secondary mt-0.5">{s.description}</p>}
                  {isDraft && s.generated_payload?.body && (
                    <div className="mt-2 flex items-start gap-2 bg-crwn-elevated/40 rounded-lg p-2.5">
                      <FileText className="w-3.5 h-3.5 text-crwn-text-secondary shrink-0 mt-0.5" />
                      <p className="text-xs text-crwn-text whitespace-pre-wrap">{s.generated_payload.body}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-3">
                {s.status === 'pending' ? (
                  <div className="flex gap-2">
                    <button onClick={() => act(s.id, 'approve')} disabled={busy === s.id} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-full bg-crwn-gold text-crwn-bg text-xs font-semibold disabled:opacity-50">
                      {busy === s.id ? '…' : <><Check className="w-3.5 h-3.5" /> {isDraft ? 'Approve draft' : 'Approve & create'}</>}
                    </button>
                    <button onClick={() => act(s.id, 'skip')} disabled={busy === s.id} className="px-4 py-2 rounded-full bg-crwn-elevated text-crwn-text-secondary text-xs font-medium">Skip</button>
                  </div>
                ) : s.status === 'skipped' ? (
                  <span className="text-xs text-crwn-text-secondary inline-flex items-center gap-1"><X className="w-3.5 h-3.5" /> Skipped</span>
                ) : s.status === 'failed' ? (
                  <button onClick={() => act(s.id, 'approve')} className="text-xs text-red-400">Failed — retry</button>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-crwn-gold inline-flex items-center gap-1"><Check className="w-3.5 h-3.5" /> {s.status === 'executed' ? 'Created' : 'Approved'}</span>
                    {s.executed_resource_type && resourceRoute[s.executed_resource_type] && (
                      <button onClick={() => router.push(resourceRoute[s.executed_resource_type!])} className="text-xs text-crwn-text-secondary inline-flex items-center gap-1">View <ExternalLink className="w-3 h-3" /></button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
