import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  eligiblePopupFor,
  isPopupEngineEnabled,
  recordPopupEvent,
  recordSurveyResponse,
  getPopup,
} from '@/lib/popups';
import type { PopupContext } from '@/lib/popups';
import { resend, FROM_EMAIL } from '@/lib/resend';
import { buildReferralLink } from '@/lib/postWinReferral';
import { pendingRequestForFan } from '@/lib/testimonials/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const FOUNDER_EMAIL = 'joshn.wms@gmail.com';

// admin_settings flags any announcement pop-up may gate on. Add a feature's flag
// here when you add its announcement, or the announcement fires while the feature
// is still dark and sends the user to a tile that is not there.
const ANNOUNCEABLE_FLAGS = ['royalty_readiness', 'live_tips', 'quest_engine', 'producer_sessions'];

/**
 * GET /api/popups?page=/home — the ONE pop-up (if any) this user should see now.
 * Dark-launched: returns { enabled:false, popup:null } until the flag is flipped.
 */
export async function GET(req: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!(await isPopupEngineEnabled(supabaseAdmin))) {
    return NextResponse.json({ enabled: false, popup: null });
  }

  const { searchParams } = new URL(req.url);
  const pathname = searchParams.get('page') || '/home';

  const ctx = await buildContext(user.id);
  const def = await eligiblePopupFor(supabaseAdmin, ctx, pathname);
  if (!def) return NextResponse.json({ enabled: true, popup: null });

  // Serialize only what the client renders (predicate functions are not sent).
  return NextResponse.json({
    enabled: true,
    popup: {
      key: def.key,
      kind: def.kind,
      title: def.title,
      body: def.body,
      // The referral link is per-artist, so the static registry cannot hold it. Injected here
      // rather than templated, because one explicit conditional is easier to audit than a
      // substitution system, and this is the only pop-up that needs it. `buildReferralLink`
      // returns null without a slug, which leaves the CTA as a plain link rather than a copy
      // button that would silently copy nothing.
      cta: def.cta
        ? {
            ...def.cta,
            ...(def.key === 'artist_post_win_referral' && ctx.artistSlug
              ? { copyText: buildReferralLink(ctx.artistSlug) ?? undefined }
              : {}),
          }
        : null,
      dismissLabel: def.dismissLabel ?? 'Close',
      survey: def.survey ?? null,
      // Tell the client to replace this pop-up's copy with the artist's REAL next move,
      // resolved from /api/artist/constraint + /api/artist/roadmap exactly as Rise Mode
      // does. The resolution is NOT done here on purpose: this route runs on every
      // navigation and the roadmap read calls Stripe, so the cost belongs on the rare
      // path where the pop-up has actually won, not on every page change. A pop-up that
      // asks for it and cannot resolve one renders nothing at all.
      resolveNextMove: def.key === 'artist_resume_rise',
    },
  });
}

/**
 * POST /api/popups — record an interaction.
 * Body: { popupKey, action: 'shown'|'dismissed'|'clicked'|'completed', rating?, feedback? }
 */
export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const { popupKey, action, rating, feedback } = body || {};
  const def = getPopup(popupKey);
  if (!def || !['shown', 'dismissed', 'clicked', 'completed'].includes(action)) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  await recordPopupEvent(supabaseAdmin, user.id, popupKey, action);

  // Survey completion: store the answer and alert the founder on a low score.
  if (def.kind === 'survey' && action === 'completed' && typeof rating === 'number') {
    await recordSurveyResponse(supabaseAdmin, user.id, popupKey, rating, feedback ?? null);
    if (rating <= 2) {
      await alertFounderLowScore(user.id, popupKey, rating, feedback ?? null);
    }
  }

  return NextResponse.json({ ok: true });
}

