'use client';

// Fan detail drawer for the Fan Growth CRM. Opens from a FanTable row. Shows the
// fan's score breakdown, contribution history, badges, notes, recent activity,
// and artist->fan actions. Reuses the live scores from /api/audience (passed in
// as `fan`) and loads the rest from /api/crm/fan. Mobile: full-screen sheet.

import { useState, useEffect, useCallback } from 'react';
import { AudienceFan } from '@/types';
import { useToast } from '@/components/shared/Toast';
import {
  X, Loader2, Star, MessageSquare, Award, Heart, TrendingDown, TrendingUp,
  MapPin, Trash2, StickyNote, Sparkles,
} from 'lucide-react';

interface FanBadge { id: string; badge_key: string; label: string; icon: string | null; awarded_at: string; }
interface FanNote { id: string; note: string; created_at: string; }
interface FanAction { id: string; action_type: string; status: string; created_at: string; metadata: any; }
interface FanEvent { event_type: string; source: string | null; ref_kind: string | null; value: number; created_at: string; }
interface Contribution {
  subscriptionStatus: string;
  tierName: string | null;
  subscriptionLengthDays: number | null;
  referralCount: number;
  badgeCount: number;
  eventCount: number;
}

interface FanDetailBundle {
  notes: FanNote[];
  actions: FanAction[];
  badges: FanBadge[];
  events: FanEvent[];
  contribution: Contribution;
}

interface FanDetailDrawerProps {
  fan: AudienceFan | null;
  isOpen: boolean;
  onClose: () => void;
}

const scoreColor = (score: number, invert = false) => {
  const high = invert ? 'text-red-400' : 'text-green-400';
  const low = invert ? 'text-crwn-text-secondary' : 'text-crwn-text-secondary';
  if (score >= 60) return high;
  if (score >= 30) return 'text-orange-400';
  return low;
};

