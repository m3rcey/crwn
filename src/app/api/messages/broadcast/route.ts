import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { getOwnedArtistIds, artistAllowsDMs } from '@/lib/messaging';
import { buildAudience, applyAudienceFilters, type AudienceFilters, type FanRecord } from '@/lib/audience';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

/**
 * Who a broadcast goes to.
 *  - subscribers: active subscribers, optionally narrowed to specific tiers.
 *    The DEFAULT, and the only audience that reaches nobody unexpected:
 *    everyone in it is already paying the artist.
 *  - segment: a saved_segments row (filters the artist built in the Fan CRM).
 *  - lifecycle: one of vip/active/at_risk/churned/cold.
 *
 * segment and lifecycle can reach people who are NOT active subscribers, e.g.
 * churned fans for a win-back. Neither can ever reach a `lead`: fan_contacts
 * rows have no profiles row, so there is nobody to open a conversation with.
 */
type Audience =
  | { type: 'subscribers'; tierIds?: string[] }
  | { type: 'segment'; segmentId: string }
  | { type: 'lifecycle'; value: string };

const LIFECYCLES = new Set(['vip', 'active', 'at_risk', 'churned', 'cold']);

interface Recipient {
  fanId: string;
  tierId: string | null;
}

// Read the request's audience spec. A bare `tierIds` with no `audience` is the
// body shape the old BroadcastModal sent; keep honoring it.
function parseAudience(body: Record<string, unknown>): Audience | null {
  const a = body.audience as Partial<Audience> | undefined;
  if (!a || !a.type) {
    const tierIds = Array.isArray(body.tierIds) ? (body.tierIds as string[]) : undefined;
    return { type: 'subscribers', tierIds };
  }
  if (a.type === 'subscribers') {
    const tierIds = (a as { tierIds?: unknown }).tierIds;
    return { type: 'subscribers', tierIds: Array.isArray(tierIds) ? (tierIds as string[]) : undefined };
  }
  if (a.type === 'segment') {
    const segmentId = (a as { segmentId?: unknown }).segmentId;
    if (typeof segmentId === 'string' && segmentId) return { type: 'segment', segmentId };
  }
  if (a.type === 'lifecycle') {
    const value = (a as { value?: unknown }).value;
    if (typeof value === 'string' && LIFECYCLES.has(value)) return { type: 'lifecycle', value };
  }
  return null;
}

/**
 * Resolve an audience to the fans who can actually receive a DM.
 * Returns null when the audience names a segment this artist does not own.
 */
async function resolveRecipients(artistId: string, audience: Audience): Promise<Recipient[] | null> {
  // Fast path: "everyone paying me" is answered by subscriptions directly,
  // without scoring the entire audience.
  if (audience.type === 'subscribers') {
    let q = supabaseAdmin
      .from('subscriptions')
      .select('fan_id, tier_id')
      .eq('artist_id', artistId)
      .eq('status', 'active');
    if (audience.tierIds && audience.tierIds.length > 0) q = q.in('tier_id', audience.tierIds);
    const { data } = await q;
    return (data || []).map((s) => ({ fanId: s.fan_id, tierId: s.tier_id }));
  }

  let filters: AudienceFilters;

  if (audience.type === 'segment') {
    const { data: segment } = await supabaseAdmin
      .from('saved_segments')
      .select('filters')
      .eq('id', audience.segmentId)
      .eq('artist_id', artistId) // a segment id alone must not select anyone
      .maybeSingle();
    if (!segment) return null;
    filters = (segment.filters || {}) as AudienceFilters;
  } else {
    filters = { lifecycle: audience.value };
  }

  const { fans } = await buildAudience(supabaseAdmin, artistId, {
    includeEmails: false,
    includeLeads: false,
  });

  return applyAudienceFilters(fans, filters)
    .filter((f: FanRecord) => f.lifecycle !== 'lead')
    .map((f) => ({ fanId: f.fan_id, tierId: f.tier_id }));
}

// Ownership + Pro gate, shared by GET and POST.
async function authorize(artistId: unknown) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (typeof artistId !== 'string' || !artistId) {
    return { error: NextResponse.json({ error: 'Missing fields' }, { status: 400 }) };
  }
  const owned = await getOwnedArtistIds(supabaseAdmin, user.id);
  if (!owned.includes(artistId)) {
    return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  }
  if (!(await artistAllowsDMs(supabaseAdmin, artistId))) {
    return { error: NextResponse.json({ error: 'Direct messaging is a Pro feature.', reason: 'tier_locked' }, { status: 403 }) };
  }
  return { user };
}

// GET /api/messages/broadcast?artistId=..&type=..[&tierIds=a,b][&segmentId=..][&lifecycle=..]
// Recipient count preview. Sending to an unknown number of people is how an
// artist accidentally messages nobody, or everybody.
export async function GET(req: NextRequest) {
  const artistId = req.nextUrl.searchParams.get('artistId');
  const auth = await authorize(artistId);
  if (auth.error) return auth.error;

  const tierIdsRaw = req.nextUrl.searchParams.get('tierIds');
  const audience = parseAudience({
    audience: {
      type: req.nextUrl.searchParams.get('type') || 'subscribers',
      tierIds: tierIdsRaw ? tierIdsRaw.split(',').filter(Boolean) : undefined,
      segmentId: req.nextUrl.searchParams.get('segmentId') || undefined,
      value: req.nextUrl.searchParams.get('lifecycle') || undefined,
    },
  });
  if (!audience) return NextResponse.json({ error: 'Invalid audience' }, { status: 400 });

  const recipients = await resolveRecipients(artistId as string, audience);
  if (recipients === null) return NextResponse.json({ error: 'Unknown segment' }, { status: 404 });

  return NextResponse.json({ count: recipients.length });
}

