// Admin: read the acquisition funnel, and act on it.
//
// This is what retires the two raw SQL queries in Josh's TODO.md ("work the human-review
// queue", "check the dead-letter queue"). Those were an operational debt the engine created,
// and asking a founder to run SQL every morning is not a product.
//
// AUTH: requireAdmin() derives the acting admin from the SESSION, never from a body param.
// Middleware skips /api/, and this route uses the service-role client, so its authorization is
// only what it does here.
//
// PII: the list view returns Instagram usernames and scores, because that is the job. It does
// NOT return DM transcripts. Those are admin-readable in the DB for support, but there is no
// reason to stream a stranger's private messages into a dashboard by default.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/auth/requireAdmin';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const view = req.nextUrl.searchParams.get('view') || 'leads';

  // ---- Config health. BOOLEANS ONLY. ----
  //
  // This exists because of a real gap: the webhook fails CLOSED, so "secret missing from
  // Vercel" and "secret is wrong" both return 401. That is correct (it gives an attacker no
  // oracle) but it means nobody, including Claude, can tell from outside whether a key is
  // actually configured. ANTHROPIC_API_KEY cannot be probed from outside at all.
  //
  // So: report PRESENCE, never VALUE. Not a prefix, not a length, not a masked hint. A
  // boolean cannot leak a secret, and a boolean is all anyone needs to answer "did I set it".
  if (view === 'config') {
    let migrated = false;
    let engineEnabled = false;
    try {
      const { error } = await supabaseAdmin.from('lead_identities').select('id').limit(1);
      migrated = !error;
      const { data: flag } = await supabaseAdmin
        .from('admin_settings')
        .select('value')
        .eq('key', 'acquisition_engine')
        .maybeSingle();
      engineEnabled = !!(flag?.value as { enabled?: boolean } | null)?.enabled;
    } catch {
      migrated = false;
    }

    const isSet = (v: string | undefined) => !!v && v.length > 10;

    return NextResponse.json({
      config: {
        migrated,
        engineEnabled,
        // Inbound. Without it the webhook rejects EVERY request.
        manychatWebhookSecret: isSet(process.env.MANYCHAT_WEBHOOK_SECRET),
        // Outbound. Without it, follow-up reaches nobody.
        manychatApiToken: isSet(process.env.MANYCHAT_API_TOKEN),
        // Optional. Without it the engine still runs, on deterministic question ordering.
        anthropicApiKey: isSet(process.env.ANTHROPIC_API_KEY),
        // A tag set without Meta's blessing is how apps get banned. Unset is the safe default.
        manychatMessageTag: !!process.env.MANYCHAT_MESSAGE_TAG,
      },
    });
  }

  // The engine may not be migrated yet. Every query below is wrapped so the panel renders an
  // honest empty state instead of a stack trace.
  try {
    if (view === 'dead_letter') {
      const { data } = await supabaseAdmin
        .from('acquisition_events')
        .select('id, event_name, last_error_code, attempt_count, created_at, lead_identity_id')
        .eq('status', 'dead_letter')
        .order('created_at', { ascending: false })
        .limit(100);
      return NextResponse.json({ rows: data ?? [] });
    }

    if (view === 'human_review') {
      const { data } = await supabaseAdmin
        .from('lead_sessions')
        .select('id, current_question_key, last_activity_at, lead_magnet_id, lead_identity_id')
        .eq('state', 'human_review')
        .order('last_activity_at', { ascending: false })
        .limit(100);

      const rows = await hydrate(data ?? []);
      return NextResponse.json({ rows });
    }

    // Default: the funnel.
    const { data: sessions } = await supabaseAdmin
      .from('lead_sessions')
      .select('id, state, status, lead_magnet_id, keyword, source_post_id, started_at, last_activity_at, lead_identity_id')
      .order('last_activity_at', { ascending: false })
      .limit(100);

    const rows = await hydrate(sessions ?? []);
    return NextResponse.json({ rows });
  } catch (err) {
    console.error('[admin/acquisition] read failed:', err instanceof Error ? err.message : 'unknown');
    // Almost always "the migration has not been run yet". Say so rather than 500ing.
    return NextResponse.json({ rows: [], notReady: true });
  }
}

/** Join identity + profile + result onto a session list, in two queries, not N. */
async function hydrate(sessions: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
  if (!sessions.length) return [];

  const ids = [...new Set(sessions.map((s) => s.lead_identity_id).filter(Boolean))] as string[];

  const [{ data: identities }, { data: profiles }, { data: results }] = await Promise.all([
    supabaseAdmin.from('lead_identities').select('id, instagram_username, email, claimed_at, status').in('id', ids),
    supabaseAdmin.from('lead_profiles').select('lead_identity_id, lead_score, score_band, monthly_listeners, primary_blocker').in('lead_identity_id', ids),
    supabaseAdmin.from('lead_magnet_results').select('id, lead_session_id, viewed_at, claimed_at, recalculated_at').in('lead_session_id', sessions.map((s) => s.id as string)),
  ]);

  const byIdentity = new Map((identities ?? []).map((i) => [i.id, i]));
  const byProfile = new Map((profiles ?? []).map((p) => [p.lead_identity_id, p]));
  const bySession = new Map((results ?? []).map((r) => [r.lead_session_id, r]));

  return sessions.map((s) => ({
    ...s,
    identity: byIdentity.get(s.lead_identity_id as string) ?? null,
    profile: byProfile.get(s.lead_identity_id as string) ?? null,
    result: bySession.get(s.id as string) ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  let body: { action?: string; id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const { action, id } = body;
  if (!action || !id) return NextResponse.json({ error: 'Missing action or id' }, { status: 400 });

  switch (action) {
    case 'retry_event': {
      // Put a dead-lettered job back in the queue with a clean slate. The dispatcher will
      // pick it up on its next run.
      await supabaseAdmin
        .from('acquisition_events')
        .update({
          status: 'pending',
          attempt_count: 0,
          next_attempt_at: new Date().toISOString(),
          last_error_code: null,
        })
        .eq('id', id)
        .eq('status', 'dead_letter'); // never resurrect something that is not actually dead
      break;
    }

    case 'resolve_review': {
      // Josh has replied to this lead by hand. Take the session out of the review queue and
      // park it in nurture, so the dispatcher can pick the relationship back up later.
      await supabaseAdmin
        .from('lead_sessions')
        .update({ state: 'nurture', last_activity_at: new Date().toISOString() })
        .eq('id', id)
        .eq('state', 'human_review');
      break;
    }

    case 'disqualify': {
      // Not a CRWN lead. Stops every channel immediately (channels.ts refuses to send to a
      // disqualified identity), without deleting the record.
      await supabaseAdmin.from('lead_identities').update({ status: 'disqualified' }).eq('id', id);
      break;
    }

    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }

  // Audit. Reuses the EXISTING agent_action_log rather than inventing a second audit table,
  // and derives the acting admin from the session (admin.id), never from the request.
  await supabaseAdmin.from('agent_action_log').insert({
    admin_id: admin.id,
    action_type: `acquisition_${action}`,
    action_label: `Acquisition: ${action} on ${id}`,
    action_params: { id },
    result: 'success',
  });

  return NextResponse.json({ ok: true });
}
