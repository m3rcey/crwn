'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft, Loader2, Users, DollarSign, UserPlus, Search, Check, X,
  Crown, Shield, Trash2, Target, Plus,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/shared/Toast';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { SQUAD_TYPE_MAP, VISIBILITY_LABELS, type SquadType } from '@/lib/squads';

interface Member {
  id: string; fan_id: string; role: string; status: string;
  display_name: string; avatar_url: string | null;
  contribution_score: number; revenue_generated: number; subscribers_attributed: number;
}
interface SquadDetail {
  squad: { id: string; name: string; type: SquadType; status: string; visibility: string; goal: string | null; badge_key: string | null; artist_id: string };
  members: Member[];
  missions: { mission_id: string; missions: { id: string; title: string; type: string; status: string } }[];
  stats: { activeMembers: number; pending: number; revenueGenerated: number; subscribersAttributed: number; missionsCompleted: number; clipsPosted: number };
}

export default function SquadDetailPage() {
  const router = useRouter();
  const params = useParams();
  const squadId = params?.id as string;
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const supabase = createBrowserSupabaseClient();

  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<SquadDetail | null>(null);
  const [tab, setTab] = useState<'members' | 'applications' | 'missions'>('members');

  // Add-member search
  const [showAdd, setShowAdd] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState<{ fan_id: string; display_name: string; email: string; avatar_url: string | null }[]>([]);
  const [searching, setSearching] = useState(false);
  const [artistId, setArtistId] = useState<string | null>(null);

  // Attach mission
  const [artistMissions, setArtistMissions] = useState<{ id: string; title: string }[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/squads/${squadId}`);
      const json = await res.json();
      if (!res.ok) { showToast(json.error || 'Not found', 'error'); router.push('/squads'); return; }
      setDetail(json);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [squadId, router, showToast]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace('/login'); return; }
    (async () => {
      const { data } = await supabase.from('artist_profiles').select('id').eq('user_id', user.id).maybeSingle();
      setArtistId(data?.id ?? null);
      if (data?.id) {
        const { data: ms } = await supabase.from('missions').select('id, title').eq('artist_id', data.id).eq('status', 'active');
        setArtistMissions(ms || []);
      }
    })();
    load();
  }, [authLoading, user, router, load, supabase]);

  // Debounced audience search
  useEffect(() => {
    if (!showAdd || !artistId || searchQ.trim().length < 2) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/audience?artistId=${artistId}&search=${encodeURIComponent(searchQ)}&limit=12`);
        const json = await res.json();
        // Leads (imported contacts) have no profiles row and can't be squad members — exclude them.
        setSearchResults((json.fans || [])
          .filter((f: any) => f.lifecycle !== 'lead')
          .slice(0, 8)
          .map((f: any) => ({ fan_id: f.fan_id, display_name: f.display_name, email: f.email, avatar_url: f.avatar_url })));
      } catch { /* silent */ } finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [searchQ, showAdd, artistId]);

  const addMember = async (fanId: string) => {
    try {
      const res = await fetch(`/api/squads/${squadId}/members`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fanId, status: 'active' }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      showToast('Member added', 'success');
      setSearchQ(''); setSearchResults([]); setShowAdd(false);
      load();
    } catch (e: any) { showToast(e.message || 'Failed', 'error'); }
  };

  const updateMember = async (memberId: string, patch: { role?: string; status?: string }) => {
    try {
      const res = await fetch(`/api/squads/${squadId}/members`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId, ...patch }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      load();
    } catch (e: any) { showToast(e.message || 'Failed', 'error'); }
  };

  const setStatus = async (status: string) => {
    try {
      await fetch(`/api/squads/${squadId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
      });
      load();
    } catch { showToast('Failed', 'error'); }
  };

  const attachMission = async (missionId: string) => {
    if (!missionId) return;
    await fetch(`/api/squads/${squadId}/missions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ missionId }),
    });
    load();
  };
  const detachMission = async (missionId: string) => {
    await fetch(`/api/squads/${squadId}/missions`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ missionId }),
    });
    load();
  };

  if (loading || authLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-crwn-gold" /></div>;
  }
  if (!detail) return null;

  const { squad, members, stats, missions } = detail;
  const def = SQUAD_TYPE_MAP[squad.type] || SQUAD_TYPE_MAP.custom;
  const active = members.filter(m => m.status === 'active');
  const pending = members.filter(m => m.status === 'applied' || m.status === 'invited');
  const attachedIds = new Set(missions.map(m => m.mission_id));
  const attachable = artistMissions.filter(m => !attachedIds.has(m.id));

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => router.push('/squads')} className="p-2 -ml-2 text-crwn-text-secondary hover:text-crwn-text"><ArrowLeft className="w-5 h-5" /></button>
        <span className="text-2xl">{def.icon}</span>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-crwn-text truncate">{squad.name}</h1>
          <p className="text-xs text-crwn-text-secondary">{VISIBILITY_LABELS[squad.visibility as keyof typeof VISIBILITY_LABELS]}</p>
        </div>
        <select value={squad.status} onChange={e => setStatus(e.target.value)}
          className="text-xs bg-crwn-card border border-crwn-elevated rounded-lg px-2 py-1.5 text-crwn-text">
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {squad.goal && <p className="text-sm text-crwn-text-secondary mb-4 bg-crwn-card rounded-xl px-4 py-3 border border-crwn-elevated">🎯 {squad.goal}</p>}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2 mb-5">
        <Stat icon={<Users className="w-4 h-4" />} label="Members" value={String(stats.activeMembers)} />
        <Stat icon={<DollarSign className="w-4 h-4" />} label="Revenue" value={`$${(stats.revenueGenerated / 100).toFixed(0)}`} />
        <Stat icon={<UserPlus className="w-4 h-4" />} label="Subs" value={String(stats.subscribersAttributed)} />
        <Stat icon={<Target className="w-4 h-4" />} label="Missions" value={String(stats.missionsCompleted)} />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4 border-b border-crwn-elevated">
        {(['members', 'applications', 'missions'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm font-medium capitalize border-b-2 -mb-px transition-colors ${
              tab === t ? 'border-crwn-gold text-crwn-gold' : 'border-transparent text-crwn-text-secondary'
            }`}>
            {t}{t === 'applications' && pending.length > 0 && <span className="ml-1 text-crwn-gold">({pending.length})</span>}
          </button>
        ))}
      </div>

      {tab === 'members' && (
        <div className="space-y-3">
          <button onClick={() => setShowAdd(v => !v)} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-crwn-elevated text-sm text-crwn-text-secondary hover:border-crwn-gold/40 hover:text-crwn-text">
            <UserPlus className="w-4 h-4" /> Add a fan
          </button>
          {showAdd && (
            <div className="bg-crwn-card rounded-xl border border-crwn-elevated p-3">
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-crwn-text-secondary" />
                <input value={searchQ} onChange={e => setSearchQ(e.target.value)} autoFocus placeholder="Search your fans by name or email"
                  className="w-full pl-9 pr-3 py-2 bg-crwn-elevated rounded-lg text-sm text-crwn-text placeholder:text-crwn-text-secondary focus:outline-none" />
              </div>
              {searching ? <Loader2 className="w-4 h-4 animate-spin text-crwn-gold mx-auto my-2" /> : searchResults.map(r => (
                <button key={r.fan_id} onClick={() => addMember(r.fan_id)} className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-crwn-elevated/50 text-left">
                  <div className="w-7 h-7 rounded-full bg-crwn-elevated flex items-center justify-center text-xs text-crwn-text-secondary">{r.display_name.charAt(0).toUpperCase()}</div>
                  <div className="min-w-0 flex-1"><p className="text-sm text-crwn-text truncate">{r.display_name}</p></div>
                  <Plus className="w-4 h-4 text-crwn-gold" />
                </button>
              ))}
            </div>
          )}
          {active.length === 0 ? <p className="text-sm text-crwn-text-secondary text-center py-6">No members yet.</p> :
            active.map(m => <MemberRow key={m.id} m={m} onRole={(role) => updateMember(m.id, { role })} onRemove={() => updateMember(m.id, { status: 'removed' })} />)}
        </div>
      )}

      {tab === 'applications' && (
        <div className="space-y-2">
          {pending.length === 0 ? <p className="text-sm text-crwn-text-secondary text-center py-6">No pending applications or invites.</p> :
            pending.map(m => (
              <div key={m.id} className="flex items-center gap-3 bg-crwn-card rounded-xl border border-crwn-elevated p-3">
                <div className="w-8 h-8 rounded-full bg-crwn-elevated flex items-center justify-center text-xs text-crwn-text-secondary">{m.display_name.charAt(0).toUpperCase()}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-crwn-text truncate">{m.display_name}</p>
                  <p className="text-xs text-crwn-text-secondary capitalize">{m.status}</p>
                </div>
                <button onClick={() => updateMember(m.id, { status: 'active' })} className="p-2 rounded-lg bg-crwn-gold/10 text-crwn-gold"><Check className="w-4 h-4" /></button>
                <button onClick={() => updateMember(m.id, { status: 'rejected' })} className="p-2 rounded-lg bg-crwn-elevated text-crwn-text-secondary"><X className="w-4 h-4" /></button>
              </div>
            ))}
        </div>
      )}

      {tab === 'missions' && (
        <div className="space-y-3">
          {attachable.length > 0 && (
            <select onChange={e => { attachMission(e.target.value); e.target.value = ''; }} defaultValue=""
              className="w-full bg-crwn-card border border-crwn-elevated rounded-xl px-3 py-2.5 text-sm text-crwn-text">
              <option value="" disabled>Attach a mission…</option>
              {attachable.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
            </select>
          )}
          {missions.length === 0 ? <p className="text-sm text-crwn-text-secondary text-center py-6">No missions attached. <button onClick={() => router.push('/missions/new')} className="text-crwn-gold">Create one</button>.</p> :
            missions.map(sm => (
              <div key={sm.mission_id} className="flex items-center gap-3 bg-crwn-card rounded-xl border border-crwn-elevated p-3">
                <Target className="w-4 h-4 text-crwn-gold shrink-0" />
                <div className="min-w-0 flex-1"><p className="text-sm text-crwn-text truncate">{sm.missions?.title || 'Mission'}</p><p className="text-xs text-crwn-text-secondary capitalize">{sm.missions?.type}</p></div>
                <button onClick={() => detachMission(sm.mission_id)} className="text-crwn-text-secondary hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-crwn-card rounded-xl p-2.5 text-center border border-crwn-elevated">
      <div className="flex justify-center text-crwn-text-secondary mb-1">{icon}</div>
      <p className="text-base font-bold text-crwn-text">{value}</p>
      <p className="text-[10px] text-crwn-text-secondary">{label}</p>
    </div>
  );
}

function MemberRow({ m, onRole, onRemove }: { m: Member; onRole: (role: string) => void; onRemove: () => void }) {
  const roleIcon = m.role === 'captain' ? <Crown className="w-3 h-3" /> : m.role === 'mod' || m.role === 'manager' ? <Shield className="w-3 h-3" /> : null;
  return (
    <div className="flex items-center gap-3 bg-crwn-card rounded-xl border border-crwn-elevated p-3">
      {m.avatar_url ? <img src={m.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" /> :
        <div className="w-8 h-8 rounded-full bg-crwn-elevated flex items-center justify-center text-xs text-crwn-text-secondary">{m.display_name.charAt(0).toUpperCase()}</div>}
      <div className="min-w-0 flex-1">
        <p className="text-sm text-crwn-text truncate flex items-center gap-1.5">{m.display_name} {roleIcon && <span className="text-crwn-gold">{roleIcon}</span>}</p>
        <p className="text-xs text-crwn-text-secondary">{m.subscribers_attributed} subs · ${(m.revenue_generated / 100).toFixed(0)}</p>
      </div>
      <select value={m.role} onChange={e => onRole(e.target.value)} className="text-xs bg-crwn-elevated rounded-lg px-2 py-1 text-crwn-text">
        <option value="member">Member</option>
        <option value="captain">Captain</option>
        <option value="mod">Mod</option>
        <option value="manager">Manager</option>
      </select>
      <button onClick={onRemove} className="text-crwn-text-secondary hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
    </div>
  );
}
