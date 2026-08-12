import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { safeInternalPath } from '@/lib/safeRedirect';
import { NOTIFICATION_TAXONOMY } from '@/lib/comms/taxonomy';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Cybersecurity audit 2026-08-12, MEDIUM: this route took `type`, `title`, `message`
// and `link` straight from the body and wrote them, unexamined, into every one of the
// artist's subscribers' feeds. Ownership was checked, so the caller is a real artist
// writing to their own fans. That is exactly the population worth phishing: the fans
// already trust this artist, the bell is CRWN's own UI, and NotificationBell rendered
// `href={notification.link}` through next/link, which puts a `javascript:` URI onto a
// live anchor inside CRWN's origin. Cookies are httpOnly:false and there is no
// script-src CSP, so that anchor is the session.
//
// Three bounds, each closing a different property of that attack.

/**
 * The `type` allowlist, DERIVED from the notification taxonomy rather than restated,
 * so a new type is governed and allowlisted in one edit instead of two.
 *
 * Fan-audience only. This route writes to an artist's SUBSCRIBERS, so an artist-facing
 * type (`earning`, `cashout`, `team_split_payout`) has no legitimate use here, and
 * every one of them renders a money icon in the bell. Letting an artist mint a
 * money-shaped notification in a fan's feed is a free credibility upgrade for a
 * phishing message, for no product gain.
 *
 * NOTE the deliberate difference from `classifyNotification`, which treats an unknown
 * type as "ungoverned, deliver". That default is right for a TRUSTED server-side
 * producer, where silence would be the worse failure. It is wrong for a value that
 * arrived in a request body: caller-supplied input fails CLOSED.
 */
const FAN_NOTIFICATION_TYPES: ReadonlySet<string> = new Set(
  Object.entries(NOTIFICATION_TAXONOMY)
    .filter(([, c]) => c.audience === 'fan')
    .map(([type]) => type),
);

/**
 * Rendering bounds, not authorization. The bell shows one line of title and a truncated
 * message, so a 4KB payload buys an attacker layout abuse and nothing else. These
 * TRUNCATE rather than reject on purpose: a real artist whose track title runs long
 * should still reach their fans, and a 400 there would break a genuine release
 * announcement to protect against nothing.
 */
const MAX_TITLE = 200;
const MAX_MESSAGE = 500;

function boundedText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  // Control characters are never legitimate here and are how a one-line field becomes
  // several. Escaped rather than written literally: an invisible character in a source
  // filter is how a filter quietly stops filtering.
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!cleaned) return null;
  return cleaned.slice(0, max);
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Burst cap (stops a rapid loop) plus a daily cap (stops slow-drip overkill).
  // A fan who gets pinged all day mutes the bell, and a muted fan is a fan you no
  // longer reach. The platform protects the artist's own audience from that here.
  const underBurst = await checkRateLimit(user.id, 'notify-subscribers', 60, 5);
  if (!underBurst) {
    return NextResponse.json({ error: 'Too many notifications at once. Give it a minute.' }, { status: 429 });
  }
  const underDaily = await checkRateLimit(user.id, 'notify-subscribers-daily', 86400, 8);
  if (!underDaily) {
    return NextResponse.json(
      { error: 'You have pinged your fans a lot today. Past this they start tuning the bell out, so save it for what matters. Try again tomorrow.' },
      { status: 429 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const { artistId, type, title, message, link } = body;

  if (typeof artistId !== 'string' || !artistId || !type) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  if (typeof type !== 'string' || !FAN_NOTIFICATION_TYPES.has(type)) {
    return NextResponse.json({ error: 'Unsupported notification type' }, { status: 400 });
  }

  const safeTitle = boundedText(title, MAX_TITLE);
  if (!safeTitle) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }
  // A missing message is normal; an unusable one is not silently kept.
  const safeMessage = message === undefined || message === null ? null : boundedText(message, MAX_MESSAGE);

  // `link` is validated with the canonical validator (src/lib/safeRedirect.ts), the same
  // one the email click trackers use. `safeInternalPath` is the strictest of its three
  // policies: a single-slash relative CRWN path and nothing else. That is what a
  // notification link has always been in practice (both real callers pass
  // `/artist/<slug>` and `/<slug>/live/<id>`), and it refuses `javascript:` and `data:`
  // in every encoding, protocol-relative `//evil.example`, backslash variants, malformed
  // percent-encoding, and any absolute origin including a hostile one.
  //
  // REJECT rather than drop: a link the artist meant to send that silently vanished is a
  // broken announcement they would never find out about, and only a hand-crafted request
  // can produce an invalid one.
  let safeLink: string | null = null;
  if (link !== undefined && link !== null && link !== '') {
    safeLink = safeInternalPath(link);
    if (!safeLink) {
      return NextResponse.json({ error: 'Link must be a path inside CRWN' }, { status: 400 });
    }
  }

  // Verify the caller owns this artist profile
  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('id')
    .eq('id', artistId)
    .eq('user_id', user.id)
    .single();

  if (!artist) {
    return NextResponse.json({ error: 'Not your artist profile' }, { status: 403 });
  }

  const { data: subs } = await supabaseAdmin
    .from('subscriptions')
    .select('fan_id')
    .eq('artist_id', artistId)
    .eq('status', 'active');

  if (!subs || subs.length === 0) {
    return NextResponse.json({ notified: 0 });
  }

  // Only the validated values are written. Nothing from `body` reaches the row directly.
  const notifications = subs.map(sub => ({
    user_id: sub.fan_id,
    type,
    title: safeTitle,
    message: safeMessage,
    link: safeLink,
  }));

  const { error } = await supabaseAdmin.from('notifications').insert(notifications);

  if (error) {
    console.error('Notify subscribers error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ notified: subs.length });
}
