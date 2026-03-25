import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

// Lightweight endpoint called from middleware to track visits and activity
export async function POST(req: NextRequest) {
  try {
    const { visitorHash, userId, artistSlug, recruiterCode, markConverted } = await req.json();
    const today = new Date().toISOString().split('T')[0];

    // Track site visit (unique per day per visitor)
    if (visitorHash) {
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
    if (visitorHash && artistSlug) {
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
      }
    }

    // Track referral click if recruiter code present
    if (visitorHash && recruiterCode) {
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

    // Mark referral click as converted when an artist signs up with a recruiter code
    if (markConverted && markConverted.recruiterCode && markConverted.userId) {
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

    // Update last_active_at for authenticated users
    if (userId) {
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
