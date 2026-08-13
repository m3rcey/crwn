// Daily testimonial request generator.
//
// The ONLY automation in the feature: it finds fans who have EXPERIENCED value and creates one ask.
// It sends no email, writes no notification, and publishes nothing. Delivery is the Pop-up Engine
// and the fan hub card, both of which read the row this creates.
//
// Vercel Hobby permits at most one run per day and nothing here is time critical, so the schedule
// is daily. Idempotence does not depend on the schedule: the unique indexes in
// schema-phase2-fan-testimonials.sql reject a duplicate, so a manual re-run is a no-op.
//
// Fails CLOSED and SOFT: an unauthorized call gets 401, and a missing migration returns
// skipped:'migration_pending' with a 200 rather than paging anyone.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateTestimonialRequests } from '@/lib/testimonials/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
);

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await generateTestimonialRequests(supabaseAdmin, new Date());

  return NextResponse.json({
    ok: true,
    ...result,
  });
}
