import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { recordFunnelEvent } from '@/lib/analytics/funnelEvents';
import { requestHasDnt } from '@/lib/analytics/doNotTrack';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

// Lightweight endpoint called from middleware to track visits and activity.
// It writes via the service role, so it must not blindly trust an arbitrary
// body from a public caller (which could pollute funnel data or forge referral
// conversions that later drive recruiter payouts).
//
// Trust model:
//  - Middleware calls this with the shared INTERNAL_TRACK_SECRET header → fully
//    trusted (it writes visit/click rows + last_active).
//  - Fail OPEN until INTERNAL_TRACK_SECRET is configured, so tracking never
//    silently dies on a deploy. Once the secret is set on the server, only the
//    header-bearing internal caller can write tracking rows.
//  - The conversion-marking path has a legitimate client caller (the /welcome
//    page), so it is allowed either for the trusted internal caller OR for an
//    authenticated user marking THEIR OWN signup (userId === session user).
export async function POST(req: NextRequest) {
  try {
    // Founder devices are never counted (src/lib/analytics/doNotTrack.ts). The trusted
    // middleware caller sends no cookies, so this only drops direct browser calls (the
    // markConverted path) from a marked device.
    if (requestHasDnt(req.headers)) return NextResponse.json({ ok: true });

    const expected = process.env.INTERNAL_TRACK_SECRET;
    const trustedInternal = !!expected && req.headers.get('x-internal-secret') === expected;
    const trackingAllowed = !expected || trustedInternal;

    const { visitorHash, userId, artistSlug, recruiterCode, markConverted } = await req.json();
    const today = new Date().toISOString().split('T')[0];

    // Track site visit (unique per day per visitor)
    if (trackingAllowed && visitorHash) {
      await supabaseAdmin
        .from('site_visits')
        .upsert(
          {
            visit_date: today,
            visitor_hash: visitorHash,
            is_authenticated: !!userId,
          },
          { onConflict: 'visit_date,visitor_hash' }
        );
    }

    // Track artist page visit if on an artist page
    if (trackingAllowed && visitorHash && artistSlug) {
      const { data: artist } = await supabaseAdmin
        .from('artist_profiles')
        .select('id')
        .eq('slug', artistSlug)
        .single();

      if (artist) {
        await supabaseAdmin
          .from('artist_page_visits')
          .upsert(
            {
              artist_id: artist.id,
              visit_date: today,
              visitor_hash: visitorHash,
            },
            { onConflict: 'artist_id,visit_date,visitor_hash' }
          );

        // Mirror the visit into the funnel. Without this, "first fan visit" (the
        // step between launching and a first member) was invisible: page_viewed
        // was only ever emitted for lead-magnet pages, so an artist's own page
        // traffic never reached funnel_events. Deduped per visitor per day, the
        // same grain as artist_page_visits, so the two can be reconciled.
        await recordFunnelEvent(supabaseAdmin, {
          stage: 'page_viewed',
          artistId: String(artist.id),
          userId: userId || null,
          referrer: artistSlug,
          dedupeKey: `artistpage:${artist.id}:${visitorHash}:${today}`,
          metadata: { surface: 'artist_page', slug: artistSlug },
        });
      }
    }

    // Track referral click if recruiter code present
    if (trackingAllowed && visitorHash && recruiterCode) {
      try {
        const { data: recruiter } = await supabaseAdmin
          .from('recruiters')
          .select('is_partner')
          .eq('referral_code', recruiterCode)
          .eq('is_active', true)
          .maybeSingle();

        await supabaseAdmin
          .from('referral_clicks')
          .upsert(
            {
              referral_code: recruiterCode,
              visitor_hash: visitorHash,
              source_type: recruiter?.is_partner ? 'partner' : 'recruiter',
            },
            { onConflict: 'referral_code,visitor_hash' }
          );
      } catch {
        // Silent fail
      }
    }

    // Mark referral click as converted when an artist signs up with a recruiter
    // code. Allowed for the trusted internal caller, or an authenticated user
    // marking their own signup (prevents forging conversions for others).
    if (markConverted && markConverted.recruiterCode && markConverted.userId) {
      let allowed = trustedInternal;
      if (!allowed) {
        const supabase = await createServerSupabaseClient();
        const { data: { user } } = await supabase.auth.getUser();
        allowed = !!user && user.id === markConverted.userId;
      }
      if (allowed) {
        try {
          // Find the most recent unconverted click for this recruiter code (within 30 days)
          const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
          const { data: click } = await supabaseAdmin
            .from('referral_clicks')
            .select('id')
            .eq('referral_code', markConverted.recruiterCode)
            .eq('converted', false)
            .gte('clicked_at', thirtyDaysAgo)
            .order('clicked_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (click) {
            await supabaseAdmin
              .from('referral_clicks')
              .update({ converted: true, converted_user_id: markConverted.userId })
              .eq('id', click.id);
          }
        } catch {
          // Silent fail
        }
      }
    }

    // Update last_active_at for authenticated users
    if (trackingAllowed && userId) {
      await supabaseAdmin
        .from('profiles')
        .update({ last_active_at: new Date().toISOString() })
        .eq('id', userId);
    }

    return NextResponse.json({ ok: true });
  } catch {
    // Silent fail — tracking should never break the app
    return NextResponse.json({ ok: true });
  }
}
