'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Check, X, Copy, Plus } from 'lucide-react';

interface UserRow {
  id: string;
  display_name: string | null;
  role: 'fan' | 'artist' | 'admin';
  is_approved: boolean;
  created_at: string;
}

interface CodeRow {
  code: string;
  label: string | null;
  max_uses: number | null;
  uses: number;
  is_active: boolean;
  created_at: string;
}

export default function ApprovalsManager({ userId }: { userId: string }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [codes, setCodes] = useState<CodeRow[]>([]);
  const [gateEnabled, setGateEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [newCode, setNewCode] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newMax, setNewMax] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/approvals?userId=${userId}`);
    if (res.ok) {
      const json = await res.json();
      setUsers(json.users || []);
      setCodes(json.codes || []);
      setGateEnabled(json.gateEnabled === true);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const post = async (body: Record<string, unknown>, key: string) => {
    setBusy(key);
    await fetch('/api/admin/approvals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminUserId: userId, ...body }),
    });
    await load();
    setBusy(null);
  };

  const inviteLink = (code: string) =>
    `${typeof window !== 'undefined' ? window.location.origin : 'https://thecrwn.app'}/signup?invite=${code}`;

  const copyLink = (code: string) => {
    navigator.clipboard.writeText(inviteLink(code));
    setCopied(code);
    setTimeout(() => setCopied(null), 1500);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-crwn-text-secondary">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* Master gate switch */}
      <section className="bg-crwn-card rounded-xl p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-crwn-text text-lg font-semibold">
              Require approval to publish {gateEnabled ? '(ON)' : '(OFF)'}
            </h2>
            <p className="text-crwn-text-secondary text-sm mt-1 max-w-xl">
              {gateEnabled
                ? 'Throttle ON. New signups CANNOT publish an artist page unless approved below or via an invite link. Use this if things are breaking or you want to slow intake.'
                : 'Open. Anyone who signs up at thecrwn.app can publish an artist page immediately. This is the normal state for your IG funnel.'}
            </p>
          </div>
          <button
            disabled={busy === 'gate'}
            onClick={() => post({ action: 'setGate', enabled: !gateEnabled }, 'gate')}
            className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium ${
              gateEnabled ? 'bg-red-500/20 text-red-300' : 'bg-[#D4AF37] text-black'
            } disabled:opacity-40`}
          >
            {gateEnabled ? 'Turn gate OFF' : 'Turn gate ON'}
          </button>
        </div>
      </section>

      {/* Invite codes */}
      <section>
        <h2 className="text-crwn-text text-lg font-semibold mb-1">Invite links</h2>
        <p className="text-crwn-text-secondary text-sm mb-4">
          Paste a link into an IG DM. Anyone who signs up through it can publish an artist page immediately.
        </p>

        <div className="flex flex-wrap items-end gap-2 mb-4">
          <input
            value={newCode}
            onChange={(e) => setNewCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))}
            placeholder="CODE"
            className="bg-crwn-card text-crwn-text text-sm rounded-lg px-3 py-2 w-32 outline-none"
          />
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Label (who/what for)"
            className="bg-crwn-card text-crwn-text text-sm rounded-lg px-3 py-2 flex-1 min-w-[160px] outline-none"
          />
          <input
            value={newMax}
            onChange={(e) => setNewMax(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="Max uses (blank = ∞)"
            className="bg-crwn-card text-crwn-text text-sm rounded-lg px-3 py-2 w-40 outline-none"
          />
          <button
            disabled={!newCode || busy === 'mint'}
            onClick={async () => {
              await post({ action: 'mintCode', code: newCode, label: newLabel, maxUses: newMax }, 'mint');
              setNewCode(''); setNewLabel(''); setNewMax('');
            }}
            className="flex items-center gap-1 bg-[#D4AF37] text-black text-sm font-medium rounded-lg px-3 py-2 disabled:opacity-40"
          >
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>

        <div className="divide-y divide-white/5">
          {codes.map((c) => (
            <div key={c.code} className="flex items-center gap-3 py-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-crwn-text font-mono text-sm">{c.code}</span>
                  {!c.is_active && <span className="text-xs text-red-400">disabled</span>}
                </div>
                <div className="text-crwn-text-secondary text-xs truncate">
                  {c.label || '—'} · {c.uses}{c.max_uses != null ? `/${c.max_uses}` : ''} used
                </div>
              </div>
              <button
                onClick={() => copyLink(c.code)}
                className="flex items-center gap-1 text-xs text-crwn-text-secondary hover:text-crwn-text px-2 py-1"
              >
                <Copy className="w-3.5 h-3.5" />
                {copied === c.code ? 'Copied' : 'Copy link'}
              </button>
              <button
                disabled={busy === `code-${c.code}`}
                onClick={() => post({ action: 'toggleCode', code: c.code, isActive: !c.is_active }, `code-${c.code}`)}
                className="text-xs text-crwn-text-secondary hover:text-crwn-text px-2 py-1"
              >
                {c.is_active ? 'Disable' : 'Enable'}
              </button>
            </div>
          ))}
          {codes.length === 0 && <p className="text-crwn-text-secondary text-sm py-3">No invite codes yet.</p>}
        </div>
      </section>

      {/* Manual approvals */}
      <section>
        <h2 className="text-crwn-text text-lg font-semibold mb-1">Approve artists</h2>
        <p className="text-crwn-text-secondary text-sm mb-4">
          Anyone you already DM'd who signed up without a link. Approving lets them publish an artist page.
        </p>
        <div className="divide-y divide-white/5">
          {users.map((u) => (
            <div key={u.id} className="flex items-center gap-3 py-3">
              <div className="flex-1 min-w-0">
                <div className="text-crwn-text text-sm truncate">{u.display_name || '(no name)'}</div>
                <div className="text-crwn-text-secondary text-xs">
                  {u.role} · joined {new Date(u.created_at).toLocaleDateString()}
                </div>
              </div>
              {u.is_approved ? (
                <button
                  disabled={busy === `u-${u.id}` || u.role === 'admin'}
                  onClick={() => post({ action: 'setApproval', targetUserId: u.id, approved: false }, `u-${u.id}`)}
                  className="flex items-center gap-1 text-xs text-green-400 hover:text-red-400 px-2 py-1 disabled:opacity-40"
                >
                  <Check className="w-3.5 h-3.5" /> Approved
                </button>
              ) : (
                <button
                  disabled={busy === `u-${u.id}`}
                  onClick={() => post({ action: 'setApproval', targetUserId: u.id, approved: true }, `u-${u.id}`)}
                  className="flex items-center gap-1 text-xs bg-[#D4AF37] text-black font-medium rounded-lg px-3 py-1.5"
                >
                  <X className="w-3.5 h-3.5" /> Approve
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
