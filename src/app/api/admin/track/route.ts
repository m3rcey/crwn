import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Lightweight endpoint called from middleware to track visits and activity
export async function POST(req: NextRequest) {
  try {
    const { visitorHash, userId } = await req.json();

    // Track site visit (unique per day per visitor)
    if (visitorHash) {
      await supabaseAdmin
        .from('site_visits')
        .upsert(
          {
            visit_date: new Date().toISOString().split('T')[0],
            visitor_hash: visitorHash,
            is_authenticated: !!userId,
          },
          { onConflict: 'visit_date,visitor_hash' }
        );
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