// POST /api/messages/broadcast — artist sends one message to a fan audience.
//   body: { artistId, body, audience?, allowReplies?, audioUrl?, audioDurationMs? }
//   Legacy body: { artistId, body, tierIds? }
export async function POST(req: NextRequest) {
  const raw = await req.json().catch(() => ({}));
  const auth = await authorize(raw.artistId);
  if (auth.error) return auth.error;
  const user = auth.user!;
  const artistId = raw.artistId as string;

  const rawText = typeof raw.body === 'string' ? raw.body.trim() : '';
  const isVoice = typeof raw.audioUrl === 'string' && /^https?:\/\//.test(raw.audioUrl);
  if (!rawText && !isVoice) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  if (rawText.length > 2000) return NextResponse.json({ error: 'Message too long' }, { status: 400 });
  const text = rawText || (isVoice ? '🎤 Voice message' : '');
  const audioDuration = isVoice && Number.isFinite(raw.audioDurationMs)
    ? Math.max(0, Math.round(raw.audioDurationMs as number))
    : null;

  // Announce-only unless the artist explicitly opens replies.
  const repliesDisabled = raw.allowReplies !== true;

  const audience = parseAudience(raw);
  if (!audience) return NextResponse.json({ error: 'Invalid audience' }, { status: 400 });

  // Two governors so a broadcast stays a signal, not noise. The hourly cap stops a
  // burst; the daily cap stops an artist blasting the whole fanbase over and over.
  // Fans mute and unsubscribe when every message is another ask, so the platform
  // protects the artist's own audience here, even from a well-meaning artist.
  const underHourly = await checkRateLimit(user.id, 'dm-broadcast', 3600, 10);
  if (!underHourly) {
    return NextResponse.json(
      {
        error: 'You have sent a lot of messages this hour. Space them out or your fans stop reading the ones that matter.',
        reason: 'rate_hourly',
      },
      { status: 429 },
    );
  }
  const underDaily = await checkRateLimit(user.id, 'dm-broadcast-daily', 86400, 5);
  if (!underDaily) {
    return NextResponse.json(
      {
        error: 'That is your fifth broadcast today. Past this, fans start muting you, and a muted fan is a fan you lose. Pick this back up tomorrow.',
        reason: 'rate_daily',
      },
      { status: 429 },
    );
  }

  const recipients = await resolveRecipients(artistId, audience);
  if (recipients === null) return NextResponse.json({ error: 'Unknown segment' }, { status: 404 });
  if (recipients.length === 0) return NextResponse.json({ sent: 0 });

  // Tier rank lookup (price ascending) for inbox priority.
  const { data: tiers } = await supabaseAdmin
    .from('subscription_tiers')
    .select('id, name')
    .eq('artist_id', artistId)
    .eq('is_active', true)
    .order('price', { ascending: true });
  const rankOf = (tierId: string | null) => {
    if (!tierId) return { rank: 0, name: null as string | null };
    const idx = (tiers || []).findIndex((t) => t.id === tierId);
    return idx < 0 ? { rank: 0, name: null as string | null } : { rank: idx + 1, name: tiers![idx].name };
  };

  const preview = isVoice ? '🎤 Voice message' : (text.length > 120 ? `${text.slice(0, 117)}...` : text);
  const delivered: string[] = [];

  for (const recipient of recipients) {
    const { rank, name } = rankOf(recipient.tierId);

    // Upsert the conversation for this fan.
    const { data: existing } = await supabaseAdmin
      .from('dm_conversations')
      .select('id, fan_unread')
      .eq('artist_id', artistId)
      .eq('fan_id', recipient.fanId)
      .maybeSingle();

    let conversationId: string;
    let fanUnread = 0;
    if (existing) {
      conversationId = existing.id;
      fanUnread = existing.fan_unread ?? 0;
    } else {
      const { data: created } = await supabaseAdmin
        .from('dm_conversations')
        .insert({ artist_id: artistId, fan_id: recipient.fanId, fan_tier_rank: rank, fan_tier_name: name })
        .select('id')
        .single();
      if (!created) continue;
      conversationId = created.id;
    }

    const { error: msgErr } = await supabaseAdmin.from('dm_messages').insert({
      conversation_id: conversationId,
      sender_id: user.id,
      sender_is_artist: true,
      body: text,
      audio_url: isVoice ? raw.audioUrl : null,
      audio_duration_ms: audioDuration,
      is_broadcast: true,
      replies_disabled: repliesDisabled,
    });
    if (msgErr) continue;

    await supabaseAdmin
      .from('dm_conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: preview,
        last_sender_is_artist: true,
        fan_unread: fanUnread + 1,
        fan_tier_rank: rank,
        fan_tier_name: name,
      })
      .eq('id', conversationId);

    delivered.push(recipient.fanId);
  }

  // Notify the fans who actually received it, not everyone we tried.
  try {
    const { data: p } = await supabaseAdmin.from('profiles').select('display_name').eq('id', user.id).maybeSingle();
    const senderName = p?.display_name || 'Artist';
    if (delivered.length > 0) {
      await supabaseAdmin.from('notifications').insert(
        delivered.map((fanId) => ({
          user_id: fanId,
          type: 'direct_message',
          title: `New message from ${senderName}`,
          message: preview,
          link: '/messages',
        }))
      );
    }
  } catch {
    /* best-effort */
  }

  return NextResponse.json({ sent: delivered.length });
}