export function FanDetailDrawer({ fan, isOpen, onClose }: FanDetailDrawerProps) {
  const { showToast } = useToast();
  const [bundle, setBundle] = useState<FanDetailBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const isLead = fan?.lifecycle === 'lead';

  const load = useCallback(async () => {
    if (!fan) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/crm/fan?fanId=${fan.fan_id}`);
      const json = await res.json();
      if (res.ok) setBundle(json);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [fan]);

  useEffect(() => {
    if (isOpen && fan) { setBundle(null); load(); }
  }, [isOpen, fan, load]);

  const addNote = async () => {
    if (!fan || !noteText.trim()) return;
    setSavingNote(true);
    try {
      const res = await fetch('/api/crm/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fanId: fan.fan_id, note: noteText.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setNoteText('');
      setBundle(b => b ? { ...b, notes: [json.note, ...b.notes] } : b);
    } catch (e: any) {
      showToast(e.message || 'Failed to save note', 'error');
    } finally {
      setSavingNote(false);
    }
  };

  const deleteNote = async (id: string) => {
    setBundle(b => b ? { ...b, notes: b.notes.filter(n => n.id !== id) } : b);
    await fetch('/api/crm/notes', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  };

  const runAction = async (actionType: string, metadata: any = {}, successMsg?: string) => {
    if (!fan) return;
    setBusyAction(actionType);
    try {
      const res = await fetch('/api/crm/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fanId: fan.fan_id, actionType, metadata }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      showToast(successMsg || 'Done', 'success');
      load();
    } catch (e: any) {
      showToast(e.message || 'Action failed', 'error');
    } finally {
      setBusyAction(null);
    }
  };

  if (!isOpen || !fan) return null;

  const c = bundle?.contribution;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div
        className="relative w-full sm:max-w-md bg-crwn-bg h-full overflow-y-auto border-l border-crwn-elevated"
        style={{ animation: 'slideIn 0.25s ease-out' }}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-crwn-bg/95 backdrop-blur border-b border-crwn-elevated px-5 py-4 flex items-center gap-3">
          {fan.avatar_url ? (
            <img src={fan.avatar_url} alt="" className="w-11 h-11 rounded-full object-cover" />
          ) : (
            <div className="w-11 h-11 rounded-full bg-crwn-elevated flex items-center justify-center text-sm text-crwn-text-secondary font-medium">
              {fan.display_name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-crwn-text truncate">{fan.display_name}</p>
            <p className="text-xs text-crwn-text-secondary truncate">{fan.email || '–'}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-crwn-text-secondary hover:text-crwn-text press-scale">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-6">
          {/* Status row */}
          <div className="flex flex-wrap items-center gap-2">
            {fan.is_subscriber && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-crwn-gold/10 text-crwn-gold">
                <Star className="w-3 h-3" /> {fan.tier_name || 'Subscriber'}
              </span>
            )}
            {(fan.city || fan.country) && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs text-crwn-text-secondary bg-crwn-elevated">
                <MapPin className="w-3 h-3" /> {[fan.city, fan.state, fan.country].filter(Boolean).join(', ')}
              </span>
            )}
          </div>

          {/* Score cards */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-crwn-card rounded-xl p-3 text-center">
              <p className="text-xs text-crwn-text-secondary mb-1">Engagement</p>
              <p className="text-lg font-bold text-crwn-gold">{fan.engagement_score}</p>
            </div>
            <div className="bg-crwn-card rounded-xl p-3 text-center">
              <p className="text-xs text-crwn-text-secondary mb-1 flex items-center justify-center gap-1"><TrendingDown className="w-3 h-3" />Churn risk</p>
              <p className={`text-lg font-bold ${scoreColor(fan.churn_risk_score, true)}`}>{fan.churn_risk_score}</p>
            </div>
            <div className="bg-crwn-card rounded-xl p-3 text-center">
              <p className="text-xs text-crwn-text-secondary mb-1 flex items-center justify-center gap-1"><TrendingUp className="w-3 h-3" />Upgrade</p>
              <p className={`text-lg font-bold ${scoreColor(fan.upgrade_likelihood_score)}`}>{fan.upgrade_likelihood_score}</p>
            </div>
          </div>

          {/* Contribution */}
          <div>
            <h4 className="text-xs font-semibold text-crwn-text-secondary uppercase tracking-wider mb-2">Contribution</h4>
            <div className="bg-crwn-card rounded-xl divide-y divide-crwn-elevated/60">
              <Row label="Total spent" value={fan.total_spent > 0 ? `$${(fan.total_spent / 100).toFixed(2)}` : '–'} />
              <Row label="Subscribers referred" value={c ? String(c.referralCount) : (loading ? '…' : String(fan.referral_count))} />
              <Row label="Subscription length" value={c?.subscriptionLengthDays != null ? `${c.subscriptionLengthDays} days` : '–'} />
              <Row label="Badges earned" value={c ? String(c.badgeCount) : (loading ? '…' : '–')} />
            </div>
          </div>

          {/* Badges */}
          {bundle && bundle.badges.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-crwn-text-secondary uppercase tracking-wider mb-2">Badges</h4>
              <div className="flex flex-wrap gap-2">
                {bundle.badges.map(b => (
                  <span key={b.id} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-crwn-gold/10 text-crwn-gold">
                    <span>{b.icon || '🏅'}</span> {b.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div>
            <h4 className="text-xs font-semibold text-crwn-text-secondary uppercase tracking-wider mb-2">Actions</h4>
            <div className="grid grid-cols-2 gap-2">
              <ActionBtn icon={<MessageSquare className="w-4 h-4" />} label="Message" busy={busyAction === 'message'}
                onClick={() => runAction('message', {}, 'Logged — opening messages').then(() => { window.location.href = '/messages'; })} />
              <ActionBtn icon={<Heart className="w-4 h-4" />} label="Thank" busy={busyAction === 'thank'}
                onClick={() => runAction('thank', {}, `Thanked ${fan.display_name}`)} />
              {!isLead && (
                <>
                  <ActionBtn icon={<Award className="w-4 h-4" />} label="Give Promoter badge" busy={busyAction === 'award_badge'}
                    onClick={() => runAction('award_badge', { badgeKey: 'promoter' }, 'Badge awarded')} />
                  <ActionBtn icon={<Award className="w-4 h-4" />} label="Give Superfan badge" busy={busyAction === 'award_badge'}
                    onClick={() => runAction('award_badge', { badgeKey: 'superfan' }, 'Badge awarded')} />
                </>
              )}
            </div>
          </div>

          {/* Notes */}
          <div>
            <h4 className="text-xs font-semibold text-crwn-text-secondary uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <StickyNote className="w-3.5 h-3.5" /> Notes
            </h4>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addNote()}
                placeholder="Add a private note…"
                className="flex-1 px-3 py-2 bg-crwn-card border border-crwn-elevated rounded-lg text-sm text-crwn-text placeholder:text-crwn-text-secondary focus:outline-none focus:border-crwn-gold/50"
              />
              <button
                onClick={addNote}
                disabled={savingNote || !noteText.trim()}
                className="px-3 py-2 bg-crwn-gold text-crwn-bg rounded-lg text-xs font-semibold disabled:opacity-40"
              >
                {savingNote ? '…' : 'Add'}
              </button>
            </div>
            <div className="space-y-2">
              {bundle?.notes.map(n => (
                <div key={n.id} className="group flex items-start gap-2 bg-crwn-card rounded-lg px-3 py-2">
                  <p className="flex-1 text-sm text-crwn-text whitespace-pre-wrap">{n.note}</p>
                  <button onClick={() => deleteNote(n.id)} className="opacity-0 group-hover:opacity-100 text-crwn-text-secondary hover:text-red-400 transition-opacity">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {bundle && bundle.notes.length === 0 && (
                <p className="text-xs text-crwn-text-secondary">No notes yet.</p>
              )}
            </div>
          </div>

          {/* Recent activity */}
          <div>
            <h4 className="text-xs font-semibold text-crwn-text-secondary uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Recent activity
            </h4>
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin text-crwn-gold" />
            ) : bundle && bundle.events.length > 0 ? (
              <div className="space-y-1.5">
                {bundle.events.map((e, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-crwn-text capitalize">{e.event_type.replace(/_/g, ' ')}{e.source ? ` · ${e.source}` : ''}</span>
                    <span className="text-crwn-text-secondary">{new Date(e.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-crwn-text-secondary">No tracked activity yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-3 py-2.5">
      <span className="text-sm text-crwn-text-secondary">{label}</span>
      <span className="text-sm font-medium text-crwn-text">{value}</span>
    </div>
  );
}

function ActionBtn({ icon, label, onClick, busy }: { icon: React.ReactNode; label: string; onClick: () => void; busy?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium bg-crwn-card border border-crwn-elevated text-crwn-text hover:border-crwn-gold/50 transition-colors disabled:opacity-50"
    >
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
      <span className="truncate">{label}</span>
    </button>
  );
}
