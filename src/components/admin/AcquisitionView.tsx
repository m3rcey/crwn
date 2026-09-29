'use client';

// The acquisition panel. Four tabs, and three of them exist to retire raw SQL from Josh's
// morning routine:
//
//   Leads         the funnel: who came in, from which post, how far they got
//   Calls         booked calls waiting on an outcome. Josh says who showed up.
//   Needs you     leads CRWN could not understand and handed to a human. That human is Josh.
//   Failed        dead-lettered jobs. Should always be empty.
//   Founder       every sales_priority lead, where they are in the journey, and the founder note
//                 the daily runner would send (or why it will not). Josh copies it or marks it
//                 sent by hand; either way the same stage is never emailed twice.
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
import { Loader2, RefreshCw, Check, Ban, Instagram, CalendarClock, UserX, PhoneCall, Copy, Mail } from 'lucide-react';
import { OptionSelect } from '@/components/ui/OptionSelect';

type View = 'leads' | 'calls' | 'human_review' | 'dead_letter' | 'founder';

// One qualified lead, resolved server-side by founderFollowUp.ts. Display only.
interface FounderRow {
  id: string;
  instagram_username?: string | null;
  /** Only present when the lead may be emailed (consented, not suppressed). */
  email?: string | null;
  name?: string | null;
  lead_score?: number | null;
  score_band?: string | null;
  /** The band last written to lead_profiles. Shown only when it disagrees with the live one. */
  stored_band?: string | null;
  reason_codes?: string[];
  stage: string;
  blocker?: string | null;
  last_activity?: { label: string; at: string } | null;
  email_reason: string;
  decision: 'send' | 'wait' | 'manual_only' | 'none';
  decision_reason: string;
  next_eligible_at?: string | null;
  already_sent?: { status: string; at: string; error: string | null; manual: boolean } | null;
  dedupe_key?: string | null;
  preview?: { subject: string; text: string } | null;
}

const STAGE_LABEL: Record<string, string> = {
  internal_account: 'Your own or test account',
  not_qualified: 'Not qualified',
  no_result: 'In the DM, no result yet',
  first_paid: 'Converted (first paid member)',
  call_booked: 'Call booked',
  call_requested: 'Asked for a call',
  result_no_account: 'Saw result, no account',
  builder_saved_no_account: 'Saved a plan, no account',
  setup_incomplete: 'In setup',
  offer_not_payable: 'Launched, cannot take money yet',
  ready_no_first_paid: 'Ready, no paying member yet',
};