/** Cheap, single-query-per-fact context. Never throws; degrades to a fan. */
async function buildContext(userId: string): Promise<PopupContext> {
  const base: PopupContext = {
    userId,
    role: 'fan',
    isArtist: false,
    platformTier: null,
    stripeConnected: false,
    supportCount: 0,
    hasSentBroadcast: false,
    gmv30dCents: 0,
    accountCreatedAt: null,
    featureFlags: {},
    artistSlug: null,
    hasFirstPaidConversion: false,
    hasPendingTestimonialRequest: false,
  };

  try {
    // An OPEN testimonial ask, if the generator created one. Every user is a potential fan (an
    // artist can support other artists), so this is read before the artist branch and not inside
    // it. Reads the row the server already created; the pop-up only announces it.
    base.hasPendingTestimonialRequest = !!(await pendingRequestForFan(supabaseAdmin, userId));

    // Dark-launch flags, so an announcement pop-up cannot fire before the feature
    // it announces is reachable. One query for all of them.
    const { data: flags } = await supabaseAdmin
      .from('admin_settings')
      .select('key, value')
      .in('key', ANNOUNCEABLE_FLAGS);
    for (const row of flags || []) {
      base.featureFlags[row.key] = !!(row.value as { enabled?: boolean } | null)?.enabled;
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role, created_at')
      .eq('id', userId)
      .maybeSingle();
    if (profile?.role === 'admin') base.role = 'admin';
    // Announcements only apply to accounts that predate the announced change.
    if (profile?.created_at) base.accountCreatedAt = String(profile.created_at);

    const { data: artist } = await supabaseAdmin
      .from('artist_profiles')
      .select('id, stripe_connect_id, platform_tier, slug')
      .eq('user_id', userId)
      .maybeSingle();

    if (artist) {
      base.role = base.role === 'admin' ? 'admin' : 'artist';
      base.isArtist = true;
      base.platformTier = artist.platform_tier ?? 'starter';
      base.stripeConnected = !!artist.stripe_connect_id;
      base.artistSlug = artist.slug ?? null;

      // The Post-Win referral trigger, read from the CANONICAL win rather than recomputed.
      // `first_paid_conversion` is deduped per artist across all six paid rails, so five webhook
      // entry points cannot produce five asks, and this needs no second activation record.
      const { count: firstPaid } = await supabaseAdmin
        .from('funnel_events')
        .select('id', { count: 'exact', head: true })
        .eq('artist_id', artist.id)
        .eq('stage', 'first_paid_conversion');
      base.hasFirstPaidConversion = (firstPaid || 0) > 0;

      const { count: subs } = await supabaseAdmin
        .from('subscriptions')
        .select('id', { count: 'exact', head: true })
        .eq('artist_id', artist.id)
        .eq('status', 'active');
      base.supportCount = subs || 0;

      const { data: bc } = await supabaseAdmin
        .from('dm_messages')
        .select('id')
        .eq('sender_id', userId)
        .eq('is_broadcast', true)
        .limit(1)
        .maybeSingle();
      base.hasSentBroadcast = !!bc;

      // Trailing 30-day GMV from the real earnings ledger (gross, in cents).
      // Drives the break-even upgrade pop-ups; a read failure just leaves 0.
      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data: recent } = await supabaseAdmin
        .from('earnings')
        .select('gross_amount')
        .eq('artist_id', artist.id)
        .gte('created_at', since);
      base.gmv30dCents = (recent || []).reduce(
        (sum, row) => sum + (Number(row.gross_amount) || 0),
        0,
      );

    } else {
      const { count: subs } = await supabaseAdmin
        .from('subscriptions')
        .select('id', { count: 'exact', head: true })
        .eq('fan_id', userId)
        .eq('status', 'active');
      base.supportCount = subs || 0;
    }
  } catch (err) {
    console.error('[popups] buildContext failed:', err);
  }

  return base;
}

async function alertFounderLowScore(
  userId: string,
  popupKey: string,
  rating: number,
  feedback: string | null,
): Promise<void> {
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: FOUNDER_EMAIL,
      subject: `Low CRWN survey score (${rating}/5) from ${popupKey}`,
      text: [
        `A survey pop-up just came back at ${rating} out of 5.`,
        ``,
        `Survey: ${popupKey}`,
        `User: ${userId}`,
        `Feedback: ${feedback || '(none left)'}`,
        ``,
        `This is the "what to fix first" signal. Low scores mean act, not file.`,
      ].join('\n'),
    });
  } catch (err) {
    console.error('[popups] alertFounderLowScore failed:', err);
  }
}
