'use client';

// The acquisition panel. Four tabs, and three of them exist to retire raw SQL from Josh's
// morning routine:
//
//   Leads         the funnel: who came in, from which post, how far they got
//   Calls         booked calls waiting on an outcome. Josh says who showed up.
//   Needs you     leads CRWN could not understand and handed to a human. That human is Josh.
//   Failed        dead-lettered jobs. Should always be empty.
//
// The Calls tab is the one that cannot be automated away. A no-show has to be CONFIRMED by a
// human, because "sorry we missed you" sent to the artist who actually turned up, and had a
// good conversation, is worse than never following up at all.
//
// NOTE ON PRONOUNS: the DM copy is written for an audience that skews female (hence the
// no-masculine-slang test), but it only ever addresses the artist as "you". This admin UI is
// different: it talks ABOUT a specific named person whose gender CRWN does not know and has
// never asked. So it says "they", or nothing at all.
//
// Every mutation goes through /api/admin/acquisition, which verifies admin from the SESSION
// and writes an audit row. Nothing here is trusted.

import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, Check, Ban, Instagram, CalendarClock, UserX, PhoneCall } from 'lucide-react';
import { OptionSelect } from '@/components/ui/OptionSelect';

type View = 'leads' | 'calls' | 'human_review' | 'dead_letter';

interface Row {
  id: string;
  state?: string;
  status?: string;
  lead_magnet_id?: string;
  keyword?: string;
  source_post_id?: string;
  current_question_key?: string;
  last_activity_at?: string;
  created_at?: string;
  event_name?: string;
  last_error_code?: string;
  attempt_count?: number;
  lead_identity_id?: string;
  // On the Calls tab, event_name is 'sales_call_booked' (linked to a lead) or
  // 'sales_call_unattributed' (booked from the website, nobody to follow up).
  metadata?: { startTime?: string; endTime?: string; uid?: string } | null;
  outcome?: string | null;
  identity?: { instagram_username?: string; email?: string; claimed_at?: string; status?: string } | null;
  profile?: { lead_score?: number; score_band?: string; monthly_listeners?: number; primary_blocker?: string } | null;
  result?: { viewed_at?: string; claimed_at?: string; recalculated_at?: string } | null;
}

const OUTCOME_LABEL: Record<string, string> = {
  sales_call_attended: 'Attended',
  call_no_show: 'No-show, following up',
  sales_call_cancelled: 'Cancelled',
};

// An immediate-call request from the opportunity calculator's hand-raiser. Anonymous web lead:
// the whole CRM record (consent, qualification, alert status, manual contact status) is the
// snapshot the request route persisted.
interface CallRequestRow {
  id: string;
  created_at?: string;
  response_snapshot?: {
    phone?: string;
    artist_name?: string | null;
    plan_summary?: string | null;
    qualification?: { qualified?: boolean; band?: string; score?: number };
    alert?: { channel?: string; status?: string; fallback?: string };
    contact_status?: string;
    requested_at?: string;
  } | null;
}

const CALL_REQUEST_STATUSES: { value: string; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'alerted', label: 'Alerted' },
  { value: 'contact_attempted', label: 'Contact attempted' },
  { value: 'connected', label: 'Connected' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'launched', label: 'Launched' },
  { value: 'not_qualified', label: 'Not qualified' },
  { value: 'closed', label: 'Closed' },
];

/**
 * Has the call actually finished?
 *
 * Until it has, there is no outcome to record, so the buttons do not render at all. Cal.com
 * takes the same position: it greys out its own no-show control on a future booking.
 *
 * `endTime` is what the webhook stored. If it is somehow missing we fall back to start + 30
 * minutes, which is longer than the 15-minute slot on purpose: erring LATE only delays the
 * question, while erring EARLY re-opens the mis-click that this function exists to close.
 */
function hasEnded(r: Row): boolean {
  const end = r.metadata?.endTime
    ? new Date(r.metadata.endTime).getTime()
    : r.metadata?.startTime
    ? new Date(r.metadata.startTime).getTime() + 30 * 60_000
    : null;

  // No times at all: show the buttons rather than trap the row in "Upcoming" forever.
  if (end == null || Number.isNaN(end)) return true;

  return Date.now() > end;
}

