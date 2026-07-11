import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { syncTemplatesToDb } from '@/lib/quests/templates';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// POST /api/admin/quests-sync — upsert the code quest catalog into quest_templates
// (by `key`, idempotent). The engine runs off the in-memory registry, so this is
// OPTIONAL housekeeping: it keeps the DB catalog queryable and in sync for
// admin/AI-authored quest features. Admin-only; identity from the session, never
// a client-supplied id.
export async function POST() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { synced } = await syncTemplatesToDb(supabaseAdmin);
  return NextResponse.json({ ok: true, synced });
}
