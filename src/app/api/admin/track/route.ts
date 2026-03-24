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
    const { visitorHash, userId, artistSlug } = await req.json();
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