const BAND_COLOR: Record<string, string> = {
  sales_priority: 'text-crwn-gold',
  self_serve: 'text-green-400',
  nurture: 'text-blue-400',
  unqualified: 'text-crwn-text-secondary',
  human_review: 'text-orange-400',
};

interface Config {
  migrated: boolean;
  engineEnabled: boolean;
  manychatWebhookSecret: boolean;
  manychatApiToken: boolean;
  anthropicApiKey: boolean;
  calcomWebhookSecret: boolean;
  /** true = the secrets AGREE. false = they disagree. null = could not check. */
  calcomSecretMatches: boolean | null;
  manychatMessageTag: boolean;
}

export default function AcquisitionView() {
  const [view, setView] = useState<View>('leads');
  const [rows, setRows] = useState<Row[]>([]);
  const [callRequests, setCallRequests] = useState<CallRequestRow[]>([]);
  const [smsHealth, setSmsHealth] = useState<Record<string, any> | null>(null);
  const [smsLoading, setSmsLoading] = useState(false);
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [notReady, setNotReady] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [res, cfg] = await Promise.all([
        fetch(`/api/admin/acquisition?view=${view}`),
        fetch('/api/admin/acquisition?view=config'),
      ]);
      const json = await res.json();
      const cjson = await cfg.json();
      setRows(json.rows ?? []);
      setCallRequests(json.callRequests ?? []);
      setConfig(cjson.config ?? null);
      setNotReady(!!json.notReady);
    } catch {
      setRows([]);
      setCallRequests([]);
    }
    setLoading(false);
  }, [view]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (action: string, id: string) => {
    setBusy(id);
    await fetch('/api/admin/acquisition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, id }),
    });
    setBusy(null);
    load();
  };

  // SMS health, on demand. Lives here rather than at a URL you can type, because typing an
  // /api/ URL into the address bar skips middleware and therefore skips the session refresh,
  // which reads as "Unauthorized" even for a signed-in admin. In-app fetch carries the session
  // that the rest of this panel already relies on.
  const checkSms = async () => {
    setSmsLoading(true);
    setSmsHealth(null);
    try {
      const res = await fetch('/api/admin/twilio-health?sid=SMde98c2007a4fcdc6a3ffb77032492fd5');
      setSmsHealth(await res.json());
    } catch {
      setSmsHealth({ error: 'Could not reach the diagnostic.' });
    }
    setSmsLoading(false);
  };

  const setCallRequestStatus = async (id: string, status: string) => {
    setBusy(id);
    await fetch('/api/admin/acquisition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set_call_request_status', id, status }),
    });
    setBusy(null);
    load();
  };

  const TABS: { key: View; label: string }[] = [
    { key: 'leads', label: 'Leads' },
    { key: 'calls', label: 'Calls' },
    { key: 'human_review', label: 'Needs you' },
    { key: 'dead_letter', label: 'Failed' },
  ];

  return (
    <div>
      {config && <ConfigStrip config={config} />}

      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setView(t.key)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                view === t.key
                  ? 'bg-crwn-elevated text-crwn-text'
                  : 'text-crwn-text-secondary hover:text-crwn-text'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          onClick={load}
          className="text-crwn-text-secondary hover:text-crwn-text p-2"
          aria-label="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {view === 'calls' && (
        <div className="mb-6 bg-crwn-surface-solid rounded-xl p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-semibold text-crwn-text">SMS alert health</p>
              <p className="text-xs text-crwn-text-secondary">
                Asks Twilio directly which numbers this account owns and what happened to the last
                alerts. Read only.
              </p>
            </div>
            <button
              onClick={checkSms}
              disabled={smsLoading}
              className="shrink-0 bg-crwn-elevated text-crwn-text text-sm px-4 py-2 rounded-full disabled:opacity-50"
            >
              {smsLoading ? 'Checking…' : 'Check SMS health'}
            </button>
          </div>

          {smsHealth && (
            <div className="mt-4 space-y-3 text-sm">
              {smsHealth.error && <p className="text-crwn-error">{String(smsHealth.error)}</p>}
              {smsHealth.verdict && <p className="text-crwn-gold font-medium">{String(smsHealth.verdict)}</p>}

              {smsHealth.senderCheck && (
                <p
                  className={
                    String(smsHealth.senderCheck).startsWith('OK') ? 'text-green-400' : 'text-orange-400'
                  }
                >
                  {String(smsHealth.senderCheck)}
                </p>
              )}

              {Array.isArray(smsHealth.numbersOwned) && (
                <div>
                  <p className="text-xs text-crwn-text-secondary mb-1">Numbers this account owns:</p>
                  {smsHealth.numbersOwned.length === 0 ? (
                    <p className="text-orange-400 text-xs">None. This account owns no phone numbers.</p>
                  ) : (
                    <ul className="text-xs text-crwn-text space-y-0.5">
                      {smsHealth.numbersOwned.map((n: any) => (
                        <li key={String(n.number)}>
                          {String(n.number)} {n.smsCapable ? '(SMS ok)' : '(NOT SMS capable)'}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {smsHealth.configured && (
                <p className="text-xs text-crwn-text-secondary">
                  Sender in use: {String(smsHealth.configured.senderNumber)} &middot; Alert phone:{' '}
                  {String(smsHealth.configured.founderAlertPhone)}
                </p>
              )}

              {smsHealth.message && (
                <div className="rounded-lg bg-crwn-elevated p-3">
                  <p className="text-xs text-crwn-text-secondary mb-1">That test message:</p>
                  <p className="text-xs text-crwn-text">
                    status <span className="font-medium">{String(smsHealth.message.status)}</span>
                    {smsHealth.message.from ? ` · from ${String(smsHealth.message.from)}` : ''}
                    {smsHealth.message.errorCode ? ` · error ${String(smsHealth.message.errorCode)}` : ''}
                  </p>
                  {smsHealth.message.hint && (
                    <p className="text-xs text-orange-400 mt-1">{String(smsHealth.message.hint)}</p>
                  )}
                </div>
              )}

              {Array.isArray(smsHealth.recentMessages) && smsHealth.recentMessages.length > 0 && (
                <div>
                  <p className="text-xs text-crwn-text-secondary mb-1">Recent messages:</p>
                  <ul className="text-xs space-y-0.5">
                    {smsHealth.recentMessages.map((m: any) => (
                      <li key={String(m.sid)} className="text-crwn-text">
                        {String(m.status)} · to {String(m.to)} · from {String(m.from)}
                        {m.errorCode ? <span className="text-orange-400"> · error {String(m.errorCode)}</span> : ''}
                        {m.hint ? <span className="text-orange-400 block ml-3">{String(m.hint)}</span> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {!loading && !notReady && view === 'calls' && callRequests.length > 0 && (
        <div className="mb-6">
          <p className="text-sm font-semibold text-crwn-text mb-2">Immediate-call requests</p>
          <div className="space-y-2">
            {callRequests.map((cr) => {
              const s = cr.response_snapshot ?? {};
              const q = s.qualification ?? {};
              const alertStatus = s.alert?.status ?? 'not_attempted';
              return (
                <div key={cr.id} className="bg-crwn-surface-solid rounded-xl p-4 flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <PhoneCall className="w-4 h-4 text-crwn-gold shrink-0" />
                    <div className="min-w-0">
                      <p className="text-crwn-text font-medium truncate">
                        {s.artist_name || 'Unnamed artist'} · {s.phone || 'no number'}
                      </p>
                      <p className="text-sm text-crwn-text-secondary truncate">
                        {[
                          s.plan_summary,
                          cr.created_at ? new Date(cr.created_at).toLocaleString() : null,
                          alertStatus === 'sent'
                            ? 'SMS sent'
                            : alertStatus === 'skipped_unconfigured'
                            ? 'SMS unconfigured'
                            : alertStatus === 'failed'
                            ? `SMS failed${s.alert?.fallback === 'email_sent' ? ', emailed' : ''}`
                            : 'not alerted (below threshold)',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                  </div>
                  {q.score != null && (
                    <div className="text-right shrink-0">
                      <p className={`font-semibold ${BAND_COLOR[q.band ?? ''] ?? 'text-crwn-text'}`}>{q.score}</p>
                      <p className="text-xs text-crwn-text-secondary">{(q.band ?? '').replace(/_/g, ' ')}</p>
                    </div>
                  )}
                  <div className="shrink-0 w-44">
                    <OptionSelect
                      options={CALL_REQUEST_STATUSES}
                      value={s.contact_status || 'new'}
                      onChange={(v) => setCallRequestStatus(cr.id, v)}
                      placeholder="Status"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-crwn-gold" />
        </div>
      ) : notReady ? (
        <Empty
          title="The acquisition engine is not migrated yet"
          body="Run supabase/schema-phase2-instagram-acquisition-engine.sql, then set MANYCHAT_WEBHOOK_SECRET in Vercel. See TODO.md."
        />
      ) : rows.length === 0 ? (
        <Empty
          title={
            view === 'dead_letter'
              ? 'Nothing has failed'
              : view === 'human_review'
              ? 'Nobody is waiting on you'
              : view === 'calls'
              ? 'No calls booked yet'
              : 'No leads yet'
          }
          body={
            view === 'dead_letter'
              ? 'This is the state you want. If jobs start piling up here, the ManyChat token is the first thing to check.'
              : view === 'human_review'
              ? 'When CRWN cannot understand a lead, it stops asking rather than looping, and hands them here.'
              : view === 'calls'
              ? 'A booking on cal.com lands here automatically. Once a call has finished, mark whether they showed up: the no-show follow-up only fires when you say so.'
              : 'Leads appear here the moment someone comments your keyword on Instagram.'
          }
        />
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div
              key={r.id}
              className="bg-crwn-surface-solid rounded-xl p-4 flex items-center gap-4 flex-wrap"
            >
              {view === 'calls' ? (
                <>
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <CalendarClock className="w-4 h-4 text-crwn-text-secondary shrink-0" />
                    <div className="min-w-0">
                      <p
                        className={`font-medium truncate ${
                          r.event_name === 'sales_call_unattributed'
                            ? 'text-crwn-text-secondary'
                            : 'text-crwn-text'
                        }`}
                      >
                        {r.event_name === 'sales_call_unattributed'
                          ? 'Booking not linked to a lead'
                          : r.identity?.instagram_username
                          ? `@${r.identity.instagram_username}`
                          : r.identity?.email ?? 'Unknown lead'}
                      </p>
                      <p className="text-sm text-crwn-text-secondary truncate">
                        {r.metadata?.startTime
                          ? new Date(r.metadata.startTime).toLocaleString()
                          : 'Time unknown'}
                      </p>
                    </div>
                  </div>

                  {r.event_name === 'sales_call_unattributed' ? (
                    // No lead means no follow-up sequence, so there is nothing to mark and no
                    // button to offer. The row exists purely so a real booking is never
                    // invisible here. Booked straight from the website, most likely.
                    <span className="text-sm text-crwn-text-secondary shrink-0">
                      Booked from the website
                    </span>
                  ) : r.outcome ? (
                    // Already settled. Show it, and give no button: a second click here would
                    // either re-open a closed loop or contradict what Josh already recorded.
                    <span className="text-sm text-crwn-text-secondary shrink-0">
                      {OUTCOME_LABEL[r.outcome] ?? r.outcome}
                    </span>
                  ) : !hasEnded(r) ? (
                    // THE CALL HAS NOT HAPPENED YET. Do not ask for its outcome.
                    //
                    // An outcome question about a future meeting is not premature, it is
                    // unanswerable, and leaving the buttons on screen makes a catastrophic
                    // mis-click one pixel away: "No-show" on a call that is four days out would
                    // DM an artist "sorry we missed you" before the meeting she is looking
                    // forward to. Nothing to click means nothing to get wrong.
                    <span className="text-sm text-crwn-text-secondary shrink-0">Upcoming</span>
                  ) : r.lead_identity_id ? (
                    // Two NEUTRAL buttons, deliberately equal weight.
                    //
                    // A gold button in this codebase means "recommended", and CRWN has no
                    // business recommending an answer to a question of fact. The previous
                    // version made "showed up" gold, which read as a pre-selected default.
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => act('mark_attended', r.lead_identity_id!)}
                        disabled={busy === r.lead_identity_id}
                        className="bg-crwn-elevated text-crwn-text hover:text-green-400 text-sm px-3 py-2 rounded-full disabled:opacity-50 flex items-center gap-1"
                      >
                        <Check className="w-3.5 h-3.5" /> Showed up
                      </button>
                      <button
                        onClick={() => act('mark_no_show', r.lead_identity_id!)}
                        disabled={busy === r.lead_identity_id}
                        className="bg-crwn-elevated text-crwn-text hover:text-orange-400 text-sm px-3 py-2 rounded-full disabled:opacity-50 flex items-center gap-1"
                      >
                        <UserX className="w-3.5 h-3.5" /> No-show
                      </button>
                    </div>
                  ) : null}
                </>
              ) : view === 'dead_letter' ? (
                <>
                  <div className="flex-1 min-w-0">
                    <p className="text-crwn-text font-medium">{r.event_name}</p>
                    <p className="text-sm text-red-400">
                      {r.last_error_code} &middot; {r.attempt_count} attempts
                    </p>
                  </div>
                  <button
                    onClick={() => act('retry_event', r.id)}
                    disabled={busy === r.id}
                    className="bg-crwn-gold text-crwn-bg font-semibold text-sm px-4 py-2 rounded-full disabled:opacity-50"
                  >
                    {busy === r.id ? 'Retrying…' : 'Retry'}
                  </button>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <Instagram className="w-4 h-4 text-crwn-text-secondary shrink-0" />
                    <div className="min-w-0">
                      <p className="text-crwn-text font-medium truncate">
                        {r.identity?.instagram_username
                          ? `@${r.identity.instagram_username}`
                          : 'Anonymous lead'}
                      </p>
                      <p className="text-sm text-crwn-text-secondary truncate">
                        {view === 'human_review'
                          ? `Stuck on: ${r.current_question_key ?? 'unknown'}`
                          : [
                              r.lead_magnet_id,
                              r.profile?.monthly_listeners
                                ? `${r.profile.monthly_listeners.toLocaleString()} listeners`
                                : null,
                              r.profile?.primary_blocker,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                      </p>
                    </div>
                  </div>

                  {r.profile?.lead_score != null && (
                    <div className="text-right shrink-0">
                      <p className={`font-semibold ${BAND_COLOR[r.profile.score_band ?? ''] ?? 'text-crwn-text'}`}>
                        {r.profile.lead_score}
                      </p>
                      <p className="text-xs text-crwn-text-secondary">
                        {(r.profile.score_band ?? '').replace(/_/g, ' ')}
                      </p>
                    </div>
                  )}

                  <div className="shrink-0 text-xs text-crwn-text-secondary w-28">
                    {r.result?.claimed_at
                      ? 'Claimed'
                      : r.result?.recalculated_at
                      ? 'Edited numbers'
                      : r.result?.viewed_at
                      ? 'Opened result'
                      : r.state?.replace(/_/g, ' ') ?? ''}
                  </div>

                  {view === 'human_review' && (
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => act('resolve_review', r.id)}
                        disabled={busy === r.id}
                        className="bg-crwn-gold text-crwn-bg font-semibold text-sm px-3 py-2 rounded-full disabled:opacity-50 flex items-center gap-1"
                      >
                        <Check className="w-3.5 h-3.5" /> Handled
                      </button>
                      {r.lead_identity_id && (
                        <button
                          onClick={() => act('disqualify', r.lead_identity_id!)}
                          disabled={busy === r.lead_identity_id}
                          className="text-crwn-text-secondary hover:text-red-400 text-sm px-3 py-2 rounded-full flex items-center gap-1"
                        >
                          <Ban className="w-3.5 h-3.5" /> Not a lead
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Config health. The webhook fails CLOSED, so from outside "the secret is missing" and "the
 * secret is wrong" look identical (both 401). That is correct: it gives an attacker no oracle.
 * But it also means nobody could answer "did I actually set that key" without this strip.
 *
 * Booleans only. Never a value, never a prefix, never a masked hint.
 */
function ConfigStrip({ config }: { config: Config }) {
  const items: { label: string; ok: boolean; required: boolean; note: string }[] = [
    {
      label: 'Migration',
      ok: config.migrated,
      required: true,
      note: 'Run supabase/schema-phase2-instagram-acquisition-engine.sql',
    },
    {
      label: 'Webhook secret',
      ok: config.manychatWebhookSecret,
      required: true,
      note: 'MANYCHAT_WEBHOOK_SECRET. Without it the webhook rejects every request.',
    },
    {
      label: 'ManyChat API token',
      ok: config.manychatApiToken,
      required: true,
      note: 'MANYCHAT_API_TOKEN. Without it, follow-up reaches nobody.',
    },
    {
      label: 'Claude',
      ok: config.anthropicApiKey,
      required: false,
      note: 'ANTHROPIC_API_KEY. Optional: without it, vague answers land in Needs you.',
    },
    {
      // A green tick here used to mean only "a string is present", which is a question nobody
      // was asking. It now means "the secret Vercel runs with is byte-identical to the one
      // Cal.com signs with", which is the only thing that determines whether a booking lands.
      label: 'Cal.com',
      ok: config.calcomWebhookSecret && config.calcomSecretMatches === true,
      required: false,
      note:
        config.calcomWebhookSecret && config.calcomSecretMatches === false
          ? 'CALCOM_WEBHOOK_SECRET does NOT match the secret stored in Cal.com. Every booking is being rejected. Copy the secret out of Cal.com and re-paste it into Vercel, then redeploy.'
          : config.calcomWebhookSecret && config.calcomSecretMatches === null
          ? 'CALCOM_WEBHOOK_SECRET is set, but CRWN could not reach Cal.com to confirm it matches. Check CALCOM_API_KEY and that a webhook pointing at CRWN exists.'
          : 'CALCOM_WEBHOOK_SECRET. Without it no booking is detected, so an artist who books a call still gets nurtured as if she never did.',
    },
  ];

  const blockers = items.filter((i) => i.required && !i.ok);
  const ready = blockers.length === 0;

  return (
    <div className="bg-crwn-surface-solid rounded-xl p-4 mb-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {items.map((i) => (
            <div key={i.label} className="flex items-center gap-2" title={i.note}>
              {i.ok ? (
                <Check className="w-4 h-4 text-green-400 shrink-0" />
              ) : (
                <Ban className={`w-4 h-4 shrink-0 ${i.required ? 'text-red-400' : 'text-crwn-text-secondary'}`} />
              )}
              <span className={`text-sm ${i.ok ? 'text-crwn-text' : 'text-crwn-text-secondary'}`}>
                {i.label}
              </span>
            </div>
          ))}
        </div>

        <span
          className={`text-xs font-semibold px-3 py-1 rounded-full ${
            config.engineEnabled
              ? 'bg-green-400/15 text-green-400'
              : 'bg-crwn-elevated text-crwn-text-secondary'
          }`}
        >
          {config.engineEnabled ? 'LIVE' : 'DARK'}
        </span>
      </div>

      {!config.engineEnabled && (
        <div className="text-xs text-crwn-text-secondary mt-3 leading-relaxed space-y-2">
          {ready ? (
            <>
              {/* Being dark is a TESTING ASSET, not just a safety net. A correctly configured
                  ManyChat request gets back 503 engine_disabled, which proves the URL, the
                  header, the secret and the body are all right WITHOUT writing a single row.
                  An earlier version of this panel just said "flip it on", which threw that
                  away and invited a first test that writes junk leads instead of reading a
                  clean 503. */}
              <p>
                <span className="text-crwn-text font-medium">Everything required is configured.</span>{' '}
                Smoke test ManyChat FIRST, while this is still dark: a correct External Request
                should return <span className="text-crwn-gold">503 engine_disabled</span>. That
                proves your URL, header, secret and body are right without writing any data.
                A 401 means the secret does not match. A 400 means the body is off.
              </p>
              <p>
                Once you have seen that 503, flip it on:{' '}
                <code className="text-crwn-gold">
                  UPDATE admin_settings SET value = &apos;{'{'}&quot;enabled&quot;: true{'}'}&apos;::jsonb WHERE key = &apos;acquisition_engine&apos;;
                </code>
              </p>
            </>
          ) : (
            <p>Still needed: {blockers.map((b) => b.label).join(', ')}. Hover each item for what it is.</p>
          )}
        </div>
      )}
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="text-center py-16 max-w-md mx-auto">
      <h3 className="text-crwn-text font-semibold mb-2">{title}</h3>
      <p className="text-crwn-text-secondary text-sm leading-relaxed">{body}</p>
    </div>
  );
}