const DECISION_LABEL: Record<string, string> = {
  send: 'Sends on the next daily run',
  wait: 'Waiting',
  manual_only: 'Hand-send only',
  none: 'No email',
};

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
  const [founderRows, setFounderRows] = useState<FounderRow[]>([]);
  const [founderEnabled, setFounderEnabled] = useState(false);
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
      if (view === 'founder') {
        setFounderRows(json.rows ?? []);
        setFounderEnabled(!!json.founderFollowUpEnabled);
        setRows([]);
      } else {
        setRows(json.rows ?? []);
      }
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
    { key: 'founder', label: 'Founder' },
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
                            ? 'alert emailed'
                            : alertStatus === 'skipped_unconfigured'
                            ? 'alert unconfigured'
                            : alertStatus === 'failed'
                            ? `alert email failed${s.alert?.fallback === 'email_sent' ? ', fallback emailed' : ''}`
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
      ) : view === 'founder' ? (
        <FounderPanel
          rows={founderRows}
          enabled={founderEnabled}
          busy={busy}
          onMarkSent={(id) => act('mark_founder_followup_sent', id)}
          onReload={load}
        />
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

// A stored DM answer the current normalizer reads differently, or a stored band the canonical
// scorer no longer agrees with. Planned server-side; applying re-plans and is audited.
interface RenormalizeRow {
  leadIdentityId: string;
  instagramUsername: string | null;
  raw: string;
  stored: string;
  proposed: string | null;
  kind: 'repair' | 'review' | 'rescore';
  storedBand: string | null;
  storedScore: number | null;
  liveBand: string;
  liveScore: number;
}

function RenormalizeReview({ onApplied }: { onApplied: () => void }) {
  const [rows, setRows] = useState<RenormalizeRow[] | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'applying' | 'done'>('idle');
  const [summary, setSummary] = useState<string | null>(null);
  const check = async () => {
    setState('loading');
    try {
      const res = await fetch('/api/admin/acquisition?view=renormalize');
      const json = await res.json();
      setRows(json.rows ?? []);
    } catch {
      setRows([]);
    }
    setState('idle');
  };
  const apply = async () => {
    setState('applying');
    try {
      const res = await fetch('/api/admin/acquisition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'apply_renormalization', id: 'all' }),
      });
      const json = await res.json();
      setSummary(`${json.repaired ?? 0} answers corrected, ${json.rescored ?? 0} rescored, ${json.skipped ?? 0} left for review.`);
    } catch {
      setSummary('Could not apply. Nothing was changed by this click if you see this.');
    }
    setState('done');
    setRows(null);
    onApplied();
  };
  const actionable = (rows ?? []).filter((r) => r.kind !== 'review').length;

  return (
    <div className="bg-crwn-surface-solid rounded-xl p-4 mb-4">
      <div className="flex items-center gap-3 flex-wrap">
        <p className="text-sm text-crwn-text flex-1 min-w-0">
          Stored DM answers re-read with the current parser, and bands the scorer no longer agrees with.
        </p>
        <button
          onClick={check}
          disabled={state === 'loading' || state === 'applying'}
          className="px-3 py-1.5 rounded-full text-xs bg-crwn-elevated text-crwn-text disabled:opacity-50"
        >
          {state === 'loading' ? 'Checking…' : 'Check stored answers'}
        </button>
      </div>
      {summary && <p className="text-xs text-green-400 mt-2">{summary}</p>}
      {rows && rows.length === 0 && <p className="text-xs text-crwn-text-secondary mt-2">Nothing to correct.</p>}
      {rows && rows.length > 0 && (
        <div className="mt-3 space-y-2">
          {rows.map((r) => (
            <div key={r.leadIdentityId} className="text-xs text-crwn-text-secondary border-t border-crwn-elevated pt-2">
              <p className="text-crwn-text">
                @{r.instagramUsername ?? 'unknown'} ·{' '}
                {r.kind === 'repair' ? 'Correct the answer' : r.kind === 'rescore' ? 'Rescore only' : 'Needs you (parser cannot tell)'}
              </p>
              {r.raw && <p>They wrote: “{r.raw.slice(0, 160)}”</p>}
              {r.kind !== 'rescore' && (
                <p>
                  Stored {r.stored.replace(/_/g, ' ')}
                  {r.proposed ? `, now reads ${r.proposed.replace(/_/g, ' ')}` : ', now reads as unreadable'}
                </p>
              )}
              <p>
                Band stored {(r.storedBand ?? 'none').replace(/_/g, ' ')} ({r.storedScore ?? '?'})
                {r.kind === 'rescore' ? `, scorer now says ${r.liveBand.replace(/_/g, ' ')} (${r.liveScore})` : ''}
              </p>
            </div>
          ))}
          {actionable > 0 && (
            <button
              onClick={apply}
              disabled={state === 'applying'}
              className="mt-2 px-4 py-2 rounded-full text-xs font-semibold bg-crwn-gold text-black disabled:opacity-50"
            >
              {state === 'applying' ? 'Applying…' : `Apply ${actionable} correction${actionable === 1 ? '' : 's'}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function FounderPanel({
  rows,
  enabled,
  busy,
  onMarkSent,
  onReload,
}: {
  rows: FounderRow[];
  enabled: boolean;
  busy: string | null;
  onMarkSent: (id: string) => void;
  onReload: () => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (r: FounderRow) => {
    if (!r.preview) return;
    try {
      await navigator.clipboard.writeText(
        `${r.email ? `To: ${r.email}\n` : ''}Subject: ${r.preview.subject}\n\n${r.preview.text}`,
      );
      setCopied(r.id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // Clipboard blocked: the draft is on screen to select by hand.
    }
  };
  const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : '');

  return (
    <div>
      <p className="text-sm text-crwn-text-secondary mb-4">
        Automatic sending is{' '}
        <span className={enabled ? 'text-green-400' : 'text-crwn-gold'}>{enabled ? 'ON' : 'OFF'}</span>.{' '}
        {enabled
          ? 'Leads marked "Sends on the next daily run" get a note from Josh at CRWN, and replies go to your Gmail.'
          : 'Nothing sends by itself. Copy a draft into Gmail, then mark it sent so it is never sent twice.'}
      </p>
      <RenormalizeReview onApplied={onReload} />
      {rows.length === 0 ? (
        <Empty
          title="No qualified leads yet"
          body="Leads the scorer bands sales_priority land here with their journey stage and a draft."
        />
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="bg-crwn-surface-solid rounded-xl p-4">
              <div className="flex items-start gap-4 flex-wrap">
                <div className="min-w-0 flex-1">
                  <p className="text-crwn-text font-medium truncate">
                    {r.name || 'Unnamed'}
                    {r.instagram_username ? ` · @${r.instagram_username}` : ''}
                  </p>
                  <p className="text-sm text-crwn-text-secondary">
                    {STAGE_LABEL[r.stage] ?? r.stage}
                    {r.blocker ? ` · ${r.blocker}` : ''}
                  </p>
                  {r.last_activity && (
                    <p className="text-xs text-crwn-text-secondary">
                      Last: {r.last_activity.label}, {when(r.last_activity.at)}
                    </p>
                  )}
                  <p className="text-xs text-crwn-text-secondary">
                    {DECISION_LABEL[r.decision] ?? r.decision} ({r.decision_reason.replace(/_/g, ' ')})
                    {r.next_eligible_at ? ` until ${when(r.next_eligible_at)}` : ''}
                    {r.email_reason !== 'eligible' ? ` · email: ${r.email_reason.replace(/_/g, ' ')}` : ''}
                    {r.already_sent
                      ? ` · this stage: ${r.already_sent.manual ? 'sent by hand' : r.already_sent.status}${
                          r.already_sent.error ? ` (${r.already_sent.error})` : ''
                        } ${when(r.already_sent.at)}`
                      : ''}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`font-semibold ${BAND_COLOR[r.score_band ?? ''] ?? 'text-crwn-text'}`}>{r.lead_score ?? ''}</p>
                  <p className="text-xs text-crwn-text-secondary">{(r.reason_codes ?? []).join(', ').replace(/_/g, ' ')}</p>
                  {r.stored_band && r.stored_band !== r.score_band && (
                    <p className="text-xs text-orange-400">
                      stored {r.stored_band.replace(/_/g, ' ')}, live {(r.score_band ?? 'none').replace(/_/g, ' ')}
                    </p>
                  )}
                </div>
              </div>
              {r.preview && (
                <div className="mt-3 flex gap-2 flex-wrap">
                  <button
                    onClick={() => setOpen(open === r.id ? null : r.id)}
                    className="px-3 py-1.5 rounded-full text-xs bg-crwn-elevated text-crwn-text flex items-center gap-1"
                  >
                    <Mail className="w-3.5 h-3.5" /> {open === r.id ? 'Hide draft' : 'Show draft'}
                  </button>
                  <button
                    onClick={() => copy(r)}
                    className="px-3 py-1.5 rounded-full text-xs bg-crwn-elevated text-crwn-text flex items-center gap-1"
                  >
                    <Copy className="w-3.5 h-3.5" /> {copied === r.id ? 'Copied' : 'Copy draft'}
                  </button>
                  {!r.already_sent && (
                    <button
                      disabled={busy === r.id}
                      onClick={() => onMarkSent(r.id)}
                      className="px-3 py-1.5 rounded-full text-xs bg-crwn-elevated text-crwn-text flex items-center gap-1 disabled:opacity-50"
                    >
                      <Check className="w-3.5 h-3.5" /> I sent this by hand
                    </button>
                  )}
                </div>
              )}
              {open === r.id && r.preview && (
                <div className="mt-3 rounded-lg bg-crwn-elevated p-3 text-sm text-crwn-text whitespace-pre-wrap">
                  {r.email && <p className="text-crwn-text-secondary mb-1">To: {r.email}</p>}
                  <p className="font-semibold mb-2">{r.preview.subject}</p>
                  {r.preview.text}
                </div>
              )}
            </div>
          ))}
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
