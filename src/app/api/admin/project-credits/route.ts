// GET /api/admin/project-credits: the project-credits scorecard for every project that sells
// credits, so the founder reads the verdict on /admin instead of running a script.
// Admin-only from the SESSION (requireAdmin); the reads are service-role. Read-only.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { loadCreditsScorecards } from '@/lib/projectCredits/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(await loadCreditsScorecards(supabaseAdmin));
}
